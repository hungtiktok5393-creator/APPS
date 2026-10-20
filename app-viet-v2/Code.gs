/**
 * Spelling Mastery – Backend Google Apps Script
 * Gắn vào Google Sheet (Extensions → Apps Script) rồi Deploy dạng Web app.
 * Sheet "Results" và "Assignments" được tự tạo ở lần gọi đầu tiên.
 */

/** ĐỔI GIÁ TRỊ NÀY trước khi deploy (mật khẩu đơn giản của giáo viên). */
const TEACHER_KEY = 'DOI_MAT_KHAU_CUA_BAN';
/** (Tuỳ chọn) ID Google Sheet. Để trống nếu script gắn trực tiếp vào Sheet. */
const SPREADSHEET_ID = '';
/** Cho phép nộp trễ tối đa bao lâu sau hạn (ms) để bù độ trễ mạng / hàng đợi retry. */
const GRACE_MS = 2 * 60 * 1000;
const MAX_BODY = 200000;

const SHEET_RESULTS = 'Results';
const SHEET_ASSIGN = 'Assignments';
const RESULT_HEADERS = ['submissionId', 'assignmentId', 'assignmentName', 'submittedAt', 'name', 'cls', 'score', 'totalMs', 'late', 'details', 'userAgent'];
const ASSIGN_HEADERS = ['id', 'name', 'due', 'max', 'req', 'createdAt', 'wordsJson', 'ttsJson', 'shuffle'];

/* ---------- Tiện ích ---------- */
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function ss_() { return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name, headers) {
  const ss = ss_(); let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}
function rows_(sh) { const n = sh.getLastRow(); return n < 2 ? [] : sh.getRange(2, 1, n - 1, sh.getLastColumn()).getValues(); }
/** Chặn formula injection khi mở bằng Sheets/Excel */
function safe_(v) { v = String(v == null ? '' : v); return /^[=+\-@]/.test(v) ? "'" + v : v; }
function iso_(v) { return v instanceof Date ? v.toISOString() : String(v); }
function isTeacher_(key) {
  return TEACHER_KEY !== 'DOI_MAT_KHAU_CUA_BAN' && typeof key === 'string' && key.length > 0 && key === TEACHER_KEY;
}
function findAssignment_(id) {
  const r = rows_(sheet_(SHEET_ASSIGN, ASSIGN_HEADERS)).find(x => String(x[0]) === id);
  if (!r) return null;
  let words = null, tts = null;
  try { words = JSON.parse(r[6] || 'null'); } catch (e) {}
  try { tts = JSON.parse(r[7] || 'null'); } catch (e) {}
  return { id: String(r[0]), name: String(r[1]), due: Number(r[2]) || 0, max: Number(r[3]) || 0, req: r[4] === true || r[4] === 'TRUE' || r[4] === 1, createdAt: iso_(r[5]), words: words, tts: tts, shuffle: r[8] === true || r[8] === 'TRUE' };
}

/* ---------- POST: nộp bài / lưu bài giao ---------- */
function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    lock.waitLock(20000); locked = true;
    if (!e || !e.postData || !e.postData.contents) return json_({ ok: false, error: 'bad_request', message: 'Thiếu dữ liệu.' });
    if (e.postData.contents.length > MAX_BODY) return json_({ ok: false, error: 'too_large', message: 'Dữ liệu quá lớn.' });
    const body = JSON.parse(e.postData.contents);
    const action = body.action || 'submit';
    if (action === 'submit') return json_(submit_(body));
    if (action === 'saveAssignment') return json_(saveAssignment_(body));
    return json_({ ok: false, error: 'bad_request', message: 'Hành động không hợp lệ.' });
  } catch (err) {
    return json_({ ok: false, error: 'server_error', message: String(err) });
  } finally { if (locked) lock.releaseLock(); }
}

function submit_(b) {
  const id = String(b.submissionId || ''), aid = String(b.assignmentId || '');
  if (!/^[\w-]{8,64}$/.test(id) || !/^[\w-]{3,40}$/.test(aid)) return { ok: false, error: 'bad_request', message: 'Thiếu mã bài hoặc mã nộp.' };
  const name = String(b.name || '').trim().slice(0, 60) || 'Ẩn danh';
  const cls = String(b.cls || '').trim().slice(0, 20);
  const details = (Array.isArray(b.details) ? b.details : []).slice(0, 500).map(function (d) {
    return { word: String(d.word || '').slice(0, 100), views: +d.views || 0, wrongCount: +d.wrongCount || 0, score: +d.score || 0, timeMs: +d.timeMs || 0 };
  });
  // Điểm bài = TỔNG điểm từng từ (mỗi từ 0–10) nên tối đa = 10 × số từ
  const score = Number(b.score);
  if (!(score >= 0 && score <= details.length * 10)) return { ok: false, error: 'bad_request', message: 'Điểm không hợp lệ.' };
  const sh = sheet_(SHEET_RESULTS, RESULT_HEADERS), data = rows_(sh);
  if (data.some(function (r) { return String(r[0]) === id; })) return { ok: true, duplicate: true };   // chống nộp trùng

  const a = findAssignment_(aid);                       // hạn nộp & số lần: ưu tiên dữ liệu đã đăng ký ở máy chủ
  const due = a ? a.due : (Number(b.due) || 0);
  const max = a ? a.max : (Number(b.max) || 0);
  const now = Date.now();
  if (due && now > due + GRACE_MS) return { ok: false, error: 'expired', message: 'Bài đã hết hạn nộp.' };
  if (max > 0) {
    const cnt = data.filter(function (r) {
      return String(r[1]) === aid && String(r[4]).toLowerCase() === name.toLowerCase() && String(r[5]).toLowerCase() === cls.toLowerCase();
    }).length;
    if (cnt >= max) return { ok: false, error: 'max_attempts', message: 'Đã hết số lần làm bài cho phép.' };
  }
  sh.appendRow([id, aid, safe_(a ? a.name : b.assignmentName), new Date(now).toISOString(), safe_(name), safe_(cls), score,
    Math.round(+b.totalMs || 0), (due && now > due) ? 'yes' : '', JSON.stringify(details), safe_(String(b.userAgent || '').slice(0, 200))]);
  return { ok: true };
}

function saveAssignment_(b) {
  if (!isTeacher_(b.teacherKey)) return { ok: false, error: 'unauthorized', message: 'Teacher Key không đúng.' };
  const a = b.assignment || {};
  if (!/^[\w-]{3,40}$/.test(String(a.id || '')) || !(Number(a.due) > 0)) return { ok: false, error: 'bad_request', message: 'Dữ liệu bài giao không hợp lệ.' };
  const words = Array.isArray(a.words) ? a.words.slice(0, 500).map(function (w) { return { en: String(w.en).slice(0, 100), vi: String(w.vi).slice(0, 200) }; }) : null;
  const wordsJson = words ? JSON.stringify(words) : '';
  if (wordsJson.length > 45000) return { ok: false, error: 'too_large', message: 'Bộ từ quá lớn để lưu (giới hạn ô Sheet).' };
  const sh = sheet_(SHEET_ASSIGN, ASSIGN_HEADERS), data = rows_(sh);
  const row = [String(a.id), safe_(String(a.name || '').slice(0, 80)), Number(a.due), Number(a.max) || 0, !!a.req, new Date().toISOString(), wordsJson, JSON.stringify(a.tts || {}), !!a.shuffle];
  const idx = data.findIndex(function (r) { return String(r[0]) === String(a.id); });
  if (idx >= 0) sh.getRange(idx + 2, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
  return { ok: true };
}

/* ---------- GET: ping / lấy bài / thống kê ---------- */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = p.action || 'ping';
    if (action === 'ping') return json_({ ok: true, teacher: isTeacher_(p.teacherKey), time: Date.now() });

    if (action === 'getAssignment') {            // công khai (học sinh) – chỉ trả dữ liệu bài, không có kết quả
      const a = findAssignment_(String(p.id || ''));
      if (!a) return json_({ ok: false, error: 'not_found' });
      return json_({ ok: true, assignment: { id: a.id, name: a.name, due: a.due, max: a.max, req: a.req, words: a.words, tts: a.tts, shuffle: a.shuffle } });
    }

    if (!isTeacher_(p.teacherKey)) return json_({ ok: false, error: 'unauthorized', message: 'Teacher Key không đúng.' });

    if (action === 'assignments') {
      const res = rows_(sheet_(SHEET_RESULTS, RESULT_HEADERS)), map = {};
      rows_(sheet_(SHEET_ASSIGN, ASSIGN_HEADERS)).forEach(function (r) { map[String(r[0])] = { id: String(r[0]), name: String(r[1]), due: Number(r[2]) || 0, createdAt: iso_(r[5]), count: 0 }; });
      res.forEach(function (r) {
        const id = String(r[1]);
        if (!map[id]) map[id] = { id: id, name: String(r[2] || id), due: 0, createdAt: iso_(r[3]), count: 0 };
        map[id].count++;
      });
      const list = Object.keys(map).map(function (k) { return map[k]; }).sort(function (x, y) { return y.createdAt < x.createdAt ? -1 : 1; });
      return json_({ ok: true, assignments: list });
    }

    if (action === 'results') {
      const id = String(p.id || '');
      const a = findAssignment_(id);
      const results = rows_(sheet_(SHEET_RESULTS, RESULT_HEADERS)).filter(function (r) { return String(r[1]) === id; }).map(function (r) {
        let details = []; try { details = JSON.parse(r[9] || '[]'); } catch (x) {}
        return { submissionId: String(r[0]), submittedAt: iso_(r[3]), name: String(r[4]), cls: String(r[5]), score: Number(r[6]), totalMs: Number(r[7]), late: String(r[8]) === 'yes', details: details };
      });
      return json_({ ok: true, assignment: a ? { id: a.id, name: a.name, due: a.due } : { id: id, name: id }, results: results });
    }
    return json_({ ok: false, error: 'bad_request', message: 'Hành động không hợp lệ.' });
  } catch (err) { return json_({ ok: false, error: 'server_error', message: String(err) }); }
}
