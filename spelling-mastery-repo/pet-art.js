/* Nhà Thầy Hưng – đồ hoạ game Thú cưng (SVG thuần, không ảnh ngoài).
 * window.PetArt = { pet(o) → chuỗi <g> thú, face(o, expr, mouth), room(id, tod) → chuỗi lớp nền phòng, furn(slot,id), egg(sp,uid), SPECIES, DYES }
 * Toạ độ thú: gốc (0,0) ở chân, đầu cao khoảng −190. Các nhóm có data-p để pet.js tạo hoạt ảnh:
 *   all (cả con) · body (thở) · head (lắc đầu) · tail · earL/earR · armL/armR · eyes · face · back (cánh) · fx */
(function () {
  'use strict';
  const hx = h => { h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, c => c + c); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = hx(a), y = hx(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const lit = (c, t) => mix(c, '#ffffff', t), drk = (c, t) => mix(c, '#000000', t);

  /* ---------- Loài ---------- */
  const SPECIES = {
    meo: { b: '#f6a75a', bl: '#fff1de', inn: '#ffb1c1', ears: 'cat', tail: 'cat', nose: 'tri', mouth: 'w', marks: ['tabby'], whisk: 1, fluff: 1 },
    cun: { b: '#e9c18f', bl: '#fff6ea', earC: '#a8714a', ears: 'dog', tail: 'dog', nose: 'oval', mouth: 'smile', marks: ['spot'] },
    tho: { b: '#f4eff6', bl: '#ffffff', inn: '#ffb6c8', ears: 'bunny', tail: 'puff', nose: 'tri', mouth: 'w', teeth: 1 },
    ga: { b: '#ffd84d', bl: '#fff4b8', ears: 'tuft', tail: 'feather', beak: '#ff9f1c', feet: '#ff9f1c', arms: 'wing' },
    gau: { b: '#a9744f', bl: '#ecd0ae', inn: '#e8b996', ears: 'round', tail: 'puff', nose: 'oval', mouth: 'smile', marks: ['muzzle'] },
    panda: { b: '#fbfbfd', dark: '#2f2f3d', bl: '#ffffff', ears: 'round', earC: '#2f2f3d', tail: 'puff', nose: 'oval', mouth: 'w', marks: ['panda'], limbs: '#2f2f3d' },
    cao: { b: '#f2762e', bl: '#fff4e8', inn: '#ffd2b0', ears: 'fox', tail: 'fox', nose: 'oval', mouth: 'w', marks: ['muzzleW'], fluff: 1, whisk: 1 },
    canhcut: { b: '#34446b', bl: '#ffffff', ears: 'none', tail: 'tri', beak: '#ffb02e', feet: '#ffb02e', arms: 'flipper', marks: ['pface'] },
    ho: { b: '#ff9a3c', bl: '#fff6ea', inn: '#ffc1a3', ears: 'round', tail: 'tiger', nose: 'tri', mouth: 'w', marks: ['stripes', 'muzzleW'], whisk: 1, fluff: 1 },
    rong: { b: '#43c59e', bl: '#ffe9a8', ears: 'horns', tail: 'dragon', nose: 'nostril', mouth: 'smile', marks: ['spikes', 'bellyband'], wingsFixed: 1 },
    kylan: { b: '#fbf7ff', bl: '#ffffff', inn: '#ffc8e4', ears: 'horse', tail: 'mane', nose: 'nostril', mouth: 'smile', marks: ['mane'], horn: 1 },
    phuong: { b: '#ff5a36', bl: '#ffd166', ears: 'crest', tail: 'flame', beak: '#ffc300', feet: '#ffb703', arms: 'wing', marks: ['blush'] }
  };
  const DYES = { hong: '#ffa6c9', bacha: '#8ee6c8', lavender: '#b9a3f5', nang: '#ffd84d', dao: '#ffb38a', bien: '#6cb8ff', khoi: '#9aa3b5', tuyet: '#f7f9ff', den: '#45435a',
    kim: '#e8b923', lua: '#ff6a2b', cauvong: '#c38bff', phale: '#a8e8ff', thienha: '#3b2a78' };
  const SPECIAL = { kim: 1, lua: 1, cauvong: 1, phale: 1, thienha: 1 };

  function palette(sp, col) {
    const S = SPECIES[sp] || SPECIES.meo, b = (col && DYES[col]) || S.b;
    return { b, l: lit(b, .5), d: drk(b, .22), o: drk(b, b === '#fbfbfd' || b === '#f4eff6' || b === '#f7f9ff' || b === '#fbf7ff' ? .55 : .48), bl: S.bl, inn: S.inn || lit(b, .35), dark: S.dark, special: SPECIAL[col] ? col : '' };
  }

  /* ---------- defs (gradient da, bóng, hiệu ứng đặc biệt) ---------- */
  function defs(u, P) {
    let skin;
    const anim = (dur, dx) => `<animateTransform attributeName="gradientTransform" type="translate" values="-${dx} 0;${dx} 0;-${dx} 0" dur="${dur}s" repeatCount="indefinite"/>`;
    if (P.special === 'kim') skin = `<linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="1">${anim(3, .5)}<stop offset="0" stop-color="#fff6c2"/><stop offset=".35" stop-color="#f7cd3b"/><stop offset=".55" stop-color="#fff2a6"/><stop offset=".75" stop-color="#d9a512"/><stop offset="1" stop-color="#fff0a0"/></linearGradient>`;
    else if (P.special === 'lua') skin = `<linearGradient id="${u}s" x1="0" y1="1" x2="0" y2="0"><animateTransform attributeName="gradientTransform" type="translate" values="0 .08;0 -.08;0 .08" dur="1.6s" repeatCount="indefinite"/><stop offset="0" stop-color="#d7263d"/><stop offset=".45" stop-color="#ff7b00"/><stop offset=".85" stop-color="#ffd23f"/><stop offset="1" stop-color="#fff3b0"/></linearGradient>`;
    else if (P.special === 'cauvong') skin = `<linearGradient id="${u}s" x1="0" y1="0" x2="1" y2=".4" spreadMethod="reflect">${anim(4, .6)}<stop offset="0" stop-color="#ff8fa3"/><stop offset=".2" stop-color="#ffc06e"/><stop offset=".4" stop-color="#fff06e"/><stop offset=".6" stop-color="#8ef0a8"/><stop offset=".8" stop-color="#7fc8ff"/><stop offset="1" stop-color="#c49bff"/></linearGradient>`;
    else if (P.special === 'phale') skin = `<linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="1">${anim(3.5, .4)}<stop offset="0" stop-color="#f2feff"/><stop offset=".4" stop-color="#a8ecff"/><stop offset=".6" stop-color="#e9e0ff"/><stop offset="1" stop-color="#8fd3ff"/></linearGradient>`;
    else if (P.special === 'thienha') skin = `<pattern id="${u}s" patternUnits="userSpaceOnUse" width="60" height="60"><rect width="60" height="60" fill="#2a1a5e"/><circle cx="12" cy="10" r="14" fill="#5b2a86" opacity=".7"/><circle cx="44" cy="40" r="18" fill="#1f3a93" opacity=".6"/><circle cx="8" cy="44" r="1.4" fill="#fff"/><circle cx="30" cy="18" r="1" fill="#fff"/><circle cx="50" cy="12" r="1.6" fill="#fff"><animate attributeName="opacity" values="1;.2;1" dur="2s" repeatCount="indefinite"/></circle><circle cx="40" cy="54" r="1" fill="#ffe9a8"/><circle cx="22" cy="34" r="1.2" fill="#fff"><animate attributeName="opacity" values=".3;1;.3" dur="2.6s" repeatCount="indefinite"/></circle></pattern>`;
    else skin = `<radialGradient id="${u}s" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="${P.l}"/><stop offset=".55" stop-color="${P.b}"/><stop offset="1" stop-color="${P.d}"/></radialGradient>`;
    return `<defs>${skin}<radialGradient id="${u}bl" cx=".45" cy=".35" r=".8"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${P.bl}"/></radialGradient>
<radialGradient id="${u}eye" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#5a4a8a"/><stop offset=".6" stop-color="#2a2142"/><stop offset="1" stop-color="#140f24"/></radialGradient>
<linearGradient id="${u}gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a3"/><stop offset=".5" stop-color="#ffcf33"/><stop offset="1" stop-color="#d99a00"/></linearGradient>
<radialGradient id="${u}glow"><stop offset="0" stop-color="#fff7b0" stop-opacity=".9"/><stop offset="1" stop-color="#ffd84d" stop-opacity="0"/></radialGradient></defs>`;
  }

  /* ---------- Bộ phận ---------- */
  const mirror = s => `${s}<g transform="scale(-1,1)">${s}</g>`;
  function ears(S, P, u, side) {    // side: 'L' hoặc 'R' (phải = lật gương)
    const sk = `url(#${u}s)`, o = P.o, ec = S.earC || null;
    const st = `stroke="${o}" stroke-width="3" stroke-linejoin="round"`;
    switch (S.ears) {
      case 'cat': return `<path d="M-48,-128 L-50,-174 L-12,-150Z" fill="${sk}" ${st}/><path d="M-42,-136 L-44,-163 L-22,-149Z" fill="${P.inn}"/>`;
      case 'fox': return `<path d="M-50,-122 L-58,-186 L-10,-150Z" fill="${sk}" ${st}/><path d="M-44,-132 L-50,-170 L-22,-148Z" fill="${P.inn}"/><path d="M-55,-165 L-58,-186 L-42,-174Z" fill="#3a2a2a"/>`;
      case 'dog': return '';
      case 'bunny': return `<g transform="rotate(-8 -24 -150)"><ellipse cx="-24" cy="-192" rx="13" ry="40" fill="${sk}" ${st}/><ellipse cx="-24" cy="-188" rx="6.5" ry="29" fill="${P.inn}"/></g>`;
      case 'round': return `<circle cx="-40" cy="-146" r="17" fill="${ec || sk}" ${st}/><circle cx="-40" cy="-146" r="9" fill="${ec ? '#55556a' : P.inn}"/>`;
      case 'horse': return `<path d="M-36,-138 L-44,-178 L-16,-150Z" fill="${sk}" ${st}/><path d="M-34,-144 L-39,-168 L-22,-150Z" fill="${P.inn}"/>`;
      case 'horns': return `<path d="M-28,-146 C-36,-168 -30,-186 -18,-194 C-22,-178 -16,-162 -12,-152Z" fill="url(#${u}gold)" stroke="#a87a10" stroke-width="2.5" stroke-linejoin="round"/><path d="M-52,-118 L-72,-130 L-60,-112 L-70,-104 L-52,-104Z" fill="${P.d}" ${st}/>`;
      default: return '';
    }
  }
  function earsFront(S, P, u) {     // tai rủ của cún, mào gà, mào phượng
    const o = P.o, ec = S.earC || P.d, st = `stroke="${o}" stroke-width="3" stroke-linejoin="round"`;
    if (S.ears === 'dog') return { L: `<path d="M-40,-148 C-66,-148 -78,-118 -70,-90 C-66,-76 -50,-80 -47,-96 C-44,-114 -38,-132 -40,-148Z" fill="${ec}" ${st}/>`, R: 1 };
    if (S.ears === 'tuft') return { C: `<path d="M-2,-154 C-10,-170 -6,-182 4,-184 C0,-174 2,-164 6,-156Z" fill="${P.b}" ${st}/><path d="M4,-156 C8,-172 18,-176 24,-170 C16,-168 12,-162 10,-154Z" fill="${P.d}" ${st}/>` };
    if (S.ears === 'crest') return { C: `<g><path d="M-6,-150 C-24,-172 -16,-196 -4,-206 C-8,-186 2,-170 2,-152Z" fill="#ffd166" ${st}/><path d="M0,-152 C4,-176 18,-190 30,-190 C20,-180 14,-166 10,-150Z" fill="#ff9e00" ${st}/><path d="M-12,-150 C-34,-160 -40,-178 -36,-190 C-30,-176 -20,-168 -8,-156Z" fill="#ff5a36" ${st}/></g>` };
    return {};
  }
  function tail(S, P, u) {
    const sk = `url(#${u}s)`, o = P.o, st = `stroke="${o}" stroke-width="3" stroke-linejoin="round"`;
    switch (S.tail) {
      case 'cat': return `<path d="M30,-26 C58,-26 66,-54 54,-74 C49,-82 56,-90 62,-84" fill="none" stroke="${o}" stroke-width="15" stroke-linecap="round"/><path d="M30,-26 C58,-26 66,-54 54,-74 C49,-82 56,-90 62,-84" fill="none" stroke="${P.b}" stroke-width="9" stroke-linecap="round"/><path d="M54,-74 C49,-82 56,-90 62,-84" fill="none" stroke="${P.d}" stroke-width="9" stroke-linecap="round"/>`;
      case 'tiger': return `<path d="M30,-26 C58,-26 66,-54 54,-74 C49,-82 56,-90 62,-84" fill="none" stroke="${o}" stroke-width="15" stroke-linecap="round"/><path d="M30,-26 C58,-26 66,-54 54,-74 C49,-82 56,-90 62,-84" fill="none" stroke="${P.b}" stroke-width="9" stroke-linecap="round"/><path d="M30,-26 C58,-26 66,-54 54,-74 C49,-82 56,-90 62,-84" fill="none" stroke="#2b2230" stroke-width="9" stroke-dasharray="5 9"/>`;
      case 'dog': return `<path d="M28,-30 C46,-34 54,-54 44,-66 C40,-58 36,-46 26,-42Z" fill="${sk}" ${st}/>`;
      case 'puff': return `<circle cx="38" cy="-22" r="12" fill="${S.limbs || sk}" ${st}/><circle cx="35" cy="-25" r="4" fill="#fff" opacity=".35"/>`;
      case 'fox': return `<path d="M26,-24 C60,-16 84,-48 74,-82 C68,-100 50,-94 52,-76 C54,-56 44,-40 26,-38Z" fill="${sk}" ${st}/><path d="M66,-90 C76,-84 78,-70 74,-62 C66,-66 56,-74 56,-84 C58,-92 62,-93 66,-90Z" fill="#fffaf2"/>`;
      case 'dragon': return `<path d="M26,-18 C60,-6 88,-20 98,-46 L106,-42 L100,-56 C90,-30 64,-20 28,-32Z" fill="${sk}" ${st}/><path d="M48,-20 l4,-10 l5,9 M66,-20 l5,-10 l4,10 M82,-28 l6,-9 l2,10" fill="${P.d}" stroke="${o}" stroke-width="2" stroke-linejoin="round"/>`;
      case 'mane': return `<path d="M28,-30 C56,-30 70,-56 62,-80" fill="none" stroke="#ff9ecf" stroke-width="10" stroke-linecap="round"/><path d="M30,-24 C62,-20 78,-44 74,-70" fill="none" stroke="#a5d8ff" stroke-width="9" stroke-linecap="round"/><path d="M30,-18 C64,-10 84,-30 84,-52" fill="none" stroke="#c3b1ff" stroke-width="8" stroke-linecap="round"/>`;
      case 'flame': return `<path d="M26,-30 C52,-40 70,-70 64,-104 C80,-84 84,-56 70,-36 C84,-40 94,-54 96,-70 C104,-44 88,-18 56,-18 C46,-18 34,-20 26,-24Z" fill="url(#${u}fl)" stroke="#c4320f" stroke-width="2.5" stroke-linejoin="round"/><linearGradient id="${u}fl" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ff3d2e"/><stop offset=".6" stop-color="#ff9e00"/><stop offset="1" stop-color="#ffe066"/></linearGradient>`;
      case 'feather': return `<path d="M28,-26 L48,-38 L42,-24 L52,-22 L30,-16Z" fill="${P.d}" ${st}/>`;
      case 'tri': return `<path d="M26,-14 L44,-10 L30,-4Z" fill="${P.d}" ${st}/>`;
      default: return '';
    }
  }
  function arm(S, P, u) {   // tay trái (nhìn từ người xem); tay phải = lật gương
    const sk = S.limbs || `url(#${u}s)`, o = P.o, st = `stroke="${o}" stroke-width="3" stroke-linejoin="round"`;
    if (S.arms === 'wing') return `<path d="M-30,-60 C-52,-58 -60,-38 -54,-24 C-48,-30 -44,-30 -40,-26 C-40,-34 -36,-36 -32,-34Z" fill="${P.d}" ${st}/>`;
    if (S.arms === 'flipper') return `<path d="M-32,-62 C-50,-56 -58,-34 -52,-18 C-44,-26 -38,-40 -32,-46Z" fill="${P.b}" ${st}/>`;
    return `<ellipse cx="-37" cy="-42" rx="10" ry="15" transform="rotate(24 -37 -42)" fill="${sk}" ${st}/>`;
  }
  const HEAD = 'M-54,-108 C-54,-142 -30,-158 0,-158 C30,-158 54,-142 54,-108 C54,-80 32,-64 0,-64 C-32,-64 -54,-80 -54,-108Z';
  const HEAD_FLUFF = 'M-54,-110 C-54,-142 -30,-158 0,-158 C30,-158 54,-142 54,-110 C55,-100 56,-96 62,-92 C56,-90 55,-88 56,-82 C46,-68 24,-64 0,-64 C-24,-64 -46,-68 -56,-82 C-55,-88 -56,-90 -62,-92 C-56,-96 -55,-100 -54,-110Z';
  const BODY = 'M-40,-34 C-42,-62 -22,-78 0,-78 C22,-78 42,-62 40,-34 C39,-12 22,-2 0,-2 C-22,-2 -39,-12 -40,-34Z';

  function marks(S, P, u, where) {
    const o = P.o, out = [];
    (S.marks || []).forEach(m => {
      if (where === 'head') {
        if (m === 'tabby') out.push(`<path d="M-8,-154 L-6,-138 M0,-157 L0,-140 M8,-154 L6,-138" stroke="${P.d}" stroke-width="4" stroke-linecap="round"/>`);
        if (m === 'stripes') out.push(`<path d="M-10,-156 L-6,-138 M0,-158 L0,-136 M10,-156 L6,-138 M-54,-112 L-40,-108 M-54,-100 L-42,-100 M54,-112 L40,-108 M54,-100 L42,-100" stroke="#2b2230" stroke-width="4.5" stroke-linecap="round"/>`);
        if (m === 'spot') out.push(`<ellipse cx="22" cy="-112" rx="17" ry="15" fill="${P.d}" opacity=".85"/>`);
        if (m === 'muzzle') out.push(`<ellipse cx="0" cy="-88" rx="20" ry="14" fill="${P.bl}"/>`);
        if (m === 'muzzleW') out.push(`<path d="M-46,-94 C-34,-70 -12,-66 0,-78 C12,-66 34,-70 46,-94 C30,-84 14,-90 0,-98 C-14,-90 -30,-84 -46,-94Z" fill="${P.bl}"/>`);
        if (m === 'panda') out.push(`<ellipse cx="-21" cy="-106" rx="15" ry="18" transform="rotate(28 -21 -106)" fill="${S.dark}"/><ellipse cx="21" cy="-106" rx="15" ry="18" transform="rotate(-28 21 -106)" fill="${S.dark}"/>`);
        if (m === 'pface') out.push(`<path d="M0,-80 C-30,-66 -50,-90 -44,-112 C-40,-132 -16,-138 0,-122 C16,-138 40,-132 44,-112 C50,-90 30,-66 0,-80Z" fill="#ffffff"/>`);
        if (m === 'spikes') out.push(`<path d="M-8,-157 L0,-176 L8,-157Z M-30,-150 L-30,-168 L-18,-155Z M30,-150 L30,-168 L18,-155Z" fill="${P.d}" stroke="${o}" stroke-width="2.5" stroke-linejoin="round"/>`);
        if (m === 'mane') out.push(`<path d="M-6,-158 C-30,-162 -52,-146 -56,-118 C-46,-132 -36,-136 -26,-134 C-38,-124 -42,-110 -40,-98 C-30,-118 -18,-128 -4,-132Z" fill="#ff9ecf" stroke="${drk('#ff9ecf', .35)}" stroke-width="2"/><path d="M-4,-158 C-20,-150 -28,-138 -26,-122 C-16,-136 -6,-140 6,-140Z" fill="#a5d8ff"/><path d="M6,-158 C-4,-152 -8,-144 -6,-136 C2,-146 10,-148 18,-148Z" fill="#c3b1ff"/>`);
        if (m === 'blush') out.push(`<path d="M-50,-100 l10,-4 M-50,-94 l10,-2 M50,-100 l-10,-4 M50,-94 l-10,-2" stroke="#ffd166" stroke-width="3" stroke-linecap="round"/>`);
      } else {
        if (m === 'stripes') out.push(`<path d="M-40,-48 L-28,-46 M-40,-34 L-30,-34 M40,-48 L28,-46 M40,-34 L30,-34" stroke="#2b2230" stroke-width="4.5" stroke-linecap="round"/>`);
        if (m === 'bellyband') out.push(`<path d="M-18,-48 Q0,-44 18,-48 M-20,-36 Q0,-32 20,-36 M-18,-24 Q0,-20 18,-24" stroke="${drk(P.bl, .2)}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`);
        if (m === 'panda') out.push(`<path d="M-40,-50 C-30,-74 30,-74 40,-50 C30,-58 -30,-58 -40,-50Z" fill="${S.dark}"/>`);
      }
    });
    return out.join('');
  }

  /* ---------- Mặt: biểu cảm ---------- */
  // expr: normal | happy | sleep | sad | dead | love | sick | wow | wink. mouth: auto | open | o | frown | wavy | smile
  function face(o, expr, mouthOverride) {
    const S = SPECIES[o.sp] || SPECIES.meo, u = o.uid, ink = '#2a2142';
    expr = expr || 'normal';
    const eye = x => {
      switch (expr) {
        case 'happy': return `<path d="M${x - 9},-104 Q${x},-117 ${x + 9},-104" stroke="${ink}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
        case 'sleep': return `<path d="M${x - 9},-108 Q${x},-100 ${x + 9},-108" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
        case 'dead': return `<path d="M${x - 7},-114 L${x + 7},-100 M${x + 7},-114 L${x - 7},-100" stroke="${ink}" stroke-width="4.5" stroke-linecap="round"/>`;
        case 'love': return `<path d="M${x},-98 C${x - 14},-108 ${x - 10},-120 ${x},-113 C${x + 10},-120 ${x + 14},-108 ${x},-98Z" fill="#ff4d6d" stroke="#c9184a" stroke-width="1.5"/>`;
        case 'wink': return x < 0 ? `<path d="M${x - 9},-104 Q${x},-117 ${x + 9},-104" stroke="${ink}" stroke-width="4.5" fill="none" stroke-linecap="round"/>` : null;
        default: return null;
      }
    };
    const round = (x, big) => `<g data-p="pupil"><ellipse cx="${x}" cy="-107" rx="${big ? 11 : 9.5}" ry="${big ? 13 : 12}" fill="url(#${u}eye)"/><circle cx="${x - 3.2}" cy="-112" r="${big ? 4.2 : 3.6}" fill="#fff"/><circle cx="${x + 3.2}" cy="-102" r="1.8" fill="#fff" opacity=".9"/></g>`;
    const eyeL = eye(-20) || round(-20, expr === 'wow'), eyeR = eye(20) || round(20, expr === 'wow');
    let lids = '';
    if (expr === 'sick') lids = `<path d="M-31,-110 Q-20,-122 -9,-110 L-9,-108 L-31,-108Z M9,-110 Q20,-122 31,-110 L31,-108 L9,-108Z" fill="${o.lidC || '#ccc'}"/><path d="M-31,-108 L-9,-108 M9,-108 L31,-108" stroke="${ink}" stroke-width="2.5" stroke-linecap="round"/>`;
    let brows = '';
    if (expr === 'sad' || expr === 'sick') brows = `<path d="M-28,-126 L-12,-122 M28,-126 L12,-122" stroke="${ink}" stroke-width="3" stroke-linecap="round" opacity=".7"/>`;
    let tear = expr === 'sad' ? `<path d="M-27,-97 C-30,-90 -31,-86 -27,-84 C-23,-86 -24,-90 -27,-97Z" fill="#7cc6ff" stroke="#3a8fd6" stroke-width="1"/>` : '';
    // mũi & miệng
    let nose = '', mouth = '';
    const m = mouthOverride || (expr === 'sad' || expr === 'sick' ? (expr === 'sick' ? 'wavy' : 'frown') : expr === 'wow' ? 'o' : expr === 'dead' ? 'flat' : expr === 'happy' || expr === 'love' ? 'open' : S.mouth || 'smile');
    if (S.beak) {
      const bc = S.beak, bd = drk(bc, .3);
      nose = (m === 'open' || m === 'o') ? `<path d="M-11,-96 L11,-96 L0,-88Z" fill="${bc}" stroke="${bd}" stroke-width="2" stroke-linejoin="round"/><path d="M-9,-86 L9,-86 L0,-78Z" fill="${drk(bc, .1)}" stroke="${bd}" stroke-width="2" stroke-linejoin="round"/><path d="M-8,-88 L8,-88 L0,-84Z" fill="#a31f34"/>`
        : `<path d="M-11,-97 Q0,-101 11,-97 L0,-82Z" fill="${bc}" stroke="${bd}" stroke-width="2" stroke-linejoin="round"/><path d="M-6,-96 Q0,-98 6,-96" stroke="#fff" stroke-width="1.5" opacity=".7" fill="none"/>`;
    } else {
      if (S.nose === 'tri') nose = `<path d="M-5,-97 L5,-97 L0,-91Z" fill="#ff7b9c" stroke="#d94a6e" stroke-width="2" stroke-linejoin="round"/>`;
      else if (S.nose === 'oval') nose = `<ellipse cx="0" cy="-95" rx="7" ry="5" fill="#2a2142"/><ellipse cx="-2" cy="-97" rx="2.4" ry="1.4" fill="#fff" opacity=".8"/>`;
      else if (S.nose === 'nostril') nose = `<circle cx="-5" cy="-95" r="1.8" fill="${drk(o.P.b, .55)}"/><circle cx="5" cy="-95" r="1.8" fill="${drk(o.P.b, .55)}"/>`;
      const mc = '#3a2342';
      if (m === 'w') mouth = `<path d="M-9,-88 Q-4.5,-82 0,-88 Q4.5,-82 9,-88" stroke="${mc}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
      else if (m === 'smile') mouth = `<path d="M-9,-88 Q0,-79 9,-88" stroke="${mc}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
      else if (m === 'open') mouth = `<path d="M-9,-89 Q0,-89 9,-89 Q8,-75 0,-75 Q-8,-75 -9,-89Z" fill="#8a1c3c" stroke="${mc}" stroke-width="2.4" stroke-linejoin="round"/><path d="M-5,-79 Q0,-84 5,-79 Q3,-76 0,-76 Q-3,-76 -5,-79Z" fill="#ff8fab"/>`;
      else if (m === 'chomp') mouth = `<ellipse cx="0" cy="-84" rx="8" ry="3" fill="#8a1c3c" stroke="${mc}" stroke-width="2.4"/>`;
      else if (m === 'o') mouth = `<ellipse cx="0" cy="-83" rx="4.5" ry="5.5" fill="#8a1c3c" stroke="${mc}" stroke-width="2.4"/>`;
      else if (m === 'frown') mouth = `<path d="M-8,-81 Q0,-89 8,-81" stroke="${mc}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
      else if (m === 'wavy') mouth = `<path d="M-10,-84 q2.5,-3 5,0 t5,0 t5,0 t5,0" stroke="${mc}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
      else if (m === 'flat') mouth = `<path d="M-7,-85 L7,-85" stroke="${mc}" stroke-width="2.8" stroke-linecap="round"/>`;
      if (S.teeth && (m === 'w' || m === 'smile')) mouth += `<rect x="-3.5" y="-87" width="7" height="6" rx="1.5" fill="#fff" stroke="${mc}" stroke-width="1.2"/>`;
    }
    const cheeks = expr === 'dead' ? '' : `<ellipse cx="-36" cy="-91" rx="9" ry="5.5" fill="#ff7096" opacity="${expr === 'love' || expr === 'happy' ? .6 : .38}"/><ellipse cx="36" cy="-91" rx="9" ry="5.5" fill="#ff7096" opacity="${expr === 'love' || expr === 'happy' ? .6 : .38}"/>`;
    const wh = S.whisk ? `<path d="M-30,-92 L-50,-96 M-30,-88 L-50,-86 M30,-92 L50,-96 M30,-88 L50,-86" stroke="${o.P.o}" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>` : '';
    return `${cheeks}${wh}<g data-p="eyes">${eyeL}${eyeR}</g>${lids}${brows}${tear}${nose}${mouth}`;
  }

  /* ---------- Phụ kiện ---------- */
  function hat(id, u) {
    switch (id) {
      case 'no': return `<g transform="translate(26 -150) rotate(18)"><path d="M0,0 C-20,-16 -26,4 -4,2 C-26,8 -18,26 0,4Z" fill="#ff5d8f" stroke="#c9184a" stroke-width="2"/><path d="M0,0 C20,-16 26,4 4,2 C26,8 18,26 0,4Z" fill="#ff5d8f" stroke="#c9184a" stroke-width="2"/><circle r="5" fill="#ff8fab" stroke="#c9184a" stroke-width="2"/></g>`;
      case 'muTiec': return `<g transform="translate(6 -150) rotate(10)"><path d="M-20,0 L0,-50 L20,0Z" fill="#7b5cff" stroke="#4b2fd1" stroke-width="2.5" stroke-linejoin="round"/><path d="M-13,-17 L13,-17 M-7,-33 L7,-33" stroke="#ffd84d" stroke-width="5"/><circle cx="0" cy="-52" r="7" fill="#ff5d8f" stroke="#c9184a" stroke-width="2"/><ellipse cx="0" cy="0" rx="21" ry="4" fill="#4b2fd1"/></g>`;
      case 'hoa': { let s = ''; const C = ['#ff8fab', '#ffd166', '#8ecae6', '#cdb4db', '#ff8fab', '#ffd166', '#8ecae6']; for (let i = 0; i < 7; i++) { const a = Math.PI * (1.12 + i * 0.127), x = Math.cos(a) * 50, y = -112 + Math.sin(a) * 46; s += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="6" cx="0" cy="-5" fill="${C[i]}"/><circle r="6" cx="5" cy="1" fill="${C[i]}"/><circle r="6" cx="-5" cy="1" fill="${C[i]}"/><circle r="6" cx="0" cy="4" fill="${C[i]}" opacity=".9"/><circle r="3.5" fill="#fff3b0"/></g>`; } return `<path d="M-50,-120 Q0,-178 50,-120" stroke="#5aa469" stroke-width="4" fill="none"/>` + s; }
      case 'muLen': return `<path d="M-48,-132 C-50,-182 50,-182 48,-132Z" fill="#4cc9f0" stroke="#277da1" stroke-width="3"/><path d="M-30,-170 L-30,-140 M-15,-176 L-15,-140 M0,-178 L0,-140 M15,-176 L15,-140 M30,-170 L30,-140" stroke="#3aa5d0" stroke-width="3"/><rect x="-52" y="-142" width="104" height="16" rx="8" fill="#f72585" stroke="#b5179e" stroke-width="3"/><circle cx="0" cy="-182" r="11" fill="#fff" stroke="#ccc" stroke-width="2"/>`;
      case 'muCao': return `<g transform="rotate(-8 0 -150)"><ellipse cx="0" cy="-148" rx="44" ry="9" fill="#222033" stroke="#000" stroke-width="2"/><rect x="-27" y="-200" width="54" height="52" rx="5" fill="#2d2b44" stroke="#000" stroke-width="2"/><rect x="-27" y="-162" width="54" height="10" fill="#e63946"/><rect x="-21" y="-196" width="8" height="30" rx="3" fill="#fff" opacity=".12"/></g>`;
      case 'muCaoBoi': return `<g transform="rotate(-6 0 -150)"><path d="M-60,-146 C-50,-136 50,-136 60,-146 C50,-156 30,-150 0,-150 C-30,-150 -50,-156 -60,-146Z" fill="#a0632e" stroke="#5e3511" stroke-width="2.5"/><path d="M-30,-148 C-34,-178 -18,-192 -4,-180 C0,-186 4,-186 8,-180 C22,-192 34,-178 30,-148Z" fill="#b97639" stroke="#5e3511" stroke-width="2.5"/><path d="M-30,-156 Q0,-150 30,-156" stroke="#5e3511" stroke-width="5" fill="none"/></g>`;
      case 'muTn': return `<g transform="rotate(-6 0 -150)"><path d="M-26,-150 L-26,-166 Q0,-176 26,-166 L26,-150 Q0,-142 -26,-150Z" fill="#22223b" stroke="#000" stroke-width="2"/><path d="M-50,-170 L0,-188 L50,-170 L0,-152Z" fill="#2b2d42" stroke="#000" stroke-width="2"/><path d="M0,-170 L34,-160 L34,-138" stroke="#ffd166" stroke-width="3" fill="none"/><circle cx="34" cy="-136" r="5" fill="#ffd166"/></g>`;
      case 'vuongMien': return `<g><path d="M-36,-146 L-40,-184 L-20,-164 L0,-192 L20,-164 L40,-184 L36,-146Z" fill="url(#${u}gold)" stroke="#b07d00" stroke-width="2.5" stroke-linejoin="round"/><circle cx="0" cy="-160" r="6" fill="#e63946" stroke="#9d0208" stroke-width="1.5"/><circle cx="-22" cy="-154" r="4" fill="#4cc9f0"/><circle cx="22" cy="-154" r="4" fill="#4cc9f0"/><circle cx="0" cy="-192" r="4" fill="#fff3b0"/></g>`;
      case 'haoQuang': return `<g data-p="halo"><ellipse cx="0" cy="-182" rx="36" ry="13" fill="url(#${u}glow)"/><ellipse cx="0" cy="-182" rx="30" ry="9" fill="none" stroke="#ffd84d" stroke-width="6"/><ellipse cx="0" cy="-182" rx="30" ry="9" fill="none" stroke="#fff7c2" stroke-width="2"/></g>`;
      default: return '';
    }
  }
  function glasses(id) {
    switch (id) {
      case 'kinhTron': return `<g fill="rgba(200,230,255,.25)" stroke="#3d2b1f" stroke-width="3.5"><circle cx="-20" cy="-107" r="15"/><circle cx="20" cy="-107" r="15"/></g><path d="M-5,-109 Q0,-113 5,-109 M-35,-108 L-52,-114 M35,-108 L52,-114" stroke="#3d2b1f" stroke-width="3" fill="none"/>`;
      case 'kinhRam': return `<path d="M-38,-117 L-4,-117 L-6,-102 Q-8,-94 -20,-94 Q-34,-94 -36,-104Z M38,-117 L4,-117 L6,-102 Q8,-94 20,-94 Q34,-94 36,-104Z" fill="#14121f" stroke="#000" stroke-width="2"/><path d="M-4,-115 L4,-115 M-38,-116 L-52,-120 M38,-116 L52,-120" stroke="#000" stroke-width="3"/><path d="M-30,-113 L-22,-104 M14,-113 L22,-104" stroke="#fff" stroke-width="2.5" opacity=".55" stroke-linecap="round"/>`;
      case 'kinhTim': { const h = x => `<path d="M${x},-94 C${x - 22},-108 ${x - 14},-126 ${x},-114 C${x + 14},-126 ${x + 22},-108 ${x},-94Z" fill="rgba(255,77,109,.75)" stroke="#c9184a" stroke-width="3"/>`; return h(-20) + h(20) + `<path d="M-6,-112 L6,-112 M-36,-112 L-52,-116 M36,-112 L52,-116" stroke="#c9184a" stroke-width="3"/>`; }
      case 'kinhSao': { const s = x => { let p = ''; for (let i = 0; i < 10; i++) { const r = i % 2 ? 7.5 : 17, a = -Math.PI / 2 + i * Math.PI / 5; p += (i ? 'L' : 'M') + (x + Math.cos(a) * r).toFixed(1) + ',' + (-107 + Math.sin(a) * r).toFixed(1); } return `<path d="${p}Z" fill="rgba(255,214,10,.8)" stroke="#e09f00" stroke-width="2.5" stroke-linejoin="round"/>`; }; return s(-20) + s(20) + `<path d="M-5,-109 L5,-109 M-36,-110 L-52,-114 M36,-110 L52,-114" stroke="#e09f00" stroke-width="3"/>`; }
      case 'kinhVr': return `<rect x="-44" y="-120" width="88" height="24" rx="12" fill="url(#vrg)" stroke="#2b2d42" stroke-width="2.5"/><defs><linearGradient id="vrg" x1="0" x2="1"><stop offset="0" stop-color="#4cc9f0"/><stop offset=".5" stop-color="#7209b7"/><stop offset="1" stop-color="#f72585"/></linearGradient></defs><path d="M-36,-114 L36,-114" stroke="#fff" stroke-width="2" opacity=".6"/><path d="M-44,-110 L-54,-112 M44,-110 L54,-112" stroke="#2b2d42" stroke-width="4"/>`;
      default: return '';
    }
  }
  function neck(id, u) {
    switch (id) {
      case 'noCo': return `<path d="M0,-70 L-18,-80 L-18,-60Z M0,-70 L18,-80 L18,-60Z" fill="#e63946" stroke="#9d0208" stroke-width="2.5" stroke-linejoin="round"/><circle cx="0" cy="-70" r="5" fill="#ff6b6b" stroke="#9d0208" stroke-width="2"/>`;
      case 'chuong': return `<path d="M-34,-74 Q0,-62 34,-74" stroke="#d62828" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="0" cy="-62" r="8" fill="url(#${u}gold)" stroke="#a87a10" stroke-width="2"/><path d="M-3,-60 L3,-60" stroke="#6b4b00" stroke-width="2"/>`;
      case 'khan': return `<path d="M-38,-78 Q0,-60 38,-78 L38,-68 Q0,-50 -38,-68Z" fill="#4361ee" stroke="#3a0ca3" stroke-width="2.5"/><path d="M18,-66 L30,-38 L18,-36 L12,-62Z" fill="#4361ee" stroke="#3a0ca3" stroke-width="2.5"/><path d="M-30,-72 Q0,-58 30,-72" stroke="#fff" stroke-width="3" stroke-dasharray="4 6" fill="none" opacity=".7"/>`;
      case 'huyChuong': return `<path d="M-14,-76 L-4,-50 M14,-76 L4,-50" stroke="#e63946" stroke-width="7"/><circle cx="0" cy="-44" r="11" fill="url(#${u}gold)" stroke="#a87a10" stroke-width="2.5"/><path d="M0,-50 L2,-45 L7,-45 L3,-42 L4,-37 L0,-40 L-4,-37 L-3,-42 L-7,-45 L-2,-45Z" fill="#fff3a3"/>`;
      case 'ngoc': { let s = ''; for (let i = 0; i <= 10; i++) { const t = i / 10, x = -34 + 68 * t, y = -74 + 18 * Math.sin(Math.PI * t); s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="#fbf8ff" stroke="#c9bfe0" stroke-width="1.2"/><circle cx="${(x - 1.4).toFixed(1)}" cy="${(y - 1.4).toFixed(1)}" r="1.4" fill="#fff"/>`; } return s + `<circle cx="0" cy="-50" r="7" fill="#ff8fab" stroke="#c9184a" stroke-width="1.5"/>`; }
      default: return '';
    }
  }
  function back(id, u) {   // vẽ SAU thân; cánh có nhóm data-p="wingL/wingR" để vỗ
    const w = (inner) => `<g data-p="wingL">${inner}</g><g transform="scale(-1,1)"><g data-p="wingR">${inner}</g></g>`;
    switch (id) {
      case 'balo': return `<rect x="-34" y="-74" width="68" height="58" rx="16" fill="#f4a261" stroke="#9c5b1f" stroke-width="3"/><rect x="-24" y="-42" width="48" height="20" rx="8" fill="#e76f51" stroke="#9c5b1f" stroke-width="2.5"/>`;
      case 'aoChoang': return `<path d="M-30,-72 C-58,-40 -62,-10 -54,0 L54,0 C62,-10 58,-40 30,-72Z" fill="#c1121f" stroke="#780000" stroke-width="3" stroke-linejoin="round"/><path d="M-40,-30 C-36,-16 -34,-6 -30,0 M0,-40 L0,0 M40,-30 C36,-16 34,-6 30,0" stroke="#780000" stroke-width="2" opacity=".5" fill="none"/>`;
      case 'canhBuom': return w(`<path d="M-20,-62 C-60,-110 -96,-84 -78,-56 C-96,-40 -76,-16 -48,-30 C-36,-36 -26,-48 -20,-56Z" fill="#ff99c8" stroke="#c9184a" stroke-width="2.5"/><circle cx="-62" cy="-74" r="9" fill="#ffd6ff" stroke="#c9184a" stroke-width="1.5"/><circle cx="-56" cy="-40" r="6" fill="#a9def9"/>`);
      case 'canhThienThan': return w(`<path d="M-24,-62 C-50,-100 -100,-106 -108,-80 C-96,-82 -90,-76 -96,-68 C-84,-70 -80,-62 -86,-54 C-72,-56 -68,-48 -72,-42 C-56,-44 -40,-48 -24,-52Z" fill="#ffffff" stroke="#b8c0d9" stroke-width="2.5" stroke-linejoin="round"/><path d="M-40,-66 C-60,-78 -80,-80 -94,-76 M-40,-58 C-58,-64 -72,-64 -82,-60" stroke="#d5dcf0" stroke-width="2" fill="none"/>`);
      case 'canhRong': return w(`<path d="M-22,-64 C-50,-112 -100,-110 -112,-82 L-96,-84 L-100,-66 L-84,-72 L-84,-52 L-68,-62 L-60,-44 C-48,-52 -32,-56 -22,-54Z" fill="#6a4c93" stroke="#3c096c" stroke-width="2.5" stroke-linejoin="round"/><path d="M-26,-60 L-96,-84 M-30,-58 L-84,-72 M-32,-56 L-68,-62" stroke="#9d4edd" stroke-width="2"/>`);
      case 'canhTien': return w(`<path d="M-20,-64 C-40,-130 -98,-124 -84,-80 C-74,-60 -42,-58 -20,-58Z" fill="rgba(168,232,255,.55)" stroke="#5ec8f2" stroke-width="2.5"/><path d="M-20,-56 C-50,-50 -86,-28 -66,-12 C-50,-2 -30,-26 -20,-50Z" fill="rgba(214,190,255,.55)" stroke="#a78bfa" stroke-width="2.5"/><circle cx="-62" cy="-96" r="3" fill="#fff"><animate attributeName="opacity" values="1;.2;1" dur="1.4s" repeatCount="indefinite"/></circle><circle cx="-52" cy="-24" r="2.5" fill="#fff"><animate attributeName="opacity" values=".2;1;.2" dur="1.8s" repeatCount="indefinite"/></circle>`);
      case 'dragonFixed': return w(`<path d="M-24,-62 C-44,-92 -70,-92 -76,-74 L-64,-76 L-64,-62 L-52,-66 L-48,-52 C-40,-56 -32,-58 -24,-56Z" fill="${u}" stroke="rgba(0,0,0,.35)" stroke-width="2.5" stroke-linejoin="round"/>`);
      default: return '';
    }
  }

  /* ---------- Con thú hoàn chỉnh ---------- */
  // o: {sp, col, eq:{hat,eyes,neck,back}, uid, expr, mouth, ghost}
  function pet(o) {
    const S = SPECIES[o.sp] || SPECIES.meo, P = palette(o.sp, o.col), u = o.uid || 'p', eq = o.eq || {};
    o.P = P; o.lidC = P.b;
    const sk = `url(#${u}s)`, ol = `stroke="${P.o}" stroke-width="3" stroke-linejoin="round"`;
    const ef = earsFront(S, P, u), eL = ears(S, P, u);
    const feetC = S.feet || S.limbs || P.d;
    const backAcc = (eq.back ? back(eq.back, u) : '') + (S.wingsFixed && !eq.back ? back('dragonFixed', P.d) : '');
    const shine = P.special === 'phale' ? ' opacity=".9"' : '';
    return `${defs(u, P)}<g data-p="all">
<g data-p="back">${backAcc}</g>
<g data-p="tail">${tail(S, P, u)}</g>
<g data-p="body">
  <ellipse cx="-20" cy="-6" rx="15" ry="9" fill="${feetC}" ${ol}/><ellipse cx="20" cy="-6" rx="15" ry="9" fill="${feetC}" ${ol}/>
  <path d="${BODY}" fill="${sk}" ${ol}${shine}/>
  <ellipse cx="0" cy="-32" rx="25" ry="23" fill="url(#${u}bl)"/>
  ${marks(S, P, u, 'body')}
  <g data-p="armL">${arm(S, P, u)}</g><g transform="scale(-1,1)"><g data-p="armR">${arm(S, P, u)}</g></g>
  <ellipse cx="-14" cy="-60" rx="10" ry="6" fill="#fff" opacity=".22" transform="rotate(-25 -14 -60)"/>
  <g data-p="neck">${neck(eq.neck, u)}</g>
</g>
<g data-p="head">
  <g data-p="earL">${eL}</g><g transform="scale(-1,1)"><g data-p="earR">${eL}</g></g>
  <path d="${S.fluff ? HEAD_FLUFF : HEAD}" fill="${sk}" ${ol}${shine}/>
  ${marks(S, P, u, 'head')}
  ${S.horn ? `<path d="M-7,-154 L0,-198 L7,-154Z" fill="url(#${u}gold)" stroke="#b07d00" stroke-width="2.5" stroke-linejoin="round"/><path d="M-5,-166 L5,-170 M-3,-178 L4,-181" stroke="#b07d00" stroke-width="2"/>` : ''}
  <ellipse cx="-22" cy="-140" rx="16" ry="8" fill="#fff" opacity=".28" transform="rotate(-22 -22 -140)"/>
  ${ef.L ? `<g data-p="flopL">${ef.L}</g><g transform="scale(-1,1)"><g data-p="flopR">${ef.L}</g></g>` : ''}${ef.C || ''}
  <g data-p="face">${face(o, o.expr || 'normal', o.mouth)}</g>
  <g data-p="glasses">${glasses(eq.eyes)}</g>
  <g data-p="hat">${hat(eq.hat, u)}</g>
</g>
<g data-p="fx"></g>
</g>`;
  }
  // SVG nhỏ độc lập (thẻ cửa hàng, album, bảng xếp hạng)
  function mini(o, size) {
    const u = 'm' + Math.random().toString(36).slice(2, 8);
    return `<svg viewBox="-80 -215 160 230" width="${size || 64}" height="${size || 64}" aria-hidden="true" focusable="false"><ellipse cx="0" cy="0" rx="44" ry="8" fill="rgba(0,0,0,.15)"/>${pet(Object.assign({}, o, { uid: u }))}</svg>`;
  }
  function egg(sp, uid) {
    const P = palette(sp, ''), u = uid || 'egg';
    return `<defs><radialGradient id="${u}e" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="${lit(P.b, .55)}"/><stop offset="1" stop-color="${P.b}"/></radialGradient></defs>
<g data-p="egg"><path d="M0,-118 C34,-118 52,-60 50,-36 C48,-8 26,4 0,4 C-26,4 -48,-8 -50,-36 C-52,-60 -34,-118 0,-118Z" fill="url(#${u}e)" stroke="${P.o}" stroke-width="3"/>
<circle cx="-20" cy="-64" r="9" fill="${P.b}" opacity=".7"/><circle cx="18" cy="-40" r="12" fill="${P.b}" opacity=".7"/><circle cx="10" cy="-88" r="6" fill="${P.b}" opacity=".7"/>
<path data-p="crack" d="M-40,-56 L-26,-66 L-14,-52 L0,-66 L12,-52 L26,-66 L40,-54" fill="none" stroke="${P.o}" stroke-width="3" stroke-linejoin="round" opacity="0"/>
<ellipse cx="-18" cy="-92" rx="10" ry="16" fill="#fff" opacity=".45" transform="rotate(-20 -18 -92)"/></g>`;
  }

  /* ---------- Phòng (khung 400×300, sàn từ y≈200) ---------- */
  function sky(tod) {
    if (tod === 'night') return ['#0b1d4d', '#2b3a7a', '#5b4b8a'];
    if (tod === 'dusk') return ['#ff9a8b', '#ffc39e', '#ffe3b3'];
    return ['#6ec6ff', '#a9ddff', '#e3f4ff'];
  }
  function stars(n, w, h, seed) { let s = '', x = seed || 7; const r = () => (x = (x * 9301 + 49297) % 233280) / 233280; for (let i = 0; i < n; i++) { const d = (1 + r() * 3).toFixed(1); s += `<circle cx="${(r() * w).toFixed(0)}" cy="${(r() * h).toFixed(0)}" r="${(r() * 1.3 + .4).toFixed(1)}" fill="#fff"><animate attributeName="opacity" values="1;.25;1" dur="${d}s" repeatCount="indefinite"/></circle>`; } return s; }
  function windowBox(x, y, w, h, tod) {
    const [a, b, c] = sky(tod);
    const sun = tod === 'night' ? `<circle cx="${x + w * .7}" cy="${y + h * .32}" r="12" fill="#fff6d5"/><circle cx="${x + w * .7 + 5}" cy="${y + h * .32 - 3}" r="10" fill="${a}"/>${stars(10, w, h * .8, 3).replace(/cx="(\d+)" cy="(\d+)"/g, (m, p, q) => `cx="${+p + x}" cy="${+q + y}"`)}` :
      tod === 'dusk' ? `<circle cx="${x + w * .5}" cy="${y + h * .8}" r="18" fill="#ff7b54" opacity=".9"/>` : `<circle cx="${x + w * .75}" cy="${y + h * .28}" r="11" fill="#fff3a3"/><ellipse cx="${x + w * .3}" cy="${y + h * .45}" rx="16" ry="6" fill="#fff" opacity=".9"><animate attributeName="cx" values="${x + w * .2};${x + w * .5};${x + w * .2}" dur="30s" repeatCount="indefinite"/></ellipse>`;
    return `<defs><linearGradient id="wsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".6" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient><clipPath id="wclip"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/></clipPath></defs>
<rect x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${h + 12}" rx="10" fill="#fff8ee" stroke="#c9a77c" stroke-width="3"/><g clip-path="url(#wclip)"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#wsky)"/>${sun}<path d="M${x},${y + h} q${w * .25},-24 ${w * .5},-10 t${w * .5},-6 V${y + h}Z" fill="#7cc576" opacity=".9"/></g>
<path d="M${x + w / 2},${y} V${y + h} M${x},${y + h / 2} H${x + w}" stroke="#fff8ee" stroke-width="5"/>`;
  }
  const ROOMS = {
    phong(tod) {
      return `<defs><linearGradient id="rw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe8d6"/><stop offset="1" stop-color="#ffd3b6"/></linearGradient><pattern id="rwp" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="14" cy="14" r="2.2" fill="#ffc09f"/><circle cx="0" cy="0" r="1.6" fill="#ffc09f"/><circle cx="28" cy="0" r="1.6" fill="#ffc09f"/><circle cx="0" cy="28" r="1.6" fill="#ffc09f"/><circle cx="28" cy="28" r="1.6" fill="#ffc09f"/></pattern>
<linearGradient id="rf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c98b55"/><stop offset="1" stop-color="#a86b3c"/></linearGradient></defs>
<rect width="400" height="300" fill="url(#rw)"/><rect width="400" height="196" fill="url(#rwp)" opacity=".8"/>
<rect y="168" width="400" height="30" fill="#f6bd9a"/><rect y="168" width="400" height="4" fill="#e9a27d"/>
${windowBox(150, 40, 100, 80, tod)}
<path d="M138,30 Q150,90 140,132 L132,132 Q138,80 128,30Z M262,30 Q250,90 260,132 L268,132 Q262,80 272,30Z" fill="#ff8fab" opacity=".9"/><rect x="124" y="26" width="152" height="7" rx="3" fill="#b07d4f"/>
<rect y="198" width="400" height="102" fill="url(#rf)"/>${[0, 1, 2, 3, 4].map(i => `<path d="M0,${210 + i * 20} H400" stroke="#9a5f33" stroke-width="1.5" opacity=".5"/>`).join('')}${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<path d="M${(i * 57 + (i % 2) * 25) % 400},${210 + (i % 5) * 20} v20" stroke="#9a5f33" stroke-width="1.5" opacity=".5"/>`).join('')}
<rect y="196" width="400" height="6" fill="#8a5530"/>`;
    },
    vuon(tod) {
      const [a, b, c] = sky(tod);
      let fl = ''; const C = ['#ff8fab', '#ffd166', '#cdb4db', '#ff595e', '#8ecae6']; for (let i = 0; i < 22; i++) { const x = (i * 71) % 400, y = 214 + (i * 37) % 80; fl += `<g transform="translate(${x} ${y})"><path d="M0,0 v10" stroke="#3a7d44" stroke-width="2"/><circle r="3.2" cx="0" cy="-3" fill="${C[i % 5]}"/><circle r="3.2" cx="3" cy="0" fill="${C[i % 5]}"/><circle r="3.2" cx="-3" cy="0" fill="${C[i % 5]}"/><circle r="3.2" cx="0" cy="3" fill="${C[i % 5]}"/><circle r="2" fill="#fff3b0"/></g>`; }
      return `<defs><linearGradient id="rs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".7" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd16f"/><stop offset="1" stop-color="#4f9d3a"/></linearGradient></defs>
<rect width="400" height="300" fill="url(#rs)"/>${tod === 'night' ? stars(40, 400, 150, 11) : `<circle cx="330" cy="50" r="24" fill="#fff3a3"/><circle cx="330" cy="50" r="34" fill="#fff3a3" opacity=".25"/>`}
<g fill="#fff" opacity=".9"><ellipse cx="80" cy="50" rx="30" ry="11"><animate attributeName="cx" values="60;110;60" dur="40s" repeatCount="indefinite"/></ellipse><ellipse cx="210" cy="72" rx="24" ry="9"><animate attributeName="cx" values="220;180;220" dur="34s" repeatCount="indefinite"/></ellipse></g>
<path d="M0,180 Q60,140 130,170 T260,160 T400,170 V210 H0Z" fill="#7fbf6a"/><path d="M0,190 Q90,160 200,186 T400,180 V215 H0Z" fill="#6aae55"/>
<g stroke="#b5835a" stroke-width="5"><path d="M0,192 H400"/>${[20, 70, 120, 170, 230, 280, 330, 380].map(x => `<path d="M${x},176 V206"/>`).join('')}</g>
<rect y="200" width="400" height="100" fill="url(#rg)"/>${fl}`;
    },
    bien(tod) {
      const [a, b, c] = sky(tod);
      return `<defs><linearGradient id="rs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${c}"/></linearGradient><linearGradient id="rsea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1fa6d9"/><stop offset="1" stop-color="#5fd3e8"/></linearGradient><linearGradient id="rsand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe3a8"/><stop offset="1" stop-color="#f3c77a"/></linearGradient></defs>
<rect width="400" height="300" fill="url(#rs)"/>${tod === 'night' ? stars(40, 400, 120, 5) + '<circle cx="80" cy="50" r="16" fill="#fff6d5"/>' : '<circle cx="80" cy="60" r="26" fill="#fff1a8"/><circle cx="80" cy="60" r="40" fill="#fff1a8" opacity=".25"/>'}
<rect y="130" width="400" height="80" fill="url(#rsea)"/>
<path d="M0,150 q20,-6 40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0" stroke="#fff" stroke-width="2.5" fill="none" opacity=".7"><animateTransform attributeName="transform" type="translate" values="0 0;-40 0;0 0" dur="6s" repeatCount="indefinite"/></path>
<path d="M0,178 q20,-6 40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0" stroke="#fff" stroke-width="2" fill="none" opacity=".5"><animateTransform attributeName="transform" type="translate" values="-40 0;0 0;-40 0" dur="5s" repeatCount="indefinite"/></path>
<path d="M0,204 Q100,190 200,202 T400,198 V300 H0Z" fill="url(#rsand)"/><path d="M0,204 Q100,190 200,202 T400,198" stroke="#fff" stroke-width="5" fill="none" opacity=".7"/>
<g transform="translate(352 210)"><path d="M0,0 C-4,-40 -2,-80 6,-110" stroke="#9c6b3c" stroke-width="10" fill="none" stroke-linecap="round"/><g fill="#3fa34d"><path d="M6,-110 C-20,-120 -44,-108 -50,-90 C-30,-104 -10,-104 6,-110Z"/><path d="M6,-110 C30,-124 54,-114 60,-96 C40,-106 22,-106 6,-110Z"/><path d="M6,-110 C0,-136 18,-150 34,-150 C20,-136 12,-124 6,-110Z"/><path d="M6,-110 C-6,-132 -28,-140 -40,-134 C-22,-130 -8,-120 6,-110Z"/></g></g>
<text x="40" y="262" font-size="18">🐚</text><text x="290" y="285" font-size="16">⭐</text>`;
    },
    rung(tod) {
      let tr = ''; for (let i = 0; i < 7; i++) { const x = i * 64 - 10, h = 90 + (i * 37) % 50; tr += `<path d="M${x},200 L${x + 30},${200 - h} L${x + 60},200Z" fill="${i % 2 ? '#1b4d3e' : '#14382d'}"/>`; }
      let ff = ''; for (let i = 0; i < 14; i++) ff += `<circle cx="${(i * 89) % 400}" cy="${60 + (i * 53) % 180}" r="2.2" fill="#fff59d"><animate attributeName="opacity" values="0;1;0" dur="${2 + i % 3}s" begin="${i * .3}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;${i % 2 ? 8 : -8} -10;0 0" dur="${4 + i % 4}s" repeatCount="indefinite"/></circle>`;
      const mush = (x, s, c) => `<g transform="translate(${x} 222) scale(${s})"><rect x="-5" y="-14" width="10" height="16" rx="4" fill="#f1e4d0"/><path d="M-18,-12 Q0,-34 18,-12Z" fill="${c}"/><circle cx="-6" cy="-20" r="2.5" fill="#fff"/><circle cx="6" cy="-17" r="2" fill="#fff"/><circle cx="0" cy="-16" r="18" fill="${c}" opacity=".18"/></g>`;
      return `<defs><linearGradient id="rs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tod === 'day' ? '#2f8f83' : '#102a43'}"/><stop offset="1" stop-color="${tod === 'day' ? '#a8e6cf' : '#245c63'}"/></linearGradient></defs>
<rect width="400" height="300" fill="url(#rs)"/>${tod !== 'day' ? stars(25, 400, 100, 9) : ''}
<g opacity=".35" fill="#fff"><path d="M120,0 L160,0 L230,200 L150,200Z"/><path d="M250,0 L270,0 L320,200 L270,200Z"/></g>${tr}
<rect y="198" width="400" height="102" fill="#2d6a4f"/><path d="M0,200 Q100,190 200,200 T400,198" stroke="#52b788" stroke-width="6" fill="none"/>
${mush(40, 1.3, '#ff6b9a')}${mush(80, .9, '#9b5de5')}${mush(360, 1.2, '#00bbf9')}${mush(320, .8, '#ff6b9a')}${ff}`;
    },
    tuyet(tod) {
      let sn = ''; for (let i = 0; i < 30; i++) sn += `<circle cx="${(i * 47) % 400}" cy="-10" r="${1.5 + i % 3}" fill="#fff" opacity=".9"><animateTransform attributeName="transform" type="translate" values="0 0;${i % 2 ? 20 : -20} 320" dur="${6 + i % 5}s" begin="-${i * .7}s" repeatCount="indefinite"/></circle>`;
      const pine = (x, s) => `<g transform="translate(${x} 205) scale(${s})"><rect x="-4" y="-10" width="8" height="12" fill="#6b4226"/><path d="M0,-80 L-26,-30 L-14,-30 L-32,-6 L32,-6 L14,-30 L26,-30Z" fill="#2a6f4e"/><path d="M0,-80 L-12,-56 Q0,-50 12,-56Z M-20,-30 Q0,-24 20,-30 L14,-36 Q0,-32 -14,-36Z" fill="#fff"/></g>`;
      return `<defs><linearGradient id="rs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tod === 'night' ? '#1b2a4e' : '#bde0fe'}"/><stop offset="1" stop-color="${tod === 'night' ? '#4a5a8a' : '#e8f4ff'}"/></linearGradient></defs>
<rect width="400" height="300" fill="url(#rs)"/>${tod === 'night' ? stars(30, 400, 120, 13) : ''}
<path d="M0,180 L70,90 L120,150 L190,70 L260,160 L320,100 L400,170 V210 H0Z" fill="#cfe3f7"/><path d="M70,90 L58,106 L78,104Z M190,70 L172,94 L204,92Z M320,100 L306,118 L332,116Z" fill="#fff"/>
<rect y="196" width="400" height="104" fill="#f4f9ff"/><path d="M0,198 Q100,186 200,198 T400,194" stroke="#dbe9f7" stroke-width="8" fill="none"/>
${pine(36, 1.2)}${pine(86, .8)}${pine(360, 1.1)}<g transform="translate(320 232)"><circle r="16" fill="#fff" stroke="#cfe0f0" stroke-width="2"/><circle cy="-24" r="11" fill="#fff" stroke="#cfe0f0" stroke-width="2"/><path d="M0,-24 l8,2 l-8,2Z" fill="#ff7b00"/><circle cx="-4" cy="-28" r="1.5" fill="#222"/><circle cx="4" cy="-28" r="1.5" fill="#222"/></g>${sn}`;
    },
    keo(tod) {
      const lolli = (x, y, c) => `<g transform="translate(${x} ${y})"><rect x="-2.5" y="0" width="5" height="70" fill="#fff" stroke="#eee"/><circle r="22" fill="${c}"/><path d="M0,0 m-14,0 a14,14 0 1,1 28,0 a10,10 0 1,1 -20,0 a6,6 0 1,1 12,0" stroke="#fff" stroke-width="4" fill="none"/></g>`;
      return `<defs><linearGradient id="rs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc8dd"/><stop offset="1" stop-color="#ffe5ec"/></linearGradient><pattern id="rch" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#8d5524"/><rect width="20" height="20" fill="#a0673a"/><rect x="20" y="20" width="20" height="20" fill="#a0673a"/></pattern></defs>
<rect width="400" height="300" fill="url(#rs)"/><g fill="#fff" opacity=".8"><circle cx="60" cy="40" r="14"/><circle cx="78" cy="36" r="18"/><circle cx="96" cy="42" r="12"/><circle cx="290" cy="60" r="12"/><circle cx="306" cy="54" r="16"/></g>
<path d="M0,170 Q50,120 100,170 Q150,110 200,170 Q250,120 300,170 Q350,110 400,170 V205 H0Z" fill="#ffafcc"/><path d="M0,170 Q50,150 100,170 Q150,145 200,170 Q250,150 300,170 Q350,145 400,170" stroke="#fff" stroke-width="6" fill="none"/>
${lolli(40, 120, '#ff595e')}${lolli(370, 110, '#8ac926')}${lolli(330, 140, '#1982c4')}
<g transform="translate(70 150)"><path d="M-6,0 C-6,-60 30,-60 30,-40" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M-6,0 C-6,-60 30,-60 30,-40" stroke="#e63946" stroke-width="10" fill="none" stroke-dasharray="8 8" stroke-linecap="round"/></g>
<rect y="200" width="400" height="100" fill="url(#rch)"/><path d="M0,200 q10,14 20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0 t20,0" fill="#fff0f6" stroke="#ffc8dd" stroke-width="2"/>`;
    },
    daiduong() {
      let bub = ''; for (let i = 0; i < 16; i++) bub += `<circle cx="${(i * 61) % 400}" cy="310" r="${2 + i % 4}" fill="none" stroke="#bdf2ff" stroke-width="1.5" opacity=".8"><animateTransform attributeName="transform" type="translate" values="0 0;${i % 2 ? 10 : -10} -330" dur="${5 + i % 5}s" begin="-${i * .6}s" repeatCount="indefinite"/></circle>`;
      const weed = (x, h, c) => `<path d="M${x},300 C${x - 12},${300 - h / 3} ${x + 12},${300 - h * 2 / 3} ${x},${300 - h}" stroke="${c}" stroke-width="7" fill="none" stroke-linecap="round"><animateTransform attributeName="transform" type="skewX" values="-4;4;-4" dur="${3 + h % 3}s" repeatCount="indefinite"/></path>`;
      return `<defs><linearGradient id="rs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0077b6"/><stop offset=".6" stop-color="#023e8a"/><stop offset="1" stop-color="#03045e"/></linearGradient></defs>
<rect width="400" height="300" fill="url(#rs)"/><g fill="#fff" opacity=".12"><path d="M100,0 L140,0 L200,300 L130,300Z"/><path d="M240,0 L260,0 L300,300 L260,300Z"/><path d="M20,0 L40,0 L60,300 L30,300Z"/></g>
<text x="60" y="80" font-size="22">🐠</text><text x="300" y="60" font-size="18">🐟</text><text x="250" y="130" font-size="26" opacity=".85">🐡</text>
<path d="M0,210 Q100,196 200,208 T400,204 V300 H0Z" fill="#e9c46a"/><path d="M0,210 Q100,196 200,208 T400,204" stroke="#f4dfa0" stroke-width="5" fill="none"/>
${weed(20, 120, '#2a9d8f')}${weed(40, 80, '#52b788')}${weed(370, 130, '#2a9d8f')}${weed(350, 90, '#95d5b2')}<text x="300" y="262" font-size="22">🪸</text><text x="70" y="270" font-size="18">🐚</text>${bub}`;
    },
    vutru() {
      const planet = `<g transform="translate(320 70)"><circle r="30" fill="url(#rpl)"/><ellipse rx="52" ry="11" fill="none" stroke="#ffd6a5" stroke-width="5" transform="rotate(-18)" opacity=".9"/><path d="M-50,8 A52,11 0 0,0 50,-8" transform="rotate(-18)" stroke="#ffd6a5" stroke-width="5" fill="none"/></g>`;
      return `<defs><radialGradient id="rs" cx=".3" cy=".3" r="1"><stop offset="0" stop-color="#3c1874"/><stop offset=".6" stop-color="#140c2e"/><stop offset="1" stop-color="#05030f"/></radialGradient><radialGradient id="rpl" cx=".35" cy=".35"><stop offset="0" stop-color="#ffb4a2"/><stop offset="1" stop-color="#b5179e"/></radialGradient><radialGradient id="rmoon" cx=".4" cy=".2" r="1"><stop offset="0" stop-color="#d9d9e8"/><stop offset="1" stop-color="#8d8da8"/></radialGradient></defs>
<rect width="400" height="300" fill="url(#rs)"/><ellipse cx="120" cy="90" rx="110" ry="40" fill="#7b2cbf" opacity=".25"/><ellipse cx="200" cy="60" rx="90" ry="26" fill="#4361ee" opacity=".2"/>${stars(70, 400, 200, 21)}${planet}
<g transform="translate(70 60)"><circle r="9" fill="#ffd166"/><circle r="16" fill="#ffd166" opacity=".2"/></g>
<g><text x="0" y="0" font-size="20" transform="translate(-30 40) rotate(30)">☄️<animateTransform attributeName="transform" type="translate" values="-40 30;440 160" dur="9s" repeatCount="indefinite"/></text></g>
<path d="M0,210 Q100,196 200,206 T400,200 V300 H0Z" fill="url(#rmoon)"/><g fill="#7a7a96" opacity=".6"><ellipse cx="60" cy="240" rx="22" ry="6"/><ellipse cx="300" cy="270" rx="30" ry="8"/><ellipse cx="200" cy="290" rx="16" ry="4"/></g>`;
    },
    laudai() {
      const pillar = x => `<g transform="translate(${x} 0)"><rect x="-14" y="30" width="28" height="172" fill="url(#rpil)"/><rect x="-20" y="26" width="40" height="10" rx="3" fill="#d4a017"/><rect x="-20" y="196" width="40" height="10" rx="3" fill="#d4a017"/></g>`;
      const banner = (x, c) => `<g transform="translate(${x} 36)"><path d="M-18,0 H18 V60 L0,48 L-18,60Z" fill="${c}" stroke="#d4a017" stroke-width="2"/><text x="0" y="32" font-size="18" text-anchor="middle">⚜️</text></g>`;
      return `<defs><linearGradient id="rs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a189a"/><stop offset="1" stop-color="#3c096c"/></linearGradient><pattern id="rst" width="40" height="24" patternUnits="userSpaceOnUse"><rect width="40" height="24" fill="none" stroke="#7b2cbf" stroke-width="1.5"/><path d="M20,0 V12 M0,12 H40" stroke="#7b2cbf" stroke-width="1.5"/></pattern><linearGradient id="rpil" x1="0" x2="1"><stop offset="0" stop-color="#e0c3fc"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#c8b6ff"/></linearGradient><linearGradient id="rcar" x1="0" x2="1"><stop offset="0" stop-color="#9d0208"/><stop offset=".5" stop-color="#d00000"/><stop offset="1" stop-color="#9d0208"/></linearGradient></defs>
<rect width="400" height="300" fill="url(#rs)"/><rect width="400" height="200" fill="url(#rst)" opacity=".7"/>
${pillar(40)}${pillar(360)}${banner(120, '#d00000')}${banner(280, '#0077b6')}
<g transform="translate(200 0)"><path d="M0,0 V30" stroke="#d4a017" stroke-width="2"/><path d="M-40,40 Q0,70 40,40 L30,36 Q0,56 -30,36Z" fill="#d4a017"/>${[-34, -17, 0, 17, 34].map(x => `<circle cx="${x}" cy="${x * x / 100 + 34}" r="3" fill="#fff59d"><animate attributeName="opacity" values="1;.4;1" dur="${1.5 + Math.abs(x) / 30}s" repeatCount="indefinite"/></circle>`).join('')}<circle cx="0" cy="44" r="40" fill="#fff59d" opacity=".12"/></g>
<rect y="200" width="400" height="100" fill="#4a1d6e"/><path d="M110,300 L160,200 H240 L290,300Z" fill="url(#rcar)"/><path d="M118,300 L164,206 H236 L282,300" stroke="#ffd166" stroke-width="3" fill="none"/>`;
    },
    may() {
      const cloud = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" fill="#fff"><ellipse cx="0" cy="0" rx="40" ry="16"/><circle cx="-18" cy="-10" r="16"/><circle cx="8" cy="-16" r="20"/><circle cx="28" cy="-6" r="13"/></g>`;
      return `<defs><linearGradient id="rs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cdb4db"/><stop offset=".5" stop-color="#ffc8dd"/><stop offset="1" stop-color="#ffe5ec"/></linearGradient></defs>
<rect width="400" height="300" fill="url(#rs)"/>
<g fill="none" stroke-width="9" opacity=".75">${['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'].map((c, i) => `<path d="M30,210 A170,170 0 0,1 370,210" transform="translate(0 ${i * 9}) scale(1 ${1 - i * .02})" stroke="${c}"/>`).join('')}</g>
<g transform="translate(200 96)"><rect x="-34" y="-50" width="68" height="100" rx="34" fill="none" stroke="#ffd166" stroke-width="5"/><path d="M0,-50 V50 M-34,0 H34" stroke="#ffd166" stroke-width="3"/><circle cy="-62" r="8" fill="#ffd166"/><circle cy="0" r="60" fill="#fff6d5" opacity=".25"/></g>
${cloud(60, 90, 1)}${cloud(330, 60, .8)}<g opacity=".9">${cloud(120, 40, .6)}</g>
<path d="M0,206 C40,184 80,214 120,198 C160,182 200,212 240,198 C280,184 320,212 360,196 C380,190 400,200 400,200 V300 H0Z" fill="#fff"/><path d="M0,236 C60,224 120,246 200,234 C280,222 340,244 400,232" stroke="#f1e6ff" stroke-width="10" fill="none"/>`;
    }
  };
  // id trong SVG phải duy nhất trên cả trang (ảnh thu nhỏ ở cửa hàng nằm chung tài liệu) → gắn tiền tố
  const uniq = (svg, p) => svg.replace(/id="([\w-]+)"/g, 'id="' + p + '$1"').replace(/url\(#([\w-]+)\)/g, 'url(#' + p + '$1)');
  function room(id, tod, pfx) { return uniq((ROOMS[id] || ROOMS.phong)(tod || 'day'), (pfx || 'r') + '-'); }

  /* ---------- Nội thất & thảm ---------- */
  const FURN_POS = { fl: [62, 268, 56], fr: [340, 268, 52], wl: [80, 112, 36], wr: [320, 112, 36], ce: [200, 30, 34] };
  const FURN_E = { caycanh: '🪴', gaubong: '🧸', sofa: '🛋️', cayThong: '🎄', ngua: '🎠', phunNuoc: '⛲', sach: '📚', quaTang: '🎁', beCa: '🐠', mayGame: '🕹️', piano: '🎹', langDen: '🏰', tranh: '🖼️', dongHo: '🕰️', cup: '🏆', co: '🎏', saoTuong: '🌟', cauVong: '🌈', bongBay: '🎈', den: '💡', disco: '🪩' };
  function furn(slot, id) {
    if (!id) return '';
    if (slot === 'rug') {
      if (id === 'thamTron') return `<ellipse cx="200" cy="270" rx="96" ry="20" fill="#90e0ef" stroke="#48cae4" stroke-width="4"/><ellipse cx="200" cy="270" rx="70" ry="13" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="6 6"/>`;
      if (id === 'thamSoc') return `<defs><pattern id="rugs" width="20" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#ffafcc"/><rect x="10" width="10" height="10" fill="#bde0fe"/></pattern></defs><rect x="100" y="252" width="200" height="38" rx="10" fill="url(#rugs)" stroke="#a2d2ff" stroke-width="3"/>`.replace(/rugs/g, 'rugs' + Math.random().toString(36).slice(2, 7));
      if (id === 'thamHoa') return `<ellipse cx="200" cy="270" rx="110" ry="24" fill="#9d0208" stroke="#ffd166" stroke-width="5"/><ellipse cx="200" cy="270" rx="86" ry="16" fill="none" stroke="#ffd166" stroke-width="2"/><path d="M200,256 L210,270 L200,284 L190,270Z" fill="#ffd166"/>`;
      return '';
    }
    const p = FURN_POS[slot], e = FURN_E[id]; if (!p || !e) return '';
    if (slot === 'ce') return `<g><path d="M${p[0]},0 V${p[1] - 14}" stroke="#888" stroke-width="1.5"/><text x="${p[0]}" y="${p[1] + p[2] * .35}" font-size="${p[2]}" text-anchor="middle" filter="url(#fsh)">${e}<animateTransform attributeName="transform" type="rotate" values="-4 ${p[0]} 0;4 ${p[0]} 0;-4 ${p[0]} 0" dur="4s" repeatCount="indefinite"/></text></g>`;
    return `<text x="${p[0]}" y="${p[1]}" font-size="${p[2]}" text-anchor="middle" filter="url(#fsh)">${e}</text>`;
  }

  window.PetArt = { pet, face, mini, egg, room, furn, palette, SPECIES, DYES, FURN_E, mix, lit, drk };
})();
