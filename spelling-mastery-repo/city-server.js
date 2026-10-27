/* ---------------------------------------------------------------------
 * PHẦN MÁY CHỦ (Apps Script) – nối luật CityCore với Sheet, sổ điểm, xếp hạng
 * Hành động (POST, kèm code/token học sinh): cityGet · cityAct {ops[], requestId} · cityBoard · cityVisit {who} · cityLike {who}
 * Sheet 'City': mỗi học sinh 1 dòng; state JSON (lớn thì gzip+base64) chia nhiều ô (≤ 45.000 ký tự/ô).
 * Cấu hình (Config): cityEnabled (true), cityCostPct (100 = giá điểm mặc định), cityActionPts (2 = điểm mỗi thao tác, 0 = miễn phí),
 *   cityDailySpendCap (0 = không giới hạn).
 * Sổ điểm: reason 'city'. KHÔNG tính vào báo cáo phụ huynh (familyReport_ bỏ qua), không ghi GameLog.
 * --------------------------------------------------------------------- */
const CT_SHEET = 'City', CT_PARTS = 24, CT_CELL = 45000, CT_FIX = 11;
const CT_HEADERS = ['code', 'v', 'updatedAt', 'lastReqId', 'lastResp', 'lvl', 'xp', 'pop', 'value', 'name', 'likes'].concat((function () { const a = []; for (let i = 1; i <= CT_PARTS; i++) a.push('s' + i); return a; })());
const CT_NCOL = CT_HEADERS.length;

function ctErr_(c, m) { return apiError_('city_' + c, m); }
function ctOpt_(balance) { return { costPct: clampInt_(cfgNum_('cityCostPct', 100), 10, 500, 100), act: clampInt_(cfgNum_('cityActionPts', CityCore.ACT_PTS), 0, 100, CityCore.ACT_PTS), cap: Math.max(0, cfgNum_('cityDailySpendCap', 0)), balance: balance }; }
function ctSh_() { return sheetT_(CT_SHEET, CT_HEADERS, [1, 3, 4, 5, 10]); }
function ctEncode_(st) {
  const js = JSON.stringify(st);
  let s = js;
  if (js.length > CT_CELL) s = 'z:' + Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(js, 'application/octet-stream', 's.json')).getBytes());
  const parts = []; for (let i = 0; i < s.length; i += CT_CELL) parts.push(s.slice(i, i + CT_CELL));
  if (parts.length > CT_PARTS) throw ctErr_('too_big', 'Thành phố quá lớn để lưu. Hãy báo giáo viên.');
  while (parts.length < CT_PARTS) parts.push('');
  return { parts: parts, js: js };
}
function ctDecode_(parts) {
  const s = parts.map(function (x) { return String(x == null ? '' : x); }).join('');
  if (!s) return '';
  if (s.slice(0, 2) === 'z:') return Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(s.slice(2)), 'application/x-gzip', 's.gz')).getDataAsString();
  return s;
}
function ctLoad_(sh, code) {
  const row = findRow_(sh, 1, code); if (!row) return null;
  const r = sh.getRange(row, 1, 1, CT_NCOL).getValues()[0];
  let js, st;
  try { js = ctDecode_(r.slice(CT_FIX)); st = JSON.parse(js); } catch (e) { throw ctErr_('corrupt', 'Dữ liệu thành phố bị lỗi, hãy báo giáo viên.'); }
  return { row: row, code: code, st: CityCore.migrate(st), raw: js, v: Number(r[1]) || 0, lastReqId: String(r[3] || ''), lastResp: String(r[4] || ''), likes: Number(r[10]) || 0 };
}
function ctRow_(code, st, v, now, rid, resp, likes) {
  const S = CityCore.stats(st, now), enc = ctEncode_(st);
  return [code, v, new Date(now).toISOString(), rid, resp, S.lv, Math.floor(st.xp), S.pop, Math.round(st.s.ps || 0), safe_(st.nm || ''), likes || 0].concat(enc.parts);
}
function ctSave_(sh, L, st, v, now, rid, resp) { sh.getRange(L.row, 1, 1, CT_NCOL).setValues([ctRow_(L.code, st, v, now, rid, resp, L.likes)]); }
function ctCreate_(sh, code, now) { appendRows_(sh, [ctRow_(code, CityCore.newState(code, now), 1, now, '', '', 0)]); return ctLoad_(sh, code); }
function ctDerived_(L, st, now, bal) { const d = CityCore.derived(st, now, ctOpt_(bal)); d.likes = L.likes; return d; }

function ctGet_(params, student) {
  const code = student.code, now = Date.now(), sh = ctSh_();
  let L = ctLoad_(sh, code);
  if (!L) L = withLock_(function () { return ctLoad_(sh, code) || ctCreate_(sh, code, now); });
  return { state: L.st, derived: ctDerived_(L, L.st, now, student.balance), serverTime: now, v: L.v, balance: student.balance, catVer: CityCore.CATVER, ver: CityCore.VER };
}
function ctAct_(params, student) {
  const code = student.code, rid = String(params.requestId || ''), ops = params.ops;
  if (!/^[\w-]{8,64}$/.test(rid)) throw ctErr_('bad_request', 'requestId không hợp lệ.');
  if (!Array.isArray(ops) || !ops.length) throw ctErr_('bad_request', 'Thiếu danh sách thao tác.');
  if (ops.length > CityCore.MAX_OPS) throw ctErr_('too_many_ops', 'Tối đa ' + CityCore.MAX_OPS + ' thao tác mỗi lần.');
  let js; try { js = JSON.stringify(ops); } catch (e) { throw ctErr_('bad_request', 'Thao tác không hợp lệ.'); }
  if (js.length > 30000) throw ctErr_('bad_request', 'Dữ liệu thao tác quá lớn.');
  const ck = 'ctq:' + code + ':' + rid;
  return withLock_(function () {
    const now = Date.now(), sh = ctSh_();
    const L = ctLoad_(sh, code) || ctCreate_(sh, code, now);
    const bal0 = (getStudent_(code) || student).balance;
    let prev = cget_(ck);
    if (!prev && L.lastReqId === rid) { try { prev = JSON.parse(L.lastResp); } catch (e) { prev = { results: [], spent: 0 }; } }
    if (prev) return { ok: true, replay: true, state: L.st, derived: ctDerived_(L, L.st, now, bal0), results: prev.results || [], spent: prev.spent || 0, balance: bal0, v: L.v, serverTime: now };
    const st = L.st, opt = ctOpt_(bal0);
    let R;
    try { R = CityCore.applyOps(st, ops, now, opt); }
    catch (err) {
      if (!err || !err.apiCode) throw err;
      const fresh = CityCore.migrate(JSON.parse(L.raw));
      return { ok: false, error: err.apiCode, message: err.message, opIndex: err.opIndex, applied: false, state: fresh, derived: ctDerived_(L, fresh, now, bal0), balance: bal0, v: L.v, serverTime: now };
    }
    let bal = bal0;
    if (R.spend > 0) {
      const r = applyDelta_(code, -R.spend, 'city', rid, R.notes.join('; ').slice(0, 200));
      if (r.clamped || r.delta !== -R.spend) {
        if (r.delta < 0) applyDelta_(code, -r.delta, 'city', rid, 'hoàn tác');
        throw ctErr_('not_enough_points', 'Không đủ điểm để thực hiện.');
      }
      bal = r.balance;
    }
    const v = L.v + 1;
    let resp = JSON.stringify({ results: R.results, spent: R.spend });
    if (resp.length > 20000) resp = JSON.stringify({ results: [], spent: R.spend });
    try { ctSave_(sh, L, st, v, now, rid, resp); }
    catch (e) { if (R.spend > 0) applyDelta_(code, R.spend, 'city', rid, 'hoàn điểm do lỗi lưu'); throw e; }
    cput_(ck, { results: R.results, spent: R.spend }, 21600);
    return { ok: true, state: st, derived: ctDerived_(L, st, now, bal), results: R.results, levelUp: R.levelUp, achievements: R.ach, spent: R.spend, balance: bal, v: v, serverTime: now };
  });
}
function ctBoardList_() {
  let list = cget_('ctboard');
  if (list) return list;
  const sh = ctSh_(), n = sh.getLastRow(); list = [];
  if (n >= 2) {
    sh.getRange(2, 1, n - 1, CT_FIX).getValues().forEach(function (r) {
      if (r[0]) list.push([String(r[0]), Number(r[5]) || 1, Number(r[7]) || 0, Number(r[8]) || 0, String(r[9] || '').replace(/^'/, ''), Number(r[10]) || 0]);
    });
    list.sort(function (a, b) { return (b[2] - a[2]) || (b[1] - a[1]) || (b[3] - a[3]) || (a[0] < b[0] ? -1 : 1); });
  }
  cput_('ctboard', list.slice(0, 600), 60);
  return list;
}
function ctBoard_(params, student) {
  const list = ctBoardList_();
  const row = function (r, i) { return { rank: i + 1, who: maskCode_(r[0]), lv: r[1], pop: r[2], value: r[3], name: r[4], likes: r[5], title: CityCore.rank(r[2]).n, me: r[0] === student.code }; };
  let me = null; for (let i = 0; i < list.length; i++) if (list[i][0] === student.code) { me = row(list[i], i); break; }
  return { board: list.slice(0, 30).map(row), me: me, total: list.length, serverTime: Date.now() };
}
function ctVisit_(params, student) {
  const who = normCode_(params.who); if (!who) throw ctErr_('bad_request', 'Thiếu mã thành phố.');
  const L = ctLoad_(ctSh_(), who); if (!L) throw ctErr_('not_found', 'Bạn này chưa xây thành phố.');
  const st = L.st, now = Date.now(), S = CityCore.stats(st, now), day = CityCore.vnDay(now);
  return { who: who, state: { b: st.b, o: st.o, ch: st.ch, th: st.th, vh: st.vh, nm: st.nm, bo: {}, hp: {}, pm: st.pm, xp: st.xp, s: { ps: st.s.ps || 0 } },
    derived: { lv: S.lv, pop: S.pop, hap: S.hap, rank: CityCore.rank(S.pop).n, likes: L.likes }, liked: !!cget_('ctlk:' + day + ':' + student.code + ':' + who), serverTime: now };
}
function ctLike_(params, student) {
  const who = normCode_(params.who), me = student.code, day = CityCore.vnDay(Date.now());
  if (!who || who === me) throw ctErr_('bad_request', 'Không thể tự thả tim cho mình.');
  const k = 'ctlk:' + day + ':' + me + ':' + who, kn = 'ctlkn:' + day + ':' + me;
  if (cget_(k)) throw ctErr_('already', 'Hôm nay bạn đã thả tim thành phố này rồi.');
  const n = Number(cget_(kn)) || 0; if (n >= 20) throw ctErr_('limit', 'Mỗi ngày thả tối đa 20 tim.');
  return withLock_(function () {
    const sh = ctSh_(), row = findRow_(sh, 1, who); if (!row) throw ctErr_('not_found', 'Không tìm thấy thành phố.');
    const c = sh.getRange(row, 11, 1, 1), likes = (Number(c.getValues()[0][0]) || 0) + 1;
    c.setValues([[likes]]); cput_(k, 1, 30 * 3600); cput_(kn, n + 1, 30 * 3600);
    return { likes: likes };
  });
}

/* ---------------- Đăng ký với route() trong Code.gs ---------------- */
function registerCityActions_(reg) {
  reg.cityGet = function (params, student) { return ctGet_(params, student); };
  reg.cityAct = function (params, student) { return ctAct_(params, student); };
  reg.cityBoard = function (params, student) { return ctBoard_(params, student); };
  reg.cityVisit = function (params, student) { return ctVisit_(params, student); };
  reg.cityLike = function (params, student) { return ctLike_(params, student); };
}
