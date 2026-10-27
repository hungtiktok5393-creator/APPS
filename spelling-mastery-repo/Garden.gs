/* =====================================================================
 * Garden.gs – máy chủ game "Khu vườn" (Spelling Mastery)
 * Dán nguyên file này vào Apps Script (cùng dự án với Code.gs), rồi Deploy bản mới.
 * KHÔNG sửa Code.gs. Tiền tố gd... / GD_... để không đụng Code.gs và Games.gs.
 *
 * Nguyên tắc:
 *  - Điểm (balance) CHỈ ĐỂ CHI. Không có đường nào sinh điểm hay đổi Xu/Tinh hoa thành điểm.
 *  - Mọi quyết định (giá, thời gian, thưởng) nằm ở server; thời gian = Date.now() của server.
 *  - gardenAct: nguyên tử TOÀN LÔ – sai một thao tác thì KHÔNG áp dụng gì cả (kể cả điểm).
 *  - Giáo viên muốn giới hạn chi điểm vườn mỗi ngày: thêm dòng gardenDailySpendCap (số điểm/ngày/học sinh)
 *    trực tiếp trong sheet Config. Mặc định 0 = không giới hạn.
 * ===================================================================== */

const GD_STATE_VER = 2;          // phiên bản cấu trúc state (migration)
const GD_CATVER = 2;             // phiên bản danh mục (client cache theo số này)
const GD_SHEET = 'Garden';
const GD_HEADERS = ['code', 'state', 'v', 'updatedAt', 'lastReqId', 'lastResp', 'lvl', 'aes', 'sn', 'state2', 'state3', 'state4', 'rep'];
const GD_MAXN = 9e15;            // trần an toàn cho mọi số
const GD_RAW_MAX = 40000;        // state ≤ 40.000 ký tự → lưu thô; lớn hơn → gzip + base64, chia ≤ 4 ô
const GD_PART = 45000, GD_PARTS = 4;
const GD_CH = 8;                 // mảnh đất 8x8
const GD_COORD = 4000, GD_CCOORD = 500, GD_MAX_CHUNKS = 400;
const GD_MAX_OPS = 40, GD_MAX_CELLS_OP = 64, GD_MAX_CELLS_BATCH = 400;
const GD_MAX_FARM = 1500, GD_MAX_DECO = 1500, GD_MAX_INV_KIND = 600, GD_MAX_INV = 3000;
const GD_OFFLINE_H = 24;         // sản vật tích luỹ tối đa 24 giờ
const GD_LOG_MAX = 50;
const GD_CLIMATE = ['Xuân', 'Hạ', 'Thu', 'Đông'];

/* ---------------- Danh mục tĩnh ---------------- */
function gdC_(id, name, e, g, c, y, xp, lv, extra) { const o = { id: id, name: name, e: e, g: g, c: c, y: y, xp: xp, lv: lv }; if (extra) for (const k in extra) o[k] = extra[k]; return o; }
// g = giây lớn, c = giá hạt (Xu), y = sản lượng gốc (Xu), xp, lv = cấp vườn cần; b = cần công trình; cl = cần mùa khí hậu (0-3, nhà kính bỏ qua); sn = cần Mùa mới ≥
const GD_CROPS = [
  gdC_('caixanh', 'Cải xanh', '🥬', 60, 4, 7, 2, 1),
  gdC_('carot', 'Cà rốt', '🥕', 120, 8, 14, 3, 1),
  gdC_('hanh', 'Hành lá', '🧅', 180, 12, 22, 4, 2),
  gdC_('cachua', 'Cà chua', '🍅', 300, 20, 38, 6, 3),
  gdC_('ngo', 'Bắp ngô', '🌽', 480, 30, 58, 8, 4),
  gdC_('khoaitay', 'Khoai tây', '🥔', 600, 40, 78, 10, 5),
  gdC_('duaieo', 'Dưa leo', '🥒', 720, 55, 108, 13, 6),
  gdC_('ot', 'Ớt', '🌶️', 900, 75, 150, 17, 7),
  gdC_('dautay', 'Dâu tây', '🍓', 1200, 100, 205, 22, 8, { cl: 0 }),
  gdC_('dualuoi', 'Dưa hấu', '🍉', 1500, 140, 290, 28, 9, { cl: 1 }),
  gdC_('bingo', 'Bí ngô', '🎃', 1800, 190, 395, 35, 10, { cl: 2 }),
  gdC_('suplo', 'Súp lơ', '🥦', 2100, 250, 530, 44, 11, { cl: 3 }),
  gdC_('nho', 'Nho', '🍇', 2700, 340, 730, 56, 12, { b: 'gieng' }),
  gdC_('lua', 'Lúa', '🌾', 3000, 380, 810, 62, 13, { b: 'gieng' }),
  gdC_('caphe', 'Cà phê', '☕', 3600, 520, 1130, 80, 14, { b: 'nhakinh' }),
  gdC_('chuoi', 'Chuối', '🍌', 4200, 650, 1430, 98, 15, { b: 'nhakinh' }),
  gdC_('dua', 'Dứa', '🍍', 5400, 880, 1980, 130, 17, { b: 'nhakinh' }),
  gdC_('xoai', 'Xoài', '🥭', 6600, 1150, 2660, 165, 19, { b: 'nhakinh' }),
  gdC_('cam', 'Cam', '🍊', 7800, 1500, 3500, 205, 21),
  gdC_('dao', 'Đào', '🍑', 9000, 1900, 4500, 250, 23, { cl: 0 }),
  gdC_('huongduong', 'Hướng dương', '🌻', 10800, 2500, 6000, 310, 25),
  gdC_('nammoc', 'Nấm ngọc', '🍄', 12600, 3200, 7800, 380, 27, { b: 'nhakinh' }),
  gdC_('hoasen', 'Hoa sen vàng', '🪷', 14400, 4200, 10500, 480, 30, { b: 'gieng', sn: 1 }),
  gdC_('tramvang', 'Cây trầm vàng', '🌳', 14400, 6000, 15500, 650, 35, { b: 'nhakinh', sn: 1 }),
  gdC_('samtien', 'Sâm tiên', '🌿', 14400, 9000, 24000, 900, 40, { sn: 2 })
];
GD_CROPS.forEach(function (c, i) { c.i = i + 1; });
const GD_CROP_BY = {}; GD_CROPS.forEach(function (c) { GD_CROP_BY[c.id] = c; });

// p = giá điểm gốc, lv, ux = giá Xu nâng cấp gốc, r = Xu/giờ gốc (0 = tiện ích), pn/pe = sản vật
const GD_BLDS = [
  { id: 'gieng', name: 'Giếng nước', e: '🪣', p: 30, lv: 1, ux: 150, r: 0, d: 'Rút ngắn thời gian lớn của cây' },
  { id: 'chuongga', name: 'Chuồng gà', e: '🐔', p: 50, lv: 2, ux: 100, r: 30, pn: 'Trứng', pe: '🥚', d: 'Đẻ trứng theo thời gian' },
  { id: 'kho', name: 'Kho hạt giống', e: '🏚️', p: 60, lv: 3, ux: 250, r: 0, d: 'Giảm giá hạt giống' },
  { id: 'nhakinh', name: 'Nhà kính', e: '🏡', p: 120, lv: 5, ux: 500, r: 0, d: 'Trồng cây trái mùa, tăng sản lượng' },
  { id: 'tongong', name: 'Tổ ong', e: '🐝', p: 90, lv: 6, ux: 300, r: 80, pn: 'Mật ong', pe: '🍯', d: 'Ong làm mật' },
  { id: 'chuongbo', name: 'Chuồng bò', e: '🐄', p: 150, lv: 9, ux: 600, r: 200, pn: 'Sữa', pe: '🥛', d: 'Bò cho sữa' },
  { id: 'coixay', name: 'Cối xay', e: '🌬️', p: 220, lv: 12, ux: 1500, r: 420, pn: 'Bột mì', pe: '🌾', d: 'Xay bột' },
  { id: 'aoca', name: 'Ao cá', e: '🐟', p: 350, lv: 16, ux: 3000, r: 900, pn: 'Cá', pe: '🐟', d: 'Nuôi cá' },
  { id: 'lobanh', name: 'Lò bánh', e: '🥖', p: 600, lv: 22, ux: 7000, r: 2000, pn: 'Bánh mì', pe: '🥖', d: 'Nướng bánh' }
];
const GD_BLD_BY = {}; GD_BLDS.forEach(function (b) { GD_BLD_BY[b.id] = b; });

// nâng cấp vĩnh viễn (giữ qua Mùa mới) – mua bằng ĐIỂM, cấp không trần, hiệu ứng giảm dần: L/(L+k)
const GD_PERMS = [   // lmax = cấp tối đa (hiệu ứng đạt 100% tại lmax; từ 99% trở lên → garden_maxed, không trừ điểm)
  { id: 'spd', name: 'Phân bón siêu tốc', e: '⚡', base: 40, rate: 1.20, k: 25, lmax: 25, max: 0.50, d: 'Rút ngắn thời gian lớn (tối đa -50%)' },
  { id: 'yld', name: 'Hạt giống tinh tuyển', e: '🌾', base: 50, rate: 1.20, k: 30, lmax: 25, max: 1.50, d: 'Tăng sản lượng thu hoạch (tối đa +150%)' },
  { id: 'xp', name: 'Sách nhà nông', e: '📘', base: 40, rate: 1.20, k: 25, lmax: 25, max: 1.00, d: 'Tăng XP (tối đa +100%)' },
  { id: 'prd', name: 'Chăn nuôi hiện đại', e: '🐮', base: 55, rate: 1.20, k: 30, lmax: 25, max: 1.50, d: 'Tăng sản vật công trình (tối đa +150%)' },
  { id: 'sed', name: 'Thương lượng giá', e: '🤝', base: 35, rate: 1.20, k: 20, lmax: 25, max: 0.50, d: 'Giảm giá hạt giống (tối đa -50%)' },
  { id: 'aes', name: 'Mắt thẩm mỹ', e: '🎨', base: 60, rate: 1.20, k: 30, lmax: 25, max: 0.20, d: 'Tăng thưởng từ Điểm thẩm mỹ (tối đa +20% thêm)' },
  { id: 'dly', name: 'Quà quen thuộc', e: '🎁', base: 30, rate: 1.20, k: 20, lmax: 25, max: 1.00, d: 'Tăng quà đăng nhập hằng ngày (tối đa +100%)' },
  { id: 'bst', name: 'Thợ giỏi', e: '🛠️', base: 45, rate: 1.20, k: 20, lmax: 25, max: 0.50, d: 'Giảm giá tăng tốc bằng điểm (tối đa -50%)' }
];
const GD_PERM_BY = {}; GD_PERMS.forEach(function (p) { GD_PERM_BY[p.id] = p; });

// trang trí: 12 chủ đề × 13 mục = 156 mục cơ bản (bậc 0) + bộ sinh theo bậc vô hạn
const GD_THEMES = [
  { id: 'hoa', name: 'Hoa', e: '🌸', base: 8, items: [['Hoa cúc', '🌼'], ['Hoa hồng', '🌹'], ['Hoa tulip', '🌷'], ['Hoa anh đào', '🌸'], ['Hoa sen', '🪷'], ['Hoa hướng dương', '🌻'], ['Hoa dâm bụt', '🌺'], ['Hoa oải hương', '🪻'], ['Hoa lan', '💮'], ['Hoa cẩm tú cầu', '💠'], ['Hoa mai vàng', '🏵️'], ['Bó hoa dại', '💐'], ['Hoa súng', '🪷']] },
  { id: 'canh', name: 'Cây cảnh', e: '🌳', base: 12, items: [['Cây bonsai', '🌳'], ['Cây thông', '🌲'], ['Cây cọ', '🌴'], ['Cây tre', '🎋'], ['Xương rồng', '🌵'], ['Cây phong', '🍁'], ['Cây liễu', '🌿'], ['Cây ô liu', '🫒'], ['Cây đa', '🌳'], ['Cỏ lau', '🌾'], ['Cây trúc', '🎍'], ['Cây lá bạc', '🍃'], ['Cây cau', '🌴']] },
  { id: 'duong', name: 'Đường đi', e: '🛤️', base: 6, items: [['Lối gạch đỏ', '🧱'], ['Lối đá cuội', '🪨'], ['Cầu gỗ nhỏ', '🌉'], ['Bậc thềm đá', '🪜'], ['Lối sỏi trắng', '⚪'], ['Đường lát gỗ', '🟫'], ['Lối đá phiến', '⬜'], ['Cổng vòm', '🚪'], ['Lối mòn cỏ', '🟩'], ['Đường ray nhỏ', '🛤️'], ['Lối gạch men', '🔶'], ['Cầu đá cong', '🌉'], ['Bậc cầu thang', '🪜']] },
  { id: 'rao', name: 'Hàng rào', e: '🚧', base: 8, items: [['Rào gỗ', '🪵'], ['Rào tre', '🎍'], ['Rào sắt', '⛓️'], ['Rào đá', '🧱'], ['Rào hoa hồng', '🌹'], ['Rào dây thép', '🔗'], ['Rào trắng', '◻️'], ['Cổng gỗ', '🚪'], ['Rào lưới', '🕸️'], ['Rào cọc', '🚧'], ['Rào bụi', '🌿'], ['Rào đá cuội', '🪨'], ['Tường gạch', '🧱']] },
  { id: 'nuoc', name: 'Đồ nước', e: '💧', base: 25, items: [['Chậu nước', '🪣'], ['Hồ cá koi', '🐟'], ['Đài phun nước', '⛲'], ['Ao sen', '🪷'], ['Thác nhỏ', '💦'], ['Giếng cảnh', '🕳️'], ['Máng nước', '🚰'], ['Hồ bơi mini', '🏊'], ['Guồng nước', '⚙️'], ['Suối nhân tạo', '🌊'], ['Bể cá cảnh', '🐠'], ['Vòi tưới hoa', '🚿'], ['Cầu qua suối', '🌉']] },
  { id: 'den', name: 'Ánh sáng', e: '💡', base: 18, items: [['Đèn lồng', '🏮'], ['Đèn cột', '💡'], ['Dây đèn sao', '✨'], ['Đèn nến', '🕯️'], ['Đèn mặt trời', '☀️'], ['Đèn đá', '🪨'], ['Đèn bão', '🔦'], ['Đèn đom đóm', '🪲'], ['Đèn ngôi sao', '⭐'], ['Đèn trăng', '🌙'], ['Đèn pha lê', '🔮'], ['Đèn dầu', '🪔'], ['Cột đèn cổ', '🏮']] },
  { id: 'tuong', name: 'Tượng', e: '🗿', base: 40, items: [['Tượng gnome', '🧙'], ['Tượng đá', '🗿'], ['Tượng thiên thần', '👼'], ['Tượng rồng', '🐉'], ['Tượng sư tử', '🦁'], ['Tượng chim hạc', '🦢'], ['Tượng nai', '🦌'], ['Tượng chim công', '🦚'], ['Tượng mèo thần tài', '🐱'], ['Tượng nàng tiên', '🧚'], ['Tượng hiệp sĩ', '🛡️'], ['Tượng rùa', '🐢'], ['Tượng cá chép', '🐟']] },
  { id: 'nho', name: 'Công trình nhỏ', e: '🏠', base: 60, items: [['Nhà chòi', '🛖'], ['Chòi canh', '🗼'], ['Chong chóng gió', '🌬️'], ['Nhà gỗ nhỏ', '🏡'], ['Vọng lâu', '⛩️'], ['Lều trại', '⛺'], ['Tháp nước', '🗼'], ['Nhà kính mini', '🏠'], ['Đình làng', '🏯'], ['Quán trà', '☕'], ['Hầm rượu', '🍷'], ['Nhà nguyện nhỏ', '⛪'], ['Đài quan sát', '🔭']] },
  { id: 'nuoi', name: 'Vật nuôi', e: '🐾', base: 30, items: [['Gà con', '🐥'], ['Vịt', '🦆'], ['Thỏ', '🐇'], ['Cừu', '🐑'], ['Bò sữa', '🐄'], ['Heo hồng', '🐖'], ['Ngựa', '🐎'], ['Dê', '🐐'], ['Mèo vườn', '🐈'], ['Chó chăn cừu', '🐕'], ['Ngỗng', '🪿'], ['Công', '🦚'], ['Bướm', '🦋']] },
  { id: 'ghe', name: 'Đồ ngoài trời', e: '🪑', base: 20, items: [['Ghế đá', '🪑'], ['Ghế sofa vườn', '🛋️'], ['Xích đu', '🎠'], ['Võng', '🛏️'], ['Ô che nắng', '⛱️'], ['Bàn picnic', '🧺'], ['Lò nướng BBQ', '🍖'], ['Ghế dài', '🛋️'], ['Hòm thư', '📮'], ['Biển chỉ đường', '🪧'], ['Giá phơi đồ', '🧺'], ['Bếp lửa trại', '🔥'], ['Cột cờ', '🚩']] },
  { id: 'co', name: 'Cỏ và đá', e: '🪨', base: 5, items: [['Tảng đá', '🪨'], ['Thảm cỏ', '🟩'], ['Bụi cỏ', '🌿'], ['Nấm đỏ', '🍄'], ['Gốc cây', '🪵'], ['Đống lá khô', '🍂'], ['Rêu xanh', '🍀'], ['Cỏ ba lá', '🍀'], ['Hòn non bộ', '⛰️'], ['Đá tảng lớn', '🗻'], ['Khúc gỗ mục', '🪵'], ['Bụi dương xỉ', '🌿'], ['Mầm non', '🌱']] },
  { id: 'le', name: 'Lễ hội', e: '🎉', base: 35, items: [['Cờ hội', '🚩'], ['Dây đèn lồng', '🏮'], ['Cây thông Noel', '🎄'], ['Bóng bay', '🎈'], ['Pháo hoa', '🎆'], ['Đèn trung thu', '🏮'], ['Cổng Tết', '🧧'], ['Bánh sinh nhật', '🎂'], ['Hộp quà', '🎁'], ['Múa rồng', '🐲'], ['Kẹo ngọt', '🍬'], ['Cây chúc phúc', '🎋'], ['Hoa đăng', '🪔']] }
];
const GD_MATS = ['Đồng', 'Bạc', 'Vàng', 'Bạch kim', 'Ngọc lục bảo', 'Hồng ngọc', 'Lam ngọc', 'Pha lê', 'Thạch anh', 'Tinh thể'];
const GD_ADJS = ['Cổ điển', 'Huyền ảo', 'Hoàng gia', 'Thiên thần', 'Ánh trăng', 'Bình minh', 'Cầu vồng', 'Vĩnh cửu'];
const GD_TIER_COST = 2.6, GD_TIER_AES = 2.2, GD_TIER_MAX = 60;

const GD_DECOS = [];           // mục cơ bản (bậc 0)
const GD_DECO_BY = {};
GD_THEMES.forEach(function (th) {
  th.items.forEach(function (it, i) {
    const cost = Math.max(1, Math.round(th.base * Math.pow(1.16, i)));
    const d = { id: th.id + (i + 1), n: it[0], e: it[1], th: th.id, cost: cost, aes: Math.max(1, Math.round(Math.pow(cost, 0.62))) };
    GD_DECOS.push(d); GD_DECO_BY[d.id] = d;
  });
});

const GD_ACH = [   // thành tựu theo công thức: mục tiêu bậc k = round(base × mul^k); thưởng Xu = round(100 × 1.8^k); bậc chia hết cho 5 thêm 1 Tinh hoa
  { id: 'hv', name: 'Nông dân chăm chỉ', d: 'Thu hoạch cây', base: 25, mul: 2.4 },
  { id: 'pl', name: 'Gieo hạt', d: 'Trồng cây', base: 25, mul: 2.4 },
  { id: 'xe', name: 'Triệu phú Xu', d: 'Kiếm Xu vườn', base: 1000, mul: 3.2 },
  { id: 'co', name: 'Chủ trại', d: 'Thu sản vật', base: 10, mul: 2.4 },
  { id: 'ch', name: 'Mở mang bờ cõi', d: 'Mở mảnh đất', base: 3, mul: 1.9 },
  { id: 'de', name: 'Nghệ nhân', d: 'Đặt trang trí', base: 5, mul: 2.2 },
  { id: 'sn', name: 'Luân hồi', d: 'Sang Mùa mới', base: 1, mul: 2 },
  { id: 'bd', name: 'Thợ xây', d: 'Xây công trình', base: 2, mul: 1.8 }
];

// Danh vọng vườn: suy ra từ TỔNG ĐIỂM ĐÃ CHI trong vườn (st.s.ps). Mốc bậc l = ceil(156.25 × l²)  (≈ 0.08 × √điểm)
const GD_REP_MAX = 60, GD_REP_K = 156.25;
const GD_REP_TITLES = [[0, 'Tập sự'], [1, 'Nông dân'], [3, 'Chủ vườn'], [6, 'Điền chủ'], [10, 'Nghệ nhân vườn'], [15, 'Kiến trúc sư vườn'], [20, 'Đại điền chủ'], [30, 'Danh nhân'], [40, 'Huyền thoại'], [50, 'Thần Nông']];

// Kỳ quan: công trình lớn, mua bằng điểm. Anchor (x,y) = ô trên-trái, chiếm w×h ô. 5 giai đoạn, giá giai đoạn s = round(p × 1.8^(s-1)).
// rep = Danh vọng tối thiểu để xây. Lưu trong st.b[id] = { x, y, l: giai đoạn 1..5, ct } (cùng cấu trúc công trình thường).
const GD_WONDER_STAGES = 5, GD_WONDER_GROW = 1.8;
function gdW_(id, name, e, w, h, p, rep, d) { return { id: id, name: name, e: e, w: w, h: h, p: p, rep: rep, d: d }; }
const GD_WONDERS = [
  gdW_('wd_phun', 'Đài phun nước lớn', '⛲', 2, 2, 300, 2, 'Đài phun nước giữa vườn'),
  gdW_('wd_chua', 'Chùa một cột', '🛕', 2, 2, 500, 3, 'Ngôi chùa nhỏ giữa hồ sen'),
  gdW_('wd_cauvong', 'Cổng cầu vồng', '🌈', 3, 2, 900, 4, 'Cầu vồng bắc ngang vườn'),
  gdW_('wd_nhakinh', 'Nhà kính pha lê', '🔮', 3, 3, 1500, 6, 'Nhà kính trong suốt lấp lánh'),
  gdW_('wd_dongho', 'Tháp đồng hồ', '🕰️', 2, 3, 2400, 8, 'Tháp đồng hồ cổ điển'),
  gdW_('wd_thuongvien', 'Vườn thượng uyển', '🏯', 4, 3, 3800, 10, 'Khu vườn hoàng gia'),
  gdW_('wd_gio', 'Cối xay gió khổng lồ', '🌬️', 3, 3, 6000, 13, 'Cối xay gió cao vút'),
  gdW_('wd_khinhkhi', 'Khinh khí cầu vàng', '🎈', 2, 2, 9000, 16, 'Khinh khí cầu neo giữa vườn'),
  gdW_('wd_laudai', 'Lâu đài cổ tích', '🏰', 4, 4, 14000, 20, 'Lâu đài như trong truyện'),
  gdW_('wd_thienvan', 'Thiên văn đài', '🔭', 3, 3, 22000, 25, 'Ngắm sao mỗi đêm'),
  gdW_('wd_congtroi', 'Cổng trời pha lê', '⛩️', 4, 3, 33000, 30, 'Cổng trời lấp lánh'),
  gdW_('wd_thannong', 'Đền Thần Nông', '🏛️', 4, 4, 60000, 38, 'Ngôi đền của vị thần nông nghiệp')
];
const GD_WONDER_BY = {}; GD_WONDERS.forEach(function (w) { GD_WONDER_BY[w.id] = w; });
function gdWonderCost_(w, s) { return gdCap_(Math.round(w.p * Math.pow(GD_WONDER_GROW, s - 1))); }          // giá (gốc) để LÊN giai đoạn s
function gdWonderAes_(w, l) { if (l < 1) return 0; let c = 0; for (let s = 1; s <= l; s++) c += gdWonderCost_(w, s); return gdCap_(Math.round(1.6 * Math.pow(c, 0.68))); }

// Nền đất (áp cho cả vườn). p = giá điểm gốc; c1/c2 = màu gợi ý cho frontend
const GD_GROUNDS = [
  { id: 'gr_nau', name: 'Đất nâu', e: '🟫', p: 50, c1: '#8d6e4a', c2: '#7a5c3a' },
  { id: 'gr_non', name: 'Cỏ non', e: '🌱', p: 80, c1: '#9ccc65', c2: '#8bc34a' },
  { id: 'gr_cat', name: 'Cát vàng', e: '🏖️', p: 120, c1: '#e6d39a', c2: '#dcc88a' },
  { id: 'gr_soi', name: 'Sỏi trắng', e: '⚪', p: 180, c1: '#cfd8dc', c2: '#b0bec5' },
  { id: 'gr_bazan', name: 'Đất đỏ bazan', e: '🟥', p: 260, c1: '#b4553a', c2: '#a14a31' },
  { id: 'gr_lau', name: 'Đồng cỏ lau', e: '🌾', p: 380, c1: '#d7c97a', c2: '#c8b968' },
  { id: 'gr_phien', name: 'Đá phiến', e: '⬛', p: 550, c1: '#78909c', c2: '#607d8b' },
  { id: 'gr_thu', name: 'Lá thu vàng', e: '🍂', p: 800, c1: '#d9a441', c2: '#c4912f' },
  { id: 'gr_tuyet', name: 'Tuyết trắng', e: '❄️', p: 1100, c1: '#f1f6fa', c2: '#dfe9f0' },
  { id: 'gr_reu', name: 'Rêu xanh', e: '🍀', p: 1500, c1: '#4f8a4b', c2: '#437a40' },
  { id: 'gr_anhdao', name: 'Cánh hoa anh đào', e: '🌸', p: 2000, c1: '#f4c6d4', c2: '#eeb3c6' },
  { id: 'gr_bacthang', name: 'Ruộng bậc thang', e: '🌄', p: 2600, c1: '#7fb069', c2: '#6aa056' },
  { id: 'gr_gachco', name: 'Gạch cổ', e: '🧱', p: 3200, c1: '#b5651d', c2: '#a05a1a' },
  { id: 'gr_dung', name: 'Dung nham nguội', e: '🌋', p: 3900, c1: '#4a3b3b', c2: '#3b2e2e' },
  { id: 'gr_cauvong', name: 'Đồng cỏ cầu vồng', e: '🌈', p: 4500, c1: '#a5d6a7', c2: '#ce93d8' },
  { id: 'gr_ngan', name: 'Dải ngân hà', e: '🌌', p: 5000, c1: '#1a1f4d', c2: '#2d2a6e' }
];
const GD_GROUND_BY = {}; GD_GROUNDS.forEach(function (g) { GD_GROUND_BY[g.id] = g; });

/* ---------------- Tiện ích ---------------- */
function gdCap_(n) { n = Number(n); if (!isFinite(n)) return 0; return Math.max(0, Math.min(GD_MAXN, n)); }
function gdDay_(now) { return Math.floor((now + 7 * 3600000) / 86400000); }       // ngày theo giờ Việt Nam
function gdClimate_(day) { return Math.floor(day / 7) % 4; }                         // đổi mùa khí hậu mỗi 7 ngày
function gdPct_() { return clampInt_(cfgNum_('gardenCostPct', 100), 10, 500, 100); }
function gdPts_(base) { return Math.min(GD_MAXN, Math.max(1, Math.ceil(base * gdPct_() / 100))); }
function gdSat_(L, k) { return L / (L + k); }
function gdSh_() { return sheetT_(GD_SHEET, GD_HEADERS, [1, 2, 4, 5, 6, 10, 11, 12]); }
function gdErr_(c, m) { return apiError_('garden_' + c, m); }
function gdInt_(v, lim) {
  const n = (typeof v === 'number') ? v : (typeof v === 'string' && /^-?\d{1,7}$/.test(v) ? Number(v) : NaN);
  if (!isFinite(n) || Math.floor(n) !== n || Math.abs(n) > lim) throw gdErr_('bad_request', 'Số/toạ độ không hợp lệ.');
  return n;
}
function gdDepthOk_(v, d) {
  if (d < 0) return false;
  if (v && typeof v === 'object') { for (const k in v) { if (!gdDepthOk_(v[k], d - 1)) return false; } }
  return true;
}
function gdLevel_(xp) {
  xp = gdCap_(xp); let lv = 1, need = 60;
  while (xp >= need && lv < 999) { xp -= need; lv++; need = Math.round(60 * Math.pow(1.2, lv - 1)); }
  return { lv: lv, into: Math.round(xp), need: need };
}
function gdLvNeed_(lv) { return Math.round(60 * Math.pow(1.2, lv - 1)); }
function gdDecoGet_(id) {                // id: "hoa3" hoặc "hoa3~2" (bậc 2). Trả null nếu không tồn tại
  id = String(id || ''); if (!/^[a-z]+\d{1,2}(~\d{1,2})?$/.test(id)) return null;
  const p = id.split('~'), base = GD_DECO_BY[p[0]]; if (!base) return null;
  const t = p.length > 1 ? Number(p[1]) : 0; if (t < 0 || t > GD_TIER_MAX || (p.length > 1 && t < 1)) return null;
  if (!t) return { id: id, n: base.n, e: base.e, th: base.th, tier: 0, cost: base.cost, aes: base.aes };
  const mat = GD_MATS[(t - 1) % GD_MATS.length], adj = t > GD_MATS.length ? ' ' + GD_ADJS[(Math.floor((t - 1) / GD_MATS.length) - 1) % GD_ADJS.length] : '';
  return { id: id, n: base.n + ' ' + mat + adj, e: base.e, th: base.th, tier: t, cost: gdCap_(Math.round(base.cost * Math.pow(GD_TIER_COST, t))), aes: gdCap_(Math.round(base.aes * Math.pow(GD_TIER_AES, t))) };
}
function gdRepThr_(l) { return Math.ceil(GD_REP_K * l * l); }
function gdRepTitle_(lv) { let t = GD_REP_TITLES[0][1]; GD_REP_TITLES.forEach(function (r) { if (lv >= r[0]) t = r[1]; }); return t; }
function gdRep_(st, extra) {                 // Danh vọng từ tổng điểm đã chi (+ extra = điểm đang chi trong lô chưa ghi)
  const ps = gdCap_(gdCap_(st.s && st.s.ps) + gdCap_(extra));
  let lv = Math.min(GD_REP_MAX, Math.floor(Math.sqrt(ps / GD_REP_K)));
  while (lv < GD_REP_MAX && gdRepThr_(lv + 1) <= ps) lv++;
  while (lv > 0 && gdRepThr_(lv) > ps) lv--;
  return { lv: lv, cur: ps, base: lv ? gdRepThr_(lv) : 0, next: lv >= GD_REP_MAX ? null : gdRepThr_(lv + 1), title: gdRepTitle_(lv) };
}
function gdMaxTier_(st, extra) { return Math.min(GD_TIER_MAX, st.sn + Math.floor(gdLevel_(st.xp).lv / 20) + gdRep_(st, extra).lv); }
function gdAes_(st) {
  let a = 0; for (const k in st.d) { const d = gdDecoGet_(st.d[k]); if (d) a += d.aes; }
  for (const id in st.b) { const w = GD_WONDER_BY[id]; if (w) a += gdWonderAes_(w, st.b[id].l); }
  return gdCap_(a);
}
function gdBpos_(st) {                       // ô bị công trình chiếm (kỳ quan chiếm w×h)
  const bp = {};
  Object.keys(st.b).forEach(function (id) {
    const b = st.b[id], w = GD_WONDER_BY[id];
    if (w) { for (let dx = 0; dx < w.w; dx++) for (let dy = 0; dy < w.h; dy++) bp[(b.x + dx) + ',' + (b.y + dy)] = id; }
    else bp[b.x + ',' + b.y] = id;
  });
  return bp;
}
function gdPf_(p, L) {                       // tỉ lệ hiệu ứng nâng cấp vĩnh viễn: 0..1, đạt 1 tại lmax
  L = Number(L) || 0; if (L <= 0) return 0;
  const sat = function (l) { return l / (l + p.k); };
  return Math.min(1, sat(L) / sat(p.lmax));
}
function gdPermMaxed_(p, L) { return gdPf_(p, L) >= 0.99; }

function gdNew_(now) {
  const f = {}; [[2, 2], [3, 2], [4, 2], [2, 3], [3, 3], [4, 3]].forEach(function (p) { f[p[0] + ',' + p[1]] = 0; });
  return { ver: GD_STATE_VER, sn: 0, xu: 60, es: 0, xp: 0, ch: ['0,0'], f: f, b: {}, d: {}, iv: {}, up: {},
    q: { d: 0, l: [], p: {}, c: [] }, dl: { d: 0, s: 0 }, ac: {}, ds: { d: 0, s: 0 }, lg: [[now, 'Chào mừng đến Khu vườn của bạn!']], gr: '', go: [], wi: {},
    s: { hv: 0, pl: 0, co: 0, xe: 0, bd: 0, cb: 0, dp: 0, ps: 0, pr: 0, dd: 0 }, xs: 0, cr: now };
}
function gdMigrate_(st) {                 // thêm trường thiếu; đổi phiên bản khi danh mục/cấu trúc thay đổi
  const n = gdNew_(st.cr || Date.now());
  Object.keys(n).forEach(function (k) { if (st[k] === undefined) st[k] = n[k]; });
  Object.keys(n.s).forEach(function (k) { if (st.s[k] === undefined) st.s[k] = 0; });
  if (!st.q.p) st.q.p = {}; if (!st.q.c) st.q.c = []; if (!st.q.l) st.q.l = [];
  // v1 → v2: thêm nền đất (gr, go) & kho kỳ quan (wi) – đã được điền mặc định ở vòng lặp trên; chuẩn hoá kiểu dữ liệu
  if (typeof st.gr !== 'string' || (st.gr && !GD_GROUND_BY[st.gr])) st.gr = '';
  if (!Array.isArray(st.go)) st.go = [];
  if (!st.wi || typeof st.wi !== 'object' || Array.isArray(st.wi)) st.wi = {};
  st.ver = GD_STATE_VER;
  return st;
}

/* ---------------- Lưu / đọc Sheet ---------------- */
function gdPack_(st) {
  const js = JSON.stringify(st);
  if (js.length <= GD_RAW_MAX) return [js, '', '', ''];
  const b64 = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(js, 'application/octet-stream', 's.json')).getBytes());
  const n = Math.ceil(b64.length / GD_PART);
  if (n > GD_PARTS) throw gdErr_('full', 'Khu vườn quá lớn để lưu. Hãy gỡ bớt trang trí hoặc báo giáo viên.');
  const out = ['Z:' + b64.slice(0, GD_PART), '', '', ''];
  for (let i = 1; i < n; i++) out[i] = b64.slice(i * GD_PART, (i + 1) * GD_PART);
  return out;
}
function gdLoad_(sh, code) {
  const row = findRow_(sh, 1, code); if (!row) return null;
  const r = sh.getRange(row, 1, 1, 12).getValues()[0];
  let js = String(r[1] || '');
  if (js.slice(0, 2) === 'Z:') {
    const b64 = js.slice(2) + String(r[9] || '') + String(r[10] || '') + String(r[11] || '');
    js = Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip', 's.gz')).getDataAsString();
  }
  let st; try { st = JSON.parse(js); } catch (e) { throw gdErr_('corrupt', 'Dữ liệu vườn bị lỗi, hãy báo giáo viên.'); }
  return { row: row, code: code, st: gdMigrate_(st), raw: js, v: Number(r[2]) || 0, lastReqId: String(r[4] || ''), lastResp: String(r[5] || '') };
}
function gdRowArr_(code, st, v, now, rid, resp) {
  const p = gdPack_(st);
  return [code, p[0], v, new Date(now).toISOString(), rid, resp, gdLevel_(st.xp).lv, Math.round(gdAes_(st)), st.sn, p[1], p[2], p[3], gdRep_(st).lv];
}
function gdEnsureCols_(sh) { if (typeof sh.getMaxColumns === 'function' && sh.getMaxColumns() < 13) sh.insertColumnsAfter(sh.getMaxColumns(), 13 - sh.getMaxColumns()); }
function gdSave_(sh, L, st, v, now, rid, resp) { gdEnsureCols_(sh); sh.getRange(L.row, 1, 1, 13).setValues([gdRowArr_(L.code, st, v, now, rid, resp)]); }
function gdCreate_(sh, code, now) {
  const st = gdNew_(now);
  appendRows_(sh, [gdRowArr_(code, st, 1, now, '', '')]);
  return gdLoad_(sh, code);
}

/* ---------------- Hiệu ứng & công thức ---------------- */
function gdEff_(st) {
  const L = function (id) { return Number(st.up[id]) || 0; }, bl = function (id) { return st.b[id] ? st.b[id].l : 0; };
  const A = gdAes_(st), mult = 1 + 0.03 * st.es, pf = function (id) { return gdPf_(GD_PERM_BY[id], L(id)); };
  const aesBonus = (0.10 + 0.20 * pf('aes')) * A / (A + 400);
  return {
    A: A, mult: mult, aesBonus: aesBonus,
    speed: (1 - 0.35 * gdSat_(bl('gieng'), 15)) * (1 - 0.5 * pf('spd')),
    yield: (1 + 1.5 * pf('yld')) * (1 + 0.4 * gdSat_(bl('nhakinh'), 15)) * (1 + aesBonus) * mult,
    xp: 1 + 1.0 * pf('xp'),
    prod: (1 + 1.5 * pf('prd')) * (1 + aesBonus) * mult,
    seed: Math.max(0.25, (1 - 0.3 * gdSat_(bl('kho'), 15)) * (1 - 0.5 * pf('sed'))),
    boost: 1 - 0.5 * pf('bst'),
    daily: 1 + 1.0 * pf('dly')
  };
}
function gdPermCost_(id, L) { const v = Math.round(GD_PERM_BY[id].base * Math.pow(GD_PERM_BY[id].rate, L)); return isFinite(v) ? gdCap_(v) : GD_MAXN; }
function gdBldUpCost_(b, l) { return gdCap_(Math.round(b.ux * Math.pow(1.32, l))); }
const GD_CHUNK_BASE = 40, GD_CHUNK_GROW = 1.18;   // mềm hơn bản cũ (1.3): ~5.000 điểm → ~18 mảnh, ~30.000 điểm → ~30 mảnh
function gdChunkCost_(nOwned) { const v = Math.round(GD_CHUNK_BASE * Math.pow(GD_CHUNK_GROW, Math.max(0, nOwned - 1))); return isFinite(v) ? gdCap_(v) : GD_MAXN; }
function gdTillCost_(nFarm) { return gdCap_(Math.round(15 * Math.pow(1.05, nFarm))); }
function gdRate_(b, lvl, eff) { return b.r * (1 + 0.7 * (lvl - 1)) * eff.prod; }                       // Xu/giờ
function gdPending_(b, bs, now, eff) {
  const el = Math.max(0, Math.min(now - (bs.ct || now), GD_OFFLINE_H * 3600000));
  return Math.floor(gdRate_(b, bs.l, eff) * el / 3600000);
}
function gdPrestigeGain_(st) { return Math.floor(Math.sqrt(gdCap_(st.xs) / 1500)); }

/* ---------------- Nhiệm vụ ngày ---------------- */
function gdRng_(seed) {
  let a = seed >>> 0;
  return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gdGenQuests_(st, lv, day) {
  const rnd = gdRng_((day * 2654435761 + Math.floor(lv / 5) * 97 + 13) % 4294967296), lc = Math.min(lv, 200);
  const types = ['hv', 'pl', 'xe', 'hk'];
  if (Object.keys(st.b).some(function (id) { return GD_BLD_BY[id] && GD_BLD_BY[id].r > 0; })) types.push('co');
  for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), t = types[i]; types[i] = types[j]; types[j] = t; }
  const open = GD_CROPS.filter(function (c) { return c.lv <= lv && !c.b && !c.sn && c.cl === undefined; });
  return types.slice(0, 3).map(function (t, i) {
    let target, key = 0;
    if (t === 'hv' || t === 'pl') target = Math.round(8 + lv * 1.2);
    else if (t === 'xe') target = Math.round(150 * Math.pow(1.1, lc));
    else if (t === 'co') target = 2 + Math.floor(lv / 10);
    else { const c = open[Math.floor(rnd() * open.length)] || GD_CROPS[0]; key = c.i; target = Math.round(4 + lv * 0.5); }
    return [t, key, target, gdCap_(Math.round(60 * Math.pow(1.09, lc) * (1 + 0.25 * i))), gdCap_(Math.round(20 * Math.pow(1.06, lc))), i === 2 ? 1 + Math.floor(lv / 25) : 0];
  });
}
function gdQText_(q) {
  const t = q[0];
  if (t === 'hv') return 'Thu hoạch ' + q[2] + ' cây';
  if (t === 'pl') return 'Trồng ' + q[2] + ' cây';
  if (t === 'xe') return 'Kiếm ' + q[2] + ' Xu từ thu hoạch và sản vật';
  if (t === 'co') return 'Thu sản vật ' + q[2] + ' lần';
  const c = GD_CROPS[q[1] - 1]; return 'Thu hoạch ' + q[2] + ' ' + (c ? c.name : 'cây');
}
function gdQProg_(st, q) { return (q[0] === 'hk' ? (st.q.p.hk && st.q.p.hk[q[1]]) : st.q.p[q[0]]) || 0; }
function gdRoll_(st, day) {                    // sang ngày mới: sinh nhiệm vụ & xoá bộ đếm ngày
  if (st.q.d === day) return;
  st.q = { d: day, l: gdGenQuests_(st, gdLevel_(st.xp).lv, day), p: { hk: {} }, c: [] };
}
function gdQCount_(ctx, type, n, key) {
  const p = ctx.st.q.p;
  if (type === 'hk') { if (!p.hk) p.hk = {}; p.hk[key] = gdCap_((p.hk[key] || 0) + n); }
  else p[type] = gdCap_((p[type] || 0) + n);
}

/* ---------------- Ngữ cảnh một lô ---------------- */
function gdE_(ctx) { return ctx.eff || (ctx.eff = gdEff_(ctx.st)); }
function gdLog_(st, now, txt) { st.lg.push([now, String(txt).slice(0, 80)]); if (st.lg.length > GD_LOG_MAX) st.lg.splice(0, st.lg.length - GD_LOG_MAX); }
function gdPayXu_(st, n) {
  if (st.xu < n) throw gdErr_('not_enough_xu', 'Không đủ Xu vườn: cần ' + n + ', hiện có ' + Math.floor(st.xu) + '.');
  st.xu = gdCap_(st.xu - n);
}
function gdGain_(ctx, xu, xp, earned) {
  const st = ctx.st; xu = gdCap_(xu); xp = gdCap_(xp);
  st.xu = gdCap_(st.xu + xu); st.xp = gdCap_(st.xp + xp);
  if (earned) { st.xs = gdCap_(st.xs + xu); st.s.xe = gdCap_(st.s.xe + xu); gdQCount_(ctx, 'xe', xu); }
}
function gdSpend_(ctx, base, note) {          // chi ĐIỂM: kiểm giới hạn ngày + số dư; chỉ ghi nhận, trừ thật khi cả lô hợp lệ
  const real = gdPts_(base), total = ctx.spend + real;
  if (ctx.cap > 0 && ctx.spentToday + total > ctx.cap) throw gdErr_('daily_cap', 'Đã chạm giới hạn chi điểm Khu vườn hôm nay (đã chi ' + ctx.spentToday + '/' + ctx.cap + ' điểm).');
  if (total > ctx.balance) throw gdErr_('not_enough_points', 'Không đủ điểm: cần ' + total + ', bạn có ' + ctx.balance + '.');
  ctx.spend = total; ctx.notes.push(note); return real;
}
function gdKey_(ctx, x, y) {                  // ô phải nằm trong mảnh đất đã mở
  const k = Math.floor(x / GD_CH) + ',' + Math.floor(y / GD_CH);
  if (!ctx.chs[k]) throw gdErr_('bad_cell', 'Ô (' + x + ',' + y + ') chưa thuộc đất của bạn.');
  return x + ',' + y;
}
function gdOcc_(ctx, key) { return ctx.st.f[key] !== undefined || ctx.st.d[key] !== undefined || !!ctx.bpos[key]; }
function gdCells_(ctx, o) {
  const list = [];
  if (Array.isArray(o.cells)) {
    if (!o.cells.length || o.cells.length > GD_MAX_CELLS_OP) throw gdErr_('too_many_cells', 'Mỗi thao tác tối đa ' + GD_MAX_CELLS_OP + ' ô.');
    o.cells.forEach(function (c) { if (!Array.isArray(c) || c.length !== 2) throw gdErr_('bad_request', 'Danh sách ô không hợp lệ.'); list.push(gdKey_(ctx, gdInt_(c[0], GD_COORD), gdInt_(c[1], GD_COORD))); });
  } else list.push(gdKey_(ctx, gdInt_(o.x, GD_COORD), gdInt_(o.y, GD_COORD)));
  ctx.cells += list.length;
  if (ctx.cells > GD_MAX_CELLS_BATCH) throw gdErr_('too_many_cells', 'Quá nhiều ô trong một lần (tối đa ' + GD_MAX_CELLS_BATCH + ').');
  return list;
}
function gdSplit_(key) { const p = key.split(','); return [Number(p[0]), Number(p[1])]; }
function gdReqCrop_(ctx, c) {
  const st = ctx.st, lv = ctx.lv;
  if (lv < c.lv) throw gdErr_('locked', c.name + ' cần cấp vườn ' + c.lv + ' (bạn đang cấp ' + lv + ').');
  if (c.sn && st.sn < c.sn) throw gdErr_('locked', c.name + ' chỉ có từ Mùa mới thứ ' + c.sn + '.');
  if (c.b && !st.b[c.b]) throw gdErr_('locked', c.name + ' cần công trình ' + GD_BLD_BY[c.b].name + '.');
  if (c.cl !== undefined && c.cl !== ctx.cs && !st.b.nhakinh) throw gdErr_('locked', c.name + ' chỉ trồng vào mùa ' + GD_CLIMATE[c.cl] + ' (hoặc có Nhà kính).');
}
function gdHarvestKey_(ctx, key, strict) {
  const st = ctx.st, cur = st.f[key];
  if (!Array.isArray(cur)) { if (strict) throw gdErr_('no_crop', 'Ô ' + key + ' không có cây.'); return null; }
  if (cur[1] > ctx.now) { if (strict) throw gdErr_('not_ready', 'Cây ở ô ' + key + ' chưa chín (còn ' + Math.ceil((cur[1] - ctx.now) / 1000) + ' giây).'); return null; }
  const c = GD_CROPS[cur[0] - 1]; st.f[key] = 0;
  if (!c) return { xu: 0, xp: 0 };
  const e = gdE_(ctx);
  gdQCount_(ctx, 'hv', 1); gdQCount_(ctx, 'hk', 1, c.i); st.s.hv = gdCap_(st.s.hv + 1);
  return { xu: Math.max(1, Math.round(c.y * e.yield)), xp: Math.max(1, Math.round(c.xp * e.xp)) };
}
function gdSettle_(ctx, onlyId) {              // tự thu sản vật trước khi đổi tốc độ sản xuất (tránh lợi dụng)
  let xu = 0;
  Object.keys(ctx.st.b).forEach(function (id) {
    const bd = GD_BLD_BY[id], bs = ctx.st.b[id]; if (!bd || !bd.r || (onlyId && onlyId !== id)) return;
    xu += gdPending_(bd, bs, ctx.now, gdE_(ctx)); bs.ct = ctx.now;
  });
  if (xu > 0) gdGain_(ctx, xu, 0, true);
  return xu;
}

/* ---------------- Các thao tác ---------------- */
function gdOpPlant_(ctx, o) {
  const st = ctx.st, crop = GD_CROP_BY[String(o.k || '')];
  if (!crop) throw gdErr_('bad_request', 'Loại cây không tồn tại.');
  gdReqCrop_(ctx, crop);
  const keys = gdCells_(ctx, o), e = gdE_(ctx), price = Math.max(1, Math.round(crop.c * e.seed)), ms = Math.round(Math.max(5, crop.g * e.speed) * 1000);
  keys.forEach(function (key) {
    const cur = st.f[key];
    if (cur === undefined) throw gdErr_('bad_cell', 'Ô ' + key + ' chưa phải đất canh tác (hãy cuốc đất trước).');
    if (cur !== 0) throw gdErr_('cell_busy', 'Ô ' + key + ' đang có cây.');
    gdPayXu_(st, price); st.f[key] = [crop.i, ctx.now + ms];
  });
  st.s.pl = gdCap_(st.s.pl + keys.length); gdQCount_(ctx, 'pl', keys.length);
  gdLog_(st, ctx.now, 'Trồng ' + keys.length + ' ' + crop.name);
  return { n: keys.length, cost: keys.length * price, readyAt: ctx.now + ms };
}
function gdOpHarvest_(ctx, o) {
  const keys = gdCells_(ctx, o); let xu = 0, xp = 0;
  keys.forEach(function (k) { const r = gdHarvestKey_(ctx, k, true); xu += r.xu; xp += r.xp; });
  gdGain_(ctx, xu, xp, true); gdLog_(ctx.st, ctx.now, 'Thu hoạch ' + keys.length + ' cây (+' + xu + ' Xu)');
  return { n: keys.length, xu: xu, xp: xp };
}
function gdOpHarvestAll_(ctx) {
  let n = 0, xu = 0, xp = 0;
  Object.keys(ctx.st.f).forEach(function (k) { const r = gdHarvestKey_(ctx, k, false); if (r) { n++; xu += r.xu; xp += r.xp; } });
  gdGain_(ctx, xu, xp, true);
  if (n) gdLog_(ctx.st, ctx.now, 'Thu hoạch tất cả: ' + n + ' cây (+' + xu + ' Xu)');
  return { n: n, xu: xu, xp: xp };
}
function gdOpTill_(ctx, o) {
  const st = ctx.st, keys = gdCells_(ctx, o); let cost = 0;
  keys.forEach(function (k) {
    if (gdOcc_(ctx, k)) throw gdErr_('cell_busy', 'Ô ' + k + ' đang có vật khác.');
    if (Object.keys(st.f).length >= GD_MAX_FARM) throw gdErr_('limit', 'Đã đạt giới hạn ' + GD_MAX_FARM + ' ô đất canh tác.');
    const c = gdTillCost_(Object.keys(st.f).length); gdPayXu_(st, c); cost += c; st.f[k] = 0;
  });
  return { n: keys.length, cost: cost };
}
function gdOpBuyPlot_(ctx, o) {
  const st = ctx.st, cx = gdInt_(o.cx, GD_CCOORD), cy = gdInt_(o.cy, GD_CCOORD), key = cx + ',' + cy;
  if (ctx.chs[key]) throw gdErr_('already', 'Mảnh đất này đã là của bạn.');
  if (st.ch.length >= GD_MAX_CHUNKS) throw gdErr_('limit', 'Đã đạt giới hạn ' + GD_MAX_CHUNKS + ' mảnh đất.');
  if (!(ctx.chs[(cx + 1) + ',' + cy] || ctx.chs[(cx - 1) + ',' + cy] || ctx.chs[cx + ',' + (cy + 1)] || ctx.chs[cx + ',' + (cy - 1)])) throw gdErr_('bad_cell', 'Chỉ mở được mảnh đất liền kề đất đang có.');
  const cost = gdSpend_(ctx, gdChunkCost_(st.ch.length), 'buyPlot ' + key);
  st.ch.push(key); ctx.chs[key] = 1; st.s.cb = gdCap_(st.s.cb + 1);
  gdLog_(st, ctx.now, 'Mở mảnh đất (' + key + ')');
  return { chunk: key, cost: cost };
}
function gdOpBuild_(ctx, o) {
  if (GD_WONDER_BY[String(o.id || '')]) return gdWonderPlace_(ctx, o);
  const st = ctx.st, bd = GD_BLD_BY[String(o.id || '')];
  if (!bd) throw gdErr_('bad_request', 'Công trình không tồn tại.');
  if (st.b[bd.id]) throw gdErr_('already', bd.name + ' đã được xây.');
  if (ctx.lv < bd.lv) throw gdErr_('locked', bd.name + ' cần cấp vườn ' + bd.lv + '.');
  const x = gdInt_(o.x, GD_COORD), y = gdInt_(o.y, GD_COORD), key = gdKey_(ctx, x, y);
  if (gdOcc_(ctx, key)) throw gdErr_('cell_busy', 'Ô ' + key + ' đang có vật khác.');
  const cost = gdSpend_(ctx, bd.p, 'build ' + bd.id);
  st.b[bd.id] = { x: x, y: y, l: 1, ct: ctx.now }; ctx.bpos[key] = bd.id; st.s.bd = gdCap_(st.s.bd + 1); ctx.eff = null;
  gdLog_(st, ctx.now, 'Xây ' + bd.name);
  return { id: bd.id, cost: cost };
}
function gdOpUpgrade_(ctx, o) {
  const st = ctx.st, what = String(o.what || '');
  if (what === 'bld') {
    const bd = GD_BLD_BY[String(o.id || '')], bs = bd && st.b[bd.id];
    if (!bs) throw gdErr_('bad_request', 'Bạn chưa có công trình này.');
    if (bs.l >= 1e6) throw gdErr_('limit', 'Công trình đã ở cấp quá cao.');
    const settled = bd.r ? gdSettle_(ctx, bd.id) : 0, cost = gdBldUpCost_(bd, bs.l);
    gdPayXu_(st, cost); bs.l++; ctx.eff = null;
    gdLog_(st, ctx.now, bd.name + ' lên cấp ' + bs.l);
    return { id: bd.id, level: bs.l, cost: cost, settledXu: settled };
  }
  if (what === 'wonder') return gdWonderUp_(ctx, o);
  if (what === 'perm') {
    const p = GD_PERM_BY[String(o.id || '')];
    if (!p) throw gdErr_('bad_request', 'Nâng cấp không tồn tại.');
    const L = Number(st.up[p.id]) || 0;
    if (gdPermMaxed_(p, L)) throw gdErr_('maxed', p.name + ' đã đạt mức tối đa, không cần nâng thêm.');
    const cost = gdSpend_(ctx, gdPermCost_(p.id, L), 'upgrade ' + p.id + '→' + (L + 1));
    const settled = p.id === 'prd' ? gdSettle_(ctx) : 0;
    st.up[p.id] = L + 1; ctx.eff = null;
    gdLog_(st, ctx.now, p.name + ' cấp ' + (L + 1));
    return { id: p.id, level: L + 1, cost: cost, settledXu: settled };
  }
  throw gdErr_('bad_request', 'Loại nâng cấp không hợp lệ (bld, perm hoặc wonder).');
}
function gdOpDecorate_(ctx, o) {
  const st = ctx.st, act = String(o.act || '');
  if (act === 'place') {
    const d = gdDecoGet_(o.id); if (!d) throw gdErr_('bad_request', 'Mục trang trí không tồn tại.');
    const key = gdKey_(ctx, gdInt_(o.x, GD_COORD), gdInt_(o.y, GD_COORD));
    if (gdOcc_(ctx, key)) throw gdErr_('cell_busy', 'Ô ' + key + ' đang có vật khác.');
    if (Object.keys(st.d).length >= GD_MAX_DECO) throw gdErr_('limit', 'Đã đạt giới hạn ' + GD_MAX_DECO + ' trang trí.');
    let cost = 0;
    if ((st.iv[d.id] || 0) > 0) { st.iv[d.id]--; if (!st.iv[d.id]) delete st.iv[d.id]; }
    else {
      const mt = gdMaxTier_(st, ctx.spend);
      if (d.tier > mt) throw gdErr_('locked', 'Bậc ' + d.tier + ' chưa mở (đang mở đến bậc ' + mt + '; thêm bậc khi tăng Danh vọng vườn, lên cấp vườn hoặc sang Mùa mới).');
      cost = gdSpend_(ctx, d.cost, 'decorate ' + d.id);
    }
    st.d[key] = d.id; st.s.dp = gdCap_(st.s.dp + 1); ctx.eff = null;
    gdLog_(st, ctx.now, 'Đặt ' + d.n);
    return { act: act, id: d.id, cost: cost };
  }
  if (act === 'move') {
    const a = gdKey_(ctx, gdInt_(o.x, GD_COORD), gdInt_(o.y, GD_COORD)), b = gdKey_(ctx, gdInt_(o.nx, GD_COORD), gdInt_(o.ny, GD_COORD));
    if (st.d[a] === undefined) throw gdErr_('bad_cell', 'Ô ' + a + ' không có trang trí.');
    if (gdOcc_(ctx, b)) throw gdErr_('cell_busy', 'Ô ' + b + ' đang có vật khác.');
    st.d[b] = st.d[a]; delete st.d[a];
    return { act: act, id: st.d[b], cost: 0 };
  }
  if (act === 'remove') {
    const a = gdKey_(ctx, gdInt_(o.x, GD_COORD), gdInt_(o.y, GD_COORD)), id = st.d[a];
    if (id === undefined) throw gdErr_('bad_cell', 'Ô ' + a + ' không có trang trí.');
    if (!st.iv[id] && Object.keys(st.iv).length >= GD_MAX_INV_KIND) throw gdErr_('limit', 'Kho trang trí đã đầy.');
    let tot = 0; for (const k in st.iv) tot += st.iv[k];
    if (tot >= GD_MAX_INV) throw gdErr_('limit', 'Kho trang trí đã đầy.');
    delete st.d[a]; st.iv[id] = (st.iv[id] || 0) + 1; ctx.eff = null;
    return { act: act, id: id, cost: 0 };
  }
  throw gdErr_('bad_request', 'act phải là place, move hoặc remove.');
}
/* ---- Kỳ quan ---- */
function gdWonderCells_(ctx, w, x, y, ignoreId) {           // trả danh sách ô; ném lỗi nếu ngoài đất hoặc bị chiếm
  const keys = [];
  for (let dx = 0; dx < w.w; dx++) for (let dy = 0; dy < w.h; dy++) {
    const k = gdKey_(ctx, x + dx, y + dy);
    if ((ctx.st.f[k] !== undefined || ctx.st.d[k] !== undefined) || (ctx.bpos[k] && ctx.bpos[k] !== ignoreId)) throw gdErr_('cell_busy', 'Ô ' + k + ' đang có vật khác (' + w.name + ' cần ' + w.w + '×' + w.h + ' ô trống).');
    keys.push(k);
  }
  return keys;
}
function gdWonderPlace_(ctx, o) {                           // mua giai đoạn 1 (hoặc đặt lại từ kho sau Mùa mới, miễn phí)
  const st = ctx.st, w = GD_WONDER_BY[String(o.id || '')];
  if (!w) throw gdErr_('bad_request', 'Kỳ quan không tồn tại.');
  if (st.b[w.id]) throw gdErr_('already', w.name + ' đã được xây.');
  const x = gdInt_(o.x, GD_COORD), y = gdInt_(o.y, GD_COORD), inv = Number(st.wi[w.id]) || 0;
  if (!inv) { const r = gdRep_(st, ctx.spend); if (r.lv < w.rep) throw gdErr_('locked', w.name + ' cần Danh vọng vườn ' + w.rep + ' (bạn đang ' + r.lv + ').'); }
  const keys = gdWonderCells_(ctx, w, x, y, null);
  let cost = 0, l = inv;
  if (!inv) { cost = gdSpend_(ctx, gdWonderCost_(w, 1), 'wonder ' + w.id + '→1'); l = 1; st.s.bd = gdCap_(st.s.bd + 1); }
  else delete st.wi[w.id];
  st.b[w.id] = { x: x, y: y, l: l, ct: ctx.now }; keys.forEach(function (k) { ctx.bpos[k] = w.id; }); ctx.eff = null;
  gdLog_(st, ctx.now, (inv ? 'Đặt lại ' : 'Xây ') + w.name);
  return { id: w.id, level: l, cost: cost, fromStore: !!inv };
}
function gdWonderUp_(ctx, o) {                              // nâng giai đoạn l → l+1 bằng điểm
  const st = ctx.st, w = GD_WONDER_BY[String(o.id || '')], b = w && st.b[w.id];
  if (!w) throw gdErr_('bad_request', 'Kỳ quan không tồn tại.');
  if (!b) throw gdErr_('bad_request', 'Bạn chưa đặt ' + w.name + ' trong vườn.');
  if (b.l >= GD_WONDER_STAGES) throw gdErr_('maxed', w.name + ' đã đạt giai đoạn cuối.');
  const cost = gdSpend_(ctx, gdWonderCost_(w, b.l + 1), 'wonder ' + w.id + '→' + (b.l + 1));
  b.l++; ctx.eff = null; gdLog_(st, ctx.now, w.name + ' giai đoạn ' + b.l);
  return { id: w.id, level: b.l, cost: cost };
}
function gdOpWonder_(ctx, o) {                              // act: place | up | move | store
  const act = String(o.act || ''), st = ctx.st;
  if (act === 'place') return gdWonderPlace_(ctx, o);
  if (act === 'up') return gdWonderUp_(ctx, o);
  const w = GD_WONDER_BY[String(o.id || '')], b = w && st.b[w.id];
  if (!w) throw gdErr_('bad_request', 'Kỳ quan không tồn tại.');
  if (!b) throw gdErr_('bad_request', 'Bạn chưa đặt ' + w.name + ' trong vườn.');
  if (act === 'move') {
    const x = gdInt_(o.x, GD_COORD), y = gdInt_(o.y, GD_COORD), keys = gdWonderCells_(ctx, w, x, y, w.id);
    Object.keys(ctx.bpos).forEach(function (k) { if (ctx.bpos[k] === w.id) delete ctx.bpos[k]; });
    b.x = x; b.y = y; keys.forEach(function (k) { ctx.bpos[k] = w.id; });
    return { id: w.id, level: b.l, cost: 0 };
  }
  if (act === 'store') {
    st.wi[w.id] = b.l; delete st.b[w.id];
    Object.keys(ctx.bpos).forEach(function (k) { if (ctx.bpos[k] === w.id) delete ctx.bpos[k]; }); ctx.eff = null;
    return { id: w.id, level: b.l, cost: 0 };
  }
  throw gdErr_('bad_request', 'act phải là place, up, move hoặc store.');
}
/* ---- Nền đất ---- */
function gdOpGround_(ctx, o) {
  const st = ctx.st, id = String(o.id || '');
  if (id === 'default' || id === '') { st.gr = ''; return { id: 'default', cost: 0 }; }
  const g = GD_GROUND_BY[id]; if (!g) throw gdErr_('bad_request', 'Nền đất không tồn tại.');
  if (st.go.indexOf(id) >= 0) { st.gr = id; return { id: id, cost: 0, owned: true }; }
  if (st.go.length >= 60) throw gdErr_('limit', 'Quá nhiều nền đất.');
  const cost = gdSpend_(ctx, g.p, 'ground ' + id);
  st.go.push(id); st.gr = id; gdLog_(st, ctx.now, 'Đổi nền đất: ' + g.name);
  return { id: id, cost: cost, owned: true };
}
function gdOpCollect_(ctx, o) {
  const st = ctx.st; let ids;
  if (o.all === true) ids = Object.keys(st.b).filter(function (id) { return GD_BLD_BY[id] && GD_BLD_BY[id].r > 0; });
  else { const bd = GD_BLD_BY[String(o.id || '')]; if (!bd || !st.b[bd.id]) throw gdErr_('bad_request', 'Bạn chưa có công trình này.'); if (!bd.r) throw gdErr_('nothing', bd.name + ' không có sản vật.'); ids = [bd.id]; }
  let xu = 0; const items = [];
  ids.forEach(function (id) {
    const bd = GD_BLD_BY[id], bs = st.b[id], n = gdPending_(bd, bs, ctx.now, gdE_(ctx));
    if (n >= 1) { bs.ct = ctx.now; xu += n; items.push({ id: id, name: bd.pn, e: bd.pe, xu: n }); gdQCount_(ctx, 'co', 1); st.s.co = gdCap_(st.s.co + 1); }
  });
  if (!items.length) { if (o.all === true) return { xu: 0, items: [] }; throw gdErr_('nothing', 'Chưa có sản vật để thu.'); }
  gdGain_(ctx, xu, 0, true); gdLog_(st, ctx.now, 'Thu sản vật (+' + xu + ' Xu)');
  return { xu: xu, items: items };
}
function gdOpBoost_(ctx, o) {
  const key = gdKey_(ctx, gdInt_(o.x, GD_COORD), gdInt_(o.y, GD_COORD)), cur = ctx.st.f[key];
  if (!Array.isArray(cur)) throw gdErr_('no_crop', 'Ô ' + key + ' không có cây.');
  const remain = (cur[1] - ctx.now) / 1000;
  if (remain <= 0) throw gdErr_('nothing', 'Cây đã chín rồi, không cần tăng tốc.');
  const cost = gdSpend_(ctx, Math.max(1, Math.ceil(remain / 300 * gdE_(ctx).boost)), 'boost ' + key);
  cur[1] = ctx.now; gdLog_(ctx.st, ctx.now, 'Tăng tốc ô ' + key);
  return { cell: key, cost: cost };
}
function gdOpClaimQuest_(ctx, o) {
  const st = ctx.st, m = /^q([0-2])$/.exec(String(o.id || ''));
  if (!m) throw gdErr_('bad_request', 'Mã nhiệm vụ không hợp lệ (q0, q1, q2).');
  const q = st.q.l[Number(m[1])];
  if (!q) throw gdErr_('bad_request', 'Không có nhiệm vụ này.');
  if (st.q.c.indexOf(o.id) >= 0) throw gdErr_('already', 'Bạn đã nhận thưởng nhiệm vụ này rồi.');
  if (gdQProg_(st, q) < q[2]) throw gdErr_('not_done', 'Nhiệm vụ chưa hoàn thành (' + Math.floor(gdQProg_(st, q)) + '/' + q[2] + ').');
  st.q.c.push(o.id); gdGain_(ctx, q[3], q[4], false); st.es = gdCap_(st.es + q[5]); ctx.eff = null;
  gdLog_(st, ctx.now, 'Hoàn thành nhiệm vụ: ' + gdQText_(q));
  return { id: o.id, xu: q[3], xp: q[4], es: q[5] };
}
function gdOpClaimDaily_(ctx) {
  const st = ctx.st, day = ctx.day;
  if (st.dl.d === day) throw gdErr_('already', 'Hôm nay bạn đã nhận quà rồi, mai quay lại nhé.');
  const s = (st.dl.d === day - 1) ? st.dl.s + 1 : 1, e = gdE_(ctx);
  const xu = gdCap_(Math.round(50 * (1 + 0.12 * Math.pow(Math.min(s, 365), 0.9)) * e.daily * Math.max(1, ctx.lv / 3)));
  const es = (s % 7 === 0) ? 1 + Math.floor(s / 28) : 0;
  st.dl = { d: day, s: s }; st.s.dd = gdCap_(st.s.dd + 1);
  gdGain_(ctx, xu, 0, false); st.es = gdCap_(st.es + es); ctx.eff = null;
  gdLog_(st, ctx.now, 'Quà đăng nhập ngày ' + s + ' (+' + xu + ' Xu' + (es ? ', +' + es + ' Tinh hoa' : '') + ')');
  return { streak: s, xu: xu, es: es };
}
function gdOpPrestige_(ctx, o) {
  const st = ctx.st, gain = gdPrestigeGain_(st);
  if (o.confirm !== true) throw gdErr_('bad_request', 'Cần xác nhận (confirm: true) để sang Mùa mới.');
  if (ctx.lv < 10) throw gdErr_('locked', 'Cần cấp vườn 10 để sang Mùa mới (bạn đang cấp ' + ctx.lv + ').');
  if (gain < 1) throw gdErr_('locked', 'Cần kiếm thêm Xu trong mùa này (tối thiểu 1.500 Xu) để nhận được Tinh hoa.');
  const owned = []; Object.keys(st.d).forEach(function (k) { owned.push(st.d[k]); });
  Object.keys(st.iv).forEach(function (id) { for (let i = 0; i < st.iv[id]; i++) owned.push(id); });
  const K = 8 + 4 * (st.sn + 1);
  owned.sort(function (a, b) { return (gdDecoGet_(b) ? gdDecoGet_(b).aes : 0) - (gdDecoGet_(a) ? gdDecoGet_(a).aes : 0); });
  const keep = owned.slice(0, K), iv = {}; keep.forEach(function (id) { iv[id] = (iv[id] || 0) + 1; });
  const fresh = gdNew_(st.cr), wk = [];
  Object.keys(st.b).forEach(function (id) { if (GD_WONDER_BY[id]) { st.wi[id] = st.b[id].l; wk.push(id); } });   // kỳ quan (mua bằng điểm) không bao giờ mất: vào kho, đặt lại miễn phí
  st.sn += 1; st.es = gdCap_(st.es + gain); st.xu = 60 + 40 * st.sn; st.xs = 0;
  st.ch = fresh.ch; st.f = fresh.f; st.b = {}; st.d = {}; st.iv = iv; st.s.pr = gdCap_(st.s.pr + 1);
  ctx.chs = { '0,0': 1 }; ctx.bpos = {}; ctx.eff = null;
  gdLog_(st, ctx.now, 'Sang Mùa ' + (st.sn + 1) + ' (+' + gain + ' Tinh hoa)');
  return { season: st.sn + 1, es: gain, keptDecos: keep.length, lostDecos: owned.length - keep.length, keptWonders: wk.length };
}
const GD_OPS = { plant: gdOpPlant_, harvest: gdOpHarvest_, harvestAll: gdOpHarvestAll_, till: gdOpTill_, buyPlot: gdOpBuyPlot_, build: gdOpBuild_, upgrade: gdOpUpgrade_, decorate: gdOpDecorate_, collect: gdOpCollect_, boost: gdOpBoost_, claimQuest: gdOpClaimQuest_, claimDaily: gdOpClaimDaily_, prestige: gdOpPrestige_, wonder: gdOpWonder_, ground: gdOpGround_ };

/* ---------------- Thành tựu & cấp độ ---------------- */
function gdStat_(st, id) { switch (id) { case 'ch': return st.s.cb; case 'de': return st.s.dp; case 'sn': return st.sn; default: return st.s[id] || 0; } }
function gdAchTarget_(a, k) { return gdCap_(Math.round(a.base * Math.pow(a.mul, k))); }
function gdAch_(ctx) {
  const st = ctx.st, got = [];
  GD_ACH.forEach(function (a) {
    let k = st.ac[a.id] || 0, guard = 0;
    while (guard++ < 60 && gdStat_(st, a.id) >= gdAchTarget_(a, k)) {
      const xu = gdCap_(Math.round(100 * Math.pow(1.8, k))), es = ((k + 1) % 5 === 0) ? 1 : 0;
      gdGain_(ctx, xu, 0, false); st.es = gdCap_(st.es + es); k++; got.push({ id: a.id, name: a.name, tier: k, xu: xu, es: es });
      gdLog_(st, ctx.now, 'Thành tựu ' + a.name + ' bậc ' + k);
    }
    st.ac[a.id] = k;
  });
  return got;
}
function gdLevelUps_(ctx, before) {
  const st = ctx.st, after = gdLevel_(st.xp).lv, ups = [];
  for (let l = before + 1; l <= after; l++) { gdGain_(ctx, 30 * l, 0, false); ups.push(l); }
  if (ups.length) gdLog_(st, ctx.now, 'Lên cấp vườn ' + after);
  return ups;
}

/* ---------------- Dữ liệu suy ra cho client ---------------- */
function gdDerived_(st, now, balance) {
  const e = gdEff_(st), li = gdLevel_(st.xp), day = gdDay_(now), cs = gdClimate_(day), pct = gdPct_(), cap = cfgNum_('gardenDailySpendCap', 0);
  const chs = {}; st.ch.forEach(function (k) { chs[k] = 1; });
  let ready = 0, growing = 0; for (const k in st.f) { const c = st.f[k]; if (Array.isArray(c)) { if (c[1] <= now) ready++; else growing++; } }
  const today = st.q.d === day, ql = today ? st.q.l : gdGenQuests_(st, li.lv, day);
  const bld = {}; Object.keys(st.b).forEach(function (id) {
    const bd = GD_BLD_BY[id], bs = st.b[id]; if (!bd) return;
    bld[id] = { l: bs.l, x: bs.x, y: bs.y, upCost: gdBldUpCost_(bd, bs.l), rateH: bd.r ? Math.round(gdRate_(bd, bs.l, e) * 100) / 100 : 0, pending: bd.r ? gdPending_(bd, bs, now, e) : 0, full: bd.r ? (now - bs.ct >= GD_OFFLINE_H * 3600000) : false };
  });
  const frontier = {}; st.ch.forEach(function (k) { const p = gdSplit_(k); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { const n = (p[0] + d[0]) + ',' + (p[1] + d[1]); if (!chs[n] && Math.abs(p[0] + d[0]) <= GD_CCOORD && Math.abs(p[1] + d[1]) <= GD_CCOORD) frontier[n] = 1; }); });
  const perms = {}; GD_PERMS.forEach(function (p) { const L = Number(st.up[p.id]) || 0; const mx = gdPermMaxed_(p, L); perms[p.id] = { l: L, lmax: p.lmax, maxed: mx, cost: mx ? null : gdPts_(gdPermCost_(p.id, L)), eff: Math.round(p.max * gdPf_(p, L) * 10000) / 10000 }; });
  const ach = GD_ACH.map(function (a) { const k = st.ac[a.id] || 0; return { id: a.id, tier: k, val: gdStat_(st, a.id), next: gdAchTarget_(a, k), xu: gdCap_(Math.round(100 * Math.pow(1.8, k))) }; });
  const ds = st.ds.d === day ? st.ds.s : 0, gain = gdPrestigeGain_(st), rp = gdRep_(st);
  const wd = GD_WONDERS.map(function (w) {
    const b = st.b[w.id], l = b ? b.l : (Number(st.wi[w.id]) || 0);
    return { id: w.id, l: l, placed: !!b, stored: !b && l > 0, x: b ? b.x : null, y: b ? b.y : null, locked: !b && !l && rp.lv < w.rep, needRep: w.rep, aes: gdWonderAes_(w, l),
      next: l >= GD_WONDER_STAGES ? null : gdPts_(gdWonderCost_(w, l + 1)), maxed: l >= GD_WONDER_STAGES };
  });
  const gcost = {}; GD_GROUNDS.forEach(function (g) { if (st.go.indexOf(g.id) < 0) gcost[g.id] = gdPts_(g.p); });
  return {
    lv: li.lv, xpInto: li.into, xpNeed: li.need, aes: Math.round(e.A), aesBonus: Math.round(e.aesBonus * 10000) / 10000,
    mult: e.mult, eff: { speed: e.speed, yield: e.yield, xp: e.xp, prod: e.prod, seed: e.seed, boost: e.boost, daily: e.daily },
    ready: ready, growing: growing, maxTier: gdMaxTier_(st), costPct: pct,
    climate: { cs: cs, name: GD_CLIMATE[cs], daysLeft: 7 - (day % 7) },
    next: { chunkCost: gdPts_(gdChunkCost_(st.ch.length)), tillCost: gdTillCost_(Object.keys(st.f).length), chunks: st.ch.length },
    frontier: Object.keys(frontier).slice(0, 120), bld: bld, perms: perms, ach: ach,
    quests: ql.map(function (q, i) { const pr = today ? gdQProg_(st, q) : 0; return { id: 'q' + i, text: gdQText_(q), prog: Math.min(Math.floor(pr), q[2]), target: q[2], xu: q[3], xp: q[4], es: q[5], claimed: today && st.q.c.indexOf('q' + i) >= 0, done: pr >= q[2] }; }),
    daily: { canClaim: st.dl.d !== day, streak: (st.dl.d === day || st.dl.d === day - 1) ? st.dl.s : 0, last: st.dl.d },
    prestige: { can: li.lv >= 10 && gain >= 1, gain: gain, needLv: 10, multAfter: 1 + 0.03 * (st.es + gain), keep: 8 + 4 * (st.sn + 1), season: st.sn + 1 },
    spend: { today: ds, cap: cap, remaining: cap > 0 ? Math.max(0, cap - ds) : null },
    rep: rp, wd: wd, gr: { cur: st.gr, owned: st.go, cost: gcost }, wi: st.wi, catVer: GD_CATVER
  };
}

/* ---------------- Action: gardenInfo ---------------- */
function gdInfo_(p) {
  if (p && Number(p.catVer) === GD_CATVER) return { catVer: GD_CATVER, same: true };
  return {
    catVer: GD_CATVER,
    crops: GD_CROPS, buildings: GD_BLDS, perms: GD_PERMS,
    wonders: GD_WONDERS.map(function (w) { const c = [], a = []; for (let l = 1; l <= GD_WONDER_STAGES; l++) { c.push(gdWonderCost_(w, l)); a.push(gdWonderAes_(w, l)); } return { id: w.id, name: w.name, e: w.e, w: w.w, h: w.h, rep: w.rep, d: w.d, cost: c, aes: a }; }),
    grounds: GD_GROUNDS,
    repCurve: { max: GD_REP_MAX, k: GD_REP_K, thresholds: (function () { const t = []; for (let l = 0; l <= GD_REP_MAX; l++) t.push(l ? gdRepThr_(l) : 0); return t; })(), titles: GD_REP_TITLES, stages: GD_WONDER_STAGES, stageGrow: GD_WONDER_GROW,
      note: 'Danh vọng = bậc lớn nhất l sao cho tổng điểm đã chi ≥ ceil(156.25×l²) (≈ 0.08×√điểm). Mở bậc trang trí = Mùa + floor(cấp vườn/20) + Danh vọng.' },
    themes: GD_THEMES.map(function (t) { return { id: t.id, name: t.name, e: t.e }; }),
    decos: GD_DECOS.map(function (d) { return [d.id, d.n, d.e, d.th, d.cost, d.aes]; }),
    tiers: { mats: GD_MATS, adjs: GD_ADJS, costMul: GD_TIER_COST, aesMul: GD_TIER_AES, max: GD_TIER_MAX, note: 'id bậc t = "<id>~<t>"; tên = tên + vật liệu[(t-1)%10] (+ tính từ nếu t>10); giá = round(giá×2.6^t); thẩm mỹ = round(aes×2.2^t); mở đến bậc = Mùa + floor(cấp/20)' },
    ach: GD_ACH, climate: GD_CLIMATE,
    consts: { chunk: GD_CH, chunkBase: GD_CHUNK_BASE, chunkGrow: GD_CHUNK_GROW, tillBase: 15, tillGrow: 1.05, offlineHours: GD_OFFLINE_H, boostSecPerPt: 300, maxOps: GD_MAX_OPS, maxCellsOp: GD_MAX_CELLS_OP, maxFarm: GD_MAX_FARM, maxDeco: GD_MAX_DECO, maxChunks: GD_MAX_CHUNKS, bldUpGrow: 1.32, bldRateGrow: 0.7, essMult: 0.03, prestigeLv: 10, prestigeDiv: 1500, startXu: 60, levelBase: 60, levelGrow: 1.2, levelReward: 30, questXuBase: 60, dailyBase: 50 },
    formulas: {
      level: 'cần(l)=round(60×1.2^(l-1)) XP', chunk: 'giá mảnh tiếp theo (điểm)=round(40×1.18^(n-1)) × gardenCostPct/100, n = số mảnh đang có',
      till: 'cuốc ô = round(15×1.05^số ô đất) Xu', perm: 'giá cấp L→L+1 (điểm)=round(base×rate^L); hiệu ứng = max×[L/(L+k)]/[lmax/(lmax+k)], đạt 100% tại lmax; ≥99% → garden_maxed', wonder: 'giá giai đoạn s = round(p×1.8^(s-1)); 5 giai đoạn; cần Danh vọng ≥ rep', ground: 'mua 1 lần, đổi lại miễn phí',
      bld: 'nâng cấp công trình L→L+1 = round(ux×1.32^L) Xu; sản vật/giờ = r×(1+0.7×(L-1))×hệ số', prestige: 'Tinh hoa = floor(sqrt(Xu kiếm trong mùa/1500)); hệ số = 1+0.03×Tinh hoa'
    }
  };
}

/* ---------------- Action: gardenGet ---------------- */
function gdGet_(params, student) {
  const code = student.code, now = Date.now(), sh = gdSh_();
  let L = gdLoad_(sh, code);
  if (!L) L = withLock_(function () { return gdLoad_(sh, code) || gdCreate_(sh, code, now); });
  return { state: L.st, derived: gdDerived_(L.st, now, student.balance), serverTime: now, v: L.v, balance: student.balance, catVer: GD_CATVER };
}

/* ---------------- Action: gardenAct ---------------- */
function gdAct_(params, student) {
  const code = student.code, rid = String(params.requestId || ''), ops = params.ops;
  if (!/^[\w-]{8,64}$/.test(rid)) throw gdErr_('bad_request', 'requestId không hợp lệ.');
  if (!Array.isArray(ops) || !ops.length) throw gdErr_('bad_request', 'Thiếu danh sách thao tác.');
  if (ops.length > GD_MAX_OPS) throw gdErr_('too_many_ops', 'Tối đa ' + GD_MAX_OPS + ' thao tác mỗi lần.');
  let js; try { js = JSON.stringify(ops); } catch (e) { throw gdErr_('bad_request', 'Thao tác không hợp lệ.'); }
  if (js.length > 30000) throw gdErr_('bad_request', 'Dữ liệu thao tác quá lớn.');
  if (!gdDepthOk_(ops, 6)) throw gdErr_('bad_request', 'Dữ liệu thao tác lồng quá sâu.');
  const baseV = params.baseV === undefined || params.baseV === null ? null : Number(params.baseV), ck = 'gdq:' + code + ':' + rid;
  return withLock_(function () {
    const now = Date.now(), sh = gdSh_();
    let L = gdLoad_(sh, code) || gdCreate_(sh, code, now);
    const bal0 = (getStudent_(code) || student).balance;
    // idempotent: cùng requestId → trả lại kết quả cũ, không áp dụng lần nữa
    let prev = cget_(ck);
    if (!prev && L.lastReqId === rid) { try { prev = JSON.parse(L.lastResp); } catch (e) { prev = { results: [], spent: 0 }; } }
    if (prev) return { ok: true, replay: true, state: L.st, derived: gdDerived_(L.st, now, bal0), results: prev.results || [], spent: prev.spent || 0, balance: bal0, v: L.v, serverTime: now };
    const st = L.st, day = gdDay_(now), ctx = { st: st, now: now, day: day, cs: gdClimate_(day), code: code, eff: null, spend: 0, notes: [], balance: bal0, cells: 0, chs: {}, bpos: {}, lv: 0,
      cap: Math.max(0, cfgNum_('gardenDailySpendCap', 0)), spentToday: st.ds.d === day ? st.ds.s : 0 };
    st.ch.forEach(function (k) { ctx.chs[k] = 1; });
    ctx.bpos = gdBpos_(st);
    gdRoll_(st, day);
    const lvBefore = gdLevel_(st.xp).lv; ctx.lv = lvBefore;
    const results = [];
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i], name = (o && typeof o === 'object') ? String(o.op || '') : '';
      try {
        if (!Object.prototype.hasOwnProperty.call(GD_OPS, name)) throw gdErr_('unknown_op', 'Thao tác không hợp lệ.');
        const r = GD_OPS[name](ctx, o); r.i = i; r.op = name; r.ok = true; results.push(r);
        ctx.lv = gdLevel_(st.xp).lv;
      } catch (err) {
        if (!err || !err.apiCode) throw err;
        const fresh = JSON.parse(L.raw);   // không lưu gì: trả lại trạng thái gốc để client đồng bộ
        gdMigrate_(fresh);
        return { ok: false, error: err.apiCode, message: 'Thao tác #' + (i + 1) + ' (' + (name || '?') + '): ' + err.message, opIndex: i, op: name, applied: false,
          state: fresh, derived: gdDerived_(fresh, now, bal0), balance: bal0, v: L.v, serverTime: now };
      }
    }
    const ach = gdAch_(ctx), ups = gdLevelUps_(ctx, lvBefore);
    let bal = bal0;
    if (ctx.spend > 0) {
      st.ds = { d: day, s: ctx.spentToday + ctx.spend }; st.s.ps = gdCap_(st.s.ps + ctx.spend);
      const r = applyDelta_(code, -ctx.spend, 'garden', rid, ctx.notes.join('; ').slice(0, 200));
      if (r.clamped || r.delta !== -ctx.spend) {
        if (r.delta < 0) applyDelta_(code, -r.delta, 'garden', rid, 'hoàn tác');
        throw gdErr_('not_enough_points', 'Không đủ điểm để thực hiện.');
      }
      bal = r.balance;
    }
    const v = L.v + 1, resp = JSON.stringify({ results: results, spent: ctx.spend });
    try { gdSave_(sh, L, st, v, now, rid, resp.length < 40000 ? resp : JSON.stringify({ results: [], spent: ctx.spend })); }
    catch (e) { if (ctx.spend > 0) applyDelta_(code, ctx.spend, 'garden', rid, 'hoàn điểm do lỗi lưu'); throw e; }
    if (resp.length < 30000) cput_(ck, { results: results, spent: ctx.spend }, 21600);
    return { ok: true, state: st, derived: gdDerived_(st, now, bal), results: results, achievements: ach, levelUps: ups, spent: ctx.spend, balance: bal, v: v, stale: (baseV !== null && baseV !== L.v), serverTime: now };
  });
}

/* ---------------- Action: gardenBoard ---------------- */
function gdBoard_(params, student) {
  let list = cget_('gdboard');
  if (!list) {
    const sh = gdSh_(), n = sh.getLastRow(); list = [];
    if (n >= 2) {
      const codes = sh.getRange(2, 1, n - 1, 1).getValues(), m = sh.getRange(2, 7, n - 1, 3).getValues();
      let rp = null; try { if (typeof sh.getMaxColumns !== 'function' || sh.getMaxColumns() >= 13) rp = sh.getRange(2, 13, n - 1, 1).getValues(); } catch (e) { rp = null; }
      for (let i = 0; i < codes.length; i++) if (codes[i][0]) list.push([String(codes[i][0]), Number(m[i][0]) || 1, Number(m[i][1]) || 0, Number(m[i][2]) || 0, rp ? (Number(rp[i][0]) || 0) : 0]);
      list.sort(function (a, b) { return (b[2] - a[2]) || (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1); });
    }
    cput_('gdboard', list, 60);
  }
  let me = null; for (let i = 0; i < list.length; i++) if (list[i][0] === student.code) { me = { rank: i + 1, lv: list[i][1], aes: list[i][2], sn: list[i][3], rep: list[i][4] || 0, rt: gdRepTitle_(list[i][4] || 0) }; break; }
  return { board: list.slice(0, 20).map(function (r, i) { return { rank: i + 1, who: maskCode_(r[0]), lv: r[1], aes: r[2], sn: r[3], rep: r[4] || 0, rt: gdRepTitle_(r[4] || 0), me: r[0] === student.code }; }), me: me, total: list.length, serverTime: Date.now() };
}

/* ---------------- Đăng ký với route() ---------------- */
function registerGardenActions_(reg) {
  reg.gardenInfo = function (params, student) { return gdInfo_(params); };
  reg.gardenGet = function (params, student) { return gdGet_(params, student); };
  reg.gardenAct = function (params, student) { return gdAct_(params, student); };
  reg.gardenBoard = function (params, student) { return gdBoard_(params, student); };
}
