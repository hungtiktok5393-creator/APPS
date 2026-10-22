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
const MAX_BODY = 3000000;                 // bộ từ hàng nghìn từ / đề hàng trăm câu → nới giới hạn thân yêu cầu
const CELL = 45000;                       // mỗi ô Google Sheet tối đa 50.000 ký tự → cắt thành nhiều ô

const SHEET_RESULTS = 'Results';
const SHEET_ASSIGN = 'Assignments';
const RESULT_HEADERS = ['submissionId', 'assignmentId', 'assignmentName', 'submittedAt', 'name', 'cls', 'score', 'totalMs', 'late', 'details', 'userAgent', 'status', 'totalWords', 'details2', 'details3', 'details4', 'details5', 'details6', 'details7', 'details8', 'details9', 'details10'];   // cột 14–22: phần dư của 'details' khi bài làm rất dài
/** Trạng thái một lần làm: partial = tự lưu khi thoát/ẩn app · timeout = 30 phút không thao tác · stopped = bấm Dừng lại · done = làm hết bộ từ */
const STATUSES = ['partial', 'timeout', 'stopped', 'done'];
const SHEET_TESTS = 'Tests';
const SHEET_TRES = 'TestResults';
const VERSION = 5;                        // ping trả về số này để ứng dụng biết Apps Script đã được cập nhật chưa
const NCHUNK = 20;
const TESTS_HEADERS = ['id', 'name', 'createdAt', 'n'].concat(Array.from({ length: NCHUNK }, function (_, i) { return 'c' + i; }));   // đề test / bộ từ lớn: cắt tối đa 20 mảnh x 45.000 ký tự
const TRES_HEADERS = ['submissionId', 'testId', 'testName', 'submittedAt', 'name', 'cls', 'score', 'maxScore', 'totalMs', 'late', 'items', 'userAgent'];
const ASSIGN_HEADERS = ['id', 'name', 'due', 'max', 'req', 'createdAt', 'wordsJson', 'ttsJson', 'shuffle', 'kind', 'link'];   // link = đường link giao bài (để xem / copy lại trong Thống kê) · kind = 'test' cho bài test (để không lẫn vào Thống kê bài từ vựng)

/* ---------- Tiện ích ---------- */
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function ss_() { return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name, headers) {
  const ss = ss_(); let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); }
  else if (sh.getLastColumn() < headers.length) sh.getRange(1, 1, 1, headers.length).setValues([headers]);   // sheet tạo từ bản cũ: bổ sung tiêu đề cột mới
  return sh;
}
function rows_(sh) { const n = sh.getLastRow(); return n < 2 ? [] : sh.getRange(2, 1, n - 1, sh.getLastColumn()).getValues(); }
function chunks_(s, n) { const out = []; for (let i = 0; i < s.length && out.length < n; i += CELL) out.push(s.slice(i, i + CELL)); while (out.length < n) out.push(''); return out; }
function detailsOf_(r) { return [r[9]].concat(r.slice(13, 22)).join(''); }
/** Chặn formula injection khi mở bằng Sheets/Excel */
function safe_(v) { v = String(v == null ? '' : v); return /^[=+\-@]/.test(v) ? "'" + v : v; }
function iso_(v) { return v instanceof Date ? v.toISOString() : String(v); }
function isTeacher_(key) {
  return TEACHER_KEY !== 'DOI_MAT_KHAU_CUA_BAN' && typeof key === 'string' && key.length > 0 && key === TEACHER_KEY;
}
function loadBlob_(id) {                    // dữ liệu lớn (bộ từ / đề) lưu theo mảnh trong sheet Tests
  const r = rows_(sheet_(SHEET_TESTS, TESTS_HEADERS)).find(function (x) { return String(x[0]) === id; });
  if (!r) return null;
  try { return JSON.parse(r.slice(4, 4 + NCHUNK).join('')); } catch (e) { return null; }
}
function findAssignment_(id, withWords) {
  const r = rows_(sheet_(SHEET_ASSIGN, ASSIGN_HEADERS)).find(x => String(x[0]) === id);
  if (!r) return null;
  let words = null, tts = null;
  try { words = JSON.parse(r[6] || 'null'); } catch (e) {}
  try { tts = JSON.parse(r[7] || 'null'); } catch (e) {}
  if (withWords && !words) { const b = loadBlob_(id); if (Array.isArray(b)) words = b; }
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
    if (action === 'submitTest') return json_(submitTest_(body));
    if (action === 'saveTest') return json_(saveTest_(body));
    if (action === 'deleteAssignment') return json_(deleteAssignment_(body));
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
  const details = (Array.isArray(b.details) ? b.details : []).slice(0, 2000).map(function (d) {
    return { word: String(d.word || '').slice(0, 100), views: +d.views || 0, wrongCount: +d.wrongCount || 0, score: +d.score || 0, timeMs: +d.timeMs || 0, skipped: !!d.skipped };
  });
  if (!details.length) return { ok: false, error: 'bad_request', message: 'Chưa có từ nào được làm.' };
  // Điểm bài = TỔNG điểm các từ đã làm (mỗi từ 0–10; từ bỏ qua = 0) nên tối đa = 10 × số từ đã làm
  const score = Number(b.score);
  if (!(score >= 0 && score <= details.length * 10)) return { ok: false, error: 'bad_request', message: 'Điểm không hợp lệ.' };
  const status = STATUSES.indexOf(b.status) >= 0 ? b.status : 'done';
  const totalWords = Math.max(0, Math.min(5000, Math.round(+b.totalWords || 0)));
  const sh = sheet_(SHEET_RESULTS, RESULT_HEADERS), data = rows_(sh);

  // Một lần làm = một submissionId = một dòng. Bản lưu tạm (partial) sẽ được cập nhật khi có thêm từ / có bản cuối.
  const idx = data.findIndex(function (r) { return String(r[0]) === id; });
  if (idx >= 0) {
    let oldN = 0; try { oldN = JSON.parse(detailsOf_(data[idx]) || '[]').length; } catch (e) {}
    const oldStatus = String(data[idx][11] || 'done');
    const progressed = details.length > oldN || (details.length === oldN && oldStatus === 'partial' && status !== 'partial');
    if (!progressed) return { ok: true, duplicate: true };          // gửi trùng / bản cũ hơn → bỏ qua
  }
  const a = findAssignment_(aid);                       // hạn nộp & số lần: ưu tiên dữ liệu đã đăng ký ở máy chủ
  const due = a ? a.due : (Number(b.due) || 0);
  const max = a ? a.max : (Number(b.max) || 0);
  const now = Date.now();
  if (due && now > due + GRACE_MS) return { ok: false, error: 'expired', message: 'Bài đã hết hạn nộp.' };
  if (idx < 0 && max > 0) {
    const cnt = data.filter(function (r) {
      return String(r[1]) === aid && String(r[4]).toLowerCase() === name.toLowerCase() && String(r[5]).toLowerCase() === cls.toLowerCase();
    }).length;
    if (cnt >= max) return { ok: false, error: 'max_attempts', message: 'Đã hết số lần làm bài cho phép.' };
  }
  const dch = chunks_(JSON.stringify(details), 10);
  if (JSON.stringify(details).length > CELL * 10) return { ok: false, error: 'too_large', message: 'Bài làm quá dài để lưu.' };
  const row = [id, aid, safe_(a ? a.name : b.assignmentName), new Date(now).toISOString(), safe_(name), safe_(cls), score,
    Math.round(+b.totalMs || 0), (due && now > due) ? 'yes' : '', dch[0], safe_(String(b.userAgent || '').slice(0, 200)), status, totalWords].concat(dch.slice(1));
  if (idx >= 0) { sh.getRange(idx + 2, 1, 1, row.length).setValues([row]); return { ok: true, updated: true }; }
  sh.appendRow(row);
  return { ok: true };
}

function linkOf_(a) { const l = String(a && a.link || ''); return l.indexOf('https://') === 0 ? safe_(l.slice(0, 4000)) : ''; }
function saveAssignment_(b) {
  if (!isTeacher_(b.teacherKey)) return { ok: false, error: 'unauthorized', message: 'Teacher Key không đúng.' };
  const a = b.assignment || {};
  if (!/^[\w-]{3,40}$/.test(String(a.id || '')) || !(Number(a.due) > 0)) return { ok: false, error: 'bad_request', message: 'Dữ liệu bài giao không hợp lệ.' };
  const words = Array.isArray(a.words) ? a.words.slice(0, 5000).map(function (w) { return { en: String(w.en).slice(0, 100), vi: String(w.vi).slice(0, 200) }; }) : null;
  let wordsJson = words ? JSON.stringify(words) : '';
  if (wordsJson.length > CELL) {                // bộ từ lớn: lưu theo mảnh ở sheet Tests, ô wordsJson để trống
    if (wordsJson.length > CELL * NCHUNK) return { ok: false, error: 'too_large', message: 'Bộ từ quá lớn để lưu.' };
    const tsh = sheet_(SHEET_TESTS, TESTS_HEADERS), td = rows_(tsh), trow = [String(a.id), safe_(String(a.name || '').slice(0, 80)), new Date().toISOString(), wordsJson.length].concat(chunks_(wordsJson, NCHUNK));
    const ti = td.findIndex(function (r) { return String(r[0]) === String(a.id); });
    if (ti >= 0) tsh.getRange(ti + 2, 1, 1, trow.length).setValues([trow]); else tsh.appendRow(trow);
    wordsJson = '';
  }
  const sh = sheet_(SHEET_ASSIGN, ASSIGN_HEADERS), data = rows_(sh);
  const row = [String(a.id), safe_(String(a.name || '').slice(0, 80)), Number(a.due), Number(a.max) || 0, !!a.req, new Date().toISOString(), wordsJson, JSON.stringify(a.tts || {}), !!a.shuffle, a.kind === 'test' ? 'test' : '', linkOf_(a)];
  const idx = data.findIndex(function (r) { return String(r[0]) === String(a.id); });
  if (idx >= 0) sh.getRange(idx + 2, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
  return { ok: true };
}

/* ---------- BÀI TEST ---------- */
function saveTest_(b) {
  if (!isTeacher_(b.teacherKey)) return { ok: false, error: 'unauthorized', message: 'Teacher Key không đúng.' };
  const a = b.assignment || {};
  const meta = saveAssignment_({ teacherKey: b.teacherKey, assignment: { id: a.id, name: a.name, due: a.due, max: a.max, req: a.req, words: null, tts: {}, shuffle: false, kind: 'test', link: a.link } });   // hạn nộp / số lần: dùng chung sheet Assignments
  if (!meta.ok) return meta;
  if (b.test) {
    let nq = 0; (Array.isArray(b.test.sections) ? b.test.sections : [{ questions: b.test.questions || [] }]).forEach(function (s) { nq += (s.questions || []).length; });   // đề mới có sections; đề cũ có questions
    if (!nq || nq > 500) return { ok: false, error: 'bad_request', message: 'Đề test không hợp lệ.' };
    const js = JSON.stringify(b.test);
    if (js.length > CELL * NCHUNK) return { ok: false, error: 'too_large', message: 'Đề test quá lớn để lưu.' };
    const chunks = chunks_(js, NCHUNK);
    const sh = sheet_(SHEET_TESTS, TESTS_HEADERS), data = rows_(sh);
    const row = [String(a.id), safe_(String(a.name || '').slice(0, 80)), new Date().toISOString(), js.length].concat(chunks);
    const idx = data.findIndex(function (r) { return String(r[0]) === String(a.id); });
    if (idx >= 0) sh.getRange(idx + 2, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
  }
  return { ok: true };
}
/** Mã các bài là BÀI TEST (đánh dấu kind, có kết quả TestResults, hoặc đề lưu ở sheet Tests) */
function blobIds_() { const set = {}; rows_(sheet_(SHEET_TESTS, TESTS_HEADERS)).forEach(function (r) { if (String(r[0])) set[String(r[0])] = 1; }); return set; }
function testIds_() {
  const set = {};
  rows_(sheet_(SHEET_ASSIGN, ASSIGN_HEADERS)).forEach(function (r) { if (String(r[9]) === 'test') set[String(r[0])] = 1; });
  rows_(sheet_(SHEET_TRES, TRES_HEADERS)).forEach(function (r) { set[String(r[1])] = 1; });
  rows_(sheet_(SHEET_TESTS, TESTS_HEADERS)).forEach(function (r) { if (String(r[4]).charAt(0) === '{') set[String(r[0])] = 1; });   // đề (object); bộ từ lớn là mảng '['
  return set;
}
function findTest_(id) {
  const r = rows_(sheet_(SHEET_TESTS, TESTS_HEADERS)).find(function (x) { return String(x[0]) === id; });
  if (!r) return null;
  try { return JSON.parse(r.slice(4, 4 + NCHUNK).join('')); } catch (e) { return null; }
}
function submitTest_(b) {
  const id = String(b.submissionId || ''), aid = String(b.assignmentId || '');
  if (!/^[\w-]{8,64}$/.test(id) || !/^[\w-]{3,40}$/.test(aid)) return { ok: false, error: 'bad_request', message: 'Thiếu mã bài hoặc mã nộp.' };
  const name = String(b.name || '').trim().slice(0, 60) || 'Ẩn danh';
  const cls = String(b.cls || '').trim().slice(0, 20);
  let items = (Array.isArray(b.items) ? b.items : []).slice(0, 500).map(function (d) {
    const m = Math.max(0, Math.min(100, +d.m || 0)), g = Math.max(0, Math.min(m, +d.g || 0));
    return { id: String(d.id || '').slice(0, 20), q: String(d.q || '').slice(0, 80), t: String(d.t || '').slice(0, 8), a: String(d.a || '').slice(0, 120), g: g, m: m, ok: String(d.ok || '').slice(0, 8) };
  });
  if (!items.length) return { ok: false, error: 'bad_request', message: 'Bài nộp trống.' };
  let score = 0, maxScore = 0;
  items.forEach(function (d) { score += d.g; maxScore += d.m; });          // điểm tính lại ở máy chủ từ từng câu
  score = Math.round(score * 100) / 100; maxScore = Math.round(maxScore * 100) / 100;
  if (JSON.stringify(items).length > 48000) items = items.map(function (d) { return { id: d.id, q: d.q, t: d.t, a: '', g: d.g, m: d.m, ok: d.ok }; });     // quá dài → bỏ câu trả lời
  if (JSON.stringify(items).length > 48000) items = items.map(function (d) { return { id: d.id, q: '', t: d.t, a: '', g: d.g, m: d.m, ok: d.ok }; });   // vẫn dài → bỏ cả nội dung câu hỏi
  const sh = sheet_(SHEET_TRES, TRES_HEADERS), data = rows_(sh);
  if (data.some(function (r) { return String(r[0]) === id; })) return { ok: true, duplicate: true };
  const a = findAssignment_(aid), due = a ? a.due : (Number(b.due) || 0), max = a ? a.max : (Number(b.max) || 0), now = Date.now();
  if (due && now > due + GRACE_MS) return { ok: false, error: 'expired', message: 'Bài đã hết hạn nộp.' };
  if (max > 0) {
    const cnt = data.filter(function (r) { return String(r[1]) === aid && String(r[4]).toLowerCase() === name.toLowerCase() && String(r[5]).toLowerCase() === cls.toLowerCase(); }).length;
    if (cnt >= max) return { ok: false, error: 'max_attempts', message: 'Đã hết số lần làm bài cho phép.' };
  }
  sh.appendRow([id, aid, safe_(a ? a.name : b.assignmentName), new Date(now).toISOString(), safe_(name), safe_(cls), score, maxScore, Math.round(+b.totalMs || 0), (due && now > due) ? 'yes' : '', JSON.stringify(items), safe_(String(b.userAgent || '').slice(0, 200))]);
  return { ok: true };
}


/* ---------- XÓA DỮ LIỆU MỘT BÀI GIAO (chỉ khi đã hết hạn) ---------- */
/** Xóa mọi dòng có cột col (0-based) = id; xóa theo khối liên tiếp từ dưới lên cho nhanh. Trả về số dòng đã xóa. */
function deleteRows_(sh, col, id) {
  const n = sh.getLastRow(); if (n < 2) return 0;
  const vals = sh.getRange(2, col + 1, n - 1, 1).getValues(), hit = [];
  vals.forEach(function (v, i) { if (String(v[0]) === id) hit.push(i + 2); });
  if (!hit.length) return 0;
  if (sh.getMaxRows() < sh.getLastRow() + 5) sh.insertRowsAfter(sh.getMaxRows(), 5);   // Sheets không cho xóa hết các dòng không bị đóng băng
  let cnt = 0, i = hit.length - 1;
  while (i >= 0) { let j = i; while (j > 0 && hit[j - 1] === hit[j] - 1) j--; sh.deleteRows(hit[j], i - j + 1); cnt += i - j + 1; i = j - 1; }
  return cnt;
}
function deleteAssignment_(b) {
  if (!isTeacher_(b.teacherKey)) return { ok: false, error: 'unauthorized', message: 'Teacher Key không đúng.' };
  const id = String(b.id || '');
  if (!/^[\w-]{3,40}$/.test(id)) return { ok: false, error: 'bad_request', message: 'Mã bài không hợp lệ.' };
  const a = findAssignment_(id);
  if (a && !(a.due > 0 && Date.now() > a.due)) return { ok: false, error: 'not_expired', message: 'Bài chưa hết hạn nộp nên chưa thể xóa dữ liệu.' };   // bài chưa đăng ký (chỉ còn kết quả mồ côi) thì cho xóa
  const out = {
    results: deleteRows_(sheet_(SHEET_RESULTS, RESULT_HEADERS), 1, id),
    testResults: deleteRows_(sheet_(SHEET_TRES, TRES_HEADERS), 1, id),
    tests: deleteRows_(sheet_(SHEET_TESTS, TESTS_HEADERS), 0, id),
    assignment: deleteRows_(sheet_(SHEET_ASSIGN, ASSIGN_HEADERS), 0, id)
  };
  return { ok: true, deleted: out };
}

/* ---------- GET: ping / lấy bài / thống kê ---------- */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = p.action || 'ping';
    if (action === 'ping') return json_({ ok: true, teacher: isTeacher_(p.teacherKey), time: Date.now(), v: VERSION });

    if (action === 'getAssignment') {            // công khai (học sinh) – chỉ trả dữ liệu bài, không có kết quả
      const a = findAssignment_(String(p.id || ''), true);
      if (!a) return json_({ ok: false, error: 'not_found' });
      return json_({ ok: true, assignment: { id: a.id, name: a.name, due: a.due, max: a.max, req: a.req, words: a.words, tts: a.tts, shuffle: a.shuffle } });
    }

    if (action === 'getTest') {                  // công khai (học sinh) – trả đề + hạn nộp, không có kết quả
      const id = String(p.id || ''), a = findAssignment_(id), test = findTest_(id);
      if (!a || !test) return json_({ ok: false, error: 'not_found' });
      return json_({ ok: true, assignment: { id: a.id, name: a.name, due: a.due, max: a.max, req: a.req, test: test } });
    }

    if (!isTeacher_(p.teacherKey)) return json_({ ok: false, error: 'unauthorized', message: 'Teacher Key không đúng.' });

    if (action === 'assignments') {
      const res = rows_(sheet_(SHEET_RESULTS, RESULT_HEADERS)), map = {}, tids = testIds_(), tset = blobIds_();
      rows_(sheet_(SHEET_ASSIGN, ASSIGN_HEADERS)).forEach(function (r) { if (!String(r[0]) || tids[String(r[0])]) return; map[String(r[0])] = { id: String(r[0]), name: String(r[1]), due: Number(r[2]) || 0, createdAt: iso_(r[5]), count: 0, link: String(r[10] || ''), hasData: !!r[6] || !!tset[String(r[0])] }; });
      res.forEach(function (r) {
        const id = String(r[1]);
        if (!id || tids[id]) return;
        if (!map[id]) map[id] = { id: id, name: String(r[2] || id), due: 0, createdAt: iso_(r[3]), count: 0 };
        map[id].count++;
      });
      const list = Object.keys(map).map(function (k) { return map[k]; }).sort(function (x, y) { return y.createdAt < x.createdAt ? -1 : 1; });
      return json_({ ok: true, assignments: list });
    }

    if (action === 'testAssignments') {
      const map = {}, tset = blobIds_();
      rows_(sheet_(SHEET_ASSIGN, ASSIGN_HEADERS)).forEach(function (r) { if (String(r[0]) && String(r[9]) === 'test') map[String(r[0])] = { id: String(r[0]), name: String(r[1]), due: Number(r[2]) || 0, createdAt: iso_(r[5]), count: 0, link: String(r[10] || ''), hasData: !!tset[String(r[0])] }; });
      rows_(sheet_(SHEET_TESTS, TESTS_HEADERS)).forEach(function (r) { const id = String(r[0]); if (id && String(r[4]).charAt(0) === '{' && !map[id]) map[id] = { id: id, name: String(r[1]), due: 0, createdAt: iso_(r[2]), count: 0, link: '', hasData: true }; });
      rows_(sheet_(SHEET_TRES, TRES_HEADERS)).forEach(function (r) {
        const id = String(r[1]);
        if (id && !map[id]) map[id] = { id: id, name: String(r[2] || id), due: 0, createdAt: iso_(r[3]), count: 0, link: '', hasData: false };
        if (!id) return;
        map[id].count++;
      });
      return json_({ ok: true, assignments: Object.keys(map).map(function (k) { return map[k]; }).sort(function (x, y) { return y.createdAt < x.createdAt ? -1 : 1; }) });
    }

    if (action === 'testResults') {
      const id = String(p.id || '');
      const results = rows_(sheet_(SHEET_TRES, TRES_HEADERS)).filter(function (r) { return String(r[1]) === id; }).map(function (r) {
        let items = []; try { items = JSON.parse(r[10] || '[]'); } catch (x) {}
        return { submissionId: String(r[0]), assignmentId: String(r[1]), submittedAt: iso_(r[3]), name: String(r[4]), cls: String(r[5]), score: Number(r[6]), max: Number(r[7]), totalMs: Number(r[8]), late: String(r[9]) === 'yes', items: items };
      });
      return json_({ ok: true, results: results });
    }

    if (action === 'results') {
      const id = String(p.id || ''), all = id === 'all';          // id = 'all' → mọi bài (để cộng điểm học sinh qua nhiều bài)
      const a = all ? null : findAssignment_(id);
      const results = rows_(sheet_(SHEET_RESULTS, RESULT_HEADERS)).filter(function (r) { return all || String(r[1]) === id; }).map(function (r) {
        let details = []; try { details = JSON.parse(detailsOf_(r) || '[]'); } catch (x) {}
        return { submissionId: String(r[0]), assignmentId: String(r[1]), assignmentName: String(r[2]), submittedAt: iso_(r[3]), name: String(r[4]), cls: String(r[5]), score: Number(r[6]), totalMs: Number(r[7]),
          late: String(r[8]) === 'yes', details: details, status: String(r[11] || 'done'), totalWords: Number(r[12]) || 0 };
      });
      return json_({ ok: true, assignment: all ? { id: 'all', name: 'Tất cả các bài', due: 0 } : (a ? { id: a.id, name: a.name, due: a.due } : { id: id, name: id }), results: results });
    }
    return json_({ ok: false, error: 'bad_request', message: 'Hành động không hợp lệ.' });
  } catch (err) { return json_({ ok: false, error: 'server_error', message: String(err) }); }
}
