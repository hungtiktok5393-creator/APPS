/**
 * Games.gs – 10 trò may rủi bằng điểm ảo: slots, wheel, hilo, mines, crash, dice, plinko, scratch, keno, coin.
 * Kết quả ngẫu nhiên sinh Ở SERVER (Math.random); client chỉ diễn hoạt.
 * Phụ thuộc Code.gs v8: applyDelta_, getStudent_, cfgNum_, cfgBool_, withLock_, apiError_, findRow_,
 * appendRows_, sheetT_, GAME_ACTIONS (router tự gọi registerGameActions_ + kiểm mã, rate limit, gamesEnabled).
 * Sheet tự tạo: GameState (1 dòng / học sinh) · GameLog (timestamp, code, game, bet, payout, net, detail).
 * Mọi tên helper có tiền tố g/G_ để không đụng Code.gs.
 */
const G_SHEET_STATE = 'GameState', G_SHEET_LOG = 'GameLog';
const G_STATE_HEADERS = ['code', 'game', 'state', 'updatedAt', 'lastReqId', 'lastResp'];   // lastReqId/lastResp: phản hồi của yêu cầu gần nhất → idempotent bền vững
const G_LOG_HEADERS = ['timestamp', 'code', 'game', 'bet', 'payout', 'net', 'detail'];
const G_LIST = ['slots', 'wheel', 'hilo', 'mines', 'crash', 'dice', 'plinko', 'scratch', 'keno', 'coin'];
const G_TZ = 'Asia/Ho_Chi_Minh';
const G_RTP = 0.90;        // hệ số hilo/mines/crash = G_RTP / xác suất sống sót  → RTP = 90% với mọi chiến thuật (≥1 bước)
const G_CAP = 100;         // trần hệ số hilo/mines (đạt là tự rút) và điểm nổ crash
const G_RATE = 0.10;       // crash: m(t) = floor(100·e^(0.10·t giây)) / 100
const G_MINCASH = 1.01;    // crash: hệ số tối thiểu để rút

/* ---------- Bảng trò chơi ---------- */
const G_SYMS = ['cherry', 'lemon', 'bell', 'star', 'diamond', 'seven'];
const G_SLOT_W = [30, 25, 18, 14, 9, 4];                                        // trọng số / 100 cho MỖI cuộn (độc lập)
const G_SLOT_TRIPLE = { cherry: 5, lemon: 8, bell: 15, star: 30, diamond: 80, seven: 250 };
const G_SLOT_PAIR = { cherry: 1.5, star: 1.5, diamond: 1.5, seven: 1.5 };      // đúng 2 biểu tượng giống nhau (lemon/bell: 0)
const G_WHEEL = (function () {                                                  // 40 ô đều xác suất: ×0:21 · ×0.5:4 · ×1.5:12 · ×3:2 · ×10:1
  const a = []; for (let i = 0; i < 40; i++) a.push(0);
  [[10, [0]], [3, [13, 33]], [0.5, [5, 15, 25, 35]], [1.5, [2, 7, 10, 14, 17, 20, 23, 26, 28, 31, 37, 39]]].forEach(function (e) { e[1].forEach(function (i) { a[i] = e[0]; }); });
  return a;
})();

/* Plinko: 10 hàng, slot = số lần rơi phải (0..10), xác suất C(10,k)/1024. RTP tính trong NOTES_GAMES.md (mô phỏng node). */
const G_PLINKO = {
  low:  [7.6, 2.9, 1.4, 1, 0.8, 0.6, 0.8, 1, 1.4, 2.9, 7.6],
  mid:  [20.2, 5.5, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 5.5, 20.2],
  high: [43.8, 10.2, 2.9, 0.9, 0.3, 0.1, 0.3, 0.9, 2.9, 10.2, 43.8]
};
/* Thẻ cào: 9 ô độc lập, 16 biểu tượng theo trọng số; thắng nếu có biểu tượng xuất hiện ≥3 lần (lấy hệ số cao nhất). hệ số = G_SCR_BASE[biểu tượng] × G_SCR_CNT[số lần] */
const G_SCR_SYMS = ['cherry', 'lemon', 'orange', 'grape', 'melon', 'peach', 'bell', 'clover', 'heart', 'moon', 'star', 'rainbow', 'gem', 'crown', 'diamond', 'seven'];
const G_SCR_W    = [7, 7, 7, 6, 6, 6, 5, 5, 5, 4, 4, 3, 3, 2, 2, 1];
const G_SCR_BASE = [1.7, 1.7, 1.7, 1.7, 1.7, 1.7, 2.05, 2.05, 2.4, 2.7, 3.4, 5.1, 6.8, 10.2, 17, 42.5];
const G_SCR_CNT  = { 3: 1, 4: 3, 5: 10, 6: 30, 7: 60, 8: 100, 9: 200 };
/* Keno mini: chọn k số (1..5) trong 1..20, máy rút 8 số khác nhau. G_KENO[k][hits] = hệ số (siêu bội, RTP ≈ 88–90%). */
const G_KENO = {
  1: [0, 2.25],
  2: [0, 0, 6.1],
  3: [0, 0, 1.5, 9.25],
  4: [0, 0, 0.55, 2.4, 24.5],
  5: [0, 0, 0.4, 1, 5, 62.9]
};

/* ---------- Tiện ích ---------- */
function gRnd_(n) { return Math.floor(Math.random() * n); }
function gId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function gR2_(x) { return Math.floor(x * 100 + 1e-9) / 100; }
function gR4_(x) { return Math.round(x * 10000) / 10000; }
function gNow_() { return Utilities.formatDate(new Date(), G_TZ, 'yyyy-MM-dd HH:mm:ss'); }
function gDay_(v) { return v instanceof Date ? Utilities.formatDate(v, G_TZ, 'yyyy-MM-dd') : String(v).slice(0, 10); }
function gPick_(w) { let t = 0; w.forEach(function (x) { t += x; }); let r = Math.random() * t; for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; } return w.length - 1; }
function gsSh_() { return sheetT_(G_SHEET_STATE, G_STATE_HEADERS, [1, 5]); }
function glSh_() { return sheetT_(G_SHEET_LOG, G_LOG_HEADERS, [1, 2]); }

function gNetKey_(code) { return 'gn:' + code + ':' + gDay_(new Date()); }
function gLog_(code, game, bet, payout, detail) {
  let d = JSON.stringify(detail == null ? '' : detail); if (d === '""') d = '';
  glSh_().appendRow([gNow_(), code, game, bet, payout, payout - bet, d.slice(0, 500)]);
  try {   // cập nhật bộ nhớ đệm lỗ-trong-ngày CHỈ khi đã có sẵn (thiếu thì lần sau tính lại từ GameLog)
    const c = CacheService.getScriptCache(), k = gNetKey_(code), h = c.get(k);
    if (h !== null) c.put(k, String((Number(h) || 0) + payout - bet), 1800);
  } catch (e) {}
}
/** Lỗ ròng trong ngày (Asia/Ho_Chi_Minh) = -tổng net của GameLog hôm nay. Có cache (mã, ngày) 30 phút; mất cache → quét ngược GameLog.
 *  Chỉ GHI cache khi đang giữ khoá (tránh ghi số cũ đè lên số mới do ván khác vừa ghi log). */
function gDayNet_(code) {
  const cache = CacheService.getScriptCache(), ck = gNetKey_(code);
  try { const h = cache.get(ck); if (h !== null) return Number(h) || 0; } catch (e) {}
  const sh = glSh_(), today = gDay_(new Date()); let end = sh.getLastRow(), net = 0, done = false;
  while (end >= 2 && !done) {
    const st = Math.max(2, end - 499), v = sh.getRange(st, 1, end - st + 1, 6).getValues();
    for (let i = v.length - 1; i >= 0; i--) {
      const d = gDay_(v[i][0]);
      if (d < today) { done = true; break; }
      if (d === today && String(v[i][1]) === code) net += Number(v[i][5]) || 0;
    }
    end = st - 1;
  }
  try { if (LockService.getScriptLock().hasLock()) cache.put(ck, String(net), 1800); } catch (e) {}
  return net;
}
function gLimits_(stu) {
  const lim = cfgNum_('dailyLossLimit', 300), net = gDayNet_(stu.code), loss = Math.max(0, -net);
  const cap = Math.max(0, Math.min(cfgNum_('maxBet', 200), Math.floor(stu.balance * cfgNum_('maxBetPct', 25) / 100), stu.balance));
  return { cap: cap, left: lim > 0 ? Math.max(0, lim - loss) : Infinity, net: net, lim: lim };   // dailyLossLimit ≤ 0 = không giới hạn
}
/** Kiểm cược: trò bật, số nguyên dương, ≤ số dư, ≤ min(maxBet, số dư·maxBetPct/100), và không vượt hạn mức lỗ ngày. */
function gCheckBet_(stu, game, bet) {
  if (!cfgBool_('game_' + game + '_enabled', true)) throw apiError_('games_disabled', 'Trò này đang tắt.');
  bet = Number(bet);
  if (!isFinite(bet) || bet < 1 || Math.floor(bet) !== bet) throw apiError_('bad_request', 'Cược phải là số nguyên dương.');
  const L = gLimits_(stu);
  if (L.left <= 0) throw apiError_('daily_limit', 'Hôm nay đã chạm giới hạn lỗ (' + L.lim + ' điểm). Quay lại vào ngày mai nhé.');
  if (bet > L.cap) throw apiError_('bet_too_high', 'Cược tối đa hiện tại là ' + L.cap + ' điểm.');
  if (bet > L.left) throw apiError_('daily_limit', 'Hạn mức lỗ hôm nay chỉ còn ' + L.left + ' điểm.');
  return bet;
}

/* ---------- Trạng thái ván (GameState) + idempotent ---------- */
function gsLoad_(code, create) {
  const sh = gsSh_(), cache = CacheService.getScriptCache(), rk = 'gr:' + code; let row = 0, r = null;
  try { const hit = Number(cache.get(rk)) || 0; if (hit >= 2) { const v = sh.getRange(hit, 1, 1, 6).getValues()[0]; if (String(v[0]) === code) { row = hit; r = v; } } } catch (e) {}   // nhớ số dòng → bỏ một lần quét cột
  if (!row) {
    row = findRow_(sh, 1, code);
    if (!row) { if (!create) return null; appendRows_(sh, [[code, '', '', '', '', '']]); row = sh.getLastRow(); }
    r = sh.getRange(row, 1, 1, 6).getValues()[0];
    try { cache.put(rk, String(row), 21600); } catch (e) {}
  }
  let st = null;
  try { st = r[2] ? JSON.parse(r[2]) : null; } catch (e) {}
  return { row: row, code: code, state: st, reqId: String(r[4] || ''), resp: String(r[5] || '') };
}
function gsWrite_(gs, state, rid, resp) {
  if (!gs.row) { const g2 = gsLoad_(gs.code, true); gs.row = g2.row; }
  const rs = resp ? JSON.stringify(resp) : gs.resp;
  gsSh_().getRange(gs.row, 1, 1, 6).setValues([[gs.code, state ? state.g : '', state ? JSON.stringify(state) : '', gNow_(), rid, rs]]);
  gs.state = state; gs.reqId = rid; gs.resp = rs;
}
/** Mọi action ghi: cần requestId [\w-]{8,64}; chạy trong khoá; gửi lại cùng requestId → trả đúng phản hồi cũ (replay:true), không trừ/cộng lần nữa. fn(gs, stu) → {state, resp}.
 *  instant=true (ván một phát): không tạo/ghi dòng GameState nếu phản hồi đã nằm chắc trong cache (đọc lại để kiểm); cache hỏng → ghi sheet như cũ. */
function gMutate_(p, s, fn, instant) {
  const rid = String(p.requestId || '');
  if (!/^[\w-]{8,64}$/.test(rid)) throw apiError_('bad_request', 'Thiếu requestId (8–64 ký tự [A-Za-z0-9_-]).');
  return withLock_(function () {
    const cache = CacheService.getScriptCache(), ck = 'gq:' + s.code + ':' + rid, hit = cache.get(ck);
    if (hit) return gReplay_(hit);
    const gs = gsLoad_(s.code, !instant) || { row: 0, code: s.code, state: null, reqId: '', resp: '' };
    if (gs.reqId === rid && gs.resp) return gReplay_(gs.resp);
    const stu = getStudent_(s.code);
    if (!stu) throw apiError_('invalid_code', 'Mã không tồn tại.');
    if (!stu.active) throw apiError_('code_disabled', 'Mã đã bị vô hiệu hoá.');
    const out = fn(gs, stu), js = JSON.stringify(out.resp);
    let cached = false;
    try { cache.put(ck, js, 21600); cached = cache.get(ck) === js; } catch (e) {}
    if (!(instant && cached && !out.state && !gs.state)) gsWrite_(gs, out.state, rid, out.resp);
    return out.resp;
  });
}
function gReplay_(s) { const o = JSON.parse(s); o.replay = true; return o; }
function gNeed_(gs, game) { if (!gs.state || gs.state.g !== game) throw apiError_('no_game', 'Không có ván ' + game + ' đang chơi.'); return gs.state; }
function gCrashDone_(st, now) { return gCrashMult_(now - st.t) >= st.C; }
/** Chặn mở 2 ván cùng lúc. Ván crash đã nổ mà chưa ai chốt thì tự tất toán (thua) rồi cho chơi tiếp. */
function gNoActive_(gs) {
  const st = gs.state; if (!st) return;
  if (st.g === 'crash' && gCrashDone_(st, Date.now())) { gLog_(gs.code, 'crash', st.bet, 0, { crashPoint: gR2_(st.C), forfeit: true }); gsWrite_(gs, null, gs.reqId, null); return; }
  throw apiError_('game_active', 'Đang có ván ' + st.g + ' chưa kết thúc – gọi getActiveGame để chơi tiếp.');
}
/** Tất toán ván nhiều bước: cộng payout (bet đã trừ lúc bắt đầu), ghi GameLog. Trả số dư mới. */
function gFinish_(code, game, st, payout, detail) {
  let bal;
  if (payout > 0) bal = applyDelta_(code, payout, 'game', st.gid, { g: game, bet: st.bet, payout: payout }).balance;
  else bal = getStudent_(code).balance;
  gLog_(code, game, st.bet, payout, detail);
  return bal;
}
/** Ván một phát (slots/wheel): một lần applyDelta_(payout - bet). */
function gPayInstant_(stu, game, bet, payout, detail) {
  const delta = payout - bet; let bal = stu.balance;
  if (delta) bal = applyDelta_(stu.code, delta, 'game', game, { g: game, bet: bet, payout: payout }).balance;
  gLog_(stu.code, game, bet, payout, detail);
  return bal;
}
function gStake_(stu, game, bet, gid) { return applyDelta_(stu.code, -bet, 'game', gid, { g: game, bet: bet, stake: true }).balance; }

/* ---------- Công thức hệ số ---------- */
function gHiloMult_(st) { return Math.min(G_CAP, G_RTP / st.pcum); }
function gMinesMult_(m, k) { let p = 1; for (let i = 0; i < k; i++) p *= (25 - m - i) / (25 - i); return Math.min(G_CAP, G_RTP / p); }
function gCoinMult_(k) { return Math.min(G_CAP, G_RTP / Math.pow(0.5, k)); }
function gCrashMult_(ms) { return Math.floor(Math.exp(G_RATE * Math.min(Math.max(ms, 0), 120000) / 1000) * 100) / 100; }

/** Góc nhìn công khai của ván đang chơi (KHÔNG lộ vị trí mìn / điểm nổ). */
function gView_(st) {
  const base = { game: st.g, active: true, gameId: st.gid, bet: st.bet };
  if (st.g === 'hilo') {
    const k = st.steps, hi = 13 - st.rank, lo = st.rank - 1;
    const nx = function (n) { return n > 0 ? gR4_(Math.min(G_CAP, G_RTP / (st.pcum * n / 13))) : null; };
    return Object.assign(base, { card: { rank: st.rank, suit: st.suit }, steps: k, hist: st.hist, mult: k ? gR4_(gHiloMult_(st)) : null,
      payoutNow: k ? Math.round(st.bet * gHiloMult_(st)) : 0, next: { higher: nx(hi), lower: nx(lo) } });
  }
  if (st.g === 'mines') {
    const k = st.rev.length, m = gMinesMult_(st.m, k);
    return Object.assign(base, { mines: st.m, revealed: st.rev, steps: k, mult: k ? gR4_(m) : null, payoutNow: k ? Math.round(st.bet * m) : 0,
      nextMult: (25 - st.m - k > 0) ? gR4_(gMinesMult_(st.m, k + 1)) : null });
  }
  if (st.g === 'coin') { const k = st.steps; return Object.assign(base, { steps: k, mult: k ? gR4_(gCoinMult_(k)) : null, payoutNow: k ? Math.round(st.bet * gCoinMult_(k)) : 0, nextMult: gR4_(gCoinMult_(k + 1)) }); }
  return Object.assign(base, { startedAt: st.t, serverNow: Date.now(), rate: G_RATE, minCash: G_MINCASH });   // crash
}

/* ---------- 1. SLOTS ---------- */
function gSlotMult_(r) {
  if (r[0] === r[1] && r[1] === r[2]) return G_SLOT_TRIPLE[r[0]];
  const sym = r[0] === r[1] ? r[0] : (r[0] === r[2] ? r[0] : (r[1] === r[2] ? r[1] : null));
  return sym ? (G_SLOT_PAIR[sym] || 0) : 0;
}
function gSlots_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    gNoActive_(gs);
    const bet = gCheckBet_(stu, 'slots', p.bet);
    const reels = [G_SYMS[gPick_(G_SLOT_W)], G_SYMS[gPick_(G_SLOT_W)], G_SYMS[gPick_(G_SLOT_W)]];
    const mult = gSlotMult_(reels), payout = Math.round(bet * mult);
    const bal = gPayInstant_(stu, 'slots', bet, payout, { reels: reels, mult: mult });
    return { state: null, resp: { ok: true, game: 'slots', reels: reels, mult: mult, bet: bet, payout: payout, net: payout - bet, balance: bal } };
  }, true);
}

/* ---------- 2. WHEEL ---------- */
function gWheel_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    gNoActive_(gs);
    const bet = gCheckBet_(stu, 'wheel', p.bet), index = gRnd_(G_WHEEL.length), mult = G_WHEEL[index], payout = Math.round(bet * mult);
    const bal = gPayInstant_(stu, 'wheel', bet, payout, { index: index, mult: mult });
    return { state: null, resp: { ok: true, game: 'wheel', index: index, mult: mult, segments: G_WHEEL, bet: bet, payout: payout, net: payout - bet, balance: bal } };
  }, true);
}

/* ---------- 3. HILO ---------- */
function gHiloStart_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    gNoActive_(gs);
    const bet = gCheckBet_(stu, 'hilo', p.bet), gid = gId_(), rank = 1 + gRnd_(13);
    const bal = gStake_(stu, 'hilo', bet, gid);
    const st = { g: 'hilo', gid: gid, bet: bet, rank: rank, suit: gRnd_(4), pcum: 1, steps: 0, hist: [rank], t: Date.now() };
    return { state: st, resp: Object.assign({ ok: true, balance: bal }, gView_(st)) };
  });
}
function gHiloEnd_(stu, st, cap) {
  const mult = gHiloMult_(st), payout = Math.round(st.bet * mult), bal = gFinish_(stu.code, 'hilo', st, payout, { steps: st.steps, hist: st.hist, mult: gR4_(mult) });
  return { state: null, resp: { ok: true, game: 'hilo', active: false, result: 'cashout', auto: !!cap, card: { rank: st.rank, suit: st.suit }, steps: st.steps, hist: st.hist, mult: gR4_(mult), bet: st.bet, payout: payout, net: payout - st.bet, balance: bal } };
}
function gHiloGuess_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    const st = gNeed_(gs, 'hilo'), hi = p.guess === 'higher';
    if (!hi && p.guess !== 'lower') throw apiError_('bad_request', "guess phải là 'higher' hoặc 'lower'.");
    const n = hi ? 13 - st.rank : st.rank - 1;               // số lá thắng (bằng nhau = thua)
    if (n < 1) throw apiError_('bad_request', 'Không thể đoán hướng này với lá hiện tại.');
    const prev = st.rank, nx = 1 + gRnd_(13), suit = gRnd_(4), win = hi ? nx > prev : nx < prev;
    st.hist.push(nx);
    if (!win) {
      const bal = gFinish_(stu.code, 'hilo', st, 0, { steps: st.steps, hist: st.hist, guess: p.guess });
      return { state: null, resp: { ok: true, game: 'hilo', active: false, result: 'lose', prev: prev, card: { rank: nx, suit: suit }, steps: st.steps, hist: st.hist, bet: st.bet, payout: 0, net: -st.bet, balance: bal } };
    }
    st.pcum *= n / 13; st.steps++; st.rank = nx; st.suit = suit;
    if (gHiloMult_(st) >= G_CAP) return gHiloEnd_(stu, st, true);
    return { state: st, resp: Object.assign({ ok: true, result: 'win', balance: stu.balance }, gView_(st)) };
  });
}
function gHiloCash_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    const st = gNeed_(gs, 'hilo');
    if (st.steps < 1) throw apiError_('bad_request', 'Hãy đoán đúng ít nhất 1 lần trước khi rút.');
    return gHiloEnd_(stu, st, false);
  });
}

/* ---------- 4. MINES (5x5, ô 0..24 theo hàng) ---------- */
function gMinesStart_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    gNoActive_(gs);
    const m = Number(p.mines);
    if (!isFinite(m) || Math.floor(m) !== m || m < 1 || m > 10) throw apiError_('bad_request', 'Số mìn phải từ 1 đến 10.');
    const bet = gCheckBet_(stu, 'mines', p.bet), gid = gId_(), cells = [];
    for (let i = 0; i < 25; i++) cells.push(i);
    for (let i = 0; i < m; i++) { const j = i + gRnd_(25 - i), t = cells[i]; cells[i] = cells[j]; cells[j] = t; }   // Fisher–Yates một phần
    const bal = gStake_(stu, 'mines', bet, gid);
    const st = { g: 'mines', gid: gid, bet: bet, m: m, mines: cells.slice(0, m).sort(function (a, b) { return a - b; }), rev: [], t: Date.now() };
    return { state: st, resp: Object.assign({ ok: true, balance: bal }, gView_(st)) };
  });
}
function gMinesEnd_(stu, st, auto) {
  const mult = gMinesMult_(st.m, st.rev.length), payout = Math.round(st.bet * mult);
  const bal = gFinish_(stu.code, 'mines', st, payout, { m: st.m, steps: st.rev.length, mult: gR4_(mult) });
  return { state: null, resp: { ok: true, game: 'mines', active: false, result: 'cashout', auto: !!auto, mines: st.mines, revealed: st.rev, steps: st.rev.length, mult: gR4_(mult), bet: st.bet, payout: payout, net: payout - st.bet, balance: bal } };
}
function gMinesReveal_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    const st = gNeed_(gs, 'mines'), c = Number(p.cell);
    if (!isFinite(c) || Math.floor(c) !== c || c < 0 || c > 24) throw apiError_('bad_request', 'cell phải từ 0 đến 24.');
    if (st.rev.indexOf(c) >= 0) throw apiError_('bad_request', 'Ô này đã lật.');
    if (st.mines.indexOf(c) >= 0) {
      const bal = gFinish_(stu.code, 'mines', st, 0, { m: st.m, steps: st.rev.length, hit: c });
      return { state: null, resp: { ok: true, game: 'mines', active: false, result: 'lose', hit: c, mines: st.mines, revealed: st.rev, steps: st.rev.length, bet: st.bet, payout: 0, net: -st.bet, balance: bal } };
    }
    st.rev.push(c);
    if (st.rev.length >= 25 - st.m || gMinesMult_(st.m, st.rev.length) >= G_CAP) return gMinesEnd_(stu, st, true);
    return { state: st, resp: Object.assign({ ok: true, result: 'safe', cell: c, balance: stu.balance }, gView_(st)) };
  });
}
function gMinesCash_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    const st = gNeed_(gs, 'mines');
    if (st.rev.length < 1) throw apiError_('bad_request', 'Hãy lật ít nhất 1 ô trước khi rút.');
    return gMinesEnd_(stu, st, false);
  });
}

/* ---------- 5. CRASH (tên lửa) ---------- */
/** Điểm nổ C = 0.90/(1-U), U~U[0,1): P(C>c)=0.90/c. C<1 → nổ ngay tại 1.00 (10%); trần 100. Giữ bí mật tới khi ván kết thúc. */
function gCrashStart_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    gNoActive_(gs);
    const bet = gCheckBet_(stu, 'crash', p.bet), gid = gId_();
    let C = G_RTP / (1 - Math.random()); if (C < 1) C = 1; if (C > G_CAP) C = G_CAP;
    const bal = gStake_(stu, 'crash', bet, gid);
    const st = { g: 'crash', gid: gid, bet: bet, C: C, t: Date.now() };
    return { state: st, resp: Object.assign({ ok: true, balance: bal }, gView_(st)) };
  });
}
/** Hệ số tại thời điểm SERVER nhận yêu cầu: m = floor(100·e^(0.1·giây)) / 100. m ≥ C → đã nổ, mất cược; ngược lại trả bet·m. */
function gCrashCash_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    const st = gNeed_(gs, 'crash'), m = gCrashMult_(Date.now() - st.t), cp = gR2_(st.C);
    if (m >= st.C) {
      const bal = gFinish_(stu.code, 'crash', st, 0, { crashPoint: cp, at: m });
      return { state: null, resp: { ok: true, game: 'crash', active: false, result: 'crash', crashPoint: cp, mult: m, bet: st.bet, payout: 0, net: -st.bet, balance: bal } };
    }
    if (m < G_MINCASH) throw apiError_('bad_request', 'Quá sớm – chờ hệ số ≥ ' + G_MINCASH + '.');
    const payout = Math.round(st.bet * m), bal = gFinish_(stu.code, 'crash', st, payout, { crashPoint: cp, cash: m });
    return { state: null, resp: { ok: true, game: 'crash', active: false, result: 'cashout', crashPoint: cp, mult: m, bet: st.bet, payout: payout, net: payout - st.bet, balance: bal } };
  });
}

/* ---------- 6. DICE (Trên–Dưới) ---------- */
function gDice_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    gNoActive_(gs);
    const target = Number(p.target), dir = p.dir;
    if (!isFinite(target) || Math.floor(target) !== target || target < 2 || target > 98) throw apiError_('bad_request', 'Ngưỡng phải là số nguyên từ 2 đến 98.');
    if (dir !== 'under' && dir !== 'over') throw apiError_('bad_request', "dir phải là 'under' hoặc 'over'.");
    const chance = dir === 'under' ? target - 1 : 100 - target;
    if (chance < 5 || chance > 95) throw apiError_('bad_request', 'Tỉ lệ thắng phải từ 5% đến 95%.');
    const bet = gCheckBet_(stu, 'dice', p.bet), mult = gR2_(G_RTP * 100 / chance), roll = 1 + gRnd_(100);
    const win = dir === 'under' ? roll < target : roll > target, payout = win ? Math.round(bet * mult) : 0;
    const bal = gPayInstant_(stu, 'dice', bet, payout, { roll: roll, target: target, dir: dir, mult: mult });
    return { state: null, resp: { ok: true, game: 'dice', roll: roll, target: target, dir: dir, chance: chance, mult: mult, win: win, bet: bet, payout: payout, net: payout - bet, balance: bal } };
  }, true);
}

/* ---------- 7. PLINKO ---------- */
function gPlinko_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    gNoActive_(gs);
    const risk = p.risk;
    if (!Object.prototype.hasOwnProperty.call(G_PLINKO, risk)) throw apiError_('bad_request', "risk phải là 'low', 'mid' hoặc 'high'.");
    const bet = gCheckBet_(stu, 'plinko', p.bet), path = [];
    let slot = 0; for (let i = 0; i < 10; i++) { const b = gRnd_(2); path.push(b); slot += b; }
    const mult = G_PLINKO[risk][slot], payout = Math.round(bet * mult);
    const bal = gPayInstant_(stu, 'plinko', bet, payout, { risk: risk, slot: slot, mult: mult });
    return { state: null, resp: { ok: true, game: 'plinko', risk: risk, path: path, slot: slot, mult: mult, table: G_PLINKO[risk], bet: bet, payout: payout, net: payout - bet, balance: bal } };
  }, true);
}

/* ---------- 8. THẺ CÀO ---------- */
function gScratchMult_(cells) {   // → {symbol, count, mult} hoặc null; nhiều biểu tượng ≥3 → lấy hệ số cao nhất
  const cnt = {}; let best = null;
  cells.forEach(function (c) { cnt[c] = (cnt[c] || 0) + 1; });
  Object.keys(cnt).forEach(function (sym) {
    const n = cnt[sym]; if (n < 3) return;
    const m = gR2_(G_SCR_BASE[G_SCR_SYMS.indexOf(sym)] * G_SCR_CNT[n]);
    if (!best || m > best.mult) best = { symbol: sym, count: n, mult: m };
  });
  return best;
}
function gScratch_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    gNoActive_(gs);
    const bet = gCheckBet_(stu, 'scratch', p.bet), cells = [];
    for (let i = 0; i < 9; i++) cells.push(G_SCR_SYMS[gPick_(G_SCR_W)]);   // 9 ô độc lập, không sắp xếp lại
    const win = gScratchMult_(cells), mult = win ? win.mult : 0, payout = Math.round(bet * mult);
    const bal = gPayInstant_(stu, 'scratch', bet, payout, { cells: cells.join(','), mult: mult });
    return { state: null, resp: { ok: true, game: 'scratch', cells: cells, win: win ? { symbol: win.symbol, count: win.count } : null, mult: mult, bet: bet, payout: payout, net: payout - bet, balance: bal } };
  }, true);
}

/* ---------- 9. KENO MINI ---------- */
function gKeno_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    gNoActive_(gs);
    const picks = p.picks;
    if (!Array.isArray(picks) || picks.length < 1 || picks.length > 5) throw apiError_('bad_request', 'Hãy chọn từ 1 đến 5 số.');
    const seen = {};
    picks.forEach(function (n) { if (typeof n !== 'number' || Math.floor(n) !== n || n < 1 || n > 20 || seen[n]) throw apiError_('bad_request', 'Số chọn phải khác nhau, từ 1 đến 20.'); seen[n] = 1; });
    const bet = gCheckBet_(stu, 'keno', p.bet), pool = [];
    for (let i = 1; i <= 20; i++) pool.push(i);
    for (let i = 0; i < 8; i++) { const j = i + gRnd_(20 - i), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    const draw = pool.slice(0, 8).sort(function (a, b) { return a - b; });
    let hits = 0; picks.forEach(function (n) { if (draw.indexOf(n) >= 0) hits++; });
    const tbl = G_KENO[picks.length], mult = tbl[hits] || 0, payout = Math.round(bet * mult);
    const bal = gPayInstant_(stu, 'keno', bet, payout, { picks: picks, hits: hits, mult: mult });
    return { state: null, resp: { ok: true, game: 'keno', picks: picks, draw: draw, hits: hits, mult: mult, table: tbl, bet: bet, payout: payout, net: payout - bet, balance: bal } };
  }, true);
}

/* ---------- 10. TUNG XU LIÊN TIẾP (nhiều bước) ---------- */
function gCoinStart_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    gNoActive_(gs);
    const bet = gCheckBet_(stu, 'coin', p.bet), gid = gId_(), bal = gStake_(stu, 'coin', bet, gid);
    const st = { g: 'coin', gid: gid, bet: bet, steps: 0, t: Date.now() };
    return { state: st, resp: Object.assign({ ok: true, balance: bal }, gView_(st)) };
  });
}
function gCoinEnd_(stu, st, auto) {
  const mult = gCoinMult_(st.steps), payout = Math.round(st.bet * mult), bal = gFinish_(stu.code, 'coin', st, payout, { steps: st.steps, mult: gR4_(mult) });
  return { state: null, resp: { ok: true, game: 'coin', active: false, result: 'cashout', auto: !!auto, steps: st.steps, mult: gR4_(mult), bet: st.bet, payout: payout, net: payout - st.bet, balance: bal } };
}
function gCoinFlip_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    const st = gNeed_(gs, 'coin'), win = gRnd_(2) === 0;   // người chơi luôn chọn Ngửa; thắng = ra Ngửa
    if (!win) {
      const bal = gFinish_(stu.code, 'coin', st, 0, { steps: st.steps, lost: true });
      return { state: null, resp: { ok: true, game: 'coin', active: false, result: 'lose', side: 'tails', steps: st.steps, bet: st.bet, payout: 0, net: -st.bet, balance: bal } };
    }
    st.steps++;
    if (gCoinMult_(st.steps) >= G_CAP) { const e = gCoinEnd_(stu, st, true); e.resp.side = 'heads'; return e; }
    return { state: st, resp: Object.assign({ ok: true, result: 'win', side: 'heads', balance: stu.balance }, gView_(st)) };
  });
}
function gCoinCash_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    const st = gNeed_(gs, 'coin');
    if (st.steps < 1) throw apiError_('bad_request', 'Hãy tung thắng ít nhất 1 lần trước khi rút.');
    return gCoinEnd_(stu, st, false);
  });
}

/* ---------- Khôi phục ván & thống kê ---------- */
function gActive_(p, s) {
  const gs0 = gsLoad_(s.code, false);
  if (!gs0 || !gs0.state) return { ok: true, active: false, balance: s.balance };
  const st0 = gs0.state;
  if (st0.g === 'crash' && gCrashDone_(st0, Date.now())) {      // tên lửa đã nổ mà chưa chốt → tất toán thua, lộ điểm nổ
    return withLock_(function () {
      const gs = gsLoad_(s.code, false), st = gs && gs.state;
      if (st && st.g === 'crash' && gCrashDone_(st, Date.now())) {
        const bal = gFinish_(s.code, 'crash', st, 0, { crashPoint: gR2_(st.C), at: 'poll' });
        gsWrite_(gs, null, gs.reqId, null);                      // giữ nguyên lastResp để replay requestId cũ vẫn đúng
        return { ok: true, game: 'crash', active: false, result: 'crash', crashPoint: gR2_(st.C), bet: st.bet, payout: 0, net: -st.bet, balance: bal };
      }
      return gActiveResp_(gs, getStudent_(s.code));
    });
  }
  return gActiveResp_(gs0, s);
}
function gActiveResp_(gs, stu) { return (gs && gs.state) ? Object.assign({ ok: true, balance: stu.balance }, gView_(gs.state)) : { ok: true, active: false, balance: stu.balance }; }

function gStats_(p, s) {
  const sh = glSh_(), n = sh.getLastRow(), today = gDay_(new Date()), by = {}, tot = { plays: 0, wins: 0, bet: 0, payout: 0, net: 0, best: 0 };
  G_LIST.forEach(function (g) { by[g] = { plays: 0, wins: 0, bet: 0, payout: 0, net: 0, best: 0 }; });
  if (n >= 2) {
    const st = Math.max(2, n - 4999);                           // 5.000 dòng gần nhất
    sh.getRange(st, 1, n - st + 1, 6).getValues().forEach(function (r) {
      if (String(r[1]) !== s.code) return;
      const o = by[String(r[2])]; if (!o) return;
      const bet = Number(r[3]) || 0, pay = Number(r[4]) || 0, net = Number(r[5]) || 0;
      [o, tot].forEach(function (x) { x.plays++; if (net > 0) x.wins++; x.bet += bet; x.payout += pay; x.net += net; if (pay > x.best) x.best = pay; });
    });
  }
  const L = gLimits_(s);
  return { ok: true, code: s.code, balance: s.balance, total: tot, games: by,
    today: { date: today, net: L.net, dailyLossLimit: L.lim, remainingLoss: L.left === Infinity ? null : L.left },
    maxBetNow: Math.max(0, Math.min(L.cap, L.left === Infinity ? L.cap : L.left)) };
}

/* ---------- Đăng ký với router (Code.gs gọi registerGameActions_(GAME_ACTIONS)) ---------- */
function registerGameActions_(reg) {
  reg.slotsSpin = gSlots_;
  reg.wheelSpin = gWheel_;
  reg.hiloStart = gHiloStart_; reg.hiloGuess = gHiloGuess_; reg.hiloCashout = gHiloCash_;
  reg.minesStart = gMinesStart_; reg.minesReveal = gMinesReveal_; reg.minesCashout = gMinesCash_;
  reg.crashStart = gCrashStart_; reg.crashCashout = gCrashCash_;
  reg.diceRoll = gDice_; reg.plinkoDrop = gPlinko_; reg.scratchBuy = gScratch_; reg.kenoPlay = gKeno_;
  reg.coinStart = gCoinStart_; reg.coinFlip = gCoinFlip_; reg.coinCashout = gCoinCash_;
  reg.getActiveGame = gActive_;
  reg.getGameStats = gStats_;
}
