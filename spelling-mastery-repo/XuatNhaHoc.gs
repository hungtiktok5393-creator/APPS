/**
 * XUẤT DỮ LIỆU sang app mới "Nhà Học" (mục 16). Chỉ ĐỌC Google Sheet, không sửa / xoá gì.
 * Cách dùng: dán file này vào dự án Apps Script cũ (thêm file mới tên XuatNhaHoc), chọn hàm xuatDuLieuNhaHoc → bấm Chạy.
 * Kết quả: 1 tệp nha-hoc-du-lieu-<ngày>.json trong Google Drive của thầy (đường link in ở "Nhật ký thực thi").
 * Tệp chứa: Config, Students (mã, PIN, số dư), Ledger, Parents, Assignments (+ nội dung trong sheet Tests), Results, TestResults,
 * Pets, City (đã giải nén), GameLog, và thư viện bộ từ / bài test lấy từ GitHub (index.json + data/).
 * Tệp có mật khẩu học sinh / phụ huynh → nhập xong thì XOÁ tệp khỏi Drive và máy tính.
 */
const NHX_LIBRARY = 'https://raw.githubusercontent.com/hungtiktok5393-creator/APPS/main/spelling-mastery-repo/';

function xuatDuLieuNhaHoc() {
  const ss = (typeof ss_ === 'function') ? ss_() : SpreadsheetApp.getActiveSpreadsheet();
  const warn = [];
  const out = { app: 'nha-thay-hung-export', version: 1, exportedAt: new Date().toISOString(), warnings: warn };

  out.config = {};
  nhxRows_(ss, 'Config').forEach(function (r) { if (r.key) out.config[String(r.key)] = r.value; });

  // Bài nộp: name = mã học sinh (từ bản v10). Lớp gần nhất của mỗi mã → đưa sang học sinh.
  const cls = {};
  function noteCls(code, c, at) { const k = nhxFold_(code); if (k && c && (!cls[k] || cls[k].at < at)) cls[k] = { c: String(c), at: at }; }

  out.results = nhxRows_(ss, 'Results').map(function (r) {
    let det = []; const raw = [r.details].concat([2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (i) { return r['details' + i]; })).join('');
    try { det = JSON.parse(raw || '[]'); } catch (e) { warn.push('Results ' + r.submissionId + ': details lỗi'); }
    noteCls(r.name, r.cls, nhxIso_(r.submittedAt));
    return { id: String(r.submissionId), aid: String(r.assignmentId), at: nhxIso_(r.submittedAt), code: String(r.name), cls: String(r.cls || ''),
      score: r.score, totalMs: r.totalMs, late: r.late, status: r.status || 'done', totalWords: r.totalWords, details: det };
  }).filter(function (r) { return r.id; });

  out.testResults = nhxRows_(ss, 'TestResults').map(function (r) {
    let items = []; try { items = JSON.parse(r.items || '[]'); } catch (e) { warn.push('TestResults ' + r.submissionId + ': items lỗi'); }
    noteCls(r.name, r.cls, nhxIso_(r.submittedAt));
    return { id: String(r.submissionId), aid: String(r.testId), at: nhxIso_(r.submittedAt), code: String(r.name), cls: String(r.cls || ''),
      score: r.score, maxScore: r.maxScore, totalMs: r.totalMs, late: r.late, items: items };
  }).filter(function (r) { return r.id; });

  out.students = nhxRows_(ss, 'Students').filter(function (r) { return r.code !== ''; }).map(function (r) {
    const k = nhxFold_(r.code);
    return { code: String(r.code), note: String(r.note || ''), cls: cls[k] ? cls[k].c : '', active: r.active, balance: r.balance, totalEarned: r.totalEarned,
      password: String(r.password == null ? '' : r.password), createdAt: nhxIso_(r.createdAt), lastActive: nhxIso_(r.lastActive) };
  });

  out.ledger = nhxRows_(ss, 'Ledger').map(function (r) {
    return { t: nhxIso_(r.timestamp), code: String(r.code), delta: r.delta, reason: String(r.reason), refId: String(r.refId || ''), balanceAfter: r.balanceAfter, detail: String(r.detail || '') };
  });

  out.parents = nhxRows_(ss, 'Parents').filter(function (r) { return r.code !== ''; }).map(function (r) {
    return { code: String(r.code), password: String(r.password == null ? '' : r.password), name: String(r.name || ''), children: String(r.children || ''),
      note: String(r.note || ''), active: r.active, createdAt: nhxIso_(r.createdAt) };
  });

  // Nội dung lớn (bộ từ dài / đề test) nằm trong sheet Tests, cắt thành nhiều ô c0..c19.
  const blobs = {};
  nhxRows_(ss, 'Tests').forEach(function (r) {
    let s = ''; for (let i = 0; i < 20; i++) s += (r['c' + i] == null ? '' : String(r['c' + i]));
    if (r.id && s) { try { blobs[String(r.id)] = JSON.parse(s); } catch (e) { warn.push('Tests ' + r.id + ': nội dung lỗi'); } }
  });
  out.assignments = nhxRows_(ss, 'Assignments').filter(function (r) { return r.id !== ''; }).map(function (r) {
    const id = String(r.id), kind = String(r.kind) === 'test' ? 'test' : 'vocab', b = blobs[id];
    let words = null, tts = {};
    try { words = r.wordsJson ? JSON.parse(r.wordsJson) : null; } catch (e) { warn.push('Assignments ' + id + ': wordsJson lỗi'); }
    try { tts = r.ttsJson ? JSON.parse(r.ttsJson) : {}; } catch (e) {}
    if (kind === 'vocab' && !words && Array.isArray(b)) words = b;
    const codes = String(r.codes || '').split(/[\s,;]+/).filter(String);
    return { id: id, name: String(r.name || ''), kind: kind, due: Number(r.due) || 0, max: Number(r.max) || 0, createdAt: nhxIso_(r.createdAt),
      words: kind === 'vocab' ? words : null, test: kind === 'test' && b && !Array.isArray(b) ? b : null, tts: tts,
      shuffle: r.shuffle === true || String(r.shuffle).toUpperCase() === 'TRUE', correctPts: r.correctPts, peekPenalty: r.peekPenalty, codes: codes };
  });
  // Đề test có bài nộp nhưng không còn dòng Assignments (bài test kiểu cũ) → vẫn giữ để nhập.
  const have = {}; out.assignments.forEach(function (a) { have[a.id] = 1; });
  Object.keys(blobs).forEach(function (id) {
    const b = blobs[id];
    if (!have[id] && b && !Array.isArray(b) && b.sections) out.assignments.push({ id: id, name: String(b.name || 'Bài test'), kind: 'test', due: 0, max: 0, test: b, codes: [] });
  });

  out.pets = nhxRows_(ss, 'Pets').filter(function (r) { return r.code !== ''; }).map(function (r) {
    return { code: String(r.code), state: String(r.state || ''), v: r.v, updatedAt: nhxIso_(r.updatedAt), lvl: r.lvl, xp: r.xp, streak: r.streak,
      alive: r.alive, name: String(r.name || ''), species: String(r.species || ''), best: r.best };
  });

  out.cities = nhxRows_(ss, 'City').filter(function (r) { return r.code !== ''; }).map(function (r) {
    let s = ''; for (let i = 1; i <= 24; i++) s += (r['s' + i] == null ? '' : String(r['s' + i]));
    try { if (s.slice(0, 2) === 'z:') s = Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(s.slice(2)), 'application/x-gzip', 's.gz')).getDataAsString(); }
    catch (e) { warn.push('City ' + r.code + ': giải nén lỗi'); s = ''; }
    return { code: String(r.code), state: s, v: r.v, updatedAt: nhxIso_(r.updatedAt), lvl: r.lvl, xp: r.xp, pop: r.pop, value: r.value, name: String(r.name || ''), likes: r.likes };
  }).filter(function (c) { return c.state; });

  out.gameLog = nhxRows_(ss, 'GameLog').map(function (r) {
    return { t: nhxIso_(r.timestamp), code: String(r.code), game: String(r.game), bet: r.bet, payout: r.payout, net: r.net, detail: String(r.detail || '') };
  });

  out.library = nhxLibrary_(warn);

  const name = 'nha-hoc-du-lieu-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd-HHmm') + '.json';
  const file = DriveApp.createFile(name, JSON.stringify(out), 'application/json');
  Logger.log('XONG! Tệp: ' + name);
  Logger.log('Mở link này rồi bấm nút Tải xuống (⬇): ' + file.getUrl());
  Logger.log('Học sinh: ' + out.students.length + ' · Bài giao: ' + out.assignments.length + ' · Bài nộp: ' + (out.results.length + out.testResults.length) +
    ' · Sổ xu: ' + out.ledger.length + ' · Phụ huynh: ' + out.parents.length + ' · Thú cưng: ' + out.pets.length + ' · Thành phố: ' + out.cities.length +
    ' · Bộ từ: ' + out.library.sets.length + ' · Bài test: ' + out.library.tests.length);
  if (warn.length) Logger.log('Lưu ý: ' + warn.join(' | '));
}

/** Các dòng của 1 sheet thành object theo tên cột ở dòng 1. Không có sheet → []. */
function nhxRows_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), head = v[0].map(String);
  return v.slice(1).map(function (row) { const o = {}; head.forEach(function (h, i) { if (h) o[h] = row[i]; }); return o; });
}
function nhxIso_(v) { if (v instanceof Date) return v.toISOString(); return v === '' || v == null ? '' : String(v); }
function nhxFold_(v) {
  return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Thư viện bộ từ / bài test: đọc index.json + data/sets|tests/<id>.json trên GitHub (repo công khai). */
function nhxLibrary_(warn) {
  const lib = { sets: [], tests: [] };
  try {
    const idx = JSON.parse(UrlFetchApp.fetch(NHX_LIBRARY + 'index.json').getContentText());
    const items = (idx.sets || []).map(function (s) { return ['sets', s.id]; }).concat((idx.tests || []).map(function (t) { return ['tests', t.id]; }));
    for (let i = 0; i < items.length; i += 20) {
      const part = items.slice(i, i + 20);
      UrlFetchApp.fetchAll(part.map(function (x) { return { url: NHX_LIBRARY + 'data/' + x[0] + '/' + x[1] + '.json', muteHttpExceptions: true }; }))
        .forEach(function (res, k) {
          if (res.getResponseCode() !== 200) { warn.push('Thiếu tệp thư viện ' + part[k][1]); return; }
          try { lib[part[k][0]].push(JSON.parse(res.getContentText())); } catch (e) { warn.push('Tệp thư viện lỗi ' + part[k][1]); }
        });
    }
  } catch (e) { warn.push('Không tải được thư viện từ GitHub: ' + e.message); }
  return lib;
}
