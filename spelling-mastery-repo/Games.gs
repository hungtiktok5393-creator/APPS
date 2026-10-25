/**
 * Games.gs – 5 trò may rủi bằng điểm ảo: slots, wheel, hilo, mines, crash.
 * Kết quả ngẫu nhiên sinh Ở SERVER (Math.random); client chỉ diễn hoạt.
 * Phụ thuộc Code.gs v8: applyDelta_, getStudent_, cfgNum_, cfgBool_, withLock_, apiError_, findRow_,
 * appendRows_, sheetT_, GAME_ACTIONS (router tự gọi registerGameActions_ + kiểm mã, rate limit, gamesEnabled).
 * Sheet tự tạo: GameState (1 dòng / học sinh) · GameLog (timestamp, code, game, bet, payout, net, detail).
 * Mọi tên helper có tiền tố g/G_ để không đụng Code.gs.
 */
const G_SHEET_STATE = 'GameState', G_SHEET_LOG = 'GameLog';
const G_STATE_HEADERS = ['code', 'game', 'state', 'updatedAt', 'lastReqId', 'lastResp'];   // lastReqId/lastResp: phản hồi của yêu cầu gần nhất → idempotent bền vững
const G_LOG_HEADERS = ['timestamp', 'code', 'game', 'bet', 'payout', 'net', 'detail'];
const G_LIST = ['slots', 'wheel', 'hilo', 'mines', 'crash'];
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

function gLog_(code, game, bet, payout, detail) {
  let d = JSON.stringify(detail == null ? '' : detail); if (d === '""') d = '';
  glSh_().appendRow([gNow_(), code, game, bet, payout, payout - bet, d.slice(0, 500)]);
}
/** Lỗ ròng trong ngày (Asia/Ho_Chi_Minh) = -tổng net của GameLog hôm nay; quét ngược từ cuối sheet. */
function gDayNet_(code) {
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
  const sh = gsSh_(); let row = findRow_(sh, 1, code);
  if (!row) { if (!create) return null; appendRows_(sh, [[code, '', '', '', '', '']]); row = sh.getLastRow(); }
  const r = sh.getRange(row, 1, 1, 6).getValues()[0]; let st = null;
  try { st = r[2] ? JSON.parse(r[2]) : null; } catch (e) {}
  return { row: row, code: code, state: st, reqId: String(r[4] || ''), resp: String(r[5] || '') };
}
function gsWrite_(gs, state, rid, resp) {
  const rs = resp ? JSON.stringify(resp) : gs.resp;
  gsSh_().getRange(gs.row, 1, 1, 6).setValues([[gs.code, state ? state.g : '', state ? JSON.stringify(state) : '', gNow_(), rid, rs]]);
  gs.state = state; gs.reqId = rid; gs.resp = rs;
}
/** Mọi action ghi: cần requestId [\w-]{8,64}; chạy trong khoá; gửi lại cùng requestId → trả đúng phản hồi cũ (replay:true), không trừ/cộng lần nữa. fn(gs, stu) → {state, resp}. */
function gMutate_(p, s, fn) {
  const rid = String(p.requestId || '');
  if (!/^[\w-]{8,64}$/.test(rid)) throw apiError_('bad_request', 'Thiếu requestId (8–64 ký tự [A-Za-z0-9_-]).');
  return withLock_(function () {
    const cache = CacheService.getScriptCache(), ck = 'gq:' + s.code + ':' + rid, hit = cache.get(ck);
    if (hit) return gReplay_(hit);
    const gs = gsLoad_(s.code, true);
    if (gs.reqId === rid && gs.resp) return gReplay_(gs.resp);
    const stu = getStudent_(s.code);
    if (!stu) throw apiError_('invalid_code', 'Mã không tồn tại.');
    if (!stu.active) throw apiError_('code_disabled', 'Mã đã bị vô hiệu hoá.');
    const out = fn(gs, stu);
    gsWrite_(gs, out.state, rid, out.resp);
    try { cache.put(ck, JSON.stringify(out.resp), 21600); } catch (e) {}
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
  });
}

/* ---------- 2. WHEEL ---------- */
function gWheel_(p, s) {
  return gMutate_(p, s, function (gs, stu) {
    gNoActive_(gs);
    const bet = gCheckBet_(stu, 'wheel', p.bet), index = gRnd_(G_WHEEL.length), mult = G_WHEEL[index], payout = Math.round(bet * mult);
    const bal = gPayInstant_(stu, 'wheel', bet, payout, { index: index, mult: mult });
    return { state: null, resp: { ok: true, game: 'wheel', index: index, mult: mult, segments: G_WHEEL, bet: bet, payout: payout, net: payout - bet, balance: bal } };
  });
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
  reg.getActiveGame = gActive_;
  reg.getGameStats = gStats_;
}
