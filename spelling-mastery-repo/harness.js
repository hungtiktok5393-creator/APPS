// Harness tham khảo: nạp HÀM THẬT từ Code.gs (applyDelta_, findRow_, appendRows_, withLock_...) + Garden.gs, stub Sheet/Cache/Lock/Utilities.
const fs = require('fs'), vm = require('vm'), zlib = require('zlib');
const code = fs.readFileSync('/mnt/user-data/uploads/Code.gs', 'utf8');
function extract(name) {
  const i = code.search(new RegExp('^function ' + name + '\\(', 'm'));
  if (i < 0) throw new Error('missing ' + name);
  let d = 0, j = code.indexOf('{', i), started = false;
  for (; j < code.length; j++) { const ch = code[j]; if (ch === '{') { d++; started = true; } else if (ch === '}') { d--; if (started && d === 0) break; } }
  return code.slice(i, j + 1);
}
let T = Date.UTC(2026, 9, 27, 3, 0, 0);
class FakeDate extends Date { constructor(...a) { if (a.length === 0) super(T); else super(...a); } static now() { return T; } }
class Sheet {
  constructor(headers) { this.d = [headers.slice()]; this.fmt = []; }
  getLastRow() { return this.d.length; } getLastColumn() { return this.d[0].length; } getMaxRows() { return Math.max(this.d.length, 1000); }
  insertRowsAfter() {}
  getRange(r, c, nr, nc) {
    const s = this; nr = nr || 1; nc = nc || 1;
    return { getValues() { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let k = 0; k < nc; k++) { const v = (s.d[r - 1 + i] || [])[c - 1 + k]; row.push(v === undefined ? '' : v); } o.push(row); } return o; },
      setValues(v) { for (let i = 0; i < nr; i++) { while (s.d.length < r + i) s.d.push([]); for (let k = 0; k < nc; k++) { const val = v[i][k]; if (typeof val === 'string' && val.length > 50000) throw new Error('CELL >50000'); s.d[r - 1 + i][c - 1 + k] = val; } } },
      setNumberFormat() {} };
  }
  appendRow(row) { this.d.push(row); }
}
const sheets = {};
const cache = new Map();
const sandbox = { console, Math, JSON, Date: FakeDate, Object, Array, String, Number, isFinite, parseInt, RegExp, Error, Buffer,
  CacheService: { getScriptCache: () => ({ get: k => cache.has(k) ? cache.get(k) : null, put: (k, v) => cache.set(k, v) }) },
  LockService: (() => { let held = false; return { getScriptLock: () => ({ hasLock: () => held, waitLock() { held = true; }, releaseLock() { held = false; } }) }; })(),
  Utilities: {
    newBlob: (d, ct, n) => ({ data: typeof d === 'string' ? Buffer.from(d, 'utf8') : Buffer.from(d), getBytes() { return [...this.data]; }, getDataAsString() { return this.data.toString('utf8'); } }),
    gzip: b => ({ getBytes: () => [...zlib.gzipSync(b.data)] }),
    ungzip: b => ({ getDataAsString: () => zlib.gunzipSync(b.data).toString('utf8') }),
    base64Encode: a => Buffer.from(a).toString('base64'), base64Decode: s => [...Buffer.from(s, 'base64')]
  },
  _cfg: { gardenEnabled: true, gardenCostPct: 100, gardenDailySpendCap: 0 }
};
vm.createContext(sandbox);
const pre = ['foldCode_', 'normCode_', 'isActive_', 'iso_', 'safe_', 'findRow_', 'cols_', 'clampInt_', 'apiError_', 'withLock_', 'maskCode_', 'appendRows_', 'applyDelta_', 'cget_', 'cput_', 'cfgNum_', 'cfgBool_', 'getStudent_', 'requireStudent_', 'okWrap_'].map(extract).join('\n');
vm.runInContext(`const CODE_MIN=3, CODE_MAX=16; const LEDGER_REASONS=['vocab','test','game','teacher_adjust','garden'];
function getConfigValue_(k,d){const v=_cfg[k];return v===undefined?d:v;}
const _S=new (class{})(); function stSh_(){return __sh('Students');} function ldSh_(){return __sh('Ledger');}
function sheetT_(n,h,t){return __sh(n,h);}
${pre}
`, sandbox);
sandbox.__sh = (n, h) => sheets[n] || (sheets[n] = new Sheet(h || (n === 'Students' ? ['code', 'createdAt', 'note', 'active', 'balance', 'totalEarned', 'lastActive'] : ['t', 'code', 'delta', 'reason', 'refId', 'balanceAfter', 'detail'])));
vm.runInContext(fs.readFileSync('/mnt/user-data/outputs/Garden.gs', 'utf8') + '\nconst GARDEN_ACTIONS = {}; registerGardenActions_(GARDEN_ACTIONS);', sandbox);
const run = s => vm.runInContext(s, sandbox);
function addStudent(c, bal) { sandbox.__sh('Students').d.push([c, '', '', true, bal, bal, '']); }
function call(action, params) {   // giống route(): requireStudent_ → gardenEnabled → okWrap_
  try {
    sandbox.__p = params; sandbox.__a = action;
    return run(`(function(){ const s = requireStudent_(__p.code); if(!cfgBool_('gardenEnabled',true)) throw apiError_('garden_disabled','Khu vườn đang tắt.'); return okWrap_(GARDEN_ACTIONS[__a](__p, s)); })()`);
  } catch (e) { if (e.apiCode) return { ok: false, error: e.apiCode, message: e.message }; throw e; }
}
let rid = 0; const R = () => 'req-' + String(++rid).padStart(8, '0');
const act = (code, ops, extra) => call('gardenAct', Object.assign({ code, ops, requestId: R() }, extra || {}));
const bal = c => run(`getStudent_('${c}')`).balance;
const ledger = () => sandbox.__sh('Ledger').d.slice(1);
let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name, info !== undefined ? JSON.stringify(info).slice(0, 300) : ''); } }
const adv = ms => { T += ms; };
module.exports = { sandbox, run, call, act, bal, ledger, ok, adv, addStudent, sheets, cache, R, getT: () => T, setT: v => { T = v; }, res: () => ({ pass, fail }) };
