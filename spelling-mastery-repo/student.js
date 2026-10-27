/* Nhà Thầy Hưng (Spelling Mastery) – trang học sinh (độc lập, không sửa app.js).
 * API cho games.js:  window.SMGame = { api(action,params), getBalance(), setBalance(n), toast(msg,isErr), sfx(name), requestId(), betValue(),
 *   + mở rộng: settle({delta,balance}) gọi sau MỖI ván xong (tính lãi/lỗ phiên, hạn mức, nhắc nghỉ); canPlay()->{ok,reason};
 *   register(name,{mount(stage,ctx),unmount(),resume(state)}); setRules(name,[dòng]); reducedMotion; config; stage }
 * Sự kiện trên document: smgame:select {game,stage} · smgame:stop · smgame:resume {game,state}. Game tự stage.replaceChildren() khi gắn.
 * Giả định (không có trong API_SPEC): action getActiveGame {code} → {active:{game,...}} ; lỗi/không có thì bỏ qua. */
'use strict';
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzha0yUSz_D1VWCFweO4GEftqkq3crJiNA90EOWjmRZUcChUnllN6oplgr9ut6b1IHlgQ/exec';
const VER = '20261027n', BREAK_EVERY = 20;
const $ = id => document.getElementById(id);
const LS = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} } };
const GAMES = [['slots', '🎰', 'Máy quay'], ['wheel', '🎡', 'Vòng quay'], ['hilo', '🃏', 'Cao–Thấp'], ['mines', '💣', 'Dò mìn'], ['crash', '🚀', 'Crash'], ['dice', '🎲', 'Xúc xắc'], ['plinko', '🔻', 'Plinko'], ['scratch', '🎟️', 'Thẻ cào'], ['keno', '🔢', 'Keno mini'], ['coin', '🪙', 'Tung xu']];
const REASON = { vocab: ['📘', 'Từ vựng'], test: ['📝', 'Bài test'], game: ['🎮', 'Trò chơi'], garden: ['🌱', 'Khu vườn (cũ)'], pet: ['🐾', 'Thú cưng'], city: ['🏙️', 'Nông trại & Thành phố'], teacher_adjust: ['👩‍🏫', 'Giáo viên chỉnh'] };
const ERR = { invalid_code: 'Mã không đúng. Kiểm tra lại với giáo viên.', code_disabled: 'Mã này đã bị khóa.', auth_required: 'Mã này có mật khẩu. Hãy nhập mật khẩu giáo viên đã cho bạn.', wrong_password: 'Mật khẩu không đúng. Kiểm tra lại (phân biệt chữ hoa / thường).', locked: 'Nhập sai mật khẩu quá nhiều lần. Đợi 10 phút rồi thử lại.', rate_limited: 'Bạn thao tác quá nhanh, chờ một giây.', busy: 'Máy chủ đang bận, thử lại sau.', games_disabled: 'Giáo viên đang tắt khu trò chơi.', unauthorized: 'Không có quyền.' };
const S = { code: '', tok: '', bal: 0, earned: 0, ledger: [], cfg: { maxBet: 200, maxBetPct: 25, dailyLossLimit: 300, gamesEnabled: true }, game: null, tab: '', filter: 'all', rounds: 0, pnl: 0, sinceBreak: 0, todayNet: 0, lock: null, reg: {}, rules: {}, resume: null, cfgAt: 0, last: 0, fast: false };
S.fast = LS.get('sm_fast') === '1';
const url = () => SCRIPT_URL || LS.get('sm_script_url') || '';
const nf = n => Number(n || 0).toLocaleString('vi-VN');
const sg = n => (n > 0 ? '+' : n < 0 ? '−' : '') + nf(Math.abs(n));
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const reduced = matchMedia('(prefers-reduced-motion:reduce)');

/* ---- API: POST text/plain. Action thường: cách nhau ≥1,1 giây (rate limit máy chủ).
 * Action của trò chơi: KHÔNG chờ 1,1 giây; chỉ xếp hàng cùng action (không gửi chồng khi cái trước chưa xong) và cách nhau ≥50ms. ---- */
const gate = {}, lane = {}, laneAt = {};
const GAME_ACT = /^(slots|wheel|hilo|mines|crash|dice|plinko|scratch|keno|coin|city|pet|getActiveGame|getGameStats)/;      // 'city'/'pet' = cityGet/cityAct…/petGet/petAct…: không chờ 1,1 giây/lần
const sleep = ms => new Promise(r => setTimeout(r, ms));
function call(action, params, retry) {
  if (!GAME_ACT.test(action)) return callRaw(action, params, retry, false);
  const mine = (lane[action] || Promise.resolve()).catch(() => {}).then(async () => {
    const w = (laneAt[action] || 0) + 50 - Date.now(); if (w > 0) await sleep(w);
    laneAt[action] = Date.now();
    return callRaw(action, params, retry, true);
  });
  lane[action] = mine; return mine;
}
async function callRaw(action, params, retry, free) {
  if (!url()) throw Object.assign(new Error('Chưa cài địa chỉ máy chủ.'), { code: 'no_url' });
  if (!free) { const wait = (gate[action] || 0) - Date.now(); gate[action] = Math.max(Date.now(), gate[action] || 0) + 1100; if (wait > 0) await sleep(wait); }
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 20000);
  let d;
  try {
    const r = await fetch(url(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action }, params)), signal: ac.signal });
    d = await r.json();
  } catch (_) { throw Object.assign(new Error(navigator.onLine ? 'Không kết nối được máy chủ. Thử lại sau.' : 'Không có mạng.'), { code: 'network' }); } finally { clearTimeout(t); }
  if (!d || d.ok === false) {
    const code = d && d.error || 'server_error';
    if (code === 'rate_limited' && !retry) { await sleep(free ? 500 : 1300); return callRaw(action, params, 1, free); }   // máy chủ v10 không giới hạn action trò chơi; bản cũ thì thử lại sau 0,5 giây
    const stale = code === 'bad_request' && /Hành động không hợp lệ/.test((d && d.message) || '');   // máy chủ Apps Script là bản cũ / sai địa chỉ
    throw Object.assign(new Error(stale ? 'Máy chủ chưa được cập nhật hoặc sai địa chỉ. Hãy báo giáo viên.' : (ERR[code] || (d && d.message) || 'Có lỗi xảy ra.')), { code, raw: d });
  }
  return d;
}
const api = (action, params) => call(action, Object.assign({ code: S.code, token: S.tok }, params)).then(r => { if (typeof r.balance === 'number') setBal(r.balance); return r; }, e => {
  if (['auth_required', 'wrong_password'].includes(e.code) && S.code) { const c = S.code; logout(); loginView('Mật khẩu đã được thay đổi. Hãy đăng nhập lại.'); $('code-in').value = c; $('pw-in').focus(); }
  else if (e.code === 'games_disabled') { S.cfg.gamesEnabled = false; evalLock(); }
  else if (!/^(city|pet)/.test(action) && /hạn mức|daily/i.test((e.raw && (e.raw.message + e.raw.error)) || '')) {   // trần chi điểm của Thành phố / Thú cưng KHÔNG phải hạn mức lỗ trò chơi
    S.todayNet = -S.cfg.dailyLossLimit; evalLock(); }
  throw e;
});

/* ---- Toast & âm thanh ---- */
function toast(m, err) { const t = el('div', 'toast' + (err ? ' error' : ''), m); $('toasts').append(t); setTimeout(() => t.remove(), 3800); }
let ac, muted = LS.get('sm_snd') === '0';
const TONES = { click: [[600, .04]], coin: [[880, .07], [1320, .12]], win: [[523, .1], [659, .1], [784, .1], [1047, .2]], lose: [[300, .14], [220, .24]], tick: [[1000, .02]], near: [[660, .06], [880, .06], [990, .14]], spin: [[400, .05], [500, .05], [600, .05]], error: [[180, .2, 'sawtooth']] };
function sfx(n) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume();
    let t = ac.currentTime; for (const [f, d, ty] of TONES[n] || TONES.click) { const o = ac.createOscillator(), g = ac.createGain(); o.type = ty || 'sine'; o.frequency.value = f; g.gain.setValueAtTime(.08, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d); t += d; }
  } catch (_) {}
}

/* ---- Số dư, mức cược, hạn mức, khóa ---- */
function setBal(n) { S.bal = Math.max(0, Math.floor(+n) || 0); $('bal').textContent = nf(S.bal); $('gbal').textContent = nf(S.bal); clampBet(); evalLock(); earnCta(); }
const lossLeft = () => S.cfg.dailyLossLimit > 0 ? Math.max(0, S.cfg.dailyLossLimit + Math.min(0, S.todayNet)) : Infinity;
function betCap() { const c = S.cfg; let m = Math.min(c.maxBet > 0 ? c.maxBet : Infinity, Math.max(1, Math.floor(S.bal * (c.maxBetPct || 100) / 100)), S.bal, lossLeft()); return isFinite(m) ? Math.max(0, m) : S.bal; }
function clampBet() { const i = $('bet'); let v = Math.floor(+i.value) || 0; const cap = betCap(); if (v > cap) v = cap; if (v < 0) v = 0; if (document.activeElement !== i || v !== +i.value && i.value !== '') i.value = v || ''; i.max = cap; $('bet-hint').textContent = 'Cược tối đa lúc này: ' + nf(cap) + ' (theo luật máy chủ và số dư).'; }
function evalLock() {
  const g = S.game; let m = null;
  if (S.cfg.gamesEnabled === false) m = 'Giáo viên đang tắt khu trò chơi. Hãy quay lại sau.';
  else if (g && S.cfg['game_' + g + '_enabled'] === false) m = 'Giáo viên đang tắt trò này. Thử trò khác nhé.';
  else if (lossLeft() <= 0) m = 'Hôm nay bạn đã chạm hạn mức lỗ. Hẹn gặp lại ngày mai nhé!';
  else if (S.bal < 1) m = 'Bạn hết điểm. Làm bài từ vựng để kiếm thêm.';
  S.lock = m; const l = $('game-lock'); l.hidden = !m; l.textContent = m || ''; $('game-stage').inert = !!m;
  $('g-loss').textContent = isFinite(lossLeft()) ? ' · Còn được lỗ hôm nay: ' + nf(lossLeft()) : '';
}
function sum() { $('g-sum').textContent = 'Phiên này: ' + S.rounds + ' ván, ' + sg(S.pnl) + ' điểm'; }
const parseCfg = c => { const o = Object.assign({}, S.cfg); for (const k in c) { const v = c[k]; o[k] = v === 'false' ? false : v === 'true' ? true : (typeof v === 'string' && v !== '' && !isNaN(v)) ? +v : v; } return o; };
async function loadCfg() { if (Date.now() - S.cfgAt < 60000) return; try { S.cfg = parseCfg((await call('getPublicConfig', {})).config || {}); S.cfgAt = Date.now(); } catch (_) {} rules(); tabsG(); clampBet(); evalLock(); }
function rules() {
  const c = S.cfg, ul = $('rules'); ul.replaceChildren();
  const L = ['Điểm ảo, không đổi ra tiền.', 'Tối đa ' + nf(c.maxBet) + ' điểm mỗi ván và không quá ' + c.maxBetPct + '% số dư.', 'Số dư không bao giờ âm. Hạn mức lỗ mỗi ngày: ' + nf(c.dailyLossLimit) + ' điểm.', 'Sau 20 ván sẽ có nhắc nghỉ. Không có nút tự quay lặp lại: mỗi ván do bạn tự bấm.', 'Giáo viên có thể tắt cả khu hoặc từng trò.', 'Điểm kiếm từ từ vựng: +' + (c.vocabCorrectPoints ?? 5) + ' mỗi từ đúng, −' + (c.vocabPeekPenalty ?? 1) + ' mỗi lần xem gợi ý.']
    .concat(S.rules[S.game] || []);
  L.forEach(x => ul.append(el('li', '', x)));
}

/* ---- Hồ sơ ---- */
const when = t => { const d = new Date(t); return isNaN(d) ? null : d; };
async function loadProfile() {
  const p = await api('getProfile', {}); S.earned = p.totalEarned; S.ledger = (p.ledger || []).slice().sort((a, b) => (when(b.t) || 0) - (when(a.t) || 0));
  setBal(p.balance); $('st-earned').textContent = nf(p.totalEarned); $('st-rank').textContent = p.rank ? p.rank + ' / ' + p.totalStudents : 'Chưa có hạng';
  const day = new Date().toDateString(); S.todayNet = S.ledger.filter(r => r.reason === 'game' && (when(r.t) || 0) && when(r.t).toDateString() === day).reduce((a, r) => a + r.delta, 0);
  drawProfile(); evalLock();
}
function drawProfile() {
  const pts = S.ledger.filter(r => when(r.t) && typeof r.balanceAfter === 'number').reverse(), c = $('chart'); c.replaceChildren();
  if (pts.length < 2) c.append(el('p', 'empty muted', 'Chưa đủ dữ liệu để vẽ biểu đồ.'));
  else {
    const W = 320, H = 110, P = 6, xs = pts.map(r => +when(r.t)), ys = pts.map(r => r.balanceAfter), x0 = xs[0], dx = (xs[xs.length - 1] - x0) || 1, lo = Math.min(...ys), hi = Math.max(...ys), dy = (hi - lo) || 1;
    const X = i => P + (xs[i] - x0) / dx * (W - 2 * P), Y = v => H - P - (v - lo) / dy * (H - 2 * P), N = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(N, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'st-chart'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Số dư từ ${nf(ys[0])} đến ${nf(ys[ys.length - 1])}, thấp nhất ${nf(lo)}, cao nhất ${nf(hi)}`);
    const d = ys.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
    const a = document.createElementNS(N, 'path'); a.setAttribute('d', d + ` L${X(ys.length - 1)} ${H} L${X(0)} ${H}Z`); a.setAttribute('class', 'area');
    const l = document.createElementNS(N, 'path'); l.setAttribute('d', d); l.setAttribute('class', 'line');
    const k = document.createElementNS(N, 'circle'); k.setAttribute('cx', X(ys.length - 1)); k.setAttribute('cy', Y(ys[ys.length - 1])); k.setAttribute('r', 4); k.setAttribute('class', 'dot');
    svg.append(a, l, k); c.append(svg, el('p', 'hint', `Thấp nhất ${nf(lo)} · cao nhất ${nf(hi)} (${pts.length} giao dịch gần nhất)`));
  }
  const g = S.ledger.filter(r => r.reason === 'game'), gs = $('gstats'); gs.replaceChildren();
  if (!g.length) gs.append(el('p', 'muted', 'Chưa chơi ván nào.'));
  else {
    const w = g.filter(r => r.delta > 0).length, lz = g.filter(r => r.delta < 0).length, net = g.reduce((a, r) => a + r.delta, 0), dl = el('dl', 'st-stats');
    [['Số ván', g.length], ['Thắng', w], ['Thua', lz], ['Lãi/lỗ ròng', sg(net)]].forEach(([k, v]) => { const d = el('div'); d.append(el('dt', '', k), el('dd', k[0] === 'L' ? (net < 0 ? 'neg' : net > 0 ? 'pos' : '') : '', v)); dl.append(d); });
    gs.append(dl, el('p', 'hint', 'Tính trên 50 giao dịch gần nhất.'));
  }
  const f = $('filters'); f.replaceChildren();
  [['all', 'Tất cả']].concat(Object.entries(REASON).map(([k, v]) => [k, v[1]])).forEach(([k, n]) => { const b = el('button', 'tag-btn', n); b.type = 'button'; b.setAttribute('aria-pressed', S.filter === k); b.onclick = () => { S.filter = k; drawProfile(); }; f.append(b); });
  const ul = $('ledger'); ul.replaceChildren(); const rows = S.ledger.filter(r => S.filter === 'all' || r.reason === S.filter);
  if (!rows.length) ul.append(el('li', 'empty muted', 'Chưa có giao dịch loại này.'));
  rows.forEach(r => {
    const li = el('li'), R = REASON[r.reason] || ['•', r.reason || '?'], d = when(r.t), de = r.detail, info = typeof de === 'string' ? de : de && (de.note || de.game || de.reason) || '';
    const m = el('div', 'm'); m.append(el('b', '', R[0] + ' ' + R[1]), el('span', 'hint', [d ? d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '', info].filter(Boolean).join(' · ')));
    const v = el('div', 'v'); v.append(el('b', r.delta < 0 ? 'neg' : 'pos', sg(r.delta)), el('span', 'hint', '→ ' + nf(r.balanceAfter)));
    li.append(m, v); ul.append(li);
  });
}

/* ---- Bài được giao: listOpenAssignments {code} → bài còn hạn giao chung hoặc giao riêng cho mã này. Bấm → index.html#/assign|taketest (dùng chung mã qua localStorage sm_studentCode) ---- */
const shortUrl = u => { const m = /^https:\/\/script\.google\.com\/macros\/s\/([\w-]{20,})\/exec$/.exec(String(u || '')); return m ? m[1] : u; };
const attemptsMap = () => { try { return JSON.parse(localStorage.getItem('sm_attempts') || '{}') || {}; } catch (_) { return {}; } };   // số lần làm trang làm bài lưu trên máy này
function shareCode() { try { localStorage.setItem('sm_studentCode', JSON.stringify(S.code)); localStorage.setItem('sm_studentTok', JSON.stringify(S.tok || '')); } catch (_) {} }   // trang làm bài (index.html) dùng chung mã + token
function leftText(due, now) {
  const ms = due - now; if (ms <= 0) return 'đã hết hạn';
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), hh = Math.floor(m % 1440 / 60);
  return 'còn ' + (d ? d + ' ngày ' + (hh ? hh + ' giờ' : '') : hh ? hh + ' giờ ' + (m % 60) + ' phút' : Math.max(1, m) + ' phút').trim();
}
const fmtDue = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return p(d.getHours()) + ':' + p(d.getMinutes()) + ' ' + p(d.getDate()) + '/' + p(d.getMonth() + 1); };
/* Hai danh sách: "Bài chung" (giao cho mọi mã) và "Bài của riêng bạn" (giao riêng cho mã này) – một lần gọi máy chủ, chia theo cờ personal */
async function loadOpen(quiet) {
  const lists = [$('open-list'), $('own-list')];
  lists.forEach(ul => { if (!quiet || !ul.children.length) ul.replaceChildren(el('li', 'st-empty muted', 'Đang tải…')); });
  let r;
  try { r = await api('listOpenAssignments', {}); }
  catch (e) { lists.forEach(ul => ul.replaceChildren(el('li', 'st-empty err', e.message))); return; }
  S.openAt = Date.now(); S.open = r.items || []; earnCta();
  const all = r.items || [], now = Number(r.serverTime) || Date.now();
  drawOpen($('open-list'), $('bc-count'), all.filter(x => !x.personal), now, 'Hiện chưa có bài chung nào còn hạn. 🎉');
  drawOpen($('own-list'), $('br-count'), all.filter(x => x.personal), now, 'Hiện chưa có bài nào giao riêng cho bạn. 🎉');
}
function drawOpen(ul, cnt, items, now, empty) {
  const att = attemptsMap();
  cnt.hidden = !items.length; cnt.textContent = items.length;
  ul.replaceChildren();
  if (!items.length) { ul.append(el('li', 'st-empty muted', empty)); return; }
  items.forEach(x => {
    const test = x.kind === 'test', done = att[x.id] || 0, full = x.max > 0 && done >= x.max;
    const href = asgHref(x);
    const a = el('a', 'st-oc'); a.href = href; a.onclick = shareCode;
    const m = el('div', 'm'); m.append(el('b', '', x.name || x.id));
    const bits = [test ? 'Bài test' : 'Từ vựng' + (x.count ? ' · ' + x.count + ' từ' : ''), 'Hạn ' + fmtDue(x.due) + ' (' + leftText(x.due, now) + ')'];
    m.append(el('span', 'hint', bits.join(' · ')));
    const tags = [];
    if (done) tags.push(full ? '✔ Đã làm hết ' + x.max + ' lần' : '✔ Đã làm ' + done + (x.max ? '/' + x.max : '') + ' lần');
    else if (x.max) tags.push('Làm tối đa ' + x.max + ' lần');
    if (tags.length) m.append(el('span', 'hint', tags.join(' · ')));
    if (!test) m.append(el('span', 'pts', '+' + (x.correctPts ?? S.cfg.vocabCorrectPoints ?? 5) + ' mỗi từ đúng · −' + (x.peekPenalty ?? S.cfg.vocabPeekPenalty ?? 1) + ' mỗi lần xem lại'));
    else m.append(el('span', 'pts', 'Điểm theo số câu đúng'));
    a.setAttribute('aria-label', (test ? 'Làm bài test ' : 'Làm bài từ vựng ') + (x.name || x.id) + ', ' + bits[1]);
    a.append(el('span', 'ic', test ? '📝' : '📘'), m, el('span', 'go', '›'));
    const li = el('li'); li.append(a); ul.append(li);
  });
}

/* ---- Nhắc làm bài khi sắp hết điểm (khu trò chơi): hết điểm thì làm bài để có điểm chơi tiếp ---- */
const LOW_BAL = 30;   // dưới mức này (hoặc dưới 3 lần mức cược) thì hiện nhắc
const asgHref = x => 'index.html#/' + (x.kind === 'test' ? 'taketest' : 'assign') + '?id=' + encodeURIComponent(x.id) + '&s=' + encodeURIComponent(shortUrl(url())) + '&hs=1';
function earnCta() {
  const box = $('earn-cta'); if (!box) return;
  const low = S.code && S.cfg.gamesEnabled !== false && (S.bal < 1 || S.bal < Math.max(LOW_BAL, 3 * (Math.floor(+$('bet').value) || 0)));
  if (!low) { box.hidden = true; S.ctaOn = false; return; }
  if (!S.open && Date.now() - (S.openAt || 0) > 60000) { S.openAt = Date.now(); loadOpen(1); }   // lấy danh sách bài một lần (im lặng)
  const pts = S.cfg.vocabCorrectPoints ?? 5, att = attemptsMap();
  const items = (S.open || []).filter(x => !(x.max > 0 && (att[x.id] || 0) >= x.max));
  const first = items.find(x => x.kind !== 'test') || items[0];
  const t = el('b', '', S.bal < 1 ? '😮 Hết điểm rồi! Làm bài để có điểm chơi tiếp nhé.' : '⚡ Sắp hết điểm (còn ' + nf(S.bal) + '). Nạp thêm điểm bằng cách làm bài!');
  const sub = el('span', 'hint', 'Mỗi từ đúng +' + pts + ' điểm → làm đúng 5 từ là +' + nf(5 * pts) + ' điểm.' + (S.open ? (items.length ? ' Bạn có ' + items.length + ' bài đang mở.' : ' Hiện chưa có bài mới – hãy nhờ thầy cô giao bài.') : ''));
  const acts = el('div', 'earn-acts');
  if (first) { const a = el('a', 'btn primary', (first.kind === 'test' ? '📝 Làm bài: ' : '📘 Làm bài: ') + (first.name || first.id)); a.href = asgHref(first); a.onclick = shareCode; acts.append(a); }
  const all = el('button', 'btn' + (first ? '' : ' primary'), '📋 Xem bài được giao'); all.type = 'button'; all.onclick = () => show(first && first.personal ? 'bai-rieng' : 'bai-chung'); acts.append(all);
  box.replaceChildren(t, sub, acts); box.hidden = false;
  if (!S.ctaOn) { S.ctaOn = true; if (box.animate && !reduced.matches) box.animate([{ transform: 'scale(.96)', opacity: .4 }, { transform: 'scale(1.02)', opacity: 1 }, { transform: 'scale(1)' }], { duration: 350 }); }
}

/* ---- Xếp hạng ---- */
async function loadBoard() {
  const ol = $('board'); ol.replaceChildren(el('li', 'muted', 'Đang tải…'));
  try {
    const r = await api('getLeaderboard', { limit: 50 }); ol.replaceChildren();
    (r.leaderboard || []).forEach(x => { const li = el('li', x.me ? 'me' : ''), medal = ['🥇', '🥈', '🥉'][x.rank - 1]; const b = el('span', 'rk', medal || x.rank); if (medal) b.setAttribute('aria-label', 'Hạng ' + x.rank); li.append(b, el('span', 'cd', x.code + (x.me ? ' (bạn)' : '')), el('b', '', nf(x.totalEarned))); ol.append(li); });
    if (!ol.children.length) ol.append(el('li', 'muted', 'Chưa có ai trên bảng.'));
    $('board-me').textContent = r.me && !(r.leaderboard || []).some(x => x.me) ? `Bạn đứng hạng ${r.me.rank} với ${nf(r.me.totalEarned)} điểm.` : '';
  } catch (e) { ol.replaceChildren(el('li', 'err', e.message)); }
}

/* ---- Khu trò chơi ---- */
function tabsG() {
  const t = $('gtabs'); t.replaceChildren();
  GAMES.forEach(([k, ic, n]) => {
    const off = S.cfg.gamesEnabled === false || S.cfg['game_' + k + '_enabled'] === false, b = el('button', 'st-gtab', ic + ' ' + n + (off ? ' (tắt)' : ''));
    b.type = 'button'; b.dataset.game = k; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', S.game === k); b.onclick = () => pick(k); t.append(b);
  });
}
function pick(k) {
  if (S.game && S.reg[S.game] && S.reg[S.game].unmount) try { S.reg[S.game].unmount(); } catch (_) {}
  S.game = k; LS.set('sm_game', k); sfx('click'); tabsG(); const st = $('game-stage'); st.replaceChildren();
  if (!S.reg[k]) st.append(el('p', 'empty muted st-empty', 'Trò này đang được chuẩn bị.'));
  rules(); evalLock();
  document.dispatchEvent(new CustomEvent('smgame:select', { detail: { game: k, stage: st } }));
  if (S.reg[k] && S.reg[k].mount) try { st.replaceChildren(); S.reg[k].mount(st, SMGame); } catch (e) { toast('Không tải được trò chơi.', 1); }
  doResume();
}
function doResume() { const r = S.resume; if (!r || r.game !== S.game) return; const g = S.reg[r.game]; document.dispatchEvent(new CustomEvent('smgame:resume', { detail: r })); if (g && g.resume) { try { g.resume(r.state); } catch (_) {} } S.resume = null; }
async function checkActive() {
  try {
    const r = await api('getActiveGame', {}), a = r.active || r.activeGame || (typeof r.game === 'object' ? r.game : r), n = a && (a.game || a.name || a.type || (typeof r.game === 'string' && r.game));
    if (n && GAMES.some(g => g[0] === n) && r.active !== false) { S.resume = { game: n, state: a }; toast('Bạn có ván đang chơi dở. Mở khu trò chơi để chơi tiếp.'); show('tro-choi'); pick(n); }
  } catch (_) {}
}
/* Làm nóng máy chủ (tránh khởi động nguội): một yêu cầu nhẹ khi vào tab Trò chơi, rồi ~4 phút/lần chỉ khi tab đang mở và trang đang hiển thị */
let warmT = 0;
function warmStop() { if (warmT) clearInterval(warmT); warmT = 0; }
function warmStart() {
  warmStop(); if (!S.code || !url()) return;
  call('getActiveGame', { code: S.code, token: S.tok }).catch(() => {});
  warmT = setInterval(() => { if (S.tab === 'tro-choi' && document.visibilityState === 'visible' && S.code) call('getActiveGame', { code: S.code, token: S.tok }).catch(() => {}); else if (S.tab !== 'tro-choi') warmStop(); }, 240000);
}
function stop() { document.dispatchEvent(new CustomEvent('smgame:stop')); sfx('click'); show('ho-so'); loadProfile().catch(() => {}); }
function settle(o) {
  o = o || {}; S.rounds++; S.sinceBreak++; if (typeof o.delta === 'number') { S.pnl += o.delta; S.todayNet += o.delta; }
  if (typeof o.balance === 'number') setBal(o.balance); sum(); evalLock();
  if (S.sinceBreak >= BREAK_EVERY) { S.sinceBreak = 0; const d = $('break-dlg'); d.showModal ? d.showModal() : toast('Bạn đã chơi 20 ván. Nghỉ một chút nhé!'); }
}
function betValue() { clampBet(); return Math.floor(+$('bet').value) || 0; }
function rid() { const b = new Uint8Array(12); (crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => b[i] = Math.random() * 256); return 'g-' + Date.now().toString(36) + Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); }
window.SMGame = {
  api, getBalance: () => S.bal, setBalance: setBal, toast, sfx, requestId: rid, betValue, settle,
  canPlay: () => ({ ok: !S.lock, reason: S.lock || '' }), reducedMotion: reduced.matches, get fast() { return S.fast; }, get config() { return Object.assign({}, S.cfg); }, get stage() { return $('game-stage'); },
  register(n, g) { S.reg[n] = g; if (S.game === n && g.mount) { try { $('game-stage').replaceChildren(); g.mount($('game-stage'), SMGame); } catch (_) {} } doResume(); },
  setRules(n, l) { S.rules[n] = l; if (S.game === n) rules(); }
};
reduced.addEventListener && reduced.addEventListener('change', () => { SMGame.reducedMotion = reduced.matches; });

/* ---- Điều hướng, đăng nhập ---- */
const TABS = ['bai-chung', 'bai-rieng', 'ho-so', 'xep-hang', 'tro-choi', 'thanh-pho', 'thu-cung'];   // đúng thứ tự các nút [data-tab] trong hoc-sinh.html
/* ---- Nông trại & Thành phố: city-core.js (luật) + city-art.js (đồ hoạ) + city.js (giao diện) tự đăng ký window.SMCity. Không tính vào báo cáo phụ huynh. ---- */
function cityCtx() { return { api: (a, p) => api(a, p), getBalance: () => S.bal, setBalance: setBal, toast, requestId: rid, code: S.code }; }
function openCity() {
  const r = $('city-root'); if (!r) return;
  if (S.cfg.cityEnabled === false) { r.replaceChildren(el('p', 'empty muted', 'Giáo viên đang tạm tắt Nông trại & Thành phố. Hãy quay lại sau nhé.')); return; }
  if (!(window.SMCity && typeof window.SMCity.mount === 'function')) { r.replaceChildren(el('p', 'empty muted', 'Nông trại & Thành phố sắp mở. Hãy quay lại sau nhé.')); return; }
  try { window.SMCity.mount(r, cityCtx()); } catch (_) { r.replaceChildren(el('p', 'empty muted', 'Không mở được Thành phố. Thử làm mới trang.')); }
}
function closeCity() { try { window.SMCity && window.SMCity.unmount && window.SMCity.unmount(); } catch (_) {} }
/* ---- Thú cưng: pet-art.js (đồ hoạ) + pet.js (game) tự đăng ký window.SMPet. Không tính vào báo cáo phụ huynh. ---- */
function petCtx() { return { api: (a, p) => api(a, p), getBalance: () => S.bal, setBalance: setBal, toast, requestId: rid, code: S.code }; }
function openPet() {
  const r = $('pet-root'); if (!r) return;
  if (!(window.SMPet && typeof window.SMPet.mount === 'function')) { r.replaceChildren(el('p', 'empty muted', 'Nhà thú cưng sắp mở. Hãy quay lại sau nhé.')); return; }
  try { window.SMPet.mount(r, petCtx()).finally(() => petPeek(1)); } catch (_) { r.replaceChildren(el('p', 'empty muted', 'Không mở được Nhà thú cưng. Thử làm mới trang.')); }
}
function closePet() { try { window.SMPet && window.SMPet.unmount && window.SMPet.unmount(); } catch (_) {} petPeek(1); }
/* Nhắc ở thẻ số dư + chấm đỏ trên tab: thú đang cần được chăm hôm nay (hoặc đã mất) → động lực làm bài để có điểm nuôi */
let petPeekAt = 0;
async function petPeek(force) {
  const box = $('pet-alert'), dot = $('pet-dot'); if (!box || !S.code || !window.SMPet || S.cfg.petEnabled === false) return;
  if (!force && Date.now() - petPeekAt < 60000) return; petPeekAt = Date.now();
  let p; try { p = await window.SMPet.peek(petCtx()); } catch (_) { return; }
  let msg = '', bad = false;
  if (p.dead) { msg = '💔 ' + p.name + ' đã mất vì không được chăm đủ. Vào Thú cưng để hồi sinh bé!'; bad = true; }
  else if (p.alive && !p.safe && !p.grace) { const left = Math.max(0, (p.endsAt || 0) - (p.serverTime || Date.now())), hh = Math.floor(left / 3600000), mm = Math.floor(left % 3600000 / 60000); msg = '🐾 ' + p.name + ' cần thêm ' + Math.max(0, p.min - p.fed) + ' điểm chăm sóc trong ' + (hh ? hh + ' giờ ' : '') + mm + ' phút nữa, không thì bé sẽ mất! Làm bài để có điểm nuôi bé.'; bad = true; }
  box.textContent = msg; box.hidden = !msg; dot.hidden = !bad;
}
function show(t) {
  if (t === 'bai-giao') { let l = ''; try { l = sessionStorage.getItem('sm_hs_list') || ''; } catch (_) {} t = l === 'bai-rieng' ? 'bai-rieng' : 'bai-chung'; }   // link cũ / nút "Về trang học sinh" → danh sách vừa xem
  if (t === 'khu-vuon') t = 'thanh-pho';   // link cũ của Khu vườn
  if (!TABS.includes(t)) t = 'bai-chung'; const was = S.tab; S.tab = t;
  if (t === 'bai-chung' || t === 'bai-rieng') { try { sessionStorage.setItem('sm_hs_list', t); } catch (_) {} }
  document.querySelectorAll('[data-tab]').forEach(b => { const on = b.dataset.tab === t; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; $('p-' + b.dataset.tab).hidden = !on; });
  if (location.hash !== '#' + t) history.replaceState(null, '', '#' + t);
  if (was !== t && t === 'xep-hang') loadBoard();
  if (was !== t && (t === 'bai-chung' || t === 'bai-rieng') && !(was === 'bai-chung' || was === 'bai-rieng')) loadOpen(Date.now() - (S.openAt || 0) < 30000);
  if (was !== t && t === 'tro-choi') { warmStart(); loadCfg(); if (!S.game) pick(GAMES.some(g => g[0] === LS.get('sm_game')) ? LS.get('sm_game') : 'slots'); }
  if (was !== t && t === 'thanh-pho') openCity();
  if (was === 'thanh-pho' && t !== 'thanh-pho') closeCity();
  if (was !== t && t === 'thu-cung') openPet();
  if (was === 'thu-cung' && t !== 'thu-cung') closePet();
  if (was === 'tro-choi' && t !== 'tro-choi') warmStop();
  if (was === 'tro-choi' && t !== 'tro-choi') document.dispatchEvent(new CustomEvent('smgame:stop'));
}
const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);   // giống máy chủ: bỏ dấu, chỉ chữ+số
function loginView(msg) { $('view-main').hidden = true; $('view-login').hidden = false; $('url-box').hidden = !!SCRIPT_URL; $('login-err').textContent = msg || ''; $('login-btn').disabled = false; }
/* Đăng nhập: mã + mật khẩu (lần đầu) → máy chủ trả token, máy nhớ mã + token; lần sau vào thẳng không cần gõ lại. */
async function enter(code, quiet, pw) {
  $('login-btn').disabled = true; $('login-err').textContent = quiet ? '' : 'Đang kiểm tra…';
  const tok = !pw && code === LS.get('sm_code') ? (LS.get('sm_tok') || '') : '';
  S.code = code;
  try {
    const body = { code }; if (pw) body.password = pw; else if (tok) body.token = tok;
    const r = await call('checkCode', body); if (r.valid === false) throw Object.assign(new Error(ERR.invalid_code), { code: 'invalid_code' });
    S.code = r.code || code; S.tok = r.token || ''; LS.set('sm_code', S.code); LS.set('sm_tok', S.tok || null); shareCode(); $('pw-in').value = '';
    $('who').textContent = S.code; $('view-login').hidden = true; $('view-main').hidden = false;
    show(location.hash.slice(1)); setBal(r.balance); $('st-earned').textContent = nf(r.totalEarned);
    loadProfile().catch(e => toast(e.message, 1)); loadCfg().then(checkActive).then(() => petPeek(1));
  } catch (e) {
    if (['invalid_code', 'code_disabled'].includes(e.code)) LS.set('sm_code', null);
    if (['auth_required', 'wrong_password', 'invalid_code', 'code_disabled'].includes(e.code)) LS.set('sm_tok', null);
    S.code = ''; S.tok = ''; loginView(quiet && e.code === 'auth_required' ? 'Nhập mật khẩu để vào.' : e.message); $('code-in').value = code;
    if (['auth_required', 'wrong_password'].includes(e.code)) { $('pw-in').value = ''; setTimeout(() => $('pw-in').focus(), 0); }
  }
}
function logout() {
  warmStop(); closeCity(); closePet(); petPeekAt = 0; if ($('pet-alert')) { $('pet-alert').hidden = true; $('pet-dot').hidden = true; } LS.set('sm_code', null); LS.set('sm_tok', null); S.code = ''; S.tok = ''; document.dispatchEvent(new CustomEvent('smgame:stop'));
  S.rounds = S.pnl = S.sinceBreak = 0; S.open = null; S.game = null; S.tab = ''; S.openAt = 0;
  ['open-list', 'own-list'].forEach(i => $(i).replaceChildren()); $('bc-count').hidden = $('br-count').hidden = true; sum();
  try { localStorage.setItem('sm_studentTok', JSON.stringify('')); } catch (_) {}
}
function init() {
  if (!SCRIPT_URL) $('url-in').value = LS.get('sm_script_url') || '';
  $('login-form').onsubmit = ev => {
    ev.preventDefault(); const u = $('url-in').value.trim();
    if (!SCRIPT_URL) { if (!/^https:\/\//.test(u)) return ($('login-err').textContent = 'Nhập địa chỉ máy chủ bắt đầu bằng https://'); LS.set('sm_script_url', u); }
    const c = norm($('code-in').value); $('code-in').value = c; if (!/^[A-Z0-9]{3,16}$/.test(c)) return ($('login-err').textContent = 'Mã gồm 3–16 chữ hoặc số.'); enter(c, 0, $('pw-in').value.trim());
  };
  const eye = $('pw-eye'); eye.onclick = () => { const p = $('pw-in'), on = p.type === 'password'; p.type = on ? 'text' : 'password'; eye.textContent = on ? '🙈' : '👁'; eye.setAttribute('aria-pressed', on); eye.setAttribute('aria-label', on ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'); };
  $('code-in').oninput = e => { e.target.value = norm(e.target.value); };
  $('btn-change').onclick = () => { logout(); loginView(); $('code-in').value = ''; $('pw-in').value = ''; $('code-in').focus(); };
  $('btn-refresh').onclick = () => loadProfile().then(() => toast('Đã cập nhật.'), e => toast(e.message, 1));
  $('btn-board').onclick = loadBoard; $('btn-open').onclick = () => loadOpen(); $('btn-open2').onclick = () => loadOpen(); $('btn-stop').onclick = stop;
  document.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => show(b.dataset.tab); b.onkeydown = e => { const i = TABS.indexOf(b.dataset.tab), n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null; if (n != null) { const t = document.querySelectorAll('[data-tab]')[(n + TABS.length) % TABS.length]; show(t.dataset.tab); t.focus(); } }; });
  const q = $('quick'); [['10', () => 10], ['50', () => 50], ['100', () => 100], ['½', () => Math.floor(S.bal / 2)], ['MAX', betCap]].forEach(([n, f]) => { const b = el('button', 'btn small', n); b.type = 'button'; b.setAttribute('aria-label', n === 'MAX' ? 'Cược tối đa' : n === '½' ? 'Cược một nửa số dư' : 'Cược ' + n); b.onclick = () => { $('bet').value = f(); clampBet(); LS.set('sm_bet', $('bet').value); sfx('click'); }; q.append(b); });
  $('bet').oninput = () => { clampBet(); earnCta(); }; $('bet').onchange = () => LS.set('sm_bet', $('bet').value); $('bet').value = LS.get('sm_bet') || 10;
  const sn = $('btn-snd'); const paint = () => { sn.textContent = muted ? '🔇' : '🔊'; sn.setAttribute('aria-pressed', !muted); sn.setAttribute('aria-label', muted ? 'Bật âm thanh' : 'Tắt âm thanh'); }; paint(); sn.onclick = () => { muted = !muted; LS.set('sm_snd', muted ? '0' : '1'); paint(); sfx('click'); };
  const fb = $('btn-fast'); if (fb) { const pf = () => { fb.setAttribute('aria-pressed', S.fast); fb.textContent = S.fast ? '⚡ Nhanh: bật' : '⚡ Nhanh: tắt'; }; pf(); fb.onclick = () => { S.fast = !S.fast; LS.set('sm_fast', S.fast ? '1' : '0'); pf(); sfx('click'); }; }
  $('break-go').onclick = () => $('break-dlg').close(); $('break-stop').onclick = () => { $('break-dlg').close(); stop(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.code && Date.now() - S.last > 30000) { S.last = Date.now(); loadProfile().catch(() => {}); if (/^bai-/.test(S.tab)) loadOpen(1); if (S.tab !== 'thu-cung') petPeek(); } });
  window.addEventListener('pageshow', e => { if (e.persisted && S.code) { loadProfile().catch(() => {}); if (/^bai-/.test(S.tab)) loadOpen(1); } });   // quay lại từ trang làm bài (nút Back)
  window.addEventListener('hashchange', () => S.code && show(location.hash.slice(1)));
  { const st = $('game-stage'), box = el('div', 'card earn-cta'); box.id = 'earn-cta'; box.hidden = true; box.setAttribute('role', 'status'); const host = st && st.parentElement; if (host) host.parentElement.insertBefore(box, host); }
  sum(); tabsG(); rules();
  const p = new URLSearchParams(location.search), c = norm(p.get('code') || LS.get('sm_code'));
  if (p.has('code')) history.replaceState(null, '', location.pathname + location.hash);
  if (c && url()) enter(c, 1); else { loginView(); if (c) $('code-in').value = c; }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js?v=' + VER).catch(() => {});
}
init();
