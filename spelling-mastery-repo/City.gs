/* =====================================================================
 * City.gs – máy chủ game "Nông trại & Thành phố" (Nhà Thầy Hưng / Spelling Mastery)
 * TỆP TỰ SINH bằng `node build-city.js` từ city-core.js + city-server.js – đừng sửa trực tiếp.
 * Cài: dán nguyên tệp này vào Apps Script (cùng dự án với Code.gs), rồi Deploy → New version.
 * ===================================================================== */
/* =====================================================================
 * city-core.js – LUẬT CHƠI "Nông trại & Thành phố" (dùng chung trình duyệt + Apps Script)
 * Nguồn duy nhất của luật: trình duyệt nạp tệp này để phản hồi tức thì; City.gs chứa NGUYÊN VĂN tệp này
 * (tạo bằng `node build-city.js`) để máy chủ kiểm tra lại mọi thao tác. Không gọi Date.now() bên trong:
 * thời gian luôn truyền vào (now) → máy chủ và trình duyệt tính giống hệt nhau.
 *
 * Hai loại tiền:
 *  - 🪙 Xu: kiếm trong game (thu hoạch, bán hàng, đơn hàng, thuế). Dùng xây dựng/nâng cấp thường.
 *  - ⭐ Điểm: kiếm từ làm bài tập (KHÔNG có đường nào trong game sinh ra Điểm). Dùng mở đất, kỳ quan,
 *    trang trí cao cấp, tăng tốc, bùa x2, trợ lý, nâng cấp vĩnh viễn, giống quý, phương tiện, chủ đề...
 *  - Không có gì bị mất hay reset: cây không héo, công trình không hỏng, không có "chơi lại từ đầu".
 *  - Không ngẫu nhiên khi chi Điểm (không hộp quà may rủi): giá luôn hiển thị trước.
 * ===================================================================== */
var CityCore = (function () {
  'use strict';
  var VER = 1, CATVER = 1, CH = 8, MAXC = 300, SEC = 1000, MIN = 60000, HR = 3600000, DAY = 86400000;
  var MAX_B = 4000, MAX_OPS = 40, MAX_IDS = 120, TAX_CAP_H = 6, ORDER_WAIT = 60000, SPEED_MIN_PER_PT = 10;
  var START_XU = 250, LOG_N = 30;

  /* ---------------- Danh mục vật phẩm ---------------- */
  var IT = [], IT_BY = {};
  function addItem(o) { IT.push(o); IT_BY[o.id] = o; return o; }
  addItem({ id: 'go', n: 'Gỗ', e: '🪵', k: 'mat', p: 4 });
  addItem({ id: 'da', n: 'Đá', e: '🪨', k: 'mat', p: 5 });

  // Cây trồng: id, tên, emoji, cấp mở, thời gian (giây), giá hạt (xu), giá bán (xu), [điểm để mở – giống quý]
  var CROPS_RAW = [
    ['lua', 'Lúa mì', '🌾', 1, 120, 1, 3], ['ngo', 'Ngô', '🌽', 2, 300, 2, 5], ['carot', 'Cà rốt', '🥕', 3, 600, 3, 8],
    ['dau', 'Đậu nành', '🫘', 5, 1200, 4, 11], ['mia', 'Mía', '🎋', 7, 1800, 5, 14], ['cachua', 'Cà chua', '🍅', 9, 2700, 6, 17],
    ['dautay', 'Dâu tây', '🍓', 11, 3600, 8, 22], ['khoai', 'Khoai tây', '🥔', 13, 5400, 9, 26], ['bong', 'Bông', '☁️', 15, 7200, 10, 30],
    ['bido', 'Bí ngô', '🎃', 18, 10800, 12, 38], ['ot', 'Ớt', '🌶️', 20, 9000, 11, 35], ['dua', 'Dứa', '🍍', 23, 14400, 14, 46],
    ['nho', 'Nho', '🍇', 26, 18000, 16, 55], ['duahau', 'Dưa hấu', '🍉', 30, 21600, 18, 64],
    ['huongduong', 'Hướng dương', '🌻', 2, 1800, 4, 30, 40], ['xoai', 'Xoài cát', '🥭', 4, 5400, 10, 62, 80],
    ['dao', 'Đào tiên', '🍑', 8, 7200, 12, 88, 150], ['kiwi', 'Kiwi vàng', '🥝', 12, 9000, 14, 115, 240], ['nam', 'Nấm thần', '🍄', 16, 10800, 16, 150, 360]
  ];
  var CROPS = CROPS_RAW.map(function (c) {
    var o = { id: c[0], n: c[1], e: c[2], lv: c[3], t: c[4], seed: c[5], p: c[6], rare: c[7] || 0, xp: Math.max(1, Math.round(c[6] / 4)) };
    addItem({ id: o.id, n: o.n, e: o.e, k: 'crop', p: o.p, xp: o.xp }); return o;
  });
  var CROP_BY = by(CROPS);

  /* ---------------- Danh mục công trình ----------------
   * k: field | pen | fac | house | svc | deco | road | lm | spec
   * w,h: kích thước ô · lv: cấp mở · xu / pts: giá · mat: vật liệu xây · mx: số lượng tối đa (0 = không giới hạn)
   */
  var B = [], B_BY = {};
  function addB(o) { o.w = o.w || 1; o.h = o.h || o.w; o.lv = o.lv || 1; o.xu = o.xu || 0; o.pts = o.pts || 0; o.mat = o.mat || {}; B.push(o); B_BY[o.id] = o; return o; }
  function recipe(out, n, e, q, inp, t, lv) { return { o: out, n: n, e: e, q: q || 1, in: inp, t: t, lv: lv || 1 }; }

  addB({ id: 'ruong', n: 'Ruộng', e: '🟫', k: 'field', lv: 1 });

  // Chuồng trại: con vật ăn thức ăn (feed) → sản phẩm (prod) sau t giây. a = giá mua thêm 1 con (xu)
  [
    { id: 'chuongga', n: 'Chuồng gà', e: '🐔', an: 'Gà', lv: 2, xu: 80, feed: 'tag', prod: ['trung', 'Trứng', '🥚'], t: 1200 },
    { id: 'chuongbo', n: 'Chuồng bò', e: '🐄', an: 'Bò sữa', lv: 5, xu: 300, feed: 'tab', prod: ['sua', 'Sữa', '🥛'], t: 3600 },
    { id: 'chuongvit', n: 'Chuồng vịt', e: '🦆', an: 'Vịt', lv: 9, xu: 600, feed: 'tag', prod: ['long', 'Lông vũ', '🪶'], t: 2400 },
    { id: 'chuongcuu', n: 'Chuồng cừu', e: '🐑', an: 'Cừu', lv: 10, xu: 900, feed: 'tac', prod: ['len', 'Len', '🧶'], t: 5400 },
    { id: 'traiong', n: 'Trại ong', e: '🐝', an: 'Đàn ong', lv: 14, xu: 1500, feed: '', prod: ['mat', 'Mật ong', '🍯'], t: 7200 },
    { id: 'aoca', n: 'Ao cá', e: '🐟', an: 'Đàn cá', lv: 17, xu: 2500, feed: 'tca', prod: ['ca', 'Cá', '🐟'], t: 4800 }
  ].forEach(function (p) { p.k = 'pen'; p.w = 2; p.mx = 1; p.a = Math.round(p.xu / 3); addB(p); });

  // Nhà máy (fac) & mỏ (mine = fac không cần nguyên liệu)
  addB({ id: 'traigo', n: 'Trại gỗ', e: '🪓', k: 'fac', lv: 4, xu: 150, w: 2, mx: 1, rs: [recipe('go', 'Gỗ', '🪵', 3, {}, 1200)] });
  addB({ id: 'moda', n: 'Mỏ đá', e: '⛏️', k: 'fac', lv: 6, xu: 250, w: 2, mx: 1, rs: [recipe('da', 'Đá', '🪨', 3, {}, 1800)] });
  addB({ id: 'xuongthucan', n: 'Xưởng thức ăn', e: '🥣', k: 'fac', lv: 2, xu: 50, w: 2, mx: 1, rs: [
    recipe('tag', 'Thức ăn gà', '🥣', 3, { lua: 2, ngo: 1 }, 300, 2), recipe('tab', 'Thức ăn bò', '🌿', 3, { ngo: 2, dau: 1 }, 600, 5),
    recipe('tac', 'Thức ăn cừu', '🍀', 3, { lua: 2, carot: 1 }, 900, 10), recipe('tca', 'Thức ăn cá', '🦐', 3, { dau: 1, ngo: 1, carot: 1 }, 900, 17)] });
  addB({ id: 'lobanh', n: 'Lò bánh mì', e: '🥖', k: 'fac', lv: 3, xu: 120, w: 2, mx: 1, rs: [
    recipe('banhmi', 'Bánh mì', '🍞', 1, { lua: 3 }, 480, 3), recipe('banhngo', 'Bánh ngô', '🫓', 1, { ngo: 2, trung: 1 }, 1200, 6),
    recipe('banhquy', 'Bánh quy', '🍪', 1, { lua: 2, trung: 1, duong: 1 }, 1800, 9), recipe('banhbao', 'Bánh bao', '🥟', 1, { lua: 2, carot: 1, dau: 1 }, 1500, 12)] });
  addB({ id: 'xuonggo', n: 'Xưởng mộc', e: '🪚', k: 'fac', lv: 4, xu: 200, w: 2, mx: 1, rs: [
    recipe('van', 'Ván gỗ', '🪚', 1, { go: 2 }, 600, 4), recipe('ghe', 'Bàn ghế', '🪑', 1, { van: 2, dinh: 1 }, 2400, 11)] });
  addB({ id: 'logach', n: 'Lò gạch', e: '🧱', k: 'fac', lv: 4, xu: 200, w: 2, mx: 1, rs: [
    recipe('gach', 'Gạch', '🧱', 1, { da: 2 }, 600, 4), recipe('kinh', 'Kính', '🪟', 1, { da: 3 }, 1800, 9), recipe('xm', 'Xi măng', '🪣', 1, { da: 2, go: 1 }, 1200, 14)] });
  addB({ id: 'xuongsua', n: 'Xưởng bơ sữa', e: '🧈', k: 'fac', lv: 6, xu: 300, w: 2, mx: 1, rs: [
    recipe('bo', 'Bơ', '🧈', 1, { sua: 2 }, 1800, 6), recipe('phomai', 'Phô mai', '🧀', 1, { sua: 3 }, 3600, 8), recipe('kem', 'Kem', '🍦', 1, { sua: 1, duong: 1, dautay: 1 }, 2400, 13)] });
  addB({ id: 'nhamayduong', n: 'Nhà máy đường', e: '🍬', k: 'fac', lv: 7, xu: 400, w: 2, mx: 1, rs: [
    recipe('duong', 'Đường', '🍬', 1, { mia: 2 }, 900, 7), recipe('keo', 'Kẹo mút', '🍭', 1, { duong: 2, dautay: 1 }, 1800, 12)] });
  addB({ id: 'xuongcokhi', n: 'Xưởng cơ khí', e: '🔩', k: 'fac', lv: 8, xu: 600, w: 2, mx: 1, rs: [
    recipe('dinh', 'Đinh', '🔩', 1, { da: 1, go: 1 }, 900, 8), recipe('thep', 'Thép', '⚙️', 1, { da: 3, go: 1 }, 2400, 15)] });
  addB({ id: 'xuongmay', n: 'Xưởng may', e: '🧵', k: 'fac', lv: 15, xu: 1500, w: 2, mx: 1, rs: [
    recipe('vai', 'Vải', '🧵', 1, { bong: 2 }, 1800, 15), recipe('mulen', 'Mũ len', '🧢', 1, { len: 2 }, 2400, 16),
    recipe('ao', 'Áo thun', '👕', 1, { vai: 2, len: 1 }, 3600, 18), recipe('goi', 'Gối lông', '🛏️', 1, { vai: 1, long: 2 }, 3000, 20)] });
  addB({ id: 'tiembanh', n: 'Tiệm bánh ngọt', e: '🎂', k: 'fac', lv: 16, xu: 2000, w: 2, mx: 1, rs: [
    recipe('banhkem', 'Bánh kem', '🎂', 1, { lua: 2, trung: 2, sua: 1, duong: 1 }, 3600, 16), recipe('donut', 'Bánh donut', '🍩', 1, { lua: 2, duong: 1, bo: 1 }, 2400, 17),
    recipe('banhmat', 'Bánh mật ong', '🥮', 1, { lua: 2, mat: 1, trung: 1 }, 3000, 18), recipe('banhbi', 'Bánh bí ngô', '🥧', 1, { bido: 1, trung: 1, duong: 1 }, 3600, 19)] });
  addB({ id: 'nhahang', n: 'Nhà hàng', e: '🍽️', k: 'fac', lv: 20, xu: 3000, w: 2, mx: 1, rs: [
    recipe('salad', 'Salad', '🥗', 1, { carot: 2, cachua: 2 }, 1800, 20), recipe('khoaichien', 'Khoai chiên', '🍟', 1, { khoai: 2, bo: 1 }, 2400, 20),
    recipe('pizza', 'Pizza', '🍕', 1, { banhmi: 1, cachua: 2, phomai: 1 }, 3600, 21), recipe('sup', 'Súp bí', '🍲', 1, { bido: 2, sua: 1 }, 3600, 22),
    recipe('canuong', 'Cá nướng', '🍢', 1, { ca: 2, ot: 1 }, 3000, 24)] });
  addB({ id: 'xuongnuoc', n: 'Xưởng nước ép', e: '🧃', k: 'fac', lv: 24, xu: 5000, w: 2, mx: 1, rs: [
    recipe('nuocep', 'Nước ép dâu', '🧃', 1, { dautay: 3 }, 1800, 24), recipe('sinhto', 'Sinh tố dứa', '🍹', 1, { dua: 2, sua: 1 }, 3600, 26),
    recipe('nuocnho', 'Nước nho', '🥤', 1, { nho: 3 }, 3600, 28), recipe('nuocdh', 'Nước dưa hấu', '🧉', 1, { duahau: 2 }, 2700, 31)] });

  // Nhà ở: pop = dân mỗi cấp, um = vật liệu khi nâng cấp
  [
    { id: 'nhago', n: 'Nhà gỗ', e: '🏠', lv: 1, xu: 30, pop: 5, um: ['go', 'van'] },
    { id: 'nhagach', n: 'Nhà gạch', e: '🏡', lv: 4, xu: 150, pop: 10, mat: { gach: 2 }, um: ['gach', 'van'] },
    { id: 'nhanam', n: 'Nhà nấm', e: '🍄', lv: 2, pts: 60, pop: 22, um: ['go', 'van'] },
    { id: 'nhacay', n: 'Nhà trên cây', e: '🌳', lv: 3, pts: 90, pop: 28, um: ['go', 'van'] },
    { id: 'nhapho', n: 'Nhà phố', e: '🏘️', lv: 8, xu: 500, pop: 18, mat: { gach: 3, kinh: 1 }, um: ['gach', 'kinh', 'dinh'] },
    { id: 'bietthu', n: 'Biệt thự', e: '🏡', lv: 12, xu: 2000, pop: 45, w: 2, mat: { gach: 4, kinh: 2, van: 2 }, um: ['gach', 'kinh', 'van'] },
    { id: 'laudai', n: 'Lâu đài cổ tích', e: '🏰', lv: 10, pts: 350, pop: 160, w: 3, um: ['gach', 'kinh', 'van'] },
    { id: 'chungcu', n: 'Chung cư', e: '🏢', lv: 16, xu: 6000, pop: 90, w: 2, mat: { gach: 6, kinh: 4, thep: 2 }, um: ['gach', 'kinh', 'thep'] },
    { id: 'caooc', n: 'Cao ốc', e: '🏙️', lv: 22, xu: 20000, pop: 180, w: 2, mat: { thep: 6, kinh: 8, xm: 4 }, um: ['thep', 'kinh', 'xm'] },
    { id: 'chocroi', n: 'Tháp chọc trời', e: '🌆', lv: 30, xu: 60000, pop: 400, w: 2, mat: { thep: 12, kinh: 12, xm: 8 }, um: ['thep', 'kinh', 'xm'] }
  ].forEach(function (h) { h.k = 'house'; addB(h); });

  // Dịch vụ: hap = 😊 Hạnh phúc mỗi cấp (mỗi 1 😊 = +1% thuế)
  [
    { id: 'congvien', n: 'Công viên', e: '🌳', lv: 3, xu: 100, hap: 6, w: 2 },
    { id: 'truonghoc', n: 'Trường học', e: '🏫', lv: 5, xu: 400, hap: 12, w: 2, mat: { gach: 4, van: 2 } },
    { id: 'cuuhoa', n: 'Trạm cứu hỏa', e: '🚒', lv: 7, xu: 800, hap: 14, w: 2, mat: { gach: 4, dinh: 2 } },
    { id: 'canhsat', n: 'Đồn cảnh sát', e: '🚓', lv: 9, xu: 1000, hap: 16, w: 2, mat: { gach: 5, kinh: 2 } },
    { id: 'benhvien', n: 'Bệnh viện', e: '🏥', lv: 11, xu: 1500, hap: 20, w: 2, mat: { gach: 6, kinh: 3 } },
    { id: 'thuvien', n: 'Thư viện', e: '📚', lv: 13, xu: 2000, hap: 22, w: 2, mat: { van: 4, kinh: 3 } },
    { id: 'sanbong', n: 'Sân bóng', e: '⚽', lv: 15, xu: 3000, hap: 30, w: 3, mat: { go: 6 } },
    { id: 'rapphim', n: 'Rạp chiếu phim', e: '🎬', lv: 18, xu: 5000, hap: 32, w: 2, mat: { thep: 2, kinh: 4 } },
    { id: 'ttm', n: 'Trung tâm thương mại', e: '🛍️', lv: 21, xu: 9000, hap: 45, w: 3, mat: { thep: 4, kinh: 6 } },
    { id: 'congviennuoc', n: 'Công viên nước', e: '🏊', lv: 24, xu: 14000, hap: 55, w: 3, mat: { xm: 6, kinh: 4 } },
    { id: 'sanbay', n: 'Sân bay', e: '✈️', lv: 28, xu: 25000, hap: 70, w: 3, mat: { thep: 8, xm: 6 } }
  ].forEach(function (s) { s.k = 'svc'; s.mx = 1; s.um = ['gach', 'kinh', 'dinh', 'thep']; addB(s); });

  // Trang trí (xu hoặc điểm). an = có hoạt ảnh; glow = sáng ban đêm
  [
    { id: 'bonhoa', n: 'Bồn hoa', e: '🌷', xu: 15, hap: 1 }, { id: 'cayxanh', n: 'Cây xanh', e: '🌳', xu: 20, hap: 1 },
    { id: 'hangrao', n: 'Hàng rào', e: '🪵', xu: 4, hap: 0 }, { id: 'caythong', n: 'Cây thông', e: '🌲', lv: 2, xu: 25, hap: 1 },
    { id: 'bui', n: 'Bụi hoa', e: '🌺', lv: 2, xu: 20, hap: 1 }, { id: 'ghe', n: 'Ghế đá', e: '🪑', lv: 2, xu: 30, hap: 1 },
    { id: 'den', n: 'Đèn đường', e: '💡', lv: 3, xu: 40, hap: 2, glow: 1 }, { id: 'gieng', n: 'Giếng nước', e: '🪣', lv: 4, xu: 100, hap: 3 },
    { id: 'cotco', n: 'Cột cờ', e: '🚩', lv: 5, xu: 80, hap: 3, an: 1 }, { id: 'caydua', n: 'Cây dừa', e: '🌴', lv: 6, xu: 60, hap: 2 },
    { id: 'coixay', n: 'Cối xay gió', e: '🌀', lv: 6, xu: 300, hap: 6, an: 1 }, { id: 'tramxe', n: 'Trạm xe buýt', e: '🚏', lv: 7, xu: 120, hap: 3 },
    { id: 'cayphong', n: 'Cây phong đỏ', e: '🍁', lv: 8, xu: 80, hap: 3 }, { id: 'tuongda', n: 'Tượng đá', e: '🗿', lv: 10, xu: 250, hap: 6 },
    // cao cấp (điểm)
    { id: 'anhdao', n: 'Cây hoa anh đào', e: '🌸', pts: 15, hap: 5, an: 1 }, { id: 'denlong', n: 'Đèn lồng', e: '🏮', pts: 10, hap: 3, glow: 1, an: 1 },
    { id: 'nguoituyet', n: 'Người tuyết', e: '⛄', pts: 20, hap: 6 }, { id: 'bongbay', n: 'Chùm bóng bay', e: '🎈', pts: 12, hap: 4, an: 1 },
    { id: 'thongnoel', n: 'Cây thông Noel', e: '🎄', pts: 30, hap: 8, glow: 1, an: 1 },
    { id: 'daiphun', n: 'Đài phun nước', e: '⛲', lv: 2, pts: 40, hap: 15, w: 2, an: 1 }, { id: 'cauvong', n: 'Cổng cầu vồng', e: '🌈', lv: 4, pts: 80, hap: 22, w: 2 },
    { id: 'hokoi', n: 'Hồ cá koi', e: '🎏', lv: 4, pts: 90, hap: 25, w: 2, an: 1 }, { id: 'tuongvang', n: 'Tượng vàng', e: '🏆', lv: 5, pts: 60, hap: 18, glow: 1 },
    { id: 'khinhkhicau', n: 'Khinh khí cầu', e: '🎈', lv: 5, pts: 120, hap: 30, w: 2, an: 1 }, { id: 'ngua', n: 'Đu quay ngựa gỗ', e: '🎠', lv: 6, pts: 150, hap: 35, w: 2, an: 1, glow: 1 },
    { id: 'thapdongho', n: 'Tháp đồng hồ', e: '🕰️', lv: 7, pts: 70, hap: 20, glow: 1 }, { id: 'vongquay', n: 'Vòng quay mặt trời', e: '🎡', lv: 9, pts: 300, hap: 70, w: 3, an: 1, glow: 1 },
    { id: 'caythan', n: 'Cây thần kỳ', e: '✨', lv: 12, pts: 250, hap: 60, w: 2, an: 1, glow: 1 }, { id: 'tauluon', n: 'Tàu lượn siêu tốc', e: '🎢', lv: 15, pts: 500, hap: 110, w: 3, an: 1 }
  ].forEach(function (d) { d.k = 'deco'; addB(d); });

  // Đường & mặt nước (tự nối với ô bên cạnh)
  addB({ id: 'duong', n: 'Đường nhựa', e: '🛣️', k: 'road', xu: 3 });
  addB({ id: 'duongda', n: 'Đường lát đá', e: '🧱', k: 'road', xu: 2 });
  addB({ id: 'nuoc', n: 'Hồ nước', e: '💧', k: 'road', lv: 2, xu: 8, an: 1 });

  // Kỳ quan (điểm): bonus = loại thưởng, bv = thưởng mỗi cấp. Nâng cấp vô hạn bằng điểm.
  [
    { id: 'chuamotcot', n: 'Chùa Một Cột', e: '🛕', lv: 3, pts: 100, w: 2, bonus: 'hap', bv: 30 },
    { id: 'thaprua', n: 'Tháp Rùa', e: '🐢', lv: 5, pts: 160, w: 2, bonus: 'tax', bv: 5 },
    { id: 'eiffel', n: 'Tháp Eiffel', e: '🗼', lv: 8, pts: 300, w: 3, bonus: 'fac', bv: 4 },
    { id: 'nuthan', n: 'Tượng Nữ thần Tự do', e: '🗽', lv: 10, pts: 350, w: 2, bonus: 'ord', bv: 6 },
    { id: 'kimtuthap', n: 'Kim tự tháp', e: '🔺', lv: 12, pts: 450, w: 3, bonus: 'crop', bv: 4 },
    { id: 'pisa', n: 'Tháp nghiêng Pisa', e: '🏛️', lv: 14, pts: 500, w: 2, bonus: 'fac', bv: 3 },
    { id: 'bigben', n: 'Tháp Big Ben', e: '🕰️', lv: 16, pts: 600, w: 2, bonus: 'tax', bv: 6 },
    { id: 'landmark81', n: 'Landmark 81', e: '🏙️', lv: 18, pts: 800, w: 2, bonus: 'xp', bv: 5 },
    { id: 'colosseum', n: 'Đấu trường La Mã', e: '🏟️', lv: 21, pts: 1000, w: 3, bonus: 'hap', bv: 60 },
    { id: 'truongthanh', n: 'Vạn Lý Trường Thành', e: '🏯', lv: 24, pts: 1200, w: 3, bonus: 'sto', bv: 120 },
    { id: 'tenlua', n: 'Bệ phóng tên lửa', e: '🚀', lv: 28, pts: 1500, w: 2, bonus: 'xp', bv: 6 },
    { id: 'taj', n: 'Đền Taj Mahal', e: '🕌', lv: 32, pts: 2000, w: 3, bonus: 'tax', bv: 8 }
  ].forEach(function (l) { l.k = 'lm'; l.mx = 1; addB(l); });

  // Công trình đặc biệt (có sẵn, mỗi loại 1, không cất được)
  addB({ id: 'toathi', n: 'Tòa thị chính', e: '🏛️', k: 'spec', w: 3, mx: 1, um: ['gach', 'kinh', 'dinh', 'thep'] });
  addB({ id: 'kho', n: 'Nhà kho', e: '📦', k: 'spec', w: 2, mx: 1, um: ['van', 'dinh', 'gach'] });
  addB({ id: 'donhang', n: 'Bến xe tải', e: '🚚', k: 'spec', w: 2, mx: 1, um: ['van', 'gach', 'dinh'] });
  addB({ id: 'cho', n: 'Chợ', e: '🏪', k: 'spec', w: 2, mx: 1, um: ['van', 'gach', 'kinh'] });

  /* ---- Giá bán & XP của sản phẩm: suy ra từ nguyên liệu + thời gian (cân bằng tự động) ---- */
  B.forEach(function (b) {
    if (b.k === 'pen') {
      if (!IT_BY[b.prod[0]]) addItem({ id: b.prod[0], n: b.prod[1], e: b.prod[2], k: 'ani' });
    }
    if (b.k === 'fac') b.rs.forEach(function (r) { if (!IT_BY[r.o]) addItem({ id: r.o, n: r.n, e: r.e, k: r.o.length === 3 && r.o.charAt(0) === 't' ? 'feed' : 'good' }); });
  });
  (function price() {
    var guard = 0, left = true;
    while (left && guard++ < 20) {
      left = false;
      B.forEach(function (b) {
        if (b.k === 'fac') b.rs.forEach(function (r) {
          var it = IT_BY[r.o]; if (it.p) return;
          var sum = 0, okk = true;
          Object.keys(r.in).forEach(function (k) { var x = IT_BY[k]; if (!x || !x.p) okk = false; else sum += x.p * r.in[k]; });
          if (!okk) { left = true; return; }
          it.p = Math.max(1, Math.round((sum * 1.15 + r.t / 100) / r.q));
        });
        if (b.k === 'pen') {
          var it = IT_BY[b.prod[0]]; if (it.p) return;
          var f = b.feed ? IT_BY[b.feed] : null; if (b.feed && (!f || !f.p)) { left = true; return; }
          it.p = Math.round((f ? f.p : 0) * 1.15 + b.t / 100);
        }
      });
    }
    IT.forEach(function (it) { if (!it.xp) it.xp = Math.max(1, Math.round(it.p / 4)); });
  })();
  // mỏ: giá gỗ/đá giữ nguyên p=4/5
  IT_BY.go.p = 4; IT_BY.da.p = 5; IT_BY.go.xp = 1; IT_BY.da.xp = 1;

  // Chướng ngại vật trên đất mới: dọn bằng xu → nhận vật liệu + XP
  var OBS = {
    c1: { n: 'Cây nhỏ', e: '🌳', xu: 8, get: { go: 2 }, xp: 2 }, c2: { n: 'Cây cổ thụ', e: '🌲', xu: 18, get: { go: 4 }, xp: 4 },
    d1: { n: 'Hòn đá', e: '🪨', xu: 12, get: { da: 2 }, xp: 2 }, d2: { n: 'Tảng đá lớn', e: '⛰️', xu: 25, get: { da: 4 }, xp: 4 },
    b1: { n: 'Bụi cỏ', e: '🌿', xu: 4, get: {}, xp: 1 }, b2: { n: 'Gốc cây', e: '🪵', xu: 10, get: { go: 3 }, xp: 2 }
  };

  /* ---------------- Cửa hàng ĐIỂM ---------------- */
  var HELPERS = [
    { id: 'robot', n: 'Robot thu thuế', e: '🤖', pts: 250, lv: 3, d: 'Thuế không bao giờ đầy kho (không giới hạn 6 giờ) + nút "Thu thuế cả thành phố".' },
    { id: 'maygat', n: 'Máy gặt đập', e: '🚜', pts: 120, lv: 2, d: 'Nút "Thu hoạch tất cả ruộng" chỉ một chạm.' },
    { id: 'maygieo', n: 'Máy gieo hạt', e: '🌱', pts: 120, lv: 2, d: 'Nút "Gieo lại tất cả ruộng trống" bằng hạt bạn chọn.' },
    { id: 'quandoc', n: 'Quản đốc', e: '👷', pts: 200, lv: 4, d: 'Nút "Thu sản phẩm mọi nhà máy & chuồng trại" + tự cho vật nuôi ăn.' },
    { id: 'xetai', n: 'Đội xe tải', e: '🚛', pts: 300, lv: 6, d: 'Thêm 3 ô đơn hàng trên Bến xe tải.' }
  ];
  var PERMS = [
    { id: 'kho', n: 'Kho rộng', e: '📦', base: 25, d: '+100 sức chứa kho mỗi cấp', v: 100 },
    { id: 'thue', n: 'Thuế cao', e: '💰', base: 35, d: '+5% thuế mỗi cấp', v: 5 },
    { id: 'datmau', n: 'Đất màu mỡ', e: '🌱', base: 35, d: 'Cây lớn nhanh hơn 5% mỗi cấp', v: 5 },
    { id: 'maymoc', n: 'Máy móc hiện đại', e: '⚙️', base: 35, d: 'Nhà máy & chuồng trại nhanh hơn 5% mỗi cấp', v: 5 },
    { id: 'thuongnhan', n: 'Thương lái giỏi', e: '🤝', base: 35, d: '+6% xu từ đơn hàng và chợ mỗi cấp', v: 6 },
    { id: 'hocgioi', n: 'Thị trưởng học giỏi', e: '🎓', base: 30, d: '+5% kinh nghiệm (XP) mỗi cấp', v: 5 },
    { id: 'hangcho', n: 'Thêm hàng chờ', e: '🧺', base: 60, d: '+1 ô hàng chờ cho mọi nhà máy (tối đa 6 cấp)', v: 1, max: 6 },
    { id: 'chuong', n: 'Chuồng rộng', e: '🐾', base: 50, d: '+1 con vật cho mọi chuồng trại (tối đa 10 cấp)', v: 1, max: 10 }
  ];
  var BOOSTS = [
    { id: 'x2thu', n: 'Phân bón thần', e: '🧪', pts: 25, d: 'Ruộng gieo trong lúc bật cho gấp đôi nông sản' },
    { id: 'x2thue', n: 'Mưa vàng', e: '🌧️', pts: 25, d: 'Thuế gấp đôi trong lúc bật' },
    { id: 'x2may', n: 'Siêu tốc', e: '⚡', pts: 25, d: 'Sản phẩm bắt đầu làm trong lúc bật xong nhanh gấp đôi' },
    { id: 'x2xp', n: 'Học bổng', e: '📜', pts: 20, d: 'Gấp đôi kinh nghiệm (XP) trong lúc bật' }
  ];
  var BOOST_MAX_H = 24;
  var GROUNDS = [
    { id: '', n: 'Đồng cỏ xanh', pts: 0, c: ['#7ccf5c', '#6cc04e', '#8fd96b'] },
    { id: 'xuan', n: 'Mùa xuân hoa', pts: 80, c: ['#8fdc7a', '#7fd06b', '#a6e68e'], fl: '#ff8fc8' },
    { id: 'thu', n: 'Mùa thu vàng', pts: 80, c: ['#d9b44a', '#cfa53c', '#e6c561'], fl: '#e8673c' },
    { id: 'dong', n: 'Mùa đông tuyết', pts: 100, c: ['#eef4fb', '#e2ebf6', '#f8fbff'], fl: '#9fc2e8' },
    { id: 'cat', n: 'Bãi biển cát', pts: 120, c: ['#f2dca0', '#ead08b', '#f8e7b8'], fl: '#62c4e0' },
    { id: 'keo', n: 'Xứ kẹo ngọt', pts: 150, c: ['#ffc6e0', '#ffb5d6', '#ffd6ea'], fl: '#a37bff' },
    { id: 'phep', n: 'Xứ phép thuật', pts: 200, c: ['#8e7de0', '#7f6dd6', '#a291ec'], fl: '#ffe066' }
  ];
  var EFFECTS = [
    { id: 'hoadao', n: 'Hoa đào rơi', e: '🌸', pts: 60 }, { id: 'tuyet', n: 'Tuyết rơi', e: '❄️', pts: 60 },
    { id: 'la', n: 'Lá vàng bay', e: '🍂', pts: 50 }, { id: 'domdom', n: 'Đom đóm ban đêm', e: '✨', pts: 50 },
    { id: 'bong', n: 'Bóng bay bay lên', e: '🎈', pts: 80 }, { id: 'cauvongtroi', n: 'Cầu vồng trên trời', e: '🌈', pts: 100 },
    { id: 'phaohoa', n: 'Pháo hoa ban đêm', e: '🎆', pts: 150 }
  ];
  var VEHICLES = [
    { id: 'taxi', n: 'Taxi vàng', e: '🚕', pts: 20, k: 'road' }, { id: 'xebuyt', n: 'Xe buýt', e: '🚌', pts: 40, k: 'road' },
    { id: 'xekem', n: 'Xe kem', e: '🍦', pts: 50, k: 'road' }, { id: 'xecuuhoa', n: 'Xe cứu hỏa', e: '🚒', pts: 60, k: 'road' },
    { id: 'xecanhsat', n: 'Xe cảnh sát', e: '🚓', pts: 60, k: 'road' }, { id: 'xedua', n: 'Xe đua', e: '🏎️', pts: 90, k: 'road' },
    { id: 'chocon', n: 'Chó con', e: '🐕', pts: 15, k: 'walk' }, { id: 'meocon', n: 'Mèo con', e: '🐈', pts: 15, k: 'walk' },
    { id: 'maybay', n: 'Máy bay', e: '✈️', pts: 120, k: 'air' }, { id: 'tructhang', n: 'Trực thăng', e: '🚁', pts: 100, k: 'air' },
    { id: 'ufo', n: 'Đĩa bay UFO', e: '🛸', pts: 300, k: 'air' }, { id: 'rong', n: 'Rồng bay', e: '🐉', pts: 400, k: 'air' }
  ];
  var VEH_MAX = 10;
  var EXCHANGE = [10, 50, 100, 500];

  /* ---------------- Nhiệm vụ / thành tích / danh hiệu ---------------- */
  var QUESTS = [
    ['hv', 'Thu hoạch {n} nông sản', [10, 20, 35]], ['pr', 'Thu {n} sản phẩm từ nhà máy hoặc chuồng', [3, 6, 10]],
    ['od', 'Giao {n} đơn hàng', [2, 3, 5]], ['tx', 'Thu thuế {n} lần', [5, 10, 20]], ['cl', 'Dọn {n} cây hoặc đá', [2, 4, 6]],
    ['up', 'Nâng cấp {n} lần', [1, 2, 3]], ['fd', 'Cho vật nuôi ăn {n} lần', [3, 6, 10]], ['bu', 'Xây {n} công trình', [1, 3, 5]],
    ['pl', 'Gieo {n} ô ruộng', [10, 20, 30]], ['sl', 'Bán {n} món ở chợ', [5, 10, 20]]
  ];
  var ACH = [
    { id: 'hv', n: 'Nhà nông chăm chỉ', e: '🌾', d: 'Nông sản đã thu hoạch', t: [50, 200, 1000, 5000, 20000, 100000, 500000] },
    { id: 'pr', n: 'Ông chủ nhà máy', e: '🏭', d: 'Sản phẩm đã làm', t: [20, 100, 500, 2000, 10000, 50000] },
    { id: 'od', n: 'Tài xế giao hàng', e: '🚚', d: 'Đơn hàng đã giao', t: [10, 50, 200, 1000, 5000, 20000] },
    { id: 'pop', n: 'Thành phố đông vui', e: '👨‍👩‍👧', d: 'Dân số', t: [50, 200, 1000, 5000, 20000, 100000, 500000, 2000000] },
    { id: 'bu', n: 'Kiến trúc sư', e: '🏗️', d: 'Công trình đã xây', t: [10, 50, 150, 400, 1000, 3000] },
    { id: 'up', n: 'Bậc thầy nâng cấp', e: '⬆️', d: 'Lần nâng cấp', t: [10, 50, 200, 1000, 5000] },
    { id: 'ch', n: 'Nhà thám hiểm', e: '🗺️', d: 'Mảnh đất sở hữu', t: [6, 10, 20, 40, 80, 150, 300] },
    { id: 'ps', n: 'Học sinh gương mẫu', e: '⭐', d: 'Điểm học tập đã đầu tư', t: [100, 500, 2000, 10000, 50000, 200000, 1000000] },
    { id: 'lv', n: 'Thị trưởng tài ba', e: '🎖️', d: 'Cấp thị trưởng', t: [5, 10, 20, 30, 50, 75, 100] },
    { id: 'dv', n: 'Ghé thăm mỗi ngày', e: '📅', d: 'Số ngày đã ghé thăm', t: [3, 7, 30, 100, 365, 1000] },
    { id: 'cl', n: 'Người khai hoang', e: '🪓', d: 'Cây & đá đã dọn', t: [10, 50, 200, 1000, 5000] }
  ];
  var RANKS = [[0, 'Xóm nhỏ'], [50, 'Làng quê'], [200, 'Thị trấn'], [600, 'Thị xã'], [1500, 'Thành phố'], [4000, 'Đô thị'], [10000, 'Thành phố lớn'],
    [25000, 'Siêu đô thị'], [60000, 'Thủ đô'], [150000, 'Đại đô thị'], [400000, 'Thành phố Ánh sáng'], [1000000, 'Thành phố Vũ trụ'], [5000000, 'Huyền thoại']];

  /* ---------------- Tiện ích ---------------- */
  function by(arr) { var o = {}; arr.forEach(function (x) { o[x.id] = x; }); return o; }
  var HELP_BY = by(HELPERS), PERM_BY = by(PERMS), BOOST_BY = by(BOOSTS), GROUND_BY = by(GROUNDS), FX_BY = by(EFFECTS), VEH_BY = by(VEHICLES);
  function err(c, m) { var e = new Error(m || c); e.apiCode = 'city_' + c; return e; }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function int(v) { var n = Number(v); return (isFinite(n) && Math.floor(n) === n) ? n : NaN; }
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function vnDay(now) { return Math.floor((now + 7 * HR) / DAY); }
  function dayEnd(d) { return (d + 1) * DAY - 7 * HR; }
  function key(x, y) { return x + ',' + y; }
  function cname(v, def) {
    var s = String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim();
    if (s.length > 24) s = s.slice(0, 24).trim();
    return s || def;
  }
  function fmtN(n) { n = Math.floor(n); var s = String(Math.abs(n)), o = ''; while (s.length > 3) { o = '.' + s.slice(-3) + o; s = s.slice(0, -3); } return (n < 0 ? '-' : '') + s + o; }

  /* ---------------- Cấp độ ---------------- */
  function need(lv) { return Math.round(25 * Math.pow(lv, 1.55) + 15); }
  function level(xp) {
    var lv = 1, rest = Math.max(0, Number(xp) || 0);
    while (lv < 100000 && rest >= need(lv)) { rest -= need(lv); lv++; }
    return { lv: lv, into: Math.floor(rest), need: need(lv) };
  }
  function lvReward(lv) { return 15 + 10 * lv; }

  /* ---------------- State ---------------- */
  function newState(code, now) {
    var seed = hash('city:' + code + ':' + now);
    var st = { ver: VER, seed: seed, cr: now, nm: '', xu: START_XU, xp: 0, ch: [], o: {}, b: {}, nid: 1, inv: { lua: 6, ngo: 2 }, bi: [],
      od: [], on: 0, pm: {}, hp: {}, bo: {}, th: { g: '', go: [''], fx: [], fo: [] }, vh: {}, rc: [], q: { d: 0, p: {}, c: [] },
      dv: { last: 0, n: 0, c: 0 }, ac: {}, s: { hv: 0, pr: 0, od: 0, tx: 0, cl: 0, bu: 0, up: 0, ps: 0, xe: 0, fd: 0, pl: 0, sl: 0 }, ds: { d: 0, s: 0 },
      lk: 0, lkd: { d: 0, w: [] }, lg: [[now, 'Chào mừng Thị trưởng! Hãy xây nông trại và thành phố của bạn.']], last: { c: 'lua' }, night: 1 };
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (c) { st.ch.push(key(c[0], c[1])); });
    // công trình ban đầu (16×16 ô)
    var put = function (t, x, y, l, extra) { var id = String(st.nid++), o = { t: t, x: x, y: y, l: l || 1 }; if (extra) for (var k in extra) o[k] = extra[k]; st.b[id] = o; return id; };
    put('toathi', 7, 6); put('kho', 11, 3); put('donhang', 3, 11); put('cho', 11, 10);
    for (var i = 0; i < 16; i++) { if (i !== 6 && i !== 7 && i !== 8) put('duong', i, 9); }
    for (var j = 0; j < 9; j++) put('duong', 6, j);
    put('duong', 6, 9); put('duong', 7, 9); put('duong', 8, 9);
    for (var j2 = 10; j2 < 16; j2++) put('duong', 6, j2);
    [[2, 3], [3, 3], [4, 3], [2, 4], [3, 4], [4, 4], [2, 5], [3, 5], [4, 5]].forEach(function (p, k) { put('ruong', p[0], p[1], 1, k < 3 ? { c: 'lua', e: now - 1000, n: 2 } : { c: '', e: 0 }); });
    put('nhago', 9, 11, 1, { tc: now - 2 * HR }); put('nhago', 9, 13, 1, { tc: now - 2 * HR }); put('bonhoa', 10, 12); put('cayxanh', 8, 2);
    // chướng ngại ngẫu nhiên (cố định theo seed) ở vùng trống, chừa khoảng giữa
    var occ = occupancy(st);
    for (var x = 0; x < 16; x++) for (var y = 0; y < 16; y++) {
      if (occ[key(x, y)]) continue;
      if (x >= 1 && x <= 12 && y >= 1 && y <= 14 && !(x <= 1 || y >= 14)) { if (rng(hash(seed + ':' + x + ',' + y))() > 0.08) continue; }
      genObs(st, x, y, 0.32);
    }
    orders(st, now, true);
    return st;
  }
  function genObs(st, x, y, dens) {
    var r = rng(hash(st.seed + ':o:' + x + ',' + y)), v = r();
    if (v > dens) return;
    var w = r(), t = w < 0.34 ? 'c1' : w < 0.52 ? 'c2' : w < 0.68 ? 'd1' : w < 0.76 ? 'd2' : w < 0.92 ? 'b1' : 'b2';
    st.o[key(x, y)] = t;
  }
  function migrate(st) {
    var n = newState('x', st.cr || 0);
    ['nm', 'xu', 'xp', 'ch', 'o', 'b', 'nid', 'inv', 'bi', 'od', 'on', 'pm', 'hp', 'bo', 'th', 'vh', 'rc', 'q', 'dv', 'ac', 's', 'ds', 'lk', 'lkd', 'lg', 'last', 'night'].forEach(function (k) { if (st[k] === undefined) st[k] = n[k]; });
    ['s', 'th', 'q', 'dv', 'lkd', 'last'].forEach(function (g) { Object.keys(n[g]).forEach(function (k) { if (st[g][k] === undefined) st[g][k] = n[g][k]; }); });
    st.ver = VER; return st;
  }
  function occupancy(st) {
    var m = {};
    Object.keys(st.b).forEach(function (id) { var b = st.b[id], d = B_BY[b.t]; if (!d) return; for (var i = 0; i < d.w; i++) for (var j = 0; j < d.h; j++) m[key(b.x + i, b.y + j)] = id; });
    return m;
  }
  function ownedSet(st) { var o = {}; st.ch.forEach(function (k) { o[k] = 1; }); return o; }
  function cellOwned(chs, x, y) { return !!chs[key(Math.floor(x / CH), Math.floor(y / CH))]; }

  /* ---------------- Chỉ số suy ra ---------------- */
  function permLv(st, id) { return Number(st.pm[id]) || 0; }
  function lmBonus(st, kind) {
    var v = 0; Object.keys(st.b).forEach(function (id) { var b = st.b[id], d = B_BY[b.t]; if (d && d.k === 'lm' && d.bonus === kind) v += d.bv * b.l; }); return v;
  }
  function boostOn(st, k, now) { var w = st.bo[k]; return !!(w && w[1] > now && w[0] <= now); }
  function stats(st, now) {
    var pop = 0, hap = 0, houses = 0, value = 0, fields = 0, counts = {}, kho = 1, don = 1, cho = 1, toa = 1;
    Object.keys(st.b).forEach(function (id) {
      var b = st.b[id], d = B_BY[b.t]; if (!d) return; counts[b.t] = (counts[b.t] || 0) + 1;
      if (d.k === 'house') { pop += d.pop * b.l; houses++; }
      else if (d.k === 'svc') hap += d.hap * b.l;
      else if (d.k === 'deco') hap += d.hap || 0;
      else if (d.k === 'field') fields++;
      if (b.t === 'kho') kho = b.l; else if (b.t === 'donhang') don = b.l; else if (b.t === 'cho') cho = b.l; else if (b.t === 'toathi') toa = b.l;
    });
    hap += lmBonus(st, 'hap') + 10 * (toa - 1);
    var taxPct = hap + permLv(st, 'thue') * 5 + lmBonus(st, 'tax') + 2 * (toa - 1);
    var cap = 150 + 50 * (kho - 1) + 100 * permLv(st, 'kho') + lmBonus(st, 'sto');
    var used = 0; Object.keys(st.inv).forEach(function (k) { used += st.inv[k] || 0; });
    var lv = level(st.xp).lv;
    return {
      pop: pop, hap: hap, houses: houses, fields: fields, counts: counts, taxMul: 1 + taxPct / 100, taxPct: taxPct, cap: cap, used: used, lv: lv,
      cropMul: 1 + (permLv(st, 'datmau') * 5 + lmBonus(st, 'crop')) / 100, facMul: 1 + (permLv(st, 'maymoc') * 5 + lmBonus(st, 'fac')) / 100,
      ordMul: 1 + (permLv(st, 'thuongnhan') * 6 + lmBonus(st, 'ord')) / 100 + 0.03 * (don - 1), sellMul: 1 + (permLv(st, 'thuongnhan') * 6) / 100 + 0.05 * (cho - 1),
      xpMul: 1 + (permLv(st, 'hocgioi') * 5 + lmBonus(st, 'xp')) / 100, orderSlots: Math.min(12, 6 + (don - 1)) + (st.hp.xetai ? 3 : 0),
      maxFields: Math.min(400, 12 + 3 * lv + Math.max(0, st.ch.length - 4) * 2)
    };
  }
  function rank(pop) { var r = RANKS[0], i = 0; for (var k = 0; k < RANKS.length; k++) if (pop >= RANKS[k][0]) { r = RANKS[k]; i = k; } return { i: i, n: r[1], next: RANKS[i + 1] ? RANKS[i + 1][0] : null }; }
  function chunkCost(st) { var n = Math.max(0, st.ch.length - 4); return Math.round(30 + 12 * n + 0.5 * n * n); }
  function fieldCost(n) { return 5 + 3 * n; }
  function upCost(b, d) {   // giá nâng cấp từ cấp b.l lên b.l+1: {xu, pts, mat}
    var L = b.l;
    if (d.k === 'lm') return { pts: Math.round(d.pts * 0.5 * Math.pow(L, 1.3)), xu: 0, mat: {} };
    if (d.k === 'field' || d.k === 'deco' || d.k === 'road') return null;
    var base = d.xu || Math.round((d.pts || 10) * 12), mul = d.k === 'house' ? 0.6 : d.k === 'svc' ? 0.7 : d.k === 'spec' ? 1 : 0.5;
    if (d.k === 'spec') base = { toathi: 400, kho: 120, donhang: 200, cho: 160 }[d.id] || 200;
    if (d.k === 'pen') base = d.xu;
    var xu = Math.round(base * mul * Math.pow(L, 1.5)), mat = {};
    var um = d.um || (d.k === 'fac' || d.k === 'pen' ? ['van', 'dinh', 'gach'] : ['van']);
    var n = Math.ceil(L * (d.k === 'house' ? 0.8 : 1)) + 1;
    um.forEach(function (m, i) { var q = Math.max(1, Math.round(n * (1 - i * 0.25))); if (i === 0 || L >= 2 + i * 2) mat[m] = q; });
    return { xu: xu, pts: 0, mat: mat };
  }
  function permCost(id, L) { var p = PERM_BY[id]; return Math.round(p.base * Math.pow(L + 1, 1.5)); }
  function copyCost(d, n) { return Math.round((30 + d.lv * 5) * n); }   // điểm để mua thêm bản thứ n+1 của nhà máy / chuồng
  function lmCount(st, t) { var n = 0; Object.keys(st.b).forEach(function (id) { if (st.b[id].t === t) n++; }); st.bi.forEach(function (x) { if (x.t === t) n++; }); return n; }
  function slots(st, b) { return Math.min(9, 2 + b.l) + permLv(st, 'hangcho'); }
  function animals(st, b) { return 2 + b.l + permLv(st, 'chuong'); }
  function cropTime(st, c, now) { return Math.max(10, Math.round(c.t / stats(st, now).cropMul)) * SEC; }
  function taxRate(st, b, d, S, now) { return d.pop * b.l * 0.6 * S.taxMul; }   // xu / giờ
  function taxOf(st, b, d, S, now) {
    var t0 = Number(b.tc) || now, dt = Math.max(0, now - t0) / HR, robot = !!st.hp.robot;
    var base = robot ? dt : Math.min(dt, TAX_CAP_H), w = st.bo.x2thue, ov = 0;
    if (w) ov = Math.max(0, Math.min(now, w[1]) - Math.max(t0, w[0])) / HR;
    if (!robot) ov = Math.min(ov, TAX_CAP_H);
    return Math.floor(taxRate(st, b, d, S, now) * (base + ov));
  }

  /* ---------------- Đơn hàng ---------------- */
  function producible(st, lv) {   // mặt hàng có thể làm ra ngay bây giờ (đã có công trình)
    var have = {}, out = [];
    CROPS.forEach(function (c) { if (c.lv <= lv && (!c.rare || st.rc.indexOf(c.id) >= 0)) have[c.id] = 1; });
    Object.keys(st.b).forEach(function (id) {
      var b = st.b[id], d = B_BY[b.t]; if (!d) return;
      if (d.k === 'pen') have[d.prod[0]] = 1;
      if (d.k === 'fac') d.rs.forEach(function (r) { if (r.lv <= lv) have[r.o] = 1; });
    });
    Object.keys(have).forEach(function (k) { var it = IT_BY[k]; if (it && it.k !== 'feed') out.push(k); });
    out.sort(); return out;
  }
  function genOrder(st, now, lv) {
    var r = rng(hash(st.seed + ':od:' + st.on)); st.on++;
    var pool = producible(st, lv); if (!pool.length) pool = ['lua'];
    var n = 1 + Math.floor(r() * Math.min(3, 1 + Math.floor(lv / 4))), it = {}, sum = 0, xp = 0;
    for (var i = 0; i < n; i++) {
      var k = pool[Math.floor(r() * pool.length)], d = IT_BY[k];
      var q = 1 + Math.floor(r() * Math.max(1, Math.min(6, Math.round(40 / Math.max(3, d.p)) + Math.floor(lv / 10))));
      it[k] = (it[k] || 0) + q;
    }
    Object.keys(it).forEach(function (k) { sum += IT_BY[k].p * it[k]; xp += IT_BY[k].xp * it[k]; });
    return { it: it, xu: Math.round(sum * 1.6 + 5 + lv), xp: Math.round(xp * 1.3 + 2), w: 0 };
  }
  function orders(st, now, init) {
    var S = stats(st, now), lv = S.lv;
    while (st.od.length < S.orderSlots) st.od.push(genOrder(st, now, lv));
    if (st.od.length > S.orderSlots) st.od.length = S.orderSlots;
  }

  /* ---------------- Nhiệm vụ ngày ---------------- */
  function questList(st, day, lv) {
    var h = hash(st.seed + ':q:' + day), out = [], used = {};
    var pool = QUESTS.filter(function (q) { return (q[0] !== 'fd' || lv >= 2) && (q[0] !== 'pr' || lv >= 2) && (q[0] !== 'up' || lv >= 2); });
    while (out.length < 3 && Object.keys(used).length < pool.length) {
      var i = h % pool.length; h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
      if (used[i]) continue; used[i] = 1;
      var q = pool[i], t = h % q[2].length; h = Math.imul(h ^ (h >>> 11), 1597334677) >>> 0;
      out.push({ t: q[0], n: q[2][t], text: q[1].replace('{n}', q[2][t]), xu: Math.round((40 + 12 * lv) * (1 + t * 0.6)), xp: Math.round((10 + 4 * lv) * (1 + t * 0.5)) });
    }
    return out;
  }
  function qRoll(st, day) { if (st.q.d !== day) st.q = { d: day, p: {}, c: [] }; }
  function qAdd(ctx, t, n) { qRoll(ctx.st, ctx.day); ctx.st.q.p[t] = (ctx.st.q.p[t] || 0) + (n || 1); if (t !== 'tx') ctx.st.s[t] = (ctx.st.s[t] || 0) + (n || 1); }   // s.tx = tổng xu thuế (cộng riêng)
  function visitReward(n) { return 30 + 10 * Math.min(n, 60); }

  /* ---------------- Ngữ cảnh lô thao tác ---------------- */
  function ctxNew(st, now, opt) {
    opt = opt || {};
    return { st: st, now: now, day: vnDay(now), costPct: Math.max(10, Math.min(500, Number(opt.costPct) || 100)), cap: Math.max(0, Number(opt.cap) || 0),
      balance: Math.max(0, Number(opt.balance) || 0), spend: 0, spentToday: st.ds.d === vnDay(now) ? st.ds.s : 0, notes: [], occ: null, chs: null, fx: [], lv0: level(st.xp).lv };
  }
  function P(ctx, pts) { return Math.max(1, Math.round(pts * ctx.costPct / 100)); }   // giá điểm sau hệ số giáo viên
  function spendPts(ctx, pts, note) {
    pts = Math.max(0, Math.round(pts)); if (!pts) return 0;
    var total = ctx.spend + pts;
    if (ctx.cap > 0 && ctx.spentToday + total > ctx.cap) throw err('daily_cap', 'Hôm nay đã chi ' + (ctx.spentToday + ctx.spend) + '/' + ctx.cap + ' điểm cho thành phố (giới hạn của giáo viên). Mai quay lại nhé!');
    if (total > ctx.balance) throw err('not_enough_points', 'Cần ' + total + ' ⭐ điểm, bạn có ' + ctx.balance + '. Làm bài tập để có thêm điểm nhé!');
    ctx.spend = total; ctx.notes.push(note); return pts;
  }
  function payXu(ctx, xu) { xu = Math.max(0, Math.round(xu)); if (ctx.st.xu < xu) throw err('not_enough_xu', 'Cần ' + fmtN(xu) + ' 🪙 xu, bạn có ' + fmtN(ctx.st.xu) + '. Thu hoạch, giao đơn hàng hoặc thu thuế để có thêm xu!'); ctx.st.xu -= xu; }
  function gainXu(ctx, xu) { xu = Math.max(0, Math.round(xu)); ctx.st.xu = Math.min(9e15, ctx.st.xu + xu); ctx.st.s.xe += xu; return xu; }
  function gainXp(ctx, xp) { var S = ctx.S || stats(ctx.st, ctx.now); var g = Math.max(0, Math.round(xp * S.xpMul * (boostOn(ctx.st, 'x2xp', ctx.now) ? 2 : 1))); ctx.st.xp = Math.min(9e15, ctx.st.xp + g); return g; }
  function hasItems(st, need, mul) { mul = mul || 1; for (var k in need) if ((st.inv[k] || 0) < need[k] * mul) return false; return true; }
  function missing(st, need, mul) { mul = mul || 1; var o = []; for (var k in need) { var h = st.inv[k] || 0; if (h < need[k] * mul) o.push((IT_BY[k] ? IT_BY[k].e + ' ' + IT_BY[k].n : k) + ' ' + h + '/' + need[k] * mul); } return o.join(', '); }
  function takeItems(ctx, need, mul) {
    mul = mul || 1; if (!hasItems(ctx.st, need, mul)) throw err('not_enough_items', 'Thiếu: ' + missing(ctx.st, need, mul) + '.');
    for (var k in need) { ctx.st.inv[k] -= need[k] * mul; if (ctx.st.inv[k] <= 0) delete ctx.st.inv[k]; }
  }
  function freeCap(ctx) { var S = stats(ctx.st, ctx.now); return S.cap - S.used; }
  function addItems(ctx, k, n) { ctx.st.inv[k] = (ctx.st.inv[k] || 0) + n; }
  function getB(ctx, id) { id = String(id); var b = ctx.st.b[id]; if (!b) throw err('not_found', 'Không tìm thấy công trình.'); return b; }
  function occ(ctx) { if (!ctx.occ) ctx.occ = occupancy(ctx.st); return ctx.occ; }
  function chs(ctx) { if (!ctx.chs) ctx.chs = ownedSet(ctx.st); return ctx.chs; }
  function needLv(ctx, lv, what) { var L = level(ctx.st.xp).lv; if (lv > L) throw err('locked', what + ' mở ở cấp ' + lv + ' (bạn đang cấp ' + L + ').'); }
  function canPlace(ctx, d, x, y, ignoreId) {
    if (!isFinite(x) || !isFinite(y) || Math.abs(x) > MAXC * CH || Math.abs(y) > MAXC * CH) throw err('bad_cell', 'Vị trí không hợp lệ.');
    var O = occ(ctx), C = chs(ctx);
    for (var i = 0; i < d.w; i++) for (var j = 0; j < d.h; j++) {
      var kx = x + i, ky = y + j, k = key(kx, ky);
      if (!cellOwned(C, kx, ky)) throw err('bad_cell', 'Chỗ này chưa phải đất của bạn. Mua thêm đất bằng ⭐ điểm nhé!');
      if (O[k] && O[k] !== ignoreId) throw err('cell_busy', 'Chỗ này đã có công trình.');
      if (ctx.st.o[k]) throw err('cell_busy', 'Cần dọn ' + OBS[ctx.st.o[k]].n.toLowerCase() + ' trước.');
    }
  }
  function occSet(ctx, id, b, d, on) { var O = occ(ctx); for (var i = 0; i < d.w; i++) for (var j = 0; j < d.h; j++) { var k = key(b.x + i, b.y + j); if (on) O[k] = id; else if (O[k] === id) delete O[k]; } }
  function log(st, now, txt) { st.lg.push([now, String(txt).slice(0, 100)]); if (st.lg.length > LOG_N) st.lg.splice(0, st.lg.length - LOG_N); }

  /* ---------------- Thao tác ---------------- */
  var OPS = {};
  // Xây mới hoặc đặt lại từ kho công trình: {t, x, y, inv?:index}
  OPS.place = function (ctx, o) {
    var st = ctx.st, d = B_BY[String(o.t)], x = int(o.x), y = int(o.y);
    if (!d || d.k === 'spec') throw err('bad_request', 'Công trình không hợp lệ.');
    if (Object.keys(st.b).length >= MAX_B) throw err('limit', 'Thành phố đã đạt ' + MAX_B + ' công trình.');
    if (o.inv == null) needLv(ctx, d.lv, d.n);
    canPlace(ctx, d, x, y);
    var S = stats(st, ctx.now), b = { t: d.id, x: x, y: y, l: 1 }, fromInv = -1;
    if (o.inv != null) {
      fromInv = int(o.inv); var it = st.bi[fromInv];
      if (!it || it.t !== d.id) throw err('bad_request', 'Không có công trình này trong kho.');
      b.l = it.l; st.bi.splice(fromInv, 1);
    } else {
      var cnt = S.counts[d.id] || 0, cntAll = lmCount(st, d.id);
      if (d.k === 'field') { if (S.fields >= S.maxFields) throw err('limit', 'Tối đa ' + S.maxFields + ' ô ruộng ở cấp này. Lên cấp hoặc mua thêm đất để có thêm.'); payXu(ctx, fieldCost(S.fields)); }
      else if ((d.k === 'fac' || d.k === 'pen') && cntAll >= 1) {
        if (cntAll >= 3) throw err('limit', 'Mỗi loại tối đa 3 cái.');
        spendPts(ctx, P(ctx, copyCost(d, cntAll)), 'Thêm ' + d.n);
      } else {
        if (d.mx && cntAll >= d.mx) throw err('already', 'Bạn đã có ' + d.n + '.');
        if (d.pts) spendPts(ctx, P(ctx, d.pts), d.n);
        if (d.xu) payXu(ctx, d.xu);
        if (d.mat) takeItems(ctx, d.mat);
      }
      gainXp(ctx, Math.max(1, Math.round((d.xu || 0) / 12 + (d.pts || 0) / 2 + 1)));
      qAdd(ctx, 'bu', 1);
    }
    if (d.k === 'field') { b.c = ''; b.e = 0; }
    if (d.k === 'pen') b.a = [];
    if (d.k === 'fac') b.q = [];
    if (d.k === 'house') b.tc = ctx.now;
    if (o.f && d.w === d.h) b.f = 1;
    var id = String(st.nid++); st.b[id] = b; occSet(ctx, id, b, d, true);
    return { id: id };
  };
  OPS.move = function (ctx, o) {
    var b = getB(ctx, o.id), d = B_BY[b.t], x = int(o.x), y = int(o.y), id = String(o.id);
    canPlace(ctx, d, x, y, id); occSet(ctx, id, b, d, false); b.x = x; b.y = y; occSet(ctx, id, b, d, true);
    if (o.f != null && d.w === d.h) { if (o.f) b.f = 1; else delete b.f; }
    return {};
  };
  OPS.flip = function (ctx, o) { var b = getB(ctx, o.id), d = B_BY[b.t]; if (d.w !== d.h) return {}; if (b.f) delete b.f; else b.f = 1; return {}; };
  OPS.store = function (ctx, o) {   // cất vào kho công trình (giữ nguyên cấp, đặt lại miễn phí)
    var b = getB(ctx, o.id), d = B_BY[b.t], id = String(o.id);
    if (d.k === 'spec') throw err('bad_request', 'Không cất được ' + d.n + '.');
    if (d.k === 'field' && b.c) throw err('busy', 'Hãy thu hoạch ruộng trước khi cất.');
    if (d.k === 'fac' && b.q.length) throw err('busy', 'Nhà máy còn hàng chưa xong – thu sản phẩm trước nhé.');
    if (d.k === 'pen' && b.a.some(function (e) { return e > 0; })) throw err('busy', 'Vật nuôi đang ăn – thu sản phẩm trước nhé.');
    if (d.k === 'house') { var S = stats(ctx.st, ctx.now), tx = taxOf(ctx.st, b, d, S, ctx.now); if (tx > 0) { gainXu(ctx, tx); ctx.st.s.tx += tx; } }
    if (ctx.st.bi.length >= 500) throw err('limit', 'Kho công trình đã đầy (500).');
    occSet(ctx, id, b, d, false); delete ctx.st.b[id]; ctx.st.bi.push({ t: b.t, l: b.l });
    return {};
  };
  OPS.plant = function (ctx, o) {
    var st = ctx.st, c = CROP_BY[String(o.c)], ids = o.ids;
    if (!c) throw err('bad_request', 'Hạt giống không hợp lệ.');
    if (!Array.isArray(ids) || !ids.length || ids.length > MAX_IDS) throw err('bad_request', 'Danh sách ruộng không hợp lệ.');
    needLv(ctx, c.lv, c.n);
    if (c.rare && st.rc.indexOf(c.id) < 0) throw err('locked', c.n + ' là giống quý – mở bằng ⭐ điểm trong Cửa hàng Điểm.');
    var t = cropTime(st, c, ctx.now), y = boostOn(st, 'x2thu', ctx.now) ? 4 : 2, n = 0;
    ids.forEach(function (id) {
      var b = st.b[String(id)]; if (!b || b.t !== 'ruong' || b.c) return;
      payXu(ctx, c.seed); b.c = c.id; b.e = ctx.now + t; b.n = y; n++;
    });
    if (!n) throw err('busy', 'Không có ruộng trống để gieo.');
    st.last.c = c.id; qAdd(ctx, 'pl', n);
    return { n: n };
  };
  OPS.harvest = function (ctx, o) {
    var st = ctx.st, ids = o.ids, n = 0, got = {}, xp = 0, room = freeCap(ctx), full = false;
    if (!Array.isArray(ids) || !ids.length || ids.length > MAX_IDS) throw err('bad_request', 'Danh sách ruộng không hợp lệ.');
    ids.forEach(function (id) {
      var b = st.b[String(id)]; if (!b || b.t !== 'ruong' || !b.c || b.e > ctx.now + 2000) return;
      var c = CROP_BY[b.c], y = b.n || 2; if (!c) { b.c = ''; return; }
      if (room < y) { full = true; return; }
      room -= y; addItems(ctx, c.id, y); got[c.id] = (got[c.id] || 0) + y; xp += c.xp * y / 2; n += y; b.c = ''; b.e = 0; delete b.n;
    });
    if (!n) { if (full) throw err('storage_full', 'Kho đầy! Bán bớt ở Chợ, giao đơn hàng hoặc nâng cấp Nhà kho.'); throw err('not_ready', 'Chưa có ruộng nào chín.'); }
    gainXp(ctx, xp); qAdd(ctx, 'hv', n);
    return { n: n, got: got, full: full };
  };
  OPS.clear = function (ctx, o) {
    var st = ctx.st, x = int(o.x), y = int(o.y), k = key(x, y), t = st.o[k];
    if (!t) throw err('not_found', 'Ở đây không có gì để dọn.');
    if (!cellOwned(chs(ctx), x, y)) throw err('bad_cell', 'Chỗ này chưa phải đất của bạn.');
    var ob = OBS[t]; payXu(ctx, ob.xu);
    var room = freeCap(ctx), g = 0; Object.keys(ob.get).forEach(function (m) { g += ob.get[m]; });
    if (room < g) throw err('storage_full', 'Kho đầy! Bán bớt hoặc nâng cấp Nhà kho rồi dọn tiếp.');
    Object.keys(ob.get).forEach(function (m) { addItems(ctx, m, ob.get[m]); });
    delete st.o[k]; gainXp(ctx, ob.xp); qAdd(ctx, 'cl', 1);
    return { got: ob.get };
  };
  OPS.feed = function (ctx, o) {   // cho mọi con đang đói ăn
    var st = ctx.st, b = getB(ctx, o.id), d = B_BY[b.t]; if (d.k !== 'pen') throw err('bad_request', 'Không phải chuồng trại.');
    var n = animals(st, b), mul = 1 / stats(st, ctx.now).facMul * (boostOn(st, 'x2may', ctx.now) ? 0.5 : 1), fed = 0;
    while (b.a.length < n) b.a.push(0);
    for (var i = 0; i < n; i++) {
      if (b.a[i] !== 0) continue;
      if (d.feed) { if ((st.inv[d.feed] || 0) < 1) break; var fneed = {}; fneed[d.feed] = 1; takeItems(ctx, fneed); }
      b.a[i] = ctx.now + Math.max(10, Math.round(d.t * mul)) * SEC; fed++;
    }
    if (!fed) { if (d.feed && (st.inv[d.feed] || 0) < 1) throw err('not_enough_items', 'Cần ' + IT_BY[d.feed].e + ' ' + IT_BY[d.feed].n + ' – làm ở Xưởng thức ăn.'); throw err('busy', 'Các con đều đã no.'); }
    qAdd(ctx, 'fd', fed);
    return { n: fed };
  };
  OPS.queue = function (ctx, o) {
    var st = ctx.st, b = getB(ctx, o.id), d = B_BY[b.t]; if (d.k !== 'fac') throw err('bad_request', 'Không phải nhà máy.');
    var r = d.rs[int(o.r)]; if (!r) throw err('bad_request', 'Sản phẩm không hợp lệ.');
    needLv(ctx, r.lv, r.n);
    var n = Math.max(1, Math.min(9, int(o.n) || 1)), done = 0;
    for (var i = 0; i < n; i++) {
      if (b.q.length >= slots(st, b)) { if (!done) throw err('queue_full', 'Hàng chờ đã đầy (' + slots(st, b) + ' ô). Nâng cấp nhà máy để thêm ô.'); break; }
      if (!hasItems(st, r.in)) { if (!done) throw err('not_enough_items', 'Thiếu: ' + missing(st, r.in) + '.'); break; }
      takeItems(ctx, r.in);
      var last = b.q.length ? b.q[b.q.length - 1][1] : 0, start = Math.max(ctx.now, last);
      var mul = 1 / (stats(st, ctx.now).facMul * (1 + 0.05 * (b.l - 1))) * (boostOn(st, 'x2may', start) || boostOn(st, 'x2may', ctx.now) ? 0.5 : 1);
      b.q.push([int(o.r), start + Math.max(10, Math.round(r.t * mul)) * SEC]); done++;
    }
    return { n: done };
  };
  OPS.collect = function (ctx, o) {   // thu sản phẩm đã xong (nhà máy / chuồng)
    var st = ctx.st, b = getB(ctx, o.id), d = B_BY[b.t], room = freeCap(ctx), got = {}, n = 0, xp = 0, full = false;
    if (d.k === 'fac') {
      while (b.q.length && b.q[0][1] <= ctx.now + 2000) {
        var r = d.rs[b.q[0][0]]; if (!r) { b.q.shift(); continue; }
        if (room < r.q) { full = true; break; }
        room -= r.q; addItems(ctx, r.o, r.q); got[r.o] = (got[r.o] || 0) + r.q; n += r.q; xp += IT_BY[r.o].xp * r.q; b.q.shift();
      }
    } else if (d.k === 'pen') {
      var p = d.prod[0];
      for (var i = 0; i < b.a.length; i++) {
        if (!(b.a[i] > 0 && b.a[i] <= ctx.now + 2000)) continue;
        if (room < 1) { full = true; break; }
        room--; addItems(ctx, p, 1); got[p] = (got[p] || 0) + 1; n++; xp += IT_BY[p].xp; b.a[i] = 0;
      }
    } else throw err('bad_request', 'Công trình này không có sản phẩm.');
    if (!n) { if (full) throw err('storage_full', 'Kho đầy! Bán bớt ở Chợ hoặc nâng cấp Nhà kho.'); throw err('not_ready', 'Chưa có sản phẩm xong.'); }
    gainXp(ctx, xp); qAdd(ctx, 'pr', n);
    return { n: n, got: got, full: full };
  };
  OPS.tax = function (ctx, o) {
    var st = ctx.st, ids = o.ids, S = stats(st, ctx.now), sum = 0, n = 0;
    if (o.all) { if (!st.hp.robot) throw err('locked', 'Cần 🤖 Robot thu thuế.'); ids = Object.keys(st.b).filter(function (id) { return B_BY[st.b[id].t] && B_BY[st.b[id].t].k === 'house'; }); }
    if (!Array.isArray(ids) || !ids.length || ids.length > (o.all ? MAX_B : MAX_IDS)) throw err('bad_request', 'Danh sách nhà không hợp lệ.');
    ids.forEach(function (id) {
      var b = st.b[String(id)]; if (!b) return; var d = B_BY[b.t]; if (!d || d.k !== 'house') return;
      var tx = taxOf(st, b, d, S, ctx.now); if (tx < 1) return;
      sum += tx; n++; b.tc = ctx.now;
    });
    if (!n) throw err('not_ready', 'Chưa có thuế để thu.');
    gainXu(ctx, sum); st.s.tx += sum; gainXp(ctx, Math.max(1, Math.round(n / 2))); qAdd(ctx, 'tx', n);
    return { xu: sum, n: n };
  };
  OPS.upgrade = function (ctx, o) {
    var st = ctx.st, b = getB(ctx, o.id), d = B_BY[b.t], c = upCost(b, d);
    if (!c) throw err('bad_request', d.n + ' không nâng cấp được.');
    if (b.l >= 100000) throw err('maxed', 'Đã tối đa.');
    if (c.pts) spendPts(ctx, P(ctx, c.pts), 'Nâng ' + d.n + ' lên cấp ' + (b.l + 1));
    if (c.xu) payXu(ctx, c.xu);
    takeItems(ctx, c.mat);
    if (d.k === 'house') { var S = stats(st, ctx.now), tx = taxOf(st, b, d, S, ctx.now); if (tx > 0) { gainXu(ctx, tx); st.s.tx += tx; } b.tc = ctx.now; }
    b.l++; gainXp(ctx, Math.round(5 + (c.xu || 0) / 15 + (c.pts || 0))); qAdd(ctx, 'up', 1);
    if (d.k === 'spec' && b.t === 'donhang') orders(st, ctx.now);
    return { l: b.l };
  };
  OPS.buyChunk = function (ctx, o) {
    var st = ctx.st, cx = int(o.cx), cy = int(o.cy);
    if (!isFinite(cx) || !isFinite(cy) || Math.abs(cx) > MAXC || Math.abs(cy) > MAXC) throw err('bad_request', 'Mảnh đất không hợp lệ.');
    var C = chs(ctx), k = key(cx, cy);
    if (C[k]) throw err('already', 'Bạn đã có mảnh đất này.');
    if (!C[key(cx + 1, cy)] && !C[key(cx - 1, cy)] && !C[key(cx, cy + 1)] && !C[key(cx, cy - 1)]) throw err('bad_request', 'Chỉ mua được mảnh đất sát đất của bạn.');
    spendPts(ctx, P(ctx, chunkCost(st)), 'Mua đất (' + cx + ',' + cy + ')');
    st.ch.push(k); C[k] = 1;
    var O = occ(ctx);
    for (var x = cx * CH; x < cx * CH + CH; x++) for (var y = cy * CH; y < cy * CH + CH; y++) if (!O[key(x, y)]) genObs(st, x, y, 0.22);
    gainXp(ctx, 20 + 5 * st.ch.length);
    return { k: k };
  };
  OPS.speed = function (ctx, o) {   // tăng tốc bằng điểm: 1 điểm / 10 phút còn lại (tối thiểu 1)
    var st = ctx.st, ids = Array.isArray(o.ids) ? o.ids : [o.id], rem = 0, list = [];
    if (!ids.length || ids.length > MAX_IDS) throw err('bad_request', 'Danh sách không hợp lệ.');
    ids.forEach(function (id) {
      var b = st.b[String(id)]; if (!b) return; var d = B_BY[b.t];
      if (d.k === 'field' && b.c && b.e > ctx.now) { rem += b.e - ctx.now; list.push(function () { b.e = ctx.now; }); }
      else if (d.k === 'fac' && b.q.length) { var e = b.q[b.q.length - 1][1]; if (e > ctx.now) { rem += e - ctx.now; list.push(function () { b.q.forEach(function (q) { q[1] = Math.min(q[1], ctx.now); }); }); } }
      else if (d.k === 'pen') { var mx = 0; b.a.forEach(function (e) { if (e > mx) mx = e; }); if (mx > ctx.now) { rem += mx - ctx.now; list.push(function () { b.a = b.a.map(function (e) { return e > ctx.now ? ctx.now : e; }); }); } }
    });
    if (!list.length) throw err('not_ready', 'Không có gì cần tăng tốc.');
    var pts = P(ctx, Math.max(1, Math.ceil(rem / (SPEED_MIN_PER_PT * MIN))));
    spendPts(ctx, pts, 'Tăng tốc'); list.forEach(function (f) { f(); });
    return { pts: pts };
  };
  OPS.sell = function (ctx, o) {
    var st = ctx.st, k = String(o.k), n = int(o.n), it = IT_BY[k];
    if (!it || !(n >= 1)) throw err('bad_request', 'Mặt hàng không hợp lệ.');
    if ((st.inv[k] || 0) < n) throw err('not_enough_items', 'Bạn chỉ có ' + (st.inv[k] || 0) + ' ' + it.n + '.');
    var S = stats(st, ctx.now), xu = Math.max(1, Math.round(it.p * n * S.sellMul));
    st.inv[k] -= n; if (st.inv[k] <= 0) delete st.inv[k];
    gainXu(ctx, xu); qAdd(ctx, 'sl', n);
    return { xu: xu };
  };
  OPS.order = function (ctx, o) {
    var st = ctx.st, i = int(o.i), od = st.od[i];
    if (!od) throw err('bad_request', 'Đơn hàng không hợp lệ.');
    if (od.w > ctx.now) throw err('not_ready', 'Xe tải đang trên đường tới.');
    takeItems(ctx, od.it);
    var S = stats(st, ctx.now), xu = Math.round(od.xu * S.ordMul);
    gainXu(ctx, xu); var xp = gainXp(ctx, od.xp); qAdd(ctx, 'od', 1);
    st.od[i] = genOrder(st, ctx.now, S.lv);
    return { xu: xu, xp: xp };
  };
  OPS.discard = function (ctx, o) {
    var st = ctx.st, i = int(o.i); if (!st.od[i]) throw err('bad_request', 'Đơn hàng không hợp lệ.');
    var nw = genOrder(st, ctx.now, stats(st, ctx.now).lv); nw.w = ctx.now + ORDER_WAIT; st.od[i] = nw;
    return {};
  };
  OPS.buyAnimal = function () { throw err('bad_request', 'Nâng cấp chuồng để có thêm con.'); };
  OPS.helper = function (ctx, o) {
    var st = ctx.st, h = HELP_BY[String(o.k)]; if (!h) throw err('bad_request', 'Trợ lý không hợp lệ.');
    if (st.hp[h.id]) throw err('already', 'Bạn đã có ' + h.n + '.');
    needLv(ctx, h.lv, h.n); spendPts(ctx, P(ctx, h.pts), h.n); st.hp[h.id] = 1;
    if (h.id === 'xetai') orders(st, ctx.now);
    if (h.id === 'robot') { var S = stats(st, ctx.now); Object.keys(st.b).forEach(function (id) { var b = st.b[id], d = B_BY[b.t]; if (d.k === 'house') { var tx = taxOf(st, b, d, S, ctx.now); if (tx > 0) { gainXu(ctx, tx); st.s.tx += tx; } b.tc = ctx.now; } }); }
    log(st, ctx.now, 'Đã thuê ' + h.n + '!');
    return {};
  };
  OPS.perm = function (ctx, o) {
    var st = ctx.st, p = PERM_BY[String(o.k)]; if (!p) throw err('bad_request', 'Nâng cấp không hợp lệ.');
    var L = permLv(st, p.id); if (p.max && L >= p.max) throw err('maxed', p.n + ' đã tối đa.');
    spendPts(ctx, P(ctx, permCost(p.id, L)), p.n + ' cấp ' + (L + 1)); st.pm[p.id] = L + 1;
    if (p.id === 'chuong') Object.keys(st.b).forEach(function (id) { var b = st.b[id]; if (B_BY[b.t].k === 'pen') while (b.a.length < animals(st, b)) b.a.push(0); });
    return { l: L + 1 };
  };
  OPS.boost = function (ctx, o) {
    var st = ctx.st, bo = BOOST_BY[String(o.k)], h = Math.max(1, Math.min(BOOST_MAX_H, int(o.h) || 1));
    if (!bo) throw err('bad_request', 'Bùa không hợp lệ.');
    var w = st.bo[bo.id], now = ctx.now, end;
    if (w && w[1] > now) { end = w[1] + h * HR; if (end - now > BOOST_MAX_H * HR) throw err('limit', 'Tối đa ' + BOOST_MAX_H + ' giờ.'); st.bo[bo.id] = [w[0], end]; }
    else { end = now + h * HR; st.bo[bo.id] = [now, end]; }
    spendPts(ctx, P(ctx, bo.pts * h), bo.n + ' ' + h + 'h');
    return { end: end };
  };
  OPS.exchange = function (ctx, o) {
    var n = int(o.n); if (EXCHANGE.indexOf(n) < 0) throw err('bad_request', 'Gói đổi không hợp lệ.');
    var lv = level(ctx.st.xp).lv; spendPts(ctx, P(ctx, n), 'Đổi ' + n + ' điểm lấy xu');
    var xu = gainXu(ctx, n * (10 + 2 * lv)); return { xu: xu };
  };
  OPS.rare = function (ctx, o) {
    var st = ctx.st, c = CROP_BY[String(o.k)]; if (!c || !c.rare) throw err('bad_request', 'Giống không hợp lệ.');
    if (st.rc.indexOf(c.id) >= 0) throw err('already', 'Bạn đã có giống ' + c.n + '.');
    needLv(ctx, c.lv, c.n); spendPts(ctx, P(ctx, c.rare), 'Giống ' + c.n); st.rc.push(c.id);
    log(st, ctx.now, 'Mở khoá giống quý ' + c.n + '!'); return {};
  };
  OPS.theme = function (ctx, o) {
    var st = ctx.st, g = GROUND_BY[String(o.k == null ? '' : o.k)]; if (!g) throw err('bad_request', 'Chủ đề không hợp lệ.');
    if (st.th.go.indexOf(g.id) < 0) { spendPts(ctx, P(ctx, g.pts), 'Chủ đề ' + g.n); st.th.go.push(g.id); }
    st.th.g = g.id; return {};
  };
  OPS.effect = function (ctx, o) {
    var st = ctx.st, f = FX_BY[String(o.k)]; if (!f) throw err('bad_request', 'Hiệu ứng không hợp lệ.');
    if (st.th.fo.indexOf(f.id) < 0) { spendPts(ctx, P(ctx, f.pts), 'Hiệu ứng ' + f.n); st.th.fo.push(f.id); st.th.fx.push(f.id); return { on: true }; }
    var i = st.th.fx.indexOf(f.id); if (i >= 0) st.th.fx.splice(i, 1); else st.th.fx.push(f.id);
    return { on: i < 0 };
  };
  OPS.vehicle = function (ctx, o) {
    var st = ctx.st, v = VEH_BY[String(o.k)]; if (!v) throw err('bad_request', 'Phương tiện không hợp lệ.');
    var n = st.vh[v.id] || 0; if (n >= VEH_MAX) throw err('limit', 'Tối đa ' + VEH_MAX + ' ' + v.n + '.');
    spendPts(ctx, P(ctx, v.pts), v.n); st.vh[v.id] = n + 1; return { n: n + 1 };
  };
  OPS.claimQuest = function (ctx, o) {
    var st = ctx.st, i = int(o.i), L = questList(st, ctx.day, level(st.xp).lv), q = L[i]; qRoll(st, ctx.day);
    if (!q) throw err('bad_request', 'Nhiệm vụ không hợp lệ.');
    if (st.q.c.indexOf(i) >= 0) throw err('already', 'Đã nhận thưởng.');
    if ((st.q.p[q.t] || 0) < q.n) throw err('not_ready', 'Chưa xong nhiệm vụ.');
    st.q.c.push(i); gainXu(ctx, q.xu); gainXp(ctx, q.xp);
    var bonus = 0; if (st.q.c.length === 3) { bonus = q.xu; gainXu(ctx, bonus); }
    return { xu: q.xu + bonus, xp: q.xp, all: st.q.c.length === 3 };
  };
  OPS.daily = function (ctx) {   // quà ghé thăm mỗi ngày (cộng dồn số ngày, không reset)
    var st = ctx.st; if (st.dv.c === ctx.day) throw err('already', 'Hôm nay đã nhận quà rồi. Mai quay lại nhé!');
    if (st.dv.last !== ctx.day) { st.dv.last = ctx.day; st.dv.n++; }
    st.dv.c = ctx.day; var xu = gainXu(ctx, visitReward(st.dv.n) + 5 * level(st.xp).lv);
    return { xu: xu, n: st.dv.n };
  };
  OPS.rename = function (ctx, o) { ctx.st.nm = cname(o.name, ''); return {}; };
  OPS.night = function (ctx, o) { ctx.st.night = int(o.v) === 0 ? 0 : int(o.v) === 2 ? 2 : 1; return {}; };   // 0 = luôn ngày, 1 = theo giờ thật, 2 = luôn đêm
  // gộp: thu hết + cho ăn (chuồng) – tiện cho nút "Quản đốc"
  OPS.collectAll = function (ctx) {
    var st = ctx.st; if (!st.hp.quandoc) throw err('locked', 'Cần 👷 Quản đốc.');
    var n = 0, got = {};
    Object.keys(st.b).forEach(function (id) {
      var d = B_BY[st.b[id].t]; if (d.k !== 'fac' && d.k !== 'pen') return;
      try { var r = OPS.collect(ctx, { id: id }); n += r.n; for (var k in r.got) got[k] = (got[k] || 0) + r.got[k]; } catch (e) { if (!e.apiCode) throw e; }
      if (d.k === 'pen') { try { OPS.feed(ctx, { id: id }); } catch (e2) { if (!e2.apiCode) throw e2; } }
    });
    if (!n) throw err('not_ready', 'Chưa có sản phẩm nào xong.');
    return { n: n, got: got };
  };

  function onDay(ctx) {   // đánh dấu ngày ghé thăm
    var st = ctx.st; if (st.dv.last !== ctx.day) { st.dv.last = ctx.day; st.dv.n++; }
  }
  function ach(ctx) {
    var st = ctx.st, out = [], S = stats(st, ctx.now);
    ACH.forEach(function (a) {
      var v = achVal(st, a.id, S), k = st.ac[a.id] || 0;
      while (k < a.t.length && v >= a.t[k]) { k++; var xu = 100 * k * k; gainXu(ctx, xu); out.push({ id: a.id, tier: k, n: a.n, e: a.e, xu: xu }); }
      st.ac[a.id] = k;
    });
    return out;
  }
  function achVal(st, id, S) {
    if (id === 'pop') return S.pop; if (id === 'ch') return st.ch.length; if (id === 'lv') return S.lv; if (id === 'dv') return st.dv.n;
    return Number(st.s[id]) || 0;
  }

  /** Áp một lô thao tác (nguyên tử: lỗi ở op nào → ném lỗi kèm opIndex, người gọi tự hoàn tác bằng bản sao). */
  function applyOps(st, ops, now, opt) {
    if (!Array.isArray(ops) || !ops.length) throw err('bad_request', 'Thiếu danh sách thao tác.');
    if (ops.length > MAX_OPS) throw err('too_many_ops', 'Tối đa ' + MAX_OPS + ' thao tác mỗi lần.');
    var ctx = ctxNew(st, now, opt), results = [];
    onDay(ctx); qRoll(st, ctx.day);
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i], name = (o && typeof o === 'object') ? String(o.op || '') : '';
      try {
        if (!own(OPS, name)) throw err('unknown_op', 'Thao tác không hợp lệ.');
        var r = OPS[name](ctx, o) || {}; r.i = i; r.op = name; results.push(r);
      } catch (e) { if (e && e.apiCode) e.opIndex = i; throw e; }
    }
    var lv1 = level(st.xp).lv, lvUp = [];
    for (var L = ctx.lv0 + 1; L <= lv1 && L < ctx.lv0 + 200; L++) { gainXu(ctx, lvReward(L)); lvUp.push(L); }
    if (lvUp.length) { orders(st, now); log(st, now, 'Lên cấp ' + lv1 + '! Có thêm công trình mới để xây.'); }
    var A = ach(ctx);
    if (ctx.spend > 0) { st.ds = { d: ctx.day, s: ctx.spentToday + ctx.spend }; st.s.ps = (st.s.ps || 0) + ctx.spend; }
    return { results: results, spend: ctx.spend, notes: ctx.notes, levelUp: lvUp, ach: A };
  }

  /* ---------------- Dữ liệu suy ra cho giao diện ---------------- */
  function derived(st, now, opt) {
    opt = opt || {};
    var S = stats(st, now), li = level(st.xp), day = vnDay(now), costPct = Math.max(10, Math.min(500, Number(opt.costPct) || 100));
    var pp = function (x) { return Math.max(1, Math.round(x * costPct / 100)); };
    var ql = questList(st, day, li.lv).map(function (q, i) { var pr = st.q.d === day ? (st.q.p[q.t] || 0) : 0; return { i: i, text: q.text, prog: Math.min(pr, q.n), target: q.n, xu: q.xu, xp: q.xp, done: pr >= q.n, claimed: st.q.d === day && st.q.c.indexOf(i) >= 0 }; });
    var rk = rank(S.pop);
    return {
      lv: li.lv, into: li.into, need: li.need, pop: S.pop, hap: S.hap, taxPct: S.taxPct, cap: S.cap, used: S.used, fields: S.fields, maxFields: S.maxFields,
      rank: rk.n, rankNext: rk.next, orderSlots: S.orderSlots, chunkCost: pp(chunkCost(st)), fieldCost: fieldCost(S.fields), counts: S.counts,
      cropMul: S.cropMul, facMul: S.facMul, ordMul: S.ordMul, sellMul: S.sellMul, xpMul: S.xpMul,
      quests: ql, dailyReady: st.dv.c !== day, dailyXu: visitReward(st.dv.last === day ? st.dv.n : st.dv.n + 1) + 5 * li.lv, visitDays: st.dv.n,
      spend: { today: st.ds.d === day ? st.ds.s : 0, cap: Math.max(0, Number(opt.cap) || 0) }, costPct: costPct,
      perms: PERMS.map(function (p) { var L = permLv(st, p.id); return { id: p.id, l: L, cost: p.max && L >= p.max ? null : pp(permCost(p.id, L)) }; }),
      exRate: 10 + 2 * li.lv, value: Math.round(st.s.ps || 0), day: day, endsAt: dayEnd(day),
      ach: ACH.map(function (a) { var k = st.ac[a.id] || 0; return { id: a.id, tier: k, max: a.t.length, val: achVal(st, a.id, S), next: k < a.t.length ? a.t[k] : null }; })
    };
  }
  function catalog() {
    return { catVer: CATVER, ch: CH, items: IT, crops: CROPS, b: B, obs: OBS, helpers: HELPERS, perms: PERMS, boosts: BOOSTS, grounds: GROUNDS, effects: EFFECTS,
      vehicles: VEHICLES, exchange: EXCHANGE, ach: ACH, ranks: RANKS, consts: { taxCapH: TAX_CAP_H, boostMaxH: BOOST_MAX_H, vehMax: VEH_MAX, speedMinPerPt: SPEED_MIN_PER_PT, maxOps: MAX_OPS, maxIds: MAX_IDS } };
  }

  return {
    VER: VER, CATVER: CATVER, CH: CH, HR: HR, MIN: MIN, SEC: SEC, MAX_OPS: MAX_OPS, MAX_IDS: MAX_IDS, TAX_CAP_H: TAX_CAP_H, SPEED_MIN_PER_PT: SPEED_MIN_PER_PT,
    IT: IT, IT_BY: IT_BY, CROPS: CROPS, CROP_BY: CROP_BY, B: B, B_BY: B_BY, OBS: OBS, HELPERS: HELPERS, HELP_BY: HELP_BY, PERMS: PERMS, PERM_BY: PERM_BY, BOOSTS: BOOSTS, BOOST_BY: BOOST_BY,
    GROUNDS: GROUNDS, GROUND_BY: GROUND_BY, EFFECTS: EFFECTS, FX_BY: FX_BY, VEHICLES: VEHICLES, VEH_BY: VEH_BY, VEH_MAX: VEH_MAX, EXCHANGE: EXCHANGE, ACH: ACH, RANKS: RANKS,
    newState: newState, migrate: migrate, applyOps: applyOps, derived: derived, catalog: catalog, stats: stats, level: level, need: need, rank: rank,
    occupancy: occupancy, ownedSet: ownedSet, cellOwned: cellOwned, key: key, hash: hash, rng: rng, vnDay: vnDay, chunkCost: chunkCost, fieldCost: fieldCost,
    upCost: upCost, permCost: permCost, copyCost: copyCost, lmCount: lmCount, slots: slots, animals: animals, cropTime: cropTime, taxOf: taxOf, taxRate: taxRate,
    boostOn: boostOn, questList: questList, producible: producible, permLv: permLv, cname: cname, fmtN: fmtN, err: err
  };
})();

/* ---------------------------------------------------------------------
 * PHẦN MÁY CHỦ (Apps Script) – nối luật CityCore với Sheet, sổ điểm, xếp hạng
 * Hành động (POST, kèm code/token học sinh): cityGet · cityAct {ops[], requestId} · cityBoard · cityVisit {who} · cityLike {who}
 * Sheet 'City': mỗi học sinh 1 dòng; state JSON (lớn thì gzip+base64) chia nhiều ô (≤ 45.000 ký tự/ô).
 * Cấu hình (Config): cityEnabled (true), cityCostPct (100 = giá điểm mặc định), cityDailySpendCap (0 = không giới hạn).
 * Sổ điểm: reason 'city'. KHÔNG tính vào báo cáo phụ huynh (familyReport_ bỏ qua), không ghi GameLog.
 * --------------------------------------------------------------------- */
const CT_SHEET = 'City', CT_PARTS = 24, CT_CELL = 45000, CT_FIX = 11;
const CT_HEADERS = ['code', 'v', 'updatedAt', 'lastReqId', 'lastResp', 'lvl', 'xp', 'pop', 'value', 'name', 'likes'].concat((function () { const a = []; for (let i = 1; i <= CT_PARTS; i++) a.push('s' + i); return a; })());
const CT_NCOL = CT_HEADERS.length;

function ctErr_(c, m) { return apiError_('city_' + c, m); }
function ctOpt_(balance) { return { costPct: clampInt_(cfgNum_('cityCostPct', 100), 10, 500, 100), cap: Math.max(0, cfgNum_('cityDailySpendCap', 0)), balance: balance }; }
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
