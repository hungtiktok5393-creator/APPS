/**
 * Nhà Thầy Hưng (Spelling Mastery) – Backend Google Apps Script
 * Gắn vào Google Sheet (Extensions → Apps Script) rồi Deploy dạng Web app.
 * Sheet "Results" và "Assignments" được tự tạo ở lần gọi đầu tiên.
 */

/** (Cũ, vẫn dùng được) Nên đặt teacherKey ở Project Settings → Script Properties → TEACHER_KEY; nếu có thì ưu tiên hơn hằng số này. */
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
const VERSION = 11;                       // ping trả về số này để ứng dụng biết Apps Script đã được cập nhật chưa
const NCHUNK = 20;
const TESTS_HEADERS = ['id', 'name', 'createdAt', 'n'].concat(Array.from({ length: NCHUNK }, function (_, i) { return 'c' + i; }));   // đề test / bộ từ lớn: cắt tối đa 20 mảnh x 45.000 ký tự
const TRES_HEADERS = ['submissionId', 'testId', 'testName', 'submittedAt', 'name', 'cls', 'score', 'maxScore', 'totalMs', 'late', 'items', 'userAgent'];
const ASSIGN_HEADERS = ['id', 'name', 'due', 'max', 'req', 'createdAt', 'wordsJson', 'ttsJson', 'shuffle', 'kind', 'link', 'correctPts', 'peekPenalty', 'codes'];   // codes (cột 14) = danh sách mã học sinh được giao, cách nhau dấu phẩy (ô trống = giao cho mọi mã) · correctPts / peekPenalty (cột 12, 13) = điểm cộng mỗi từ đúng / điểm trừ mỗi lần xem lại RIÊNG của bài từ vựng (ô trống = dùng mặc định chung trong Config) · link = đường link giao bài (để xem / copy lại trong Thống kê) · kind = 'test' cho bài test (để không lẫn vào Thống kê bài từ vựng)

/* ---------- Tiện ích ---------- */
function json_(o) { return o; }   // hàm cũ trả về object; jsonOut_ (v8) đóng gói JSON ở doPost/doGet
/* TỐC ĐỘ: mở Spreadsheet / Sheet MỘT lần cho mỗi lượt gọi (trước đây mở lại ở mọi hàm). */
let _ss = null; const _sh = {};
function ss_() { return _ss || (_ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet()); }
function sheet_(name, headers) {
  if (_sh[name]) return _sh[name];
  const ss = ss_(); let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); }
  else if (sh.getLastColumn() < headers.length) {   // sheet tạo từ bản cũ: CHỈ ghi thêm tiêu đề các cột còn thiếu (không đụng dữ liệu / tiêu đề cũ)
    const have = sh.getLastColumn();
    if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    sh.getRange(1, have + 1, 1, headers.length - have).setValues([headers.slice(have)]);
  }
  return (_sh[name] = sh);
}
/** Đọc TOÀN BỘ sheet – chỉ dùng cho sheet nhỏ (Assignments). Sheet lớn (Results, TestResults, Tests) phải đọc theo cột / theo dòng cần thiết. */
function rows_(sh) { const n = sh.getLastRow(); return n < 2 ? [] : sh.getRange(2, 1, n - 1, sh.getLastColumn()).getValues(); }
/** Đọc một khối cột liên tiếp (col bắt đầu từ 1) – bỏ qua các cột 'details'/'items'/mảnh đề rất nặng. */
function cols_(sh, col, num) { const n = sh.getLastRow(); return n < 2 ? [] : sh.getRange(2, col, n - 1, num).getValues(); }
/** Số dòng (>= 2) đầu tiên có cột col (1-based) = id; 0 nếu không có. Chỉ đọc đúng một cột. */
function findRow_(sh, col, id) {
  const v = cols_(sh, col, 1);
  for (let i = 0; i < v.length; i++) if (String(v[i][0]) === id) return i + 2;
  return 0;
}
/** Các dòng đầy đủ (ncol cột) mà cột khóa col (1-based) thỏa test(). Chỉ đọc cột khóa, rồi đọc đúng các khối dòng trúng. */
function readWhere_(sh, col, test, ncol) {
  const n = sh.getLastRow(); if (n < 2) return [];
  ncol = Math.min(ncol, sh.getLastColumn());
  const keys = sh.getRange(2, col, n - 1, 1).getValues(), hit = [];
  keys.forEach(function (k, i) { if (test(String(k[0]))) hit.push(i + 2); });
  if (!hit.length) return [];
  const blocks = [];
  hit.forEach(function (r) { const b = blocks[blocks.length - 1]; if (b && r === b[1] + 1) b[1] = r; else blocks.push([r, r]); });
  if (blocks.length > 6) return sh.getRange(2, 1, n - 1, ncol).getValues().filter(function (_, i) { return test(String(keys[i][0])); });   // quá nhiều khối rời → đọc một lần cho nhanh
  let out = [];
  blocks.forEach(function (b) { out = out.concat(sh.getRange(b[0], 1, b[1] - b[0] + 1, ncol).getValues()); });
  return out;
}
/* Bộ nhớ đệm (CacheService): bài giao / đề test được học sinh mở liên tục → không đọc Sheet lại mỗi lần. Xóa khi lưu / xóa bài. */
function cget_(k) { try { const v = CacheService.getScriptCache().get(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function cput_(k, o, sec) { try { const s = JSON.stringify(o); if (s.length < 32000) CacheService.getScriptCache().put(k, s, sec || 900); } catch (e) {} }   // giới hạn 100 KB/giá trị (UTF-8) → chỉ lưu bản ≤ ~32.000 ký tự
function cdel_(id) { try { CacheService.getScriptCache().removeAll(['a:' + id, 'aw:' + id, 'a2:' + id, 'aw2:' + id, 'a3:' + id, 'aw3:' + id, 'tst:' + id, 'ola', 'ola2']); } catch (e) {} }
function chunks_(s, n) { const out = []; for (let i = 0; i < s.length && out.length < n; i += CELL) out.push(s.slice(i, i + CELL)); while (out.length < n) out.push(''); return out; }
function detailsOf_(r) { return [r[9]].concat(r.slice(13, 22)).join(''); }
/** Chặn formula injection khi mở bằng Sheets/Excel */
function safe_(v) { v = String(v == null ? '' : v); return /^[=+\-@]/.test(v) ? "'" + v : v; }
function iso_(v) { return v instanceof Date ? v.toISOString() : String(v); }
function isTeacher_(key) {
  const k = teacherKey_();
  return k.length > 0 && typeof key === 'string' && key.length > 0 && key === k;
}
function loadBlob_(id) {                    // dữ liệu lớn (bộ từ / đề) lưu theo mảnh trong sheet Tests – chỉ đọc ĐÚNG dòng của bài
  const sh = sheet_(SHEET_TESTS, TESTS_HEADERS), row = findRow_(sh, 1, id);
  if (!row) return null;
  try { return JSON.parse(sh.getRange(row, 5, 1, NCHUNK).getValues()[0].join('')); } catch (e) { return null; }
}
/** Điểm riêng của bài: ô trống / không phải số → null (dùng mặc định chung); số → nguyên 0–1000. */
function ptsOrNull_(v) { if (v === '' || v == null || typeof v === 'boolean') return null; const n = Number(v); return isFinite(n) ? Math.max(0, Math.min(1000, Math.round(n))) : null; }
/** Danh sách mã học sinh được giao (mảng / chuỗi cách nhau dấu phẩy, chấm phẩy, xuống dòng) → mảng mã đã chuẩn hoá, không trùng, tối đa 1000. */
function codesList_(v) {
  const src = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,;\r\n]+/), seen = {}, out = [];
  src.forEach(function (x) { const c = normCode_(x); if (c.length >= CODE_MIN && !seen[c]) { seen[c] = 1; out.push(c); } });
  return out.slice(0, 1000);
}
/** Bài có được giao cho mã này không: bài không chọn mã (giao chung) → mọi mã đều được. */
function assignedTo_(a, code) { const L = (a && a.codes) || []; return !L.length || L.indexOf(normCode_(code)) >= 0; }
function notAssigned_() { return { ok: false, error: 'not_assigned', message: 'Bài này không được giao cho mã học sinh của bạn.' }; }
function findAssignment_(id, withWords) {
  const ck = (withWords ? 'aw3:' : 'a3:') + id, hitC = cget_(ck);
  if (hitC) return hitC;
  const sh = sheet_(SHEET_ASSIGN, ASSIGN_HEADERS), row = findRow_(sh, 1, id);
  if (!row) return null;
  const r = sh.getRange(row, 1, 1, ASSIGN_HEADERS.length).getValues()[0];
  let words = null, tts = null;
  try { words = JSON.parse(r[6] || 'null'); } catch (e) {}
  try { tts = JSON.parse(r[7] || 'null'); } catch (e) {}
  if (withWords && !words) { const b = loadBlob_(id); if (Array.isArray(b)) words = b; }
  const a = { id: String(r[0]), name: String(r[1]), due: Number(r[2]) || 0, max: Number(r[3]) || 0, req: r[4] === true || r[4] === 'TRUE' || r[4] === 1, createdAt: iso_(r[5]), words: words, tts: tts, shuffle: r[8] === true || r[8] === 'TRUE', correctPts: ptsOrNull_(r[11]), peekPenalty: ptsOrNull_(r[12]), codes: codesList_(r[13]) };
  cput_(ck, a); return a;
}

/* ---------- POST cũ: nộp bài / lưu bài giao ---------- */
/** Các action cũ (POST) – được route() gọi trong khoá script như trước. */
function legacyPost_(action, body) {
  return withLock_(function () {
    if (action === 'submit') return json_(submit_(body));
    if (action === 'saveAssignment') return json_(saveAssignment_(body));
    if (action === 'submitTest') return json_(submitTest_(body));
    if (action === 'saveTest') return json_(saveTest_(body));
    if (action === 'deleteAssignment') return json_(deleteAssignment_(body));
    return json_({ ok: false, error: 'bad_request', message: 'Hành động không hợp lệ.' });
  });
}

function submit_(b) {
  const id = String(b.submissionId || ''), aid = String(b.assignmentId || '');
  if (!/^[\w-]{8,64}$/.test(id) || !/^[\w-]{3,40}$/.test(aid)) return { ok: false, error: 'bad_request', message: 'Thiếu mã bài hoặc mã nộp.' };
  const name = String(b.name || '').trim().slice(0, 60) || 'Ẩn danh';
  const cls = String(b.cls || '').trim().slice(0, 20);
  const au = studentAuthErr_(name, b); if (au) return au;
  const details = (Array.isArray(b.details) ? b.details : []).slice(0, 2000).map(function (d) {
    return { word: String(d.word || '').slice(0, 100), views: +d.views || 0, wrongCount: +d.wrongCount || 0, score: +d.score || 0, timeMs: +d.timeMs || 0, skipped: !!d.skipped };
  });
  if (!details.length) return { ok: false, error: 'bad_request', message: 'Chưa có từ nào được làm.' };
  // Điểm bài = TỔNG điểm các từ đã làm (mỗi từ 0–10; từ bỏ qua = 0) nên tối đa = 10 × số từ đã làm
  const score = Number(b.score);
  if (!(score >= 0 && score <= details.length * 10)) return { ok: false, error: 'bad_request', message: 'Điểm không hợp lệ.' };
  const status = STATUSES.indexOf(b.status) >= 0 ? b.status : 'done';
  const totalWords = Math.max(0, Math.min(5000, Math.round(+b.totalWords || 0)));
  const sh = sheet_(SHEET_RESULTS, RESULT_HEADERS), data = cols_(sh, 1, 6);   // TỐC ĐỘ: chỉ đọc cột A:F (mã, bài, tên, lớp) – không đọc các cột 'details' rất nặng

  // Một lần làm = một submissionId = một dòng. Bản lưu tạm (partial) sẽ được cập nhật khi có thêm từ / có bản cuối.
  const idx = data.findIndex(function (r) { return String(r[0]) === id; });
  if (idx >= 0) {
    const old = sh.getRange(idx + 2, 1, 1, RESULT_HEADERS.length).getValues()[0];     // chỉ đọc đúng dòng này
    let oldN = 0; try { oldN = JSON.parse(detailsOf_(old) || '[]').length; } catch (e) {}
    const oldStatus = String(old[11] || 'done');
    const progressed = details.length > oldN || (details.length === oldN && oldStatus === 'partial' && status !== 'partial');
    if (!progressed) return { ok: true, duplicate: true };          // gửi trùng / bản cũ hơn → bỏ qua
  }
  const a = findAssignment_(aid);                       // hạn nộp & số lần: ưu tiên dữ liệu đã đăng ký ở máy chủ
  if (a && !assignedTo_(a, name)) return notAssigned_();   // bài giao riêng: chỉ mã được chọn mới nộp được (name = mã học sinh)
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

/** Bài nộp đứng tên một mã học sinh có mật khẩu → phải kèm token đúng (chống nộp bài giả dưới mã của bạn khác). */
function studentAuthErr_(name, b) {
  const st = getStudent_(name); if (!st || !st.password) return null;
  try { requireAuth_('S', st.code, st.password, { token: b.token }); return null; } catch (e) { return { ok: false, error: e.apiCode || 'auth_required', message: e.message }; }
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
    const tsh = sheet_(SHEET_TESTS, TESTS_HEADERS), trow = [String(a.id), safe_(String(a.name || '').slice(0, 80)), new Date().toISOString(), wordsJson.length].concat(chunks_(wordsJson, NCHUNK));
    const ti = findRow_(tsh, 1, String(a.id));
    if (ti) tsh.getRange(ti, 1, 1, trow.length).setValues([trow]); else tsh.appendRow(trow);
    wordsJson = '';
  }
  const sh = sheet_(SHEET_ASSIGN, ASSIGN_HEADERS);
  const row = [String(a.id), safe_(String(a.name || '').slice(0, 80)), Number(a.due), Number(a.max) || 0, !!a.req, new Date().toISOString(), wordsJson, JSON.stringify(a.tts || {}), !!a.shuffle, a.kind === 'test' ? 'test' : '', linkOf_(a)];
  while (row.length < ASSIGN_HEADERS.length) row.push('');
  const cp = ptsOrNull_(a.correctPts), pp = ptsOrNull_(a.peekPenalty);   // thiếu / không phải số → ô trống
  row[11] = cp === null ? '' : cp; row[12] = pp === null ? '' : pp;
  row[13] = codesList_(a.codes).join(',');                              // trống = giao cho mọi mã
  const idx = findRow_(sh, 1, String(a.id));
  if (idx) sh.getRange(idx, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
  cdel_(String(a.id));
  return { ok: true };
}

/* ---------- BÀI TEST ---------- */
function saveTest_(b) {
  if (!isTeacher_(b.teacherKey)) return { ok: false, error: 'unauthorized', message: 'Teacher Key không đúng.' };
  const a = b.assignment || {};
  const meta = saveAssignment_({ teacherKey: b.teacherKey, assignment: { id: a.id, name: a.name, due: a.due, max: a.max, req: a.req, words: null, tts: {}, shuffle: false, kind: 'test', link: a.link, codes: a.codes } });   // hạn nộp / số lần: dùng chung sheet Assignments
  if (!meta.ok) return meta;
  if (b.test) {
    let nq = 0; (Array.isArray(b.test.sections) ? b.test.sections : [{ questions: b.test.questions || [] }]).forEach(function (s) { nq += (s.questions || []).length; });   // đề mới có sections; đề cũ có questions
    if (!nq || nq > 500) return { ok: false, error: 'bad_request', message: 'Đề test không hợp lệ.' };
    const js = JSON.stringify(b.test);
    if (js.length > CELL * NCHUNK) return { ok: false, error: 'too_large', message: 'Đề test quá lớn để lưu.' };
    const chunks = chunks_(js, NCHUNK);
    const sh = sheet_(SHEET_TESTS, TESTS_HEADERS);
    const row = [String(a.id), safe_(String(a.name || '').slice(0, 80)), new Date().toISOString(), js.length].concat(chunks);
    const idx = findRow_(sh, 1, String(a.id));
    if (idx) sh.getRange(idx, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
    cdel_(String(a.id));
  }
  return { ok: true };
}
/** Đọc 1 lần các dữ liệu dùng chung cho danh sách bài: sheet Tests chỉ cột A:E (mã + mảnh đầu), TestResults chỉ cột B (mã bài). */
function listCtx_() {
  const A = rows_(sheet_(SHEET_ASSIGN, ASSIGN_HEADERS)), T = cols_(sheet_(SHEET_TESTS, TESTS_HEADERS), 1, 5), TR = cols_(sheet_(SHEET_TRES, TRES_HEADERS), 2, 3);
  const blob = {}, tids = {};
  T.forEach(function (r) { const id = String(r[0]); if (!id) return; blob[id] = 1; if (String(r[4]).charAt(0) === '{') tids[id] = 1; });   // đề (object); bộ từ lớn là mảng '['
  A.forEach(function (r) { if (String(r[9]) === 'test') tids[String(r[0])] = 1; });
  TR.forEach(function (r) { tids[String(r[0])] = 1; });
  return { A: A, T: T, TR: TR, blob: blob, tids: tids };
}
function findTest_(id) {
  const ck = 'tst:' + id, hitC = cget_(ck); if (hitC) return hitC;
  const sh = sheet_(SHEET_TESTS, TESTS_HEADERS), row = findRow_(sh, 1, id);
  if (!row) return null;
  try { const t = JSON.parse(sh.getRange(row, 5, 1, NCHUNK).getValues()[0].join('')); cput_(ck, t); return t; } catch (e) { return null; }
}
function submitTest_(b) {
  const id = String(b.submissionId || ''), aid = String(b.assignmentId || '');
  if (!/^[\w-]{8,64}$/.test(id) || !/^[\w-]{3,40}$/.test(aid)) return { ok: false, error: 'bad_request', message: 'Thiếu mã bài hoặc mã nộp.' };
  const name = String(b.name || '').trim().slice(0, 60) || 'Ẩn danh';
  const cls = String(b.cls || '').trim().slice(0, 20);
  const au = studentAuthErr_(name, b); if (au) return au;
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
  const sh = sheet_(SHEET_TRES, TRES_HEADERS), data = cols_(sh, 1, 6);      // TỐC ĐỘ: chỉ đọc cột A:F, không đọc cột 'items'
  if (data.some(function (r) { return String(r[0]) === id; })) return { ok: true, duplicate: true };
  const a = findAssignment_(aid), due = a ? a.due : (Number(b.due) || 0), max = a ? a.max : (Number(b.max) || 0), now = Date.now();
  if (a && !assignedTo_(a, name)) return notAssigned_();
  if (due && now > due + GRACE_MS) return { ok: false, error: 'expired', message: 'Bài đã hết hạn nộp.' };
  if (max > 0) {
    const cnt = data.filter(function (r) { return String(r[1]) === aid && String(r[4]).toLowerCase() === name.toLowerCase() && String(r[5]).toLowerCase() === cls.toLowerCase(); }).length;
    if (cnt >= max) return { ok: false, error: 'max_attempts', message: 'Đã hết số lần làm bài cho phép.' };
  }
  sh.appendRow([id, aid, safe_(a ? a.name : b.assignmentName), new Date(now).toISOString(), safe_(name), safe_(cls), score, maxScore, Math.round(+b.totalMs || 0), (due && now > due) ? 'yes' : '', JSON.stringify(items), safe_(String(b.userAgent || '').slice(0, 200))]);
  return { ok: true };
}


/* ---------- XÓA DỮ LIỆU MỘT BÀI GIAO (luôn cho phép, kể cả khi chưa hết hạn) ---------- */
/** Xóa mọi dòng có cột col (0-based) = id. Ít khối liên tiếp → xóa từng khối (từ dưới lên); nhiều khối rời → ghi lại cả bảng MỘT lần (nhanh hơn nhiều so với hàng chục lệnh deleteRows). Trả về số dòng đã xóa. */
function deleteRows_(sh, col, id) {
  const n = sh.getLastRow(); if (n < 2) return 0;
  const vals = sh.getRange(2, col + 1, n - 1, 1).getValues(), hit = [];
  vals.forEach(function (v, i) { if (String(v[0]) === id) hit.push(i + 2); });
  if (!hit.length) return 0;
  const blocks = [];
  hit.forEach(function (r) { const b = blocks[blocks.length - 1]; if (b && r === b[1] + 1) b[1] = r; else blocks.push([r, r]); });
  if (blocks.length <= 3) {
    if (sh.getMaxRows() < sh.getLastRow() + 5) sh.insertRowsAfter(sh.getMaxRows(), 5);   // Sheets không cho xóa hết các dòng không bị đóng băng
    for (let k = blocks.length - 1; k >= 0; k--) sh.deleteRows(blocks[k][0], blocks[k][1] - blocks[k][0] + 1);
  } else {
    const lc = sh.getLastColumn(), all = sh.getRange(2, 1, n - 1, lc).getValues();
    const keep = all.filter(function (_, i) { return String(vals[i][0]) !== id; }).map(function (r) { return r.map(function (c) { return typeof c === 'string' ? safe_(c) : c; }); });   // safe_: không để ô văn bản bị hiểu thành công thức khi ghi lại
    sh.getRange(2, 1, n - 1, lc).clearContent();
    if (keep.length) sh.getRange(2, 1, keep.length, lc).setValues(keep);
  }
  return hit.length;
}
function deleteAssignment_(b) {
  if (!isTeacher_(b.teacherKey)) return { ok: false, error: 'unauthorized', message: 'Teacher Key không đúng.' };
  const id = String(b.id || '');
  if (!/^[\w-]{3,40}$/.test(id)) return { ok: false, error: 'bad_request', message: 'Mã bài không hợp lệ.' };
  const out = {
    assignment: deleteRows_(sheet_(SHEET_ASSIGN, ASSIGN_HEADERS), 0, id),      // xóa dòng đăng ký trước → học sinh mở link sẽ thấy "không tìm thấy" ngay
    tests: deleteRows_(sheet_(SHEET_TESTS, TESTS_HEADERS), 0, id),
    results: deleteRows_(sheet_(SHEET_RESULTS, RESULT_HEADERS), 1, id),
    testResults: deleteRows_(sheet_(SHEET_TRES, TRES_HEADERS), 1, id)
  };
  cdel_(id);
  return { ok: true, deleted: out };
}

/* ---------- GET: ping / lấy bài / thống kê ---------- */
function legacyGet_(p, action) {
  try {
    if (action === 'ping') return json_({ ok: true, teacher: isTeacher_(p.teacherKey), time: Date.now(), v: VERSION });

    if (action === 'getAssignment') {            // công khai (học sinh) – chỉ trả dữ liệu bài, không có kết quả
      const a = findAssignment_(String(p.id || ''), true);
      if (!a) return json_({ ok: false, error: 'not_found' });
      return json_({ ok: true, assignment: { id: a.id, name: a.name, due: a.due, max: a.max, req: a.req, words: a.words, tts: a.tts, shuffle: a.shuffle, correctPts: a.correctPts, peekPenalty: a.peekPenalty } });
    }

    if (action === 'getTest') {                  // công khai (học sinh) – trả đề + hạn nộp, không có kết quả
      const id = String(p.id || ''), a = findAssignment_(id), test = findTest_(id);
      if (!a || !test) return json_({ ok: false, error: 'not_found' });
      return json_({ ok: true, assignment: { id: a.id, name: a.name, due: a.due, max: a.max, req: a.req, test: test } });
    }

    if (!isTeacher_(p.teacherKey)) return json_({ ok: false, error: 'unauthorized', message: 'Teacher Key không đúng.' });

    if (action === 'assignments') {
      const c = listCtx_(), res = cols_(sheet_(SHEET_RESULTS, RESULT_HEADERS), 2, 3), map = {};   // Results: chỉ cột B:D (mã bài, tên bài, ngày nộp)
      c.A.forEach(function (r) { if (!String(r[0]) || c.tids[String(r[0])]) return; map[String(r[0])] = { id: String(r[0]), name: String(r[1]), due: Number(r[2]) || 0, createdAt: iso_(r[5]), count: 0, link: String(r[10] || ''), hasData: !!r[6] || !!c.blob[String(r[0])], codes: codesList_(r[13]) }; });
      res.forEach(function (r) {
        const id = String(r[0]);
        if (!id || c.tids[id]) return;
        if (!map[id]) map[id] = { id: id, name: String(r[1] || id), due: 0, createdAt: iso_(r[2]), count: 0 };
        map[id].count++;
      });
      const list = Object.keys(map).map(function (k) { return map[k]; }).sort(function (x, y) { return y.createdAt < x.createdAt ? -1 : 1; });
      return json_({ ok: true, assignments: list });
    }

    if (action === 'testAssignments') {
      const c = listCtx_(), map = {};
      c.A.forEach(function (r) { if (String(r[0]) && String(r[9]) === 'test') map[String(r[0])] = { id: String(r[0]), name: String(r[1]), due: Number(r[2]) || 0, createdAt: iso_(r[5]), count: 0, link: String(r[10] || ''), hasData: !!c.blob[String(r[0])], codes: codesList_(r[13]) }; });
      c.T.forEach(function (r) { const id = String(r[0]); if (id && String(r[4]).charAt(0) === '{' && !map[id]) map[id] = { id: id, name: String(r[1]), due: 0, createdAt: iso_(r[2]), count: 0, link: '', hasData: true }; });
      c.TR.forEach(function (r) {        // cột B:D của TestResults: mã bài, tên bài, ngày nộp
        const id = String(r[0]);
        if (!id) return;
        if (!map[id]) map[id] = { id: id, name: String(r[1] || id), due: 0, createdAt: iso_(r[2]), count: 0, link: '', hasData: false };
        map[id].count++;
      });
      return json_({ ok: true, assignments: Object.keys(map).map(function (k) { return map[k]; }).sort(function (x, y) { return y.createdAt < x.createdAt ? -1 : 1; }) });
    }

    if (action === 'testResults') {
      const id = String(p.id || '');
      const results = readWhere_(sheet_(SHEET_TRES, TRES_HEADERS), 2, function (k) { return k === id; }, TRES_HEADERS.length).map(function (r) {
        let items = []; try { items = JSON.parse(r[10] || '[]'); } catch (x) {}
        return { submissionId: String(r[0]), assignmentId: String(r[1]), submittedAt: iso_(r[3]), name: String(r[4]), cls: String(r[5]), score: Number(r[6]), max: Number(r[7]), totalMs: Number(r[8]), late: String(r[9]) === 'yes', items: items };
      });
      return json_({ ok: true, results: results });
    }

    if (action === 'results') {
      const id = String(p.id || ''), all = id === 'all';          // id = 'all' → mọi bài (để cộng điểm học sinh qua nhiều bài)
      const a = all ? null : findAssignment_(id);
      const sh = sheet_(SHEET_RESULTS, RESULT_HEADERS);
      const rows = all ? rows_(sh) : readWhere_(sh, 2, function (k) { return k === id; }, RESULT_HEADERS.length);   // một bài: chỉ đọc đúng các dòng của bài đó
      const results = rows.map(function (r) {
        let details = []; try { details = JSON.parse(detailsOf_(r) || '[]'); } catch (x) {}
        return { submissionId: String(r[0]), assignmentId: String(r[1]), assignmentName: String(r[2]), submittedAt: iso_(r[3]), name: String(r[4]), cls: String(r[5]), score: Number(r[6]), totalMs: Number(r[7]),
          late: String(r[8]) === 'yes', details: details, status: String(r[11] || 'done'), totalWords: Number(r[12]) || 0 };
      });
      return json_({ ok: true, assignment: all ? { id: 'all', name: 'Tất cả các bài', due: 0 } : (a ? { id: a.id, name: a.name, due: a.due } : { id: id, name: id }), results: results });
    }
    return json_({ ok: false, error: 'bad_request', message: 'Hành động không hợp lệ.' });
  } catch (err) { return json_({ ok: false, error: 'server_error', message: String(err) }); }
}

/* =====================================================================
 * v8 – ĐIỂM TÍCH LUỸ: Students / Ledger / Config / Claims + route()
 * Games.gs: định nghĩa registerGameActions_(reg) rồi gán reg.<action> = function (params, student) {...}
 * ===================================================================== */
const SHEET_STUDENTS = 'Students', SHEET_LEDGER = 'Ledger', SHEET_CONFIG = 'Config', SHEET_CLAIMS = 'Claims';
const STUDENT_HEADERS = ['code', 'createdAt', 'note', 'active', 'balance', 'totalEarned', 'lastActive', 'password'];   // password (cột 8): giáo viên tự đặt; ô trống = không cần mật khẩu
const LEDGER_HEADERS = ['timestamp', 'code', 'delta', 'reason', 'refId', 'balanceAfter', 'detail'];
const CONFIG_HEADERS = ['key', 'value'];
const CLAIM_HEADERS = ['submissionId', 'timestamp'];
const LEDGER_REASONS = ['vocab', 'test', 'game', 'teacher_adjust', 'garden'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // bỏ 0 O 1 I L
const CODE_LEN = 6;
const CONFIG_DEFAULTS = {
  vocabCorrectPoints: 5, vocabPeekPenalty: 1, testDefaultPoints: 10, maxSubmitPoints: 5000,
  gamesEnabled: true, maxBet: 200, maxBetPct: 25, dailyLossLimit: 300,
  game_slots_enabled: true, game_wheel_enabled: true, game_hilo_enabled: true, game_mines_enabled: true, game_crash_enabled: true,
  game_dice_enabled: true, game_plinko_enabled: true, game_scratch_enabled: true, game_keno_enabled: true, game_coin_enabled: true,
  gardenEnabled: true, gardenCostPct: 100
};
const GAME_ACTIONS = {}, GARDEN_ACTIONS = {};          // Games.gs điền qua registerGameActions_(reg). Hàm (params, student) hoặc {teacher:true, fn:(params)}
let _gamesReg = false, _gardenReg = false, _cfg = null, _tk = null;

/* ---------- Tiện ích dùng chung (Games.gs gọi được) ---------- */
function jsonOut_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function apiError_(code, msg) { const e = new Error(msg || code); e.apiCode = code; return e; }
function withLock_(fn) {            // không lồng khoá: nếu execution này đã giữ khoá thì chạy thẳng
  const lock = LockService.getScriptLock();
  if (lock.hasLock()) return fn();
  try { lock.waitLock(20000); } catch (e) { throw apiError_('busy', 'Máy chủ đang bận, thử lại sau.'); }
  try { return fn(); } finally { lock.releaseLock(); }
}
function teacherKey_() {
  if (_tk === null) { _tk = PropertiesService.getScriptProperties().getProperty('TEACHER_KEY') || (TEACHER_KEY !== 'DOI_MAT_KHAU_CUA_BAN' ? TEACHER_KEY : ''); }
  return _tk;
}
function requireTeacher_(key) { if (!isTeacher_(key)) throw apiError_('unauthorized', 'Teacher Key không đúng.'); return true; }
function clampInt_(v, min, max, def) { let n = Math.floor(Number(v)); if (!isFinite(n)) n = (def === undefined ? min : def); return Math.max(min, Math.min(max, n)); }
const CODE_MIN = 3, CODE_MAX = 16;   // mã tự đặt: 3–16 ký tự chữ/số (mã tạo ngẫu nhiên vẫn 6 ký tự)
function foldCode_(v) {              // bỏ dấu tiếng Việt, đ→d, viết hoa, chỉ giữ A–Z và 0–9 → "Bé An 1" = "BEAN1"
  let s = String(v == null ? '' : v);
  try { s = s.normalize('NFD'); } catch (e) {}
  return s.replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function normCode_(v) { return foldCode_(v).slice(0, CODE_MAX); }
function isActive_(v) { return !(v === false || String(v).toLowerCase() === 'false'); }
function maskCode_(c) { return String(c); }   // v11: không che mã nữa (giữ tên hàm cho Games.gs / Garden.gs)
function rateLimit_(code, action) {   // ≤ 1 yêu cầu / giây / (mã, action)
  const c = CacheService.getScriptCache(), k = 'rl:' + action + ':' + code;
  if (c.get(k)) throw apiError_('rate_limited', 'Thao tác quá nhanh, thử lại sau 1 giây.');
  c.put(k, '1', 1);
}
function sheetT_(name, headers, textCols) {   // tạo sheet; cột mã đặt định dạng văn bản để Sheets không đổi "12E345" thành số
  const fresh = !_sh[name] && !ss_().getSheetByName(name);
  const sh = sheet_(name, headers);
  if (fresh) textCols.forEach(function (c) { sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'); });
  return sh;
}
function stSh_() { return sheetT_(SHEET_STUDENTS, STUDENT_HEADERS, [1]); }
function ldSh_() { return sheetT_(SHEET_LEDGER, LEDGER_HEADERS, [2, 5]); }
function cfSh_() { return sheetT_(SHEET_CONFIG, CONFIG_HEADERS, [1]); }
function clSh_() { return sheetT_(SHEET_CLAIMS, CLAIM_HEADERS, [1]); }
function appendRows_(sh, rows) {
  if (!rows.length) return;
  const start = sh.getLastRow() + 1, need = start + rows.length - 1;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
}

/* ---------- Config ---------- */
function normVal_(x) {
  if (typeof x === 'boolean' || typeof x === 'number') return x;
  const s = String(x == null ? '' : x).trim(), l = s.toLowerCase();
  if (l === 'true') return true;
  if (l === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}
function readCfg_() { const m = {}; rows_(cfSh_()).forEach(function (r) { const k = String(r[0]); if (k) m[k] = normVal_(r[1]); }); return m; }
function cfgMap_() {
  if (_cfg) return _cfg;
  const hit = cget_('cfg'); if (hit) return (_cfg = hit);
  let m = readCfg_();
  const miss = Object.keys(CONFIG_DEFAULTS).filter(function (k) { return !Object.prototype.hasOwnProperty.call(m, k); });
  if (miss.length) {
    withLock_(function () {
      const sh = cfSh_(), have = {};
      cols_(sh, 1, 1).forEach(function (r) { have[String(r[0])] = 1; });
      appendRows_(sh, miss.filter(function (k) { return !have[k]; }).map(function (k) { return [k, CONFIG_DEFAULTS[k]]; }));
    });
    m = readCfg_();
    Object.keys(CONFIG_DEFAULTS).forEach(function (k) { if (!(k in m)) m[k] = CONFIG_DEFAULTS[k]; });
  }
  cput_('cfg', m, 60);
  return (_cfg = m);
}
function getConfigValue_(key, def) { const v = cfgMap_()[key]; return (v === undefined || v === '') ? def : v; }
function cfgNum_(key, def) { const n = Number(getConfigValue_(key, def)); return isFinite(n) ? n : def; }
function cfgBool_(key, def) { const v = getConfigValue_(key, def); return v === true || v === 1 || String(v).toLowerCase() === 'true'; }

/* ---------- Học sinh & số dư ---------- */
function getStudent_(code) {
  code = normCode_(code); if (!code) return null;
  const sh = stSh_(), row = findRow_(sh, 1, code);
  if (!row) return null;
  const r = sh.getRange(row, 1, 1, 8).getValues()[0];
  return { row: row, code: String(r[0]), createdAt: iso_(r[1]), note: String(r[2]), active: isActive_(r[3]), balance: Number(r[4]) || 0, totalEarned: Number(r[5]) || 0, lastActive: iso_(r[6]), password: pwStr_(r[7]) };
}
function requireStudent_(code, rlAction) {
  code = normCode_(code);
  if (code.length < CODE_MIN) throw apiError_('invalid_code', 'Mã không hợp lệ.');
  if (rlAction) rateLimit_(code, rlAction);
  const s = getStudent_(code);
  if (!s) throw apiError_('invalid_code', 'Mã không tồn tại.');
  if (!s.active) throw apiError_('code_disabled', 'Mã đã bị vô hiệu hoá.');
  requireAuth_('S', s.code, s.password, _auth);
  return s;
}

/* ---------- v11: MẬT KHẨU (học sinh / phụ huynh) ----------
 * Giáo viên đặt mật khẩu tự do (lưu trong sheet, chỉ giáo viên đọc được). Ô trống = không cần mật khẩu.
 * Đăng nhập đúng → máy chủ trả token = HMAC(loại|mã|mật khẩu, khóa bí mật). Các lần gọi sau gửi token thay cho mật khẩu.
 * Đổi mật khẩu → mọi token cũ tự hết hiệu lực. Sai mật khẩu 6 lần trong 10 phút → khóa 10 phút. */
let _auth = {};
const PW_MAX = 32;
function pwStr_(v) { return String(v == null ? '' : v).trim().slice(0, PW_MAX); }
function cleanPw_(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, PW_MAX); }
function authSecret_() {
  const pr = PropertiesService.getScriptProperties(); let k = pr.getProperty('AUTH_SECRET');
  if (!k) { k = Utilities.getUuid() + Utilities.getUuid(); pr.setProperty('AUTH_SECRET', k); }
  return k;
}
function tokOf_(kind, code, pw) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(kind + '|' + code + '|' + pw, authSecret_())).replace(/=+$/, '').slice(0, 32);
}
/** Kiểm tra mật khẩu / token của yêu cầu. kind: 'S' học sinh · 'P' phụ huynh. Không có mật khẩu → luôn qua. */
function requireAuth_(kind, code, pw, a) {
  if (!pw) return true;
  a = a || {};
  const fk = 'pf:' + kind + ':' + code, c = CacheService.getScriptCache(), fails = Number(c.get(fk)) || 0;
  if (typeof a.token === 'string' && a.token && a.token === tokOf_(kind, code, pw)) return true;
  const given = typeof a.password === 'string' || typeof a.password === 'number' ? String(a.password).trim() : '';
  if (!given) throw apiError_('auth_required', 'Cần nhập mật khẩu.');
  if (fails >= 6) throw apiError_('locked', 'Nhập sai mật khẩu quá nhiều lần. Hãy thử lại sau 10 phút.');
  if (given === pw) { if (fails) c.remove(fk); return true; }
  c.put(fk, String(fails + 1), 600);
  throw apiError_('wrong_password', 'Mật khẩu không đúng.');
}
/** Đổi số dư (luôn trong khoá). Số dư không xuống dưới 0 → delta ghi vào Ledger là delta thực áp dụng. totalEarned chỉ tăng với reason vocab|test. */
function applyDelta_(code, delta, reason, refId, detail) {
  code = normCode_(code); delta = Math.round(Number(delta));
  if (!isFinite(delta)) throw apiError_('bad_request', 'delta không hợp lệ.');
  if (LEDGER_REASONS.indexOf(reason) < 0) throw apiError_('bad_request', 'reason không hợp lệ.');
  return withLock_(function () {
    const sh = stSh_(), row = findRow_(sh, 1, code);
    if (!row) throw apiError_('invalid_code', 'Mã không tồn tại.');
    const r = sh.getRange(row, 5, 1, 2).getValues()[0], bal = Number(r[0]) || 0, tot = Number(r[1]) || 0;
    const nb = Math.max(0, bal + delta), eff = nb - bal;
    const nt = tot + ((reason === 'vocab' || reason === 'test') ? Math.max(0, eff) : 0), now = new Date().toISOString();
    sh.getRange(row, 5, 1, 3).setValues([[nb, nt, now]]);
    if (eff !== delta) detail = { note: detail == null ? '' : detail, requested: delta };
    let ds = typeof detail === 'string' ? detail : JSON.stringify(detail == null ? '' : detail);
    if (ds === '""') ds = '';
    ldSh_().appendRow([now, code, eff, reason, safe_(String(refId == null ? '' : refId).slice(0, 60)), nb, safe_(ds.slice(0, 500))]);
    return { balance: nb, delta: eff, requested: delta, clamped: eff !== delta, totalEarned: nt };
  });
}
function ledgerFor_(code, n) {          // n dòng gần nhất (mới → cũ); code rỗng = mọi mã. Quét ngược tối đa 20.000 dòng
  const sh = ldSh_(), out = []; let end = sh.getLastRow(), scanned = 0;
  while (end >= 2 && out.length < n && scanned < 20000) {
    const start = Math.max(2, end - 499), v = sh.getRange(start, 1, end - start + 1, 7).getValues();
    for (let i = v.length - 1; i >= 0 && out.length < n; i--) {
      const r = v[i]; if (code && String(r[1]) !== code) continue;
      out.push({ t: iso_(r[0]), code: String(r[1]), delta: Number(r[2]), reason: String(r[3]), refId: String(r[4]), balanceAfter: Number(r[5]), detail: String(r[6]) });
    }
    scanned += end - start + 1; end = start - 1;
  }
  return out;
}
function ranking_() {                   // [[code, totalEarned]] của mã đang active, giảm dần; cache 30 giây
  const hit = cget_('lb'); if (hit) return hit;
  const list = [];
  cols_(stSh_(), 1, 6).forEach(function (r) { if (String(r[0]) && isActive_(r[3])) list.push([String(r[0]), Number(r[5]) || 0]); });
  list.sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
  cput_('lb', list, 30);
  return list;
}
function ranked_() {                    // thêm hạng (đồng điểm cùng hạng: 1,2,2,4)
  let rank = 0, prev = null;
  return ranking_().map(function (e, i) { if (e[1] !== prev) { rank = i + 1; prev = e[1]; } return [e[0], e[1], rank]; });
}

/* ---------- API học sinh ---------- */
function checkCode_(p) {
  const s = requireStudent_(p.code, 'checkCode');
  const ref = String(p.refId || '').replace(/[^\w-]/g, '').slice(0, 40);   // trang làm bài gửi kèm mã bài → báo sớm nếu bài không giao cho mã này
  if (ref) { const a = findAssignment_(ref, false); if (a && !assignedTo_(a, s.code)) throw apiError_('not_assigned', 'Bài này không được giao cho mã học sinh của bạn.'); }
  return { ok: true, valid: true, code: s.code, balance: s.balance, totalEarned: s.totalEarned, hasPassword: !!s.password, token: s.password ? tokOf_('S', s.code, s.password) : '' };
}
function submitResult_(p) {
  const s = requireStudent_(p.code, 'submitResult');
  const kind = p.kind === 'vocab' || p.kind === 'test' ? p.kind : '';
  const sid = String(p.submissionId || ''), refId = String(p.refId || '').replace(/[^\w-]/g, '').slice(0, 40);
  if (!kind) throw apiError_('bad_request', "kind phải là 'vocab' hoặc 'test'.");
  if (!/^[\w-]{8,64}$/.test(sid)) throw apiError_('bad_request', 'submissionId không hợp lệ.');
  // CHỐNG GIẢ ĐIỂM: chỉ cộng điểm cho bài giao CÓ THẬT, còn hạn, và đã có bản nộp (submit / submitTest) cùng submissionId của CHÍNH mã này.
  // Số từ đúng / điểm bị giới hạn theo bản nộp đã lưu → không thể tự gửi correct = 5000 lặp lại để lấy điểm, hay làm quá số lần / quá hạn mà vẫn được cộng.
  const asg = refId ? findAssignment_(refId, false) : null;   // điểm riêng của bài lấy từ sheet Assignments, KHÔNG nhận từ client
  if (!asg) throw apiError_('bad_request', 'Bài này chưa được đăng ký trên máy chủ nên không cộng điểm được.');
  if (!assignedTo_(asg, s.code)) throw apiError_('not_assigned', 'Bài này không được giao cho mã học sinh của bạn.');
  if (asg.due && Date.now() > asg.due + GRACE_MS) throw apiError_('expired', 'Bài đã hết hạn nộp.');
  const sub = submissionOf_(kind, sid, refId, s.code);
  if (!sub) {
    if (asg.max > 0 && attemptsOf_(kind, refId, s.code) >= asg.max) throw apiError_('max_attempts', 'Đã hết số lần làm bài cho phép.');
    throw apiError_('not_ready', 'Máy chủ chưa nhận bài làm – điểm sẽ được cộng khi bài làm được gửi xong.');   // client giữ trong hàng đợi, gửi lại sau
  }
  let pts = 0; const detail = { sid: sid };
  if (kind === 'vocab') {
    const c = Math.min(clampInt_(p.correct, 0, 5000, 0), sub.correct, Array.isArray(asg.words) ? asg.words.length : 5000), k = Math.max(clampInt_(p.peeks, 0, 100000, 0), sub.peeks);
    const cpv = asg && asg.correctPts !== null && asg.correctPts !== undefined ? asg.correctPts : cfgNum_('vocabCorrectPoints', 5);
    const ppv = asg && asg.peekPenalty !== null && asg.peekPenalty !== undefined ? asg.peekPenalty : cfgNum_('vocabPeekPenalty', 1);
    pts = c * cpv - k * ppv; detail.cp = cpv; detail.pp = ppv; detail.correct = c; detail.peeks = k;
  } else {
    const dflt = cfgNum_('testDefaultPoints', 10);
    if (Array.isArray(p.correctPoints)) {
      p.correctPoints.slice(0, 500).forEach(function (x) { const n = Number(x); pts += Math.max(0, Math.min(100, isFinite(n) ? n : dflt)); });
      detail.n = Math.min(500, p.correctPoints.length);
    } else { const c = clampInt_(p.correct, 0, 500, 0); pts = c * Math.max(0, Math.min(100, dflt)); detail.correct = c; }
    pts = Math.min(pts, Math.ceil(sub.score));          // không vượt điểm của bài test đã nộp (máy chủ tính lại từ từng câu)
  }
  const cap = cfgNum_('maxSubmitPoints', 5000);
  pts = Math.max(-cap, Math.min(cap, Math.round(pts)));
  return withLock_(function () {
    const csh = clSh_();
    if (findRow_(csh, 1, sid)) { const cur = getStudent_(s.code); return { ok: true, duplicate: true, delta: 0, balance: cur.balance, totalEarned: cur.totalEarned }; }
    const r = applyDelta_(s.code, pts, kind, refId, detail);
    csh.appendRow([sid, new Date().toISOString()]);
    return { ok: true, duplicate: false, delta: r.delta, requested: pts, balance: r.balance, totalEarned: r.totalEarned };
  });
}
/** Bản nộp (Results / TestResults) có submissionId = sid, đúng bài refId và đúng mã học sinh. Trả về null nếu chưa có.
 *  vocab → {correct: số từ không bỏ qua, peeks: tổng số lần xem lại} tính từ chi tiết đã lưu · test → {score} */
function submissionOf_(kind, sid, refId, code) {
  const sh = kind === 'vocab' ? sheet_(SHEET_RESULTS, RESULT_HEADERS) : sheet_(SHEET_TRES, TRES_HEADERS), row = findRow_(sh, 1, sid);
  if (!row) return null;
  const r = sh.getRange(row, 1, 1, kind === 'vocab' ? RESULT_HEADERS.length : 8).getValues()[0];
  if (String(r[1]) !== refId || normCode_(r[4]) !== code) return null;
  if (kind !== 'vocab') return { score: Math.max(0, Number(r[6]) || 0) };
  let d = []; try { d = JSON.parse(detailsOf_(r) || '[]'); } catch (e) {}
  if (!Array.isArray(d)) d = [];
  let correct = 0, peeks = 0;
  d.forEach(function (w) { if (!w || w.skipped) return; correct++; peeks += Math.max(0, (Number(w.views) || 1) - 1); });
  return { correct: correct, peeks: peeks };
}
/** Số lần đã nộp bài refId của mã học sinh (để báo hết lượt thay vì chờ mãi) */
function attemptsOf_(kind, refId, code) {
  const sh = kind === 'vocab' ? sheet_(SHEET_RESULTS, RESULT_HEADERS) : sheet_(SHEET_TRES, TRES_HEADERS);
  return cols_(sh, 1, 5).filter(function (r) { return String(r[1]) === refId && normCode_(r[4]) === code; }).length;
}
/** Bài còn hạn được giao cho mã này (tab "Bài được giao" ở trang học sinh). Bài không chọn mã = giao cho mọi mã; bài chọn mã chỉ hiện với đúng các mã đó.
 *  KHÔNG trả link / kết quả / dữ liệu từ / danh sách mã. Cache 30 giây (dùng chung mọi học sinh). Không quét sheet kết quả. */
function listOpenAssignments_(p) {
  const me = requireStudent_(p.code).code;
  let items = cget_('ola2');
  if (!items) {
    const A = rows_(sheet_(SHEET_ASSIGN, ASSIGN_HEADERS)), T = cols_(sheet_(SHEET_TESTS, TESTS_HEADERS), 1, 5), blob = {}, now = Date.now();
    T.forEach(function (r) { const id = String(r[0]); if (id) blob[id] = String(r[4]).charAt(0); });   // ký tự đầu mảnh dữ liệu: '{' = đề test, '[' = bộ từ lớn
    items = [];
    A.forEach(function (r) {
      const id = String(r[0]), due = Number(r[2]) || 0;
      if (!id || due <= now) return;
      const isTest = String(r[9]) === 'test';
      let count = 0;
      if (isTest) { if (blob[id] !== '{') return; }
      else {
        if (!r[6] && blob[id] !== '[') return;
        if (r[6]) { try { const w = JSON.parse(r[6]); if (Array.isArray(w)) count = w.length; } catch (e) {} }
      }
      items.push({ id: id, name: String(r[1]), kind: isTest ? 'test' : 'vocab', due: due, max: Number(r[3]) || 0, count: count, correctPts: isTest ? null : ptsOrNull_(r[11]), peekPenalty: isTest ? null : ptsOrNull_(r[12]), codes: String(r[13] || '') });
    });
    items.sort(function (a, b) { return a.due - b.due; });
    items = items.slice(0, 300);
    cput_('ola2', items, 30);
  }
  const now2 = Date.now(), out = [];
  items.forEach(function (x) {
    if (x.due <= now2) return;
    const L = x.codes ? String(x.codes).split(',') : [];
    if (L.length && L.indexOf(me) < 0) return;
    const y = {}; Object.keys(x).forEach(function (k) { if (k !== 'codes') y[k] = x[k]; });
    y.personal = L.length > 0;                                            // giao riêng (chọn mã) hay giao chung
    if (out.length < 100) out.push(y);
  });
  return { ok: true, items: out, serverTime: now2 };
}
function getProfile_(p) {
  const s = requireStudent_(p.code, 'getProfile'), rk = ranked_();
  const mine = rk.filter(function (e) { return e[0] === s.code; })[0];
  return { ok: true, code: s.code, balance: s.balance, totalEarned: s.totalEarned, rank: mine ? mine[2] : null, totalStudents: rk.length, ledger: ledgerFor_(s.code, 50) };
}
function getLeaderboard_(p) {
  const limit = clampInt_(p.limit, 1, 50, 10), me = normCode_(p.code);
  if (me.length >= CODE_MIN) rateLimit_(me, 'getLeaderboard');
  const all = ranked_(), out = []; let mine = null;
  all.forEach(function (e) {
    const isMe = e[0] === me;
    if (isMe) mine = { rank: e[2], totalEarned: e[1] };
    if (out.length < limit && e[1] > 0) out.push({ rank: e[2], code: maskCode_(e[0]), totalEarned: e[1], me: isMe });
  });
  return { ok: true, leaderboard: out, me: mine, totalStudents: all.length };
}
function getPublicConfig_() { return { ok: true, config: cfgMap_() }; }

/* ---------- API giáo viên ---------- */
/** Giáo viên tự đặt mã: p.codes = ['AN123', 'Bé Hoa 7', {code:'X1Y2', note:'Lớp 6A'}] (tối đa 200). Mã được chuẩn hoá như lúc học sinh nhập. */
function createCustomCodes_(p) {
  const items = p.codes.slice(0, 200), note = safe_(String(p.note || '').trim().slice(0, 100));
  return withLock_(function () {
    const sh = stSh_(), have = {}, rows = [], codes = [], existing = [], invalid = [], pws = {}, now = new Date().toISOString();
    cols_(sh, 1, 1).forEach(function (r) { have[String(r[0])] = 1; });
    items.forEach(function (it) {
      const obj = it && typeof it === 'object', raw = obj ? it.code : it, full = foldCode_(raw), c = full.slice(0, CODE_MAX);
      if (full.length < CODE_MIN || full.length > CODE_MAX) { invalid.push(String(raw == null ? '' : raw).slice(0, 30)); return; }
      if (have[c]) { if (existing.indexOf(c) < 0) existing.push(c); return; }
      have[c] = 1; codes.push(c);
      let pw = obj && it.password != null ? cleanPw_(it.password) : '';
      if (!pw && p.randomPw) pw = randPw_();
      if (pw) pws[c] = pw;
      rows.push([c, now, obj && it.note != null ? safe_(String(it.note).trim().slice(0, 100)) : note, true, 0, 0, '', pw]);
    });
    if (rows.length) {
      const start = sh.getLastRow() + 1, need = start + rows.length - 1;
      if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
      sh.getRange(start, 1, rows.length, 1).setNumberFormat('@');          // mã toàn số (vd 123456) không bị Sheets đổi thành số
      sh.getRange(start, 8, rows.length, 1).setNumberFormat('@');          // mật khẩu "0123" giữ nguyên số 0 đầu
      sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
    }
    return { ok: true, custom: true, codes: codes, passwords: pws, created: codes.length, requested: items.length, existing: existing, invalid: invalid };
  });
}
function createCodes_(p) {
  if (Array.isArray(p.codes)) return createCustomCodes_(p);
  const count = clampInt_(p.count, 1, 200, 1), note = safe_(String(p.note || '').trim().slice(0, 100));
  const prefix = String(p.prefix || '').toUpperCase().split('').filter(function (ch) { return CODE_ALPHABET.indexOf(ch) >= 0; }).join('').slice(0, 3);
  return withLock_(function () {
    const sh = stSh_(), have = {}, rows = [], codes = [], pws = {}, now = new Date().toISOString();
    cols_(sh, 1, 1).forEach(function (r) { have[String(r[0])] = 1; });
    for (let tries = 0; codes.length < count && tries < count * 100; tries++) {
      let c = prefix; while (c.length < CODE_LEN) c += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length));
      if (have[c]) continue;
      const pw = p.randomPw ? randPw_() : '';
      if (pw) pws[c] = pw;
      have[c] = 1; codes.push(c); rows.push([c, now, note, true, 0, 0, '', pw]);
    }
    if (rows.length) { const st = sh.getLastRow() + 1; appendRows_(sh, rows); sh.getRange(st, 8, rows.length, 1).setNumberFormat('@'); sh.getRange(st, 8, rows.length, 1).setValues(rows.map(function (r) { return [r[7]]; })); }
    return { ok: true, codes: codes, passwords: pws, created: codes.length, requested: count };
  });
}
function setActive_(code, flag) {
  code = normCode_(code);
  return withLock_(function () {
    const sh = stSh_(), row = findRow_(sh, 1, code);
    if (!row) throw apiError_('invalid_code', 'Mã không tồn tại.');
    sh.getRange(row, 4).setValue(flag); CacheService.getScriptCache().remove('lb');
    return { ok: true, code: code, active: flag };
  });
}
function deleteCode_(p) { return setActive_(p.code, false); }
function restoreCode_(p) { return setActive_(p.code, true); }
function adjustPoints_(p) {
  const code = normCode_(p.code), delta = clampInt_(p.delta, -100000, 100000, 0);
  if (!delta) throw apiError_('bad_request', 'delta phải khác 0.');
  if (!getStudent_(code)) throw apiError_('invalid_code', 'Mã không tồn tại.');
  const r = applyDelta_(code, delta, 'teacher_adjust', '', { reason: String(p.reason || '').slice(0, 150) });
  return { ok: true, code: code, balance: r.balance, delta: r.delta, clamped: r.clamped, totalEarned: r.totalEarned };
}
function listStudents_() {
  const list = cols_(stSh_(), 1, 8).filter(function (r) { return String(r[0]); }).map(function (r) {
    return { code: String(r[0]), createdAt: iso_(r[1]), note: String(r[2]), active: isActive_(r[3]), balance: Number(r[4]) || 0, totalEarned: Number(r[5]) || 0, lastActive: iso_(r[6]), password: pwStr_(r[7]) };
  });
  return { ok: true, students: list };
}
function randPw_() { let s = ''; for (let i = 0; i < 4; i++) s += Math.floor(Math.random() * 10); return s; }   // 4 chữ số, dễ nhớ với học sinh nhỏ
/** Đặt / đổi / xoá mật khẩu nhiều mã: p.items = [{code, password}] (password '' = bỏ mật khẩu) · p.randomMissing = true → tự tạo cho các mã trong items chưa có mật khẩu. */
function setPasswords_(p) {
  const items = Array.isArray(p.items) ? p.items.slice(0, 2000) : [];
  if (!items.length) throw apiError_('bad_request', 'Chưa có mã nào.');
  return withLock_(function () {
    const sh = stSh_(), v = cols_(sh, 1, 8), idx = {}, done = {}, missing = [];
    v.forEach(function (r, i) { idx[String(r[0])] = i; });
    items.forEach(function (it) {
      const c = normCode_(it && it.code); if (!c) return;
      if (!(c in idx)) { if (missing.indexOf(c) < 0) missing.push(c); return; }
      let pw = cleanPw_(it.password);
      if (!pw && it.random) pw = pwStr_(v[idx[c]][7]) || randPw_();
      v[idx[c]][7] = pw; done[c] = pw;
    });
    if (v.length) { const rg = sh.getRange(2, 8, v.length, 1); rg.setNumberFormat('@'); rg.setValues(v.map(function (r) { return [pwStr_(r[7])]; })); }
    return { ok: true, updated: Object.keys(done).length, passwords: done, missing: missing };
  });
}
function getConfig_() { return { ok: true, config: cfgMap_(), defaults: CONFIG_DEFAULTS }; }
function setConfig_(p) {
  const key = String(p.key || '');
  if (!/^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(key)) throw apiError_('bad_request', 'Key không hợp lệ.');
  let v = p.value;
  if (typeof v !== 'boolean' && typeof v !== 'number') v = normVal_(String(v == null ? '' : v).slice(0, 200));
  if (typeof v === 'number' && !isFinite(v)) throw apiError_('bad_request', 'Giá trị không hợp lệ.');
  if (typeof v === 'string') v = safe_(v);
  withLock_(function () {
    const sh = cfSh_(), row = findRow_(sh, 1, key);
    if (row) sh.getRange(row, 2).setValue(v); else appendRows_(sh, [[key, v]]);
  });
  _cfg = null; CacheService.getScriptCache().remove('cfg');
  return { ok: true, key: key, value: cfgMap_()[key] };
}
function getLedger_(p) { return { ok: true, ledger: ledgerFor_(normCode_(p.code), clampInt_(p.limit, 1, 1000, 200)) }; }

/* =====================================================================
 * v11 – PHỤ HUYNH: sheet Parents (mã phụ huynh + mật khẩu do giáo viên đặt, danh sách mã con)
 * parentLogin {code, password} → token · parentReport {code, token} → báo cáo học tập của MỌI con (một lần đăng nhập xem hết)
 * ===================================================================== */
const SHEET_PARENTS = 'Parents';
const PARENT_HEADERS = ['code', 'password', 'name', 'children', 'note', 'active', 'createdAt', 'lastActive'];
const P_TZ = 'Asia/Ho_Chi_Minh', P_DAYS = 30, DAY_MS = 86400000;
function paSh_() { return sheetT_(SHEET_PARENTS, PARENT_HEADERS, [1, 2, 4]); }
function parentRow_(r) { return { code: String(r[0]), password: pwStr_(r[1]), name: String(r[2]), children: codesList_(r[3]), note: String(r[4]), active: isActive_(r[5]), createdAt: iso_(r[6]), lastActive: iso_(r[7]) }; }
function getParent_(code) {
  code = normCode_(code); if (!code) return null;
  const sh = paSh_(), row = findRow_(sh, 1, code);
  if (!row) return null;
  const p = parentRow_(sh.getRange(row, 1, 1, PARENT_HEADERS.length).getValues()[0]); p.row = row; return p;
}
function requireParent_(p, rl) {
  const code = normCode_(p.code);
  if (code.length < CODE_MIN) throw apiError_('invalid_code', 'Mã phụ huynh không hợp lệ.');
  if (rl) rateLimit_('P' + code, rl);
  const par = getParent_(code);
  if (!par) throw apiError_('invalid_code', 'Mã phụ huynh không tồn tại.');
  if (!par.active) throw apiError_('code_disabled', 'Mã phụ huynh đã bị khóa.');
  if (!par.password) throw apiError_('auth_required', 'Mã phụ huynh chưa có mật khẩu. Hãy liên hệ giáo viên.');
  requireAuth_('P', par.code, par.password, { token: p.token, password: p.password });
  return par;
}
function childInfo_(codes) {
  const m = {}; cols_(stSh_(), 1, 3).forEach(function (r) { m[String(r[0])] = String(r[2]); });
  return codes.map(function (c) { return { code: c, note: m[c] || '', exists: c in m }; });
}
function parentLogin_(p) {
  const par = requireParent_(p, 'parentLogin');
  try { paSh_().getRange(par.row, 8).setValue(new Date().toISOString()); } catch (e) {}
  return { ok: true, code: par.code, name: par.name, token: tokOf_('P', par.code, par.password), children: childInfo_(par.children) };
}
function parentReport_(p) {
  const par = requireParent_(p);
  const ck = 'prep:' + par.code + ':' + par.children.join(','), hit = cget_(ck);
  if (hit && !p.fresh) return hit;
  const out = { ok: true, code: par.code, name: par.name, serverTime: Date.now(), days: P_DAYS, children: familyReport_(par.children) };
  cput_(ck, out, 120);
  return out;
}
/* ---------- Giáo viên quản lý phụ huynh ---------- */
function listParents_() {
  return { ok: true, parents: cols_(paSh_(), 1, PARENT_HEADERS.length).filter(function (r) { return String(r[0]); }).map(parentRow_) };
}
/** p: {code, password, name, children (mảng / chuỗi), note, active, create:true|false} */
function saveParent_(p) {
  const code = normCode_(p.code), full = foldCode_(p.code);
  if (full.length < CODE_MIN || full.length > CODE_MAX) throw apiError_('bad_request', 'Mã phụ huynh gồm 3–16 chữ hoặc số.');
  const pw = cleanPw_(p.password);
  if (!pw) throw apiError_('bad_request', 'Hãy đặt mật khẩu cho phụ huynh.');
  const kids = codesList_(p.children).slice(0, 20);
  const row = [code, pw, safe_(String(p.name || '').trim().slice(0, 80)), kids.join(','), safe_(String(p.note || '').trim().slice(0, 150)), p.active === false ? false : true];
  return withLock_(function () {
    const sh = paSh_(), r = findRow_(sh, 1, code), now = new Date().toISOString();
    if (p.create && r) throw apiError_('exists', 'Mã phụ huynh ' + code + ' đã tồn tại.');
    if (!p.create && !r) throw apiError_('not_found', 'Không tìm thấy mã phụ huynh ' + code + '.');
    if (r) { const rg = sh.getRange(r, 1, 1, 6); rg.setNumberFormat('@'); sh.getRange(r, 6).setNumberFormat('General'); rg.setValues([row]); }
    else { const st = sh.getLastRow() + 1; appendRows_(sh, [row.concat([now, ''])]); sh.getRange(st, 1, 1, 4).setNumberFormat('@'); sh.getRange(st, 1, 1, 4).setValues([row.slice(0, 4)]); }
    return { ok: true, parent: parentRow_(row.concat([r ? '' : now, ''])) };
  });
}
function deleteParent_(p) {
  const code = normCode_(p.code);
  return withLock_(function () {
    const sh = paSh_(), r = findRow_(sh, 1, code);
    if (!r) throw apiError_('not_found', 'Không tìm thấy mã phụ huynh.');
    sh.deleteRow(r); return { ok: true, code: code };
  });
}

/* ---------- Báo cáo cho phụ huynh ----------
 * Một lượt quét mỗi sheet cho TẤT CẢ các con (không quét lại theo từng con). Cửa sổ 30 ngày (giờ Việt Nam).
 * Chỉ trả số liệu thô đã gộp; trang phụ huynh tự đánh giá "chăm / lười", "đúng nhiều / ít". */
function dayOf_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, P_TZ, 'yyyy-MM-dd');
  const s = String(v || ''); if (/^\d{4}-\d\d-\d\d \d/.test(s)) return s.slice(0, 10);   // GameLog: 'yyyy-MM-dd HH:mm:ss' giờ VN
  const d = new Date(s); return isNaN(d) ? '' : Utilities.formatDate(d, P_TZ, 'yyyy-MM-dd');
}
function msOf_(v) {
  if (v instanceof Date) return v.getTime();
  const s = String(v || ''); if (/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(s)) return new Date(s.replace(' ', 'T') + '+07:00').getTime();
  const t = Date.parse(s); return isFinite(t) ? t : 0;
}
/** Đọc các dòng (số dòng 1-based) theo khối liên tiếp – chỉ dòng cần, không đọc cả sheet nặng. */
function rowsAt_(sh, nums, ncol) {
  const res = {}; if (!nums.length) return res;
  nums = nums.slice().sort(function (a, b) { return a - b; });
  const blocks = []; nums.forEach(function (r) { const b = blocks[blocks.length - 1]; if (b && r <= b[1] + 3) b[1] = r; else blocks.push([r, r]); });
  blocks.forEach(function (b) { sh.getRange(b[0], 1, b[1] - b[0] + 1, ncol).getValues().forEach(function (v, i) { res[b[0] + i] = v; }); });
  return res;
}
function familyReport_(codes) {
  // v11.1: ĐÁNH GIÁ chỉ dựa trên BÀI GIAO RIÊNG (bài có chọn mã học sinh). Bài giao chung (cho mọi mã, hạn rất dài) là ôn tập / kiếm điểm
  // → chỉ hiện ở mục "Ôn tập", không tính vào chăm chỉ, độ chính xác, bài chưa làm, bài bỏ lỡ.
  const now = Date.now(), from = now - P_DAYS * DAY_MS, set = {}, R = {};
  codes.forEach(function (c) { set[c] = 1; R[c] = { code: c, exists: false, note: '', active: false, balance: 0, totalEarned: 0, rank: null, totalStudents: 0, createdAt: '', lastActive: '',
    days: {}, vocab: [], tests: [], words: {}, asg: [], ledger: { study: 0, game: 0, garden: 0, teacher: 0 }, games7: 0, gamesNet7: 0, allAttempts: 0,
    practice: { attempts: 0, ms: 0, days: 0, words: 0, score: 0, max: 0, tests: 0 } }; });
  const day = function (c, d) { const o = R[c].days; return o[d] || (o[d] = { v: 0, t: 0, ms: 0, g: 0, p: 0, pms: 0 }); };
  // 0) Bài giao: id → danh sách mã (rỗng = giao chung)
  const A = rows_(sheet_(SHEET_ASSIGN, ASSIGN_HEADERS)), own = {};
  A.forEach(function (r) { const id = String(r[0]); if (id) own[id] = codesList_(r[13]); });
  const isOwn = function (aid, c) { const L = own[aid]; return !!(L && L.length && L.indexOf(c) >= 0); };
  // 1) Hồ sơ + hạng
  cols_(stSh_(), 1, 7).forEach(function (r) { const c = String(r[0]); if (!set[c]) return; const x = R[c];
    x.exists = true; x.createdAt = iso_(r[1]); x.note = String(r[2]); x.active = isActive_(r[3]); x.balance = Number(r[4]) || 0; x.totalEarned = Number(r[5]) || 0; x.lastActive = iso_(r[6]); });
  const rk = ranked_(); rk.forEach(function (e) { if (set[e[0]]) R[e[0]].rank = e[2]; }); codes.forEach(function (c) { R[c].totalStudents = rk.length; });
  // 2) Bài từ vựng (Results): cột nhẹ cho cả sheet; chi tiết từng từ chỉ đọc cho ≤ 40 lần làm bài riêng + ≤ 20 lần ôn tập gần nhất / con
  const done = {}, pDays = {};
  const rsh = sheet_(SHEET_RESULTS, RESULT_HEADERS), light = cols_(rsh, 1, 9), stc = cols_(rsh, 12, 2), want = {};
  light.forEach(function (r, i) {
    const c = normCode_(r[4]); if (!set[c]) return;
    const aid = String(r[1]); (done[c] || (done[c] = {}))[aid] = (done[c][aid] || 0) + 1; R[c].allAttempts++;
    const t = msOf_(r[3]); if (t < from) return;
    const mine = isOwn(aid, c), d = dayOf_(r[3]), o = day(c, d), ms = Number(r[7]) || 0;
    if (mine) { o.v++; o.ms += ms; } else { o.p++; o.pms += ms; R[c].practice.attempts++; R[c].practice.ms += ms; (pDays[c] || (pDays[c] = {}))[d] = 1; }
    R[c].vocab.push({ row: i + 2, own: mine, t: t, aid: aid, name: String(r[2]), score: Number(r[6]) || 0, ms: ms, late: String(r[8]) === 'yes', status: String(stc[i] && stc[i][0] || 'done'), total: Number(stc[i] && stc[i][1]) || 0 });
  });
  codes.forEach(function (c) {
    const L = R[c].vocab.sort(function (a, b) { return b.t - a.t; });
    R[c].vocab = L.filter(function (v) { return v.own; }).slice(0, 40).concat(L.filter(function (v) { return !v.own; }).slice(0, 20));
    R[c].vocab.forEach(function (v) { want[v.row] = 1; });
  });
  const full = rowsAt_(rsh, Object.keys(want).map(Number), RESULT_HEADERS.length);
  codes.forEach(function (c) {
    const W = R[c].words, P = R[c].practice;
    R[c].vocab = R[c].vocab.map(function (v) {
      let d = []; try { d = JSON.parse(detailsOf_(full[v.row] || []) || '[]'); } catch (e) {}
      if (!Array.isArray(d)) d = [];
      let first = 0, skip = 0, peeks = 0, wrong = 0;
      d.forEach(function (w) {
        if (!w) return; const k = String(w.word || '').slice(0, 60), vw = Number(w.views) || 1, wc = Number(w.wrongCount) || 0;
        if (w.skipped) skip++; else if (vw <= 1 && wc === 0) first++;
        peeks += Math.max(0, vw - 1); if (wc > 0) wrong++;
        if (k) { const s = W[k] || (W[k] = [0, 0, 0]); s[0]++; if (w.skipped || wc > 0 || vw >= 3) s[1]++; if (v.t > s[2]) s[2] = v.t; }
      });
      if (!v.own) { P.words += d.length; P.score += v.score; P.max += d.length * 10; }
      return { t: v.t, own: v.own, aid: v.aid, name: v.name, score: v.score, n: d.length, first: first, skip: skip, peeks: peeks, wrong: wrong, ms: v.ms, late: v.late, status: v.status, total: v.total };
    }).sort(function (a, b) { return b.t - a.t; });
    R[c].words = Object.keys(W).filter(function (k) { return W[k][1] > 0; }).map(function (k) { return [k, W[k][0], W[k][1]]; })
      .sort(function (a, b) { return (b[2] - a[2]) || (b[2] / b[1] - a[2] / a[1]); }).slice(0, 20);   // [từ, số lần gặp, số lần sai/bỏ qua/xem ≥3] – gồm cả bài ôn tập (để phụ huynh ôn cùng con)
  });
  // 3) Bài test (TestResults) – cột nhẹ
  cols_(sheet_(SHEET_TRES, TRES_HEADERS), 1, 10).forEach(function (r) {
    const c = normCode_(r[4]); if (!set[c]) return;
    const aid = String(r[1]); (done[c] || (done[c] = {}))[aid] = (done[c][aid] || 0) + 1; R[c].allAttempts++;
    const t = msOf_(r[3]); if (t < from) return;
    const mine = isOwn(aid, c), d = dayOf_(r[3]), o = day(c, d), ms = Number(r[8]) || 0, P = R[c].practice;
    if (mine) { o.t++; o.ms += ms; } else { o.p++; o.pms += ms; P.attempts++; P.tests++; P.ms += ms; P.score += Number(r[6]) || 0; P.max += Number(r[7]) || 0; (pDays[c] || (pDays[c] = {}))[d] = 1; }
    R[c].tests.push({ t: t, own: mine, aid: aid, name: String(r[2]), score: Number(r[6]) || 0, max: Number(r[7]) || 0, ms: ms, late: String(r[9]) === 'yes' });
  });
  codes.forEach(function (c) {
    const L = R[c].tests.sort(function (a, b) { return b.t - a.t; });
    R[c].tests = L.filter(function (v) { return v.own; }).slice(0, 40).concat(L.filter(function (v) { return !v.own; }).slice(0, 20));
    R[c].practice.days = Object.keys(pDays[c] || {}).length;
  });
  // 4) Bài GIAO RIÊNG cho con: còn hạn, hoặc hết hạn trong 30 ngày qua (bài giao chung không tính)
  A.forEach(function (r) {
    const id = String(r[0]), due = Number(r[2]) || 0; if (!id || !due || due < from) return;
    const L = own[id] || [], created = msOf_(r[5]); if (!L.length) return;
    codes.forEach(function (c) {
      if (L.indexOf(c) < 0) return;
      const x = R[c], born = msOf_(x.createdAt); if (born && due < born) return;
      x.asg.push({ id: id, name: String(r[1]), kind: String(r[9]) === 'test' ? 'test' : 'vocab', due: due, created: created, personal: true, max: Number(r[3]) || 0, done: (done[c] && done[c][id]) || 0 });
    });
  });
  codes.forEach(function (c) { R[c].asg.sort(function (a, b) { return b.due - a.due; }); R[c].asg = R[c].asg.slice(0, 80); });
  // 5) Sổ điểm 30 ngày (quét ngược, dừng khi quá 30 ngày)
  const lsh = ldSh_(); let end = lsh.getLastRow(), scanned = 0, stop = false;
  while (end >= 2 && !stop && scanned < 60000) {
    const st = Math.max(2, end - 999), v = lsh.getRange(st, 1, end - st + 1, 4).getValues();
    for (let i = v.length - 1; i >= 0; i--) {
      const t = msOf_(v[i][0]); if (t && t < from) { stop = true; break; }
      const c = String(v[i][1]); if (!set[c]) continue;
      const dl = Number(v[i][2]) || 0, rs = String(v[i][3]), L = R[c].ledger;
      if (rs === 'vocab' || rs === 'test') L.study += dl; else if (rs === 'game') L.game += dl; else if (rs === 'garden') L.garden += dl; else if (rs === 'teacher_adjust') L.teacher += dl;
    }
    scanned += end - st + 1; end = st - 1;
  }
  // 6) Trò chơi: số ván theo ngày (GameLog, quét ngược)
  try {
    const gsh = ss_().getSheetByName('GameLog');
    if (gsh) {
      let e = gsh.getLastRow(), sc = 0, stp = false; const w7 = now - 7 * DAY_MS;
      while (e >= 2 && !stp && sc < 100000) {
        const st = Math.max(2, e - 1999), v = gsh.getRange(st, 1, e - st + 1, 6).getValues();
        for (let i = v.length - 1; i >= 0; i--) {
          const t = msOf_(v[i][0]); if (t && t < from) { stp = true; break; }
          const c = String(v[i][1]); if (!set[c]) continue;
          day(c, dayOf_(v[i][0])).g++;
          if (t >= w7) { R[c].games7++; R[c].gamesNet7 += Number(v[i][5]) || 0; }
        }
        sc += e - st + 1; e = st - 1;
      }
    }
  } catch (err) {}
  return codes.map(function (c) { return R[c]; });
}

/* ---------- ROUTER: điểm vào duy nhất ---------- */
const PUBLIC_ACTIONS = { getPublicConfig: getPublicConfig_, getLeaderboard: getLeaderboard_ };                       // GET + POST
const STUDENT_ACTIONS = { checkCode: checkCode_, submitResult: submitResult_, getProfile: getProfile_, listOpenAssignments: listOpenAssignments_ };              // POST
const TEACHER_ACTIONS = { createCodes: createCodes_, deleteCode: deleteCode_, restoreCode: restoreCode_, adjustPoints: adjustPoints_,
  listStudents: listStudents_, getConfig: getConfig_, setConfig: setConfig_, getLedger: getLedger_,
  setPasswords: setPasswords_, listParents: listParents_, saveParent: saveParent_, deleteParent: deleteParent_ };    // POST (teacherKey trong body)
const PARENT_ACTIONS = { parentLogin: parentLogin_, parentReport: parentReport_ };                                   // POST (mã phụ huynh + mật khẩu / token)
function okWrap_(r) { return (r && typeof r === 'object') ? (r.ok === undefined ? Object.assign({ ok: true }, r) : r) : { ok: true, result: r }; }

function route(action, params, method) {
  try {
    action = String(action || '').slice(0, 40); params = params || {}; method = method || 'POST';
    if (!_gamesReg) { _gamesReg = true; if (typeof registerGameActions_ === 'function') registerGameActions_(GAME_ACTIONS); }
    if (!_gardenReg) { _gardenReg = true; if (typeof registerGardenActions_ === 'function') registerGardenActions_(GARDEN_ACTIONS); }   // Garden.gs: reg.<action> = function (params, student) {...}
    const post = method === 'POST', own = Object.prototype.hasOwnProperty;
    _auth = post ? { token: params.token, password: params.password } : {};   // mật khẩu / token của học sinh cho requireStudent_ (GET không nhận mật khẩu)
    if (own.call(PUBLIC_ACTIONS, action)) return PUBLIC_ACTIONS[action](params);
    if (post) {
      if (own.call(STUDENT_ACTIONS, action)) return STUDENT_ACTIONS[action](params);
      if (own.call(PARENT_ACTIONS, action)) return PARENT_ACTIONS[action](params);
      if (own.call(TEACHER_ACTIONS, action)) { requireTeacher_(params.teacherKey); return TEACHER_ACTIONS[action](params); }
      if (own.call(GAME_ACTIONS, action)) {
        const g = GAME_ACTIONS[action];
        if (g && typeof g === 'object' && g.teacher) { requireTeacher_(params.teacherKey); return okWrap_(g.fn(params)); }
        const s = requireStudent_(params.code);   // không rate limit 1 giây (gây trễ); an toàn nhờ requestId + withLock_
        if (!cfgBool_('gamesEnabled', true)) throw apiError_('games_disabled', 'Trò chơi đang tắt.');
        return okWrap_((typeof g === 'function' ? g : g.fn)(params, s));
      }
      if (own.call(GARDEN_ACTIONS, action)) {
        const f = GARDEN_ACTIONS[action], s = requireStudent_(params.code);
        if (!cfgBool_('gardenEnabled', true)) throw apiError_('garden_disabled', 'Khu vườn đang tắt.');
        return okWrap_((typeof f === 'function' ? f : f.fn)(params, s));
      }
      return legacyPost_(action, params);
    }
    return legacyGet_(params, action || 'ping');
  } catch (err) {
    if (err && err.apiCode) return { ok: false, error: err.apiCode, message: err.message };
    return { ok: false, error: 'server_error', message: String(err) };
  }
}
function doPost(e) {
  let out;
  try {
    if (!e || !e.postData || !e.postData.contents) out = { ok: false, error: 'bad_request', message: 'Thiếu dữ liệu.' };
    else if (e.postData.contents.length > MAX_BODY) out = { ok: false, error: 'too_large', message: 'Dữ liệu quá lớn.' };
    else {
      let body = null; try { body = JSON.parse(e.postData.contents); } catch (x) {}
      out = (body && typeof body === 'object' && !Array.isArray(body)) ? route(body.action || 'submit', body, 'POST') : { ok: false, error: 'bad_request', message: 'JSON không hợp lệ.' };
    }
  } catch (err) { out = { ok: false, error: 'server_error', message: String(err) }; }
  return jsonOut_(out);
}
function doGet(e) {
  const p = (e && e.parameter) || {};
  return jsonOut_(route(p.action || 'ping', p, 'GET'));
}
