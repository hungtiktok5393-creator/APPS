/* Nhà Thầy Hưng – Góc phụ huynh (phu-huynh.html).
 * Đăng nhập MỘT lần (mã phụ huynh + mật khẩu do giáo viên đặt) → máy chủ trả token; xem được mọi con, chuyển qua lại không cần đăng nhập lại.
 * API: parentLogin {code, password} → {token, name, children} · parentReport {code, token, fresh?} → {children:[báo cáo 30 ngày]} (xem Code.gs familyReport_). */
'use strict';
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzha0yUSz_D1VWCFweO4GEftqkq3crJiNA90EOWjmRZUcChUnllN6oplgr9ut6b1IHlgQ/exec';
const $ = id => document.getElementById(id);
const TZ = 'Asia/Ho_Chi_Minh', DAY = 86400000;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || sessionStorage.getItem(k) || 'null'); } catch (_) { return null; } },
  set(k, v, keep) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); if (v != null) (keep ? localStorage : sessionStorage).setItem(k, JSON.stringify(v)); } catch (_) {} }
};
const url = () => SCRIPT_URL || (store.get('sm_script_url_p') || '');
const ERR = {
  invalid_code: 'Mã phụ huynh không đúng. Kiểm tra lại với thầy Hưng.', code_disabled: 'Tài khoản phụ huynh này đang bị khóa.',
  wrong_password: 'Mật khẩu không đúng (phân biệt chữ hoa / thường).', auth_required: 'Hãy nhập mật khẩu.', locked: 'Nhập sai quá nhiều lần. Hãy đợi 45 giây rồi thử lại.',
  rate_limited: 'Thao tác hơi nhanh, đợi một giây rồi thử lại.', busy: 'Máy chủ đang bận, thử lại sau ít phút.'
};
const nf = n => Number(n || 0).toLocaleString('vi-VN');
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const pct = (a, b) => b > 0 ? Math.round(a / b * 100) : null;
const norm = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
const dkey = (() => { let f = null; try { f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }); } catch (_) {} return t => f ? f.format(new Date(t)) : new Date(t + 7 * 3600000).toISOString().slice(0, 10); })();
const fmtDT = t => new Date(t).toLocaleString('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const fmtDay = t => new Date(t).toLocaleDateString('vi-VN', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' });
const mins = ms => { const m = Math.round((ms || 0) / 60000); return m < 60 ? m + ' phút' : Math.floor(m / 60) + ' giờ ' + (m % 60 ? m % 60 + ' phút' : ''); };
function ago(t, now) {
  if (!t) return 'chưa có';
  const d = Math.floor((now - t) / 60000);
  if (d < 2) return 'vừa xong'; if (d < 60) return d + ' phút trước'; if (d < 1440) return Math.floor(d / 60) + ' giờ trước';
  const days = Math.round((dkey(now) === dkey(t) ? 0 : (Date.parse(dkey(now)) - Date.parse(dkey(t))) / DAY));
  return days === 1 ? 'hôm qua' : days + ' ngày trước';
}
function toast(m, err) { const t = el('div', 'toast' + (err ? ' error' : ''), m); $('toasts').append(t); setTimeout(() => t.remove(), 4000); }

/* ---- Gọi máy chủ ---- */
async function call(action, params) {
  if (!url()) throw Object.assign(new Error('Chưa có địa chỉ máy chủ.'), { code: 'no_url' });
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 45000); let d;
  try {
    const r = await fetch(url(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action }, params)), signal: ac.signal });
    d = await r.json();
  } catch (_) { throw Object.assign(new Error(navigator.onLine ? 'Không kết nối được máy chủ. Thử lại sau.' : 'Thiết bị đang mất mạng.'), { code: 'network' }); }
  finally { clearTimeout(tm); }
  if (!d || d.ok === false) {
    const code = (d && d.error) || 'server_error';
    if (code === 'bad_request' && /Hành động/.test((d && d.message) || '')) throw Object.assign(new Error('Máy chủ chưa được cập nhật bản mới. Hãy báo thầy Hưng.'), { code });
    throw Object.assign(new Error(ERR[code] || (d && d.message) || 'Có lỗi xảy ra.'), { code });
  }
  return d;
}

/* ---- Trạng thái ---- */
const S = { code: '', token: '', name: '', keep: true, kids: [], rep: null, sel: '', at: 0 };

/* ---- Tính các chỉ số từ báo cáo thô ---- */
/* Trang phụ huynh CHỈ hiện BÀI GIAO RIÊNG (bài thầy chọn mã của con). Bài giao chung là bài tự chọn của học sinh → không hiện ở đâu trên trang này.
 * Máy chủ v12 đã lọc sẵn (ownOnly). Máy chủ cũ còn gửi lẫn bài chung → lọc lại ở đây cho chắc. */
function ownOnly(rep) {
  const v12 = rep.ownOnly === true;
  (rep.children || []).forEach(x => {
    x.asg = (x.asg || []).filter(a => a.personal === true);
    const ids = new Set(x.asg.map(a => a.id)), keep = r => v12 ? r.own !== false : (r.own === true || (r.own === undefined && ids.has(r.aid)));
    x.vocab = (x.vocab || []).filter(keep); x.tests = (x.tests || []).filter(keep);
    if (!v12) {                       // số liệu theo ngày / từ sai / điểm học của máy chủ cũ có lẫn bài chung → dựng lại từ các bài riêng, bỏ phần không tách được
      const days = {}, mk = k => days[k] || (days[k] = { v: 0, t: 0, ms: 0, g: 0 });
      x.vocab.forEach(r => { const o = mk(dkey(r.t)); o.v++; o.ms += r.ms || 0; });
      x.tests.forEach(r => { const o = mk(dkey(r.t)); o.t++; o.ms += r.ms || 0; });
      Object.keys(x.days || {}).forEach(k => { if (x.days[k].g) mk(k).g = x.days[k].g; });
      x.days = days; x.words = []; if (x.ledger) x.ledger.study = null;
    }
    delete x.practice;
  });
  return rep;
}
function analyze(x, now) {
  const days = [];
  for (let i = 27; i >= 0; i--) { const t = now - i * DAY, k = dkey(t), o = x.days[k] || {}; days.push({ k, t, n: (o.v || 0) + (o.t || 0), ms: o.ms || 0, g: o.g || 0 }); }
  const last7 = days.slice(-7);
  const ownDays7 = last7.filter(d => d.n > 0).length, attempts7 = last7.reduce((a, d) => a + d.n, 0), ms7 = last7.reduce((a, d) => a + d.ms, 0);
  const due = x.asg.filter(a => a.due <= now), open = x.asg.filter(a => a.due > now);
  const doneDue = due.filter(a => a.done > 0).length, missed = due.filter(a => !a.done), todo = open.filter(a => !a.done).sort((a, b) => a.due - b.due), doneOpen = open.length - todo.length;
  const V = x.vocab.filter(v => v.n > 0), vScore = V.reduce((a, v) => a + v.score, 0), vMax = V.reduce((a, v) => a + v.n * 10, 0);
  const words = V.reduce((a, v) => a + v.n, 0), first = V.reduce((a, v) => a + v.first, 0), skip = V.reduce((a, v) => a + v.skip, 0);
  const T = x.tests.filter(t => t.max > 0), tScore = T.reduce((a, t) => a + t.score, 0), tMax = T.reduce((a, t) => a + t.max, 0);
  const vPct = pct(vScore, vMax), tPct = pct(tScore, tMax), firstPct = pct(first, words);
  const accParts = [vPct, tPct].filter(v => v != null), acc = accParts.length ? Math.round(accParts.reduce((a, b) => a + b, 0) / accParts.length) : null;
  const completion = due.length ? pct(doneDue, due.length) : null, urgent = todo.filter(a => a.due - now < DAY).length;
  // Chăm chỉ: làm bài giao riêng đủ và đúng hạn
  let dil;
  if (!x.asg.length) dil = ['none', '— Chưa có bài giao riêng', 'Thầy chưa giao bài riêng cho con trong 30 ngày qua.'];
  else if (!due.length) dil = todo.length ? ['ok', '⏳ Đang có bài cần làm', 'Còn ' + todo.length + ' bài giao riêng chưa làm (chưa đến hạn).'] : ['good', '👍 Chăm chỉ', 'Đã làm hết ' + open.length + ' bài giao riêng đang mở.'];
  else if (!missed.length && !urgent) dil = ['good', '🌟 Rất chăm chỉ', 'Làm đủ ' + doneDue + '/' + due.length + ' bài giao riêng đã hết hạn.'];
  else if (completion >= 80) dil = ['good', '👍 Chăm chỉ', 'Làm ' + doneDue + '/' + due.length + ' bài giao riêng' + (missed.length ? ', bỏ lỡ ' + missed.length + ' bài' : '') + '.'];
  else if (completion >= 50) dil = ['warn', '⚠️ Làm bài chưa đều', 'Bỏ lỡ ' + missed.length + '/' + due.length + ' bài giao riêng. Nên nhắc con làm bài trước hạn.'];
  else dil = ['bad', '⛔ Bỏ nhiều bài', 'Chỉ làm ' + doneDue + '/' + due.length + ' bài giao riêng. Phụ huynh hãy nhắc con.'];
  // Độ chính xác: chỉ bài giao riêng
  let accV;
  if (acc == null) accV = ['none', '— Chưa có bài để đánh giá', 'Con chưa làm bài giao riêng nào trong 30 ngày qua.'];
  else if (acc >= 85) accV = ['good', '🎯 Làm rất tốt', 'Bài giao riêng đúng trung bình ' + acc + '%.'];
  else if (acc >= 70) accV = ['good', '✅ Làm khá tốt', 'Bài giao riêng đúng trung bình ' + acc + '%.'];
  else if (acc >= 50) accV = ['warn', '📝 Trung bình', 'Đúng trung bình ' + acc + '% – cần ôn lại các từ hay sai.'];
  else accV = ['bad', '❗ Còn sai nhiều', 'Đúng trung bình ' + acc + '% – con cần ôn kỹ hơn.'];
  const games7 = x.games7 || 0, play = games7 > 0 && games7 > Math.max(20, attempts7 * 10);
  return { days, ownDays7, attempts7, ms7, due, open, doneDue, doneOpen, missed, todo, urgent, completion, vPct, tPct, firstPct, words, first, skip, acc, dil, accV, games7, play };
}
const verdictOf = p => (p >= 85 ? ['good', 'Tốt'] : p >= 65 ? ['ok', 'Khá'] : ['bad', 'Cần ôn']);

/* ---- Vẽ ---- */
function chip(kind, text) { return el('span', 'pa-chip ' + kind, text); }
function kpi(label, value, sub, title) { const d = el('div', 'pa-kpi'); if (title) d.title = title; d.append(el('span', 'k', label), el('b', 'v', value), sub ? el('span', 's', sub) : ''); return d; }
function section(title, ...kids) { const s = el('section', 'card pa-sec'); s.append(el('h3', '', title), ...kids.filter(Boolean)); return s; }

function drawKids() {
  const nav = $('kids'); nav.replaceChildren();
  const list = (S.rep && S.rep.children) || [];
  nav.hidden = list.length < 2;
  if (list.length < 2) return;
  const now = S.rep.serverTime || Date.now();
  list.forEach(x => {
    const A = analyze(x, now), b = el('button', 'pa-kid'); b.type = 'button'; b.setAttribute('aria-pressed', String(S.sel === x.code));
    b.append(el('b', '', x.note || x.code), el('span', 'muted small-text', x.note ? x.code : ''), chip(A.dil[0], A.dil[1]));
    b.onclick = () => { S.sel = x.code; store.set('sm_parent_sel', x.code, true); drawKids(); drawReport(); };
    nav.append(b);
  });
}

function heat(A) {
  const wrap = el('div', 'pa-heat-wrap'), grid = el('div', 'pa-heat'), info = el('p', 'hint pa-heat-info');
  grid.setAttribute('role', 'grid'); grid.setAttribute('aria-label', 'Hoạt động 28 ngày gần nhất');
  ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].forEach(d => grid.append(el('span', 'pa-dow', d)));
  const first = new Date(Date.parse(A.days[0].k + 'T00:00:00Z')).getUTCDay(), lead = (first + 6) % 7;   // ô trống để ngày đầu rơi đúng thứ
  for (let i = 0; i < lead; i++) grid.append(el('span', 'pa-cell empty'));
  const say = d => fmtDay(d.t) + ': ' + [d.n ? d.n + ' bài (' + mins(d.ms) + ')' : 'không làm bài', d.g ? d.g + ' ván trò chơi' : ''].filter(Boolean).join(' · ');
  A.days.forEach((d, i) => {
    const c = el('button', 'pa-cell l' + Math.min(3, d.n) + (d.g ? ' g' : '') + (i === A.days.length - 1 ? ' today' : '')); c.type = 'button';
    c.setAttribute('aria-label', say(d)); c.title = say(d);
    c.append(el('span', 'dn', String(Number(d.k.slice(8)))));
    c.onclick = () => { info.textContent = say(d); grid.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); c.classList.add('sel'); };
    grid.append(c);
  });
  const lg = el('div', 'pa-legend');
  lg.append(el('span', 'muted small-text', 'Ít bài'), el('span', 'pa-cell l0 mini'), el('span', 'pa-cell l1 mini'), el('span', 'pa-cell l2 mini'), el('span', 'pa-cell l3 mini'), el('span', 'muted small-text', 'nhiều bài'),
    el('span', 'pa-cell l0 g mini'), el('span', 'muted small-text', 'có chơi trò chơi'));
  info.textContent = 'Chạm vào một ngày để xem chi tiết.';
  wrap.append(grid, lg, info); return wrap;
}

function asgList(items, now, kind) {
  const ul = el('ul', 'pa-list');
  items.forEach(a => {
    const li = el('li'), m = el('div', 'm');
    m.append(el('b', '', (a.kind === 'test' ? '📝 ' : '📘 ') + a.name), el('span', 'hint', kind === 'todo' ? 'Hạn ' + fmtDT(a.due) + ' (còn ' + left(a.due - now) + ')' : 'Hết hạn ' + fmtDT(a.due)));
    li.append(m, kind === 'todo' ? chip(a.due - now < DAY ? 'bad' : 'warn', a.due - now < DAY ? 'Sắp hết hạn' : 'Chưa làm') : chip('bad', 'Bỏ lỡ'));
    ul.append(li);
  });
  return ul;
}
function left(ms) { const m = Math.floor(ms / 60000), d = Math.floor(m / 1440); return d ? d + ' ngày' : m >= 60 ? Math.floor(m / 60) + ' giờ' : Math.max(1, m) + ' phút'; }

const STATUS = { done: 'Làm hết bài', stopped: 'Dừng sớm', partial: 'Thoát giữa chừng', timeout: 'Bỏ dở 30 phút' };
function results(x, empty) {
  const all = x.vocab.map(v => Object.assign({ k: 'v' }, v)).concat(x.tests.map(t => Object.assign({ k: 't' }, t))).sort((a, b) => b.t - a.t);
  if (!all.length) return el('p', 'muted', empty);
  const ul = el('ul', 'pa-list pa-res'), more = el('button', 'btn small', 'Xem thêm'); more.type = 'button';
  let shown = 0;
  const add = n => {
    all.slice(shown, shown + n).forEach(r => {
      const li = el('li'), m = el('div', 'm');
      let p, line;
      if (r.k === 'v') {
        p = pct(r.score, r.n * 10);
        line = [r.n + (r.total && r.total > r.n ? '/' + r.total : '') + ' từ', 'đúng ngay ' + r.first + '/' + r.n, r.skip ? 'bỏ qua ' + r.skip : '', r.peeks ? 'xem lại ' + r.peeks + ' lần' : '', STATUS[r.status] && r.status !== 'done' ? STATUS[r.status] : ''].filter(Boolean);
      } else { p = pct(r.score, r.max); line = ['Điểm ' + nf(r.score) + '/' + nf(r.max)]; }
      line.push(mins(r.ms)); if (r.late) line.push('nộp trễ');
      m.append(el('b', '', (r.k === 't' ? '📝 ' : '📘 ') + (r.name || 'Bài')), el('span', 'hint', fmtDT(r.t) + ' · ' + line.join(' · ')));
      const v = el('div', 'v');
      if (p == null) v.append(el('span', 'muted', '—'));
      else { const vv = verdictOf(p); v.append(el('b', 'pa-pct ' + vv[0], p + '%'), chip(vv[0], vv[1])); }
      li.append(m, v); ul.append(li);
    });
    shown = Math.min(all.length, shown + n); more.hidden = shown >= all.length;
  };
  more.onclick = () => add(10); add(8);
  const d = el('div'); d.append(ul, more); return d;
}

function drawReport() {
  const box = $('report'); box.replaceChildren();
  const list = (S.rep && S.rep.children) || [];
  if (!list.length) { box.append(el('div', 'card empty', 'Tài khoản chưa được gắn với học sinh nào. Hãy liên hệ thầy Hưng.')); return; }
  const x = list.find(k => k.code === S.sel) || list[0]; S.sel = x.code;
  const now = S.rep.serverTime || Date.now();
  if (!x.exists) { box.append(section('Mã ' + x.code, el('p', 'err', 'Không tìm thấy mã học sinh này. Hãy liên hệ thầy Hưng để kiểm tra lại.'))); return; }
  x.lastStudy = Math.max(0, ...x.vocab.map(v => v.t), ...x.tests.map(t => t.t));
  const A = analyze(x, now);

  // 1. Tóm tắt (đánh giá chỉ theo bài giao riêng)
  const hero = el('section', 'card pa-hero');
  const who = el('div', 'pa-who'); who.append(el('h2', '', x.note || ('Mã ' + x.code)), el('span', 'muted small-text', 'Mã học sinh: ' + x.code + (x.active ? '' : ' · (mã đang bị khóa)')));
  const verdicts = el('div', 'pa-verdicts');
  [['Chăm chỉ', A.dil], ['Độ chính xác', A.accV]].forEach(([t, v]) => { const d = el('div', 'pa-verdict ' + v[0]); d.append(el('span', 'k', t), el('b', '', v[1]), el('span', 's', v[2])); verdicts.append(d); });
  hero.append(who, verdicts, el('p', 'muted small-text', 'Lần làm bài gần nhất: ' + (x.lastStudy ? ago(x.lastStudy, now) + ' (' + fmtDT(x.lastStudy) + ')' : 'chưa có trong 30 ngày qua') + '.'));
  if (A.todo.length) { const a = el('p', 'pa-alert'); a.textContent = '📌 Con còn ' + A.todo.length + ' bài giao riêng chưa làm' + (A.urgent ? ', có ' + A.urgent + ' bài sắp hết hạn trong 24 giờ' : '') + '.'; hero.append(a); }
  if (A.play) { const a = el('p', 'pa-alert'); a.textContent = '🎮 Tuần này con chơi ' + nf(A.games7) + ' ván trò chơi nhưng chỉ làm ' + A.allAttempts7 + ' bài. Phụ huynh nên nhắc con ưu tiên học.'; hero.append(a); }
  box.append(hero);

  // 2. Chỉ số chính (bài giao riêng)
  const k = el('div', 'pa-kpis');
  k.append(
    kpi('Bài giao riêng đã làm', A.due.length ? A.doneDue + '/' + A.due.length : '—', A.due.length ? (A.missed.length ? 'Bỏ lỡ ' + A.missed.length + ' bài' : 'Không bỏ lỡ bài nào') : 'Chưa có bài hết hạn', 'Các bài giao riêng đã hết hạn trong 30 ngày qua'),
    kpi('Bài chưa làm', String(A.todo.length), A.todo.length ? 'Hạn gần nhất: còn ' + left(A.todo[0].due - now) : (A.open.length ? 'Đã làm hết bài đang mở' : 'Không có bài đang mở')),
    kpi('Độ chính xác', A.acc == null ? '—' : A.acc + '%', [A.vPct != null ? 'Từ vựng ' + A.vPct + '%' : '', A.tPct != null ? 'Test ' + A.tPct + '%' : ''].filter(Boolean).join(' · ') || 'Chưa có bài'),
    kpi('Thời gian làm bài (7 ngày)', mins(A.ms7), A.attempts7 + ' lần · ' + A.ownDays7 + '/7 ngày'));
  box.append(k);

  // 3. Bài cần làm / bỏ lỡ
  if (A.todo.length) box.append(section('📌 Bài giao riêng chưa làm – ' + A.todo.length, asgList(A.todo, now, 'todo')));
  if (A.missed.length) box.append(section('⏰ Bài giao riêng đã bỏ lỡ (30 ngày) – ' + A.missed.length, asgList(A.missed, now, 'missed')));

  // 4. Kết quả bài giao riêng
  const vs = el('div', 'pa-mini');
  if (A.words) vs.append(el('p', 'small-text', 'Từ vựng 30 ngày: ' + nf(A.words) + ' từ đã làm · đúng ngay lần đầu ' + nf(A.first) + ' từ (' + A.firstPct + '%)' + (A.skip ? ' · bỏ qua ' + nf(A.skip) + ' từ' : '') + '.'));
  box.append(section('📝 Kết quả bài giao riêng', vs.childNodes.length ? vs : null, results(x, 'Chưa có bài giao riêng nào được làm trong 30 ngày qua.')));

  // 5. Lịch học
  box.append(section('📅 Lịch học 4 tuần gần nhất', heat(A)));

  // 6. Từ hay sai
  if (x.words && x.words.length) {
    const w = el('div', 'pa-words');
    x.words.forEach(([word, seen, bad]) => { const c = el('span', 'pa-word'); c.append(el('b', '', word), el('span', 'muted', ' ' + bad + '/' + seen)); c.title = 'Sai, bỏ qua hoặc phải xem lại nhiều ' + bad + ' trên ' + seen + ' lần gặp'; w.append(c); });
    box.append(section('🔁 Từ con hay sai – nên ôn cùng con', w, el('p', 'hint', 'Số bên cạnh: số lần sai / số lần gặp từ trong 30 ngày (trong các bài thầy giao riêng).')));
  }

  // 8. Điểm & trò chơi
  const L = x.ledger || {}, pts = el('div', 'pa-kpis');
  pts.append(kpi('Điểm tích lũy', nf(x.totalEarned), x.rank ? 'Hạng ' + x.rank + '/' + x.totalStudents + ' của lớp' : ''),
    kpi('Kiếm từ bài giao riêng', L.study == null ? '—' : (L.study >= 0 ? '+' : '') + nf(L.study), 'Trong 30 ngày qua'),
    kpi('Trò chơi (30 ngày)', (L.game > 0 ? '+' : '') + nf(L.game), (x.games7 || 0) + ' ván trong 7 ngày'),
    kpi('Số dư hiện tại', nf(x.balance), 'Điểm ảo, không đổi ra tiền'));
  box.append(section('🏆 Điểm thưởng', pts));
}

function drawAll() {
  $('hello').textContent = 'Xin chào' + (S.name ? ', ' + S.name : '') + ' 👋';
  const n = (S.rep && S.rep.children || []).length;
  $('updated').textContent = (n > 1 ? n + ' con · ' : '') + 'Cập nhật lúc ' + new Date(S.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  drawKids(); drawReport();
}

/* ---- Đăng nhập / tải ---- */
function loginView(msg) { $('view-main').hidden = true; $('btn-logout').hidden = true; $('view-login').hidden = false; $('url-box').hidden = !!SCRIPT_URL; $('login-err').textContent = msg || ''; $('login-btn').disabled = false; }
async function load(fresh) {
  const box = $('report');
  if (!S.rep) box.replaceChildren(el('div', 'card center muted', 'Đang tải báo cáo… (lần đầu có thể mất vài giây)'));
  $('btn-refresh').disabled = true;
  try {
    const r = await call('parentReport', { code: S.code, token: S.token, fresh: !!fresh });
    S.rep = ownOnly(r); S.at = Date.now(); if (r.name) S.name = r.name;
    if (!S.rep.children.some(c => c.code === S.sel)) S.sel = (S.rep.children[0] || {}).code || '';
    drawAll(); if (fresh) toast('Đã cập nhật.');
  } catch (e) {
    if (['auth_required', 'wrong_password', 'invalid_code', 'code_disabled'].includes(e.code)) { logout(); loginView(e.code === 'wrong_password' || e.code === 'auth_required' ? 'Mật khẩu đã được thay đổi. Hãy đăng nhập lại.' : e.message); return; }
    if (S.rep) toast(e.message, 1); else box.replaceChildren(el('div', 'card err', e.message));
  } finally { $('btn-refresh').disabled = false; }
}
function enterMain() { $('view-login').hidden = true; $('view-main').hidden = false; $('btn-logout').hidden = false; $('hello').textContent = 'Xin chào' + (S.name ? ', ' + S.name : '') + ' 👋'; load(); }
function logout() { store.set('sm_parent', null); S.code = S.token = S.name = ''; S.rep = null; $('report').replaceChildren(); $('kids').replaceChildren(); }

function init() {
  if (!SCRIPT_URL) $('url-in').value = store.get('sm_script_url_p') || '';
  $('login-form').onsubmit = async ev => {
    ev.preventDefault();
    if (!SCRIPT_URL) { const u = $('url-in').value.trim(); if (!/^https:\/\//.test(u)) return ($('login-err').textContent = 'Nhập địa chỉ máy chủ bắt đầu bằng https://'); store.set('sm_script_url_p', u, true); }
    const c = norm($('code-in').value), p = $('pw-in').value.trim(); $('code-in').value = c;
    if (c.length < 3) return ($('login-err').textContent = 'Mã phụ huynh gồm 3–16 chữ hoặc số.');
    if (!p) { $('login-err').textContent = 'Hãy nhập mật khẩu.'; return $('pw-in').focus(); }
    $('login-btn').disabled = true; $('login-err').textContent = 'Đang kiểm tra…';
    try {
      const r = await call('parentLogin', { code: c, password: p });
      S.code = r.code; S.token = r.token; S.name = r.name || ''; S.keep = $('rem').checked;
      store.set('sm_parent', { code: S.code, token: S.token, name: S.name }, S.keep);
      $('pw-in').value = ''; $('login-err').textContent = ''; $('login-btn').disabled = false; enterMain();
    } catch (e) { loginView(e.message); if (['wrong_password', 'auth_required'].includes(e.code)) $('pw-in').focus(); }
  };
  $('code-in').oninput = e => { const v = norm(e.target.value); if (v !== e.target.value) e.target.value = v; };
  const eye = $('pw-eye'); eye.onclick = () => { const p = $('pw-in'), on = p.type === 'password'; p.type = on ? 'text' : 'password'; eye.textContent = on ? '🙈' : '👁'; eye.setAttribute('aria-pressed', String(on)); eye.setAttribute('aria-label', on ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'); };
  $('btn-refresh').onclick = () => load(true);
  $('btn-logout').onclick = () => { logout(); loginView(); $('code-in').value = ''; $('code-in').focus(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.token && Date.now() - S.at > 10 * 60000) load(); });
  S.sel = store.get('sm_parent_sel') || '';
  const q = new URLSearchParams(location.search), saved = store.get('sm_parent'), qc = norm(q.get('code'));
  if (q.has('code')) history.replaceState(null, '', location.pathname);
  if (saved && saved.code && saved.token && (!qc || qc === saved.code)) { S.code = saved.code; S.token = saved.token; S.name = saved.name || ''; S.keep = !!localStorage.getItem('sm_parent'); enterMain(); }
  else { loginView(); if (qc) { $('code-in').value = qc; $('pw-in').focus(); } else $('code-in').focus(); }
}
init();
