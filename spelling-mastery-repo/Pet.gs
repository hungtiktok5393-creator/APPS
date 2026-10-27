/* =====================================================================
 * Pet.gs – máy chủ game "Thú cưng" (Nhà Thầy Hưng / Spelling Mastery)
 * Dán nguyên file này vào Apps Script (cùng dự án với Code.gs, Games.gs, Garden.gs), rồi Deploy bản mới.
 * Tiền tố pt... / PT_... để không đụng các tệp khác. Code.gs gọi registerPetActions_(PET_ACTIONS).
 *
 * Luật chính:
 *  - Mỗi ngày (giờ Việt Nam) học sinh phải chi ít nhất `petDailyMin` điểm (mặc định 50) cho ĐỒ ĂN, CHĂM SÓC, CHƠI ĐÙA, BIỂU DIỄN của thú.
 *    Hết ngày mà chưa đủ → thú chết (lúc 0:00 hôm sau). Ngày nhận nuôi / hồi sinh là ngày ân hạn (không bị chết).
 *  - Thú chết: hồi sinh trong 7 ngày (tốn điểm) hoặc tiễn bé vào Album rồi nuôi bé mới.
 *  - Điểm CHỈ ĐỂ CHI (reason 'pet' trong Ledger). Không có đường nào sinh điểm. Không ngẫu nhiên/hộp quà.
 *  - Trang phụ huynh KHÔNG tính gì từ game này (familyReport_ bỏ qua reason 'pet').
 *  - petAct: nguyên tử TOÀN LÔ, idempotent theo requestId.
 * Cấu hình (sheet Config): petEnabled (true), petDailyMin (50), petDailySpendCap (0 = không giới hạn).
 * ===================================================================== */

const PT_VER = 1;                 // phiên bản cấu trúc state
const PT_CATVER = 2;              // phiên bản danh mục (client cache theo số này). 2 = bảng giá mới (gấp đôi theo cấp/độ hiếm)
const PT_SHEET = 'Pets';
const PT_HEADERS = ['code', 'state', 'v', 'updatedAt', 'lastReqId', 'lastResp', 'lvl', 'xp', 'streak', 'alive', 'name', 'species', 'best'];
const PT_NCOL = PT_HEADERS.length;
const PT_MAXLV = 100, PT_REVIVE_DAYS = 7, PT_LOG = 40, PT_ALBUM = 60, PT_MAX_OPS = 20;
const PT_DECAY = { h: 2.5, j: 2, c: 1.5, e: 2.5 };          // mức giảm mỗi giờ: no bụng, vui vẻ, sạch sẽ, năng lượng
const PT_SLEEP_CD = 3 * 3600000;
// Bảng giá: giá gốc (số viết trong danh mục) × PT_PRICE_X × (1 + cấp mở / PT_PRICE_LV) – đồ cấp cao đắt hơn nhiều.
// Loài thú (không có cấp mở) thêm hệ số độ hiếm: loài rẻ nhất ×1, loài hiếm nhất ×(1 + PT_PRICE_RARE).
// XP nhận được vẫn tính theo giá gốc (trường b) để tốc độ lên cấp không đổi.
const PT_PRICE_X = 2, PT_PRICE_LV = 60, PT_PRICE_RARE = 0.5, PT_RENAME = 20, PT_DEF_MIN = 50;

/* ---------------- Danh mục ---------------- */
const PT_SPECIES = [
  { id: 'meo', n: 'Mèo Mướp', e: '🐱', p: 25 }, { id: 'cun', n: 'Cún Con', e: '🐶', p: 25 }, { id: 'tho', n: 'Thỏ Bông', e: '🐰', p: 25 },
  { id: 'ga', n: 'Gà Con', e: '🐥', p: 40 }, { id: 'gau', n: 'Gấu Nâu', e: '🐻', p: 60 }, { id: 'panda', n: 'Gấu Trúc', e: '🐼', p: 120 },
  { id: 'cao', n: 'Cáo Lửa', e: '🦊', p: 150 }, { id: 'canhcut', n: 'Cánh Cụt', e: '🐧', p: 200 }, { id: 'ho', n: 'Hổ Con', e: '🐯', p: 350 },
  { id: 'rong', n: 'Rồng Ngọc', e: '🐲', p: 900 }, { id: 'kylan', n: 'Kỳ Lân', e: '🦄', p: 1500 }, { id: 'phuong', n: 'Phượng Hoàng', e: '🐦‍🔥', p: 3000 }
];
// Đồ ăn: p = giá điểm, h = no bụng, j = vui, e = năng lượng, x = hệ số XP, lv = cấp cần
const PT_FOODS = [
  { id: 'banhquy', n: 'Bánh quy', e: '🍪', p: 3, h: 8, j: 2 }, { id: 'tao', n: 'Táo đỏ', e: '🍎', p: 4, h: 11, j: 2 }, { id: 'carot', n: 'Cà rốt', e: '🥕', p: 5, h: 14, j: 2 },
  { id: 'sua', n: 'Sữa tươi', e: '🥛', p: 5, h: 12, j: 4 }, { id: 'ca', n: 'Cá nướng', e: '🐟', p: 7, h: 18, j: 5 }, { id: 'trung', n: 'Trứng ốp', e: '🍳', p: 8, h: 21, j: 4 },
  { id: 'com', n: 'Cơm nắm', e: '🍙', p: 10, h: 27, j: 5 }, { id: 'banhmi', n: 'Bánh mì', e: '🥖', p: 10, h: 26, j: 6 }, { id: 'kem', n: 'Kem ốc quế', e: '🍦', p: 12, h: 12, j: 24 },
  { id: 'nuoc', n: 'Nước tăng lực', e: '🧃', p: 12, h: 6, j: 6, en: 45 }, { id: 'pizza', n: 'Pizza', e: '🍕', p: 15, h: 36, j: 10 }, { id: 'burger', n: 'Hamburger', e: '🍔', p: 15, h: 36, j: 9 },
  { id: 'ga', n: 'Gà rán', e: '🍗', p: 18, h: 42, j: 11, lv: 3 }, { id: 'sushi', n: 'Sushi', e: '🍣', p: 20, h: 42, j: 15, lv: 5 }, { id: 'banhkem', n: 'Bánh kem', e: '🍰', p: 25, h: 40, j: 30, x: 1.1, lv: 5 },
  { id: 'bittet', n: 'Bít tết', e: '🥩', p: 30, h: 60, j: 16, x: 1.1, lv: 8 }, { id: 'mamtiec', n: 'Mâm tiệc', e: '🍱', p: 45, h: 75, j: 32, en: 20, x: 1.2, lv: 12 },
  { id: 'taovang', n: 'Táo vàng thần', e: '🍏', p: 80, h: 100, j: 50, en: 50, x: 1.5, lv: 18 }, { id: 'keosao', n: 'Kẹo sao băng', e: '🌠', p: 150, h: 100, j: 100, en: 100, x: 2, lv: 30 },
  { id: 'tiec', n: 'Đại tiệc sinh nhật', e: '🎂', p: 250, h: 100, j: 100, en: 100, x: 2.5, lv: 10 }
];
// Chăm sóc: c = sạch sẽ, j = vui, en = năng lượng, cure = chữa ốm, cd = hồi chiêu (ms). Có p > 0 thì tính vào khẩu phần ngày.
const PT_CARE = [
  { id: 'tam', n: 'Tắm bọt', e: '🛁', p: 4, c: 100, j: 5 }, { id: 'chai', n: 'Chải lông', e: '🪮', p: 6, c: 30, j: 14 },
  { id: 'thuoc', n: 'Uống thuốc', e: '💊', p: 15, cure: 1, j: 2 }, { id: 'vitamin', n: 'Vitamin', e: '🍬', p: 10, en: 35, j: 4 },
  { id: 'spa', n: 'Spa thư giãn', e: '💆', p: 30, c: 100, j: 40, en: 40, lv: 4 }, { id: 'ngu', n: 'Đi ngủ', e: '💤', p: 0, en: 100, cd: PT_SLEEP_CD }
];
// Đồ chơi: mua 1 lần; mỗi lần chơi tốn pp điểm (tự tính bên dưới), không phải chờ. j = vui, en = năng lượng tốn
const PT_TOYS = [
  { id: 'bong', n: 'Quả bóng', e: '⚽', p: 30, j: 15, en: 8 }, { id: 'len', n: 'Cuộn len', e: '🧶', p: 40, j: 16, en: 6 }, { id: 'xuong', n: 'Xương gặm', e: '🦴', p: 40, j: 16, en: 5 },
  { id: 'vit', n: 'Vịt cao su', e: '🦆', p: 60, j: 18, en: 4 }, { id: 'yoyo', n: 'Yo-yo', e: '🪀', p: 90, j: 20, en: 8 }, { id: 'dieu', n: 'Diều giấy', e: '🪁', p: 150, j: 24, en: 10, lv: 4 },
  { id: 'vantruot', n: 'Ván trượt', e: '🛹', p: 300, j: 30, en: 14, lv: 8 }, { id: 'tenlua', n: 'Tên lửa đồ chơi', e: '🚀', p: 600, j: 36, en: 12, lv: 14 },
  { id: 'dia', n: 'Đĩa bay', e: '🥏', p: 1000, j: 42, en: 12, lv: 20 }
];
// Phụ kiện: slot hat | eyes | neck | back
const PT_ACC = [
  { id: 'no', s: 'hat', n: 'Nơ hồng', p: 40 }, { id: 'muTiec', s: 'hat', n: 'Mũ sinh nhật', p: 60 }, { id: 'hoa', s: 'hat', n: 'Vòng hoa', p: 90 },
  { id: 'muLen', s: 'hat', n: 'Mũ len', p: 120 }, { id: 'muCao', s: 'hat', n: 'Mũ ảo thuật', p: 220, lv: 3 }, { id: 'muCaoBoi', s: 'hat', n: 'Mũ cao bồi', p: 320, lv: 5 },
  { id: 'muTn', s: 'hat', n: 'Mũ tốt nghiệp', p: 450, lv: 8 }, { id: 'vuongMien', s: 'hat', n: 'Vương miện', p: 1200, lv: 12 }, { id: 'haoQuang', s: 'hat', n: 'Hào quang thiên thần', p: 2500, lv: 20 },
  { id: 'kinhTron', s: 'eyes', n: 'Kính tròn', p: 80 }, { id: 'kinhRam', s: 'eyes', n: 'Kính râm', p: 160 }, { id: 'kinhTim', s: 'eyes', n: 'Kính trái tim', p: 260, lv: 3 },
  { id: 'kinhSao', s: 'eyes', n: 'Kính ngôi sao', p: 420, lv: 6 }, { id: 'kinhVr', s: 'eyes', n: 'Kính tương lai', p: 900, lv: 12 },
  { id: 'noCo', s: 'neck', n: 'Nơ cổ', p: 60 }, { id: 'chuong', s: 'neck', n: 'Vòng chuông', p: 90 }, { id: 'khan', s: 'neck', n: 'Khăn quàng', p: 140 },
  { id: 'huyChuong', s: 'neck', n: 'Huy chương vàng', p: 500, lv: 6 }, { id: 'ngoc', s: 'neck', n: 'Chuỗi ngọc trai', p: 900, lv: 10 },
  { id: 'balo', s: 'back', n: 'Ba lô', p: 150 }, { id: 'aoChoang', s: 'back', n: 'Áo choàng', p: 420, lv: 4 }, { id: 'canhBuom', s: 'back', n: 'Cánh bướm', p: 800, lv: 8 },
  { id: 'canhThienThan', s: 'back', n: 'Cánh thiên thần', p: 1500, lv: 14 }, { id: 'canhRong', s: 'back', n: 'Cánh rồng', p: 2500, lv: 20 }, { id: 'canhTien', s: 'back', n: 'Cánh tiên pha lê', p: 4000, lv: 30 }
];
const PT_COLORS = [
  { id: 'hong', n: 'Hồng phấn', p: 100 }, { id: 'bacha', n: 'Xanh bạc hà', p: 100 }, { id: 'lavender', n: 'Tím oải hương', p: 100 }, { id: 'nang', n: 'Vàng nắng', p: 100 },
  { id: 'dao', n: 'Cam đào', p: 150 }, { id: 'bien', n: 'Xanh biển', p: 150 }, { id: 'khoi', n: 'Xám khói', p: 150 }, { id: 'tuyet', n: 'Trắng tuyết', p: 200 }, { id: 'den', n: 'Đen huyền', p: 200 },
  { id: 'kim', n: 'Ánh kim', p: 1500, lv: 10 }, { id: 'lua', n: 'Lửa thiêng', p: 2500, lv: 15 }, { id: 'cauvong', n: 'Cầu vồng', p: 3000, lv: 18 },
  { id: 'phale', n: 'Pha lê', p: 4000, lv: 22 }, { id: 'thienha', n: 'Thiên hà', p: 5000, lv: 26 }
];
const PT_ROOMS = [
  { id: 'phong', n: 'Phòng ấm áp', p: 0 }, { id: 'vuon', n: 'Vườn hoa', p: 150 }, { id: 'bien', n: 'Bãi biển', p: 300 }, { id: 'rung', n: 'Rừng thần tiên', p: 450, lv: 3 },
  { id: 'tuyet', n: 'Xứ tuyết', p: 550, lv: 5 }, { id: 'keo', n: 'Vương quốc kẹo', p: 700, lv: 7 }, { id: 'daiduong', n: 'Đáy đại dương', p: 900, lv: 9 },
  { id: 'vutru', n: 'Trạm vũ trụ', p: 1300, lv: 12 }, { id: 'laudai', n: 'Lâu đài hoàng gia', p: 2000, lv: 16 }, { id: 'may', n: 'Thiên đường mây', p: 3200, lv: 22 }
];
// Nội thất: slot fl (sàn trái) | fr (sàn phải) | wl (tường trái) | wr (tường phải) | ce (trần) | rug (thảm)
const PT_FURN = [
  { id: 'caycanh', s: 'fl', n: 'Chậu cây', e: '🪴', p: 40 }, { id: 'gaubong', s: 'fl', n: 'Gấu bông', e: '🧸', p: 60 }, { id: 'sofa', s: 'fl', n: 'Ghế sofa', e: '🛋️', p: 160 },
  { id: 'cayThong', s: 'fl', n: 'Cây thông', e: '🎄', p: 220 }, { id: 'ngua', s: 'fl', n: 'Ngựa gỗ', e: '🎠', p: 600, lv: 6 }, { id: 'phunNuoc', s: 'fl', n: 'Đài phun nước', e: '⛲', p: 900, lv: 10 },
  { id: 'sach', s: 'fr', n: 'Chồng sách', e: '📚', p: 50 }, { id: 'quaTang', s: 'fr', n: 'Hộp quà', e: '🎁', p: 70 }, { id: 'beCa', s: 'fr', n: 'Bể cá', e: '🐠', p: 250 },
  { id: 'mayGame', s: 'fr', n: 'Máy chơi game', e: '🕹️', p: 320, lv: 4 }, { id: 'piano', s: 'fr', n: 'Đàn piano', e: '🎹', p: 650, lv: 8 }, { id: 'langDen', s: 'fr', n: 'Lâu đài cát', e: '🏰', p: 1100, lv: 12 },
  { id: 'tranh', s: 'wl', n: 'Bức tranh', e: '🖼️', p: 50 }, { id: 'dongHo', s: 'wl', n: 'Đồng hồ', e: '🕰️', p: 90 }, { id: 'cup', s: 'wl', n: 'Cúp vàng', e: '🏆', p: 500, lv: 6 },
  { id: 'co', s: 'wr', n: 'Cờ đuôi nheo', e: '🎏', p: 60 }, { id: 'saoTuong', s: 'wr', n: 'Ngôi sao', e: '🌟', p: 120 }, { id: 'cauVong', s: 'wr', n: 'Cầu vồng', e: '🌈', p: 380, lv: 5 },
  { id: 'bongBay', s: 'ce', n: 'Bóng bay', e: '🎈', p: 30 }, { id: 'den', s: 'ce', n: 'Đèn ngủ', e: '💡', p: 60 }, { id: 'disco', s: 'ce', n: 'Quả cầu disco', e: '🪩', p: 450, lv: 7 },
  { id: 'thamTron', s: 'rug', n: 'Thảm tròn', p: 50 }, { id: 'thamSoc', s: 'rug', n: 'Thảm sọc', p: 150 }, { id: 'thamHoa', s: 'rug', n: 'Thảm hoàng gia', p: 450, lv: 6 }
];
const PT_TRICKS = [
  { id: 'nhay', n: 'Nhảy cao', e: '⤴️', lv: 2, p: 50 }, { id: 'xoay', n: 'Xoay vòng', e: '🌀', lv: 4, p: 100 }, { id: 'vay', n: 'Vẫy tay chào', e: '👋', lv: 6, p: 160 },
  { id: 'lon', n: 'Lộn nhào', e: '🤸', lv: 9, p: 300 }, { id: 'mua', n: 'Nhảy múa', e: '💃', lv: 13, p: 500 }, { id: 'hat', n: 'Ca hát', e: '🎤', lv: 17, p: 800 },
  { id: 'bay', n: 'Bay lượn', e: '🕊️', lv: 24, p: 1500 }, { id: 'phep', n: 'Phép thuật', e: '✨', lv: 35, p: 3000 }, { id: 'cauvong', n: 'Gọi cầu vồng', e: '🌈', lv: 50, p: 8000 }
];
// Kỹ năng: học 1 lần (p điểm); mỗi lần diễn tốn sp điểm (tự tính bên dưới), không phải chờ.
// Mini game: vé p điểm (không trả lại điểm, chỉ cho XP + vui). smax = điểm số tối đa hợp lệ; k = XP mỗi điểm số; xmax = trần XP; ms = thời gian tối thiểu
const PT_GAMES = [
  { id: 'hung', n: 'Hứng quà', e: '🧺', p: 5, smax: 600, k: 0.4, xmax: 150, ms: 20000 },
  { id: 'nho', n: 'Lật thẻ trí nhớ', e: '🃏', p: 5, smax: 100, k: 1.2, xmax: 120, ms: 8000 },
  { id: 'bong', n: 'Thổi bong bóng', e: '🫧', p: 5, smax: 400, k: 0.5, xmax: 140, ms: 15000 }
];
const PT_ACH = [
  { id: 'fd', n: 'Đầu bếp nhí', e: '🍳', d: 'Cho bé ăn', t: [10, 50, 200, 1000, 5000] },
  { id: 'sb', n: 'Bạn thân thiết', e: '🔥', d: 'Chuỗi ngày nuôi đủ', t: [3, 7, 14, 30, 60, 100, 365] },
  { id: 'lv', n: 'Lớn khôn', e: '⭐', d: 'Cấp cao nhất của bé', t: [5, 15, 30, 50, 75, 100] },
  { id: 'ps', n: 'Hết lòng vì bé', e: '💝', d: 'Tổng điểm đã chi', t: [500, 2000, 10000, 50000, 200000] },
  { id: 'gm', n: 'Game thủ', e: '🎮', d: 'Ván mini game', t: [5, 25, 100, 500] },
  { id: 'pl', n: 'Bạn cùng chơi', e: '🎾', d: 'Lần chơi đồ chơi', t: [10, 50, 200, 1000] },
  { id: 'tk', n: 'Ngôi sao sân khấu', e: '🎪', d: 'Lần biểu diễn', t: [10, 50, 200, 1000] },
  { id: 'ow', n: 'Nhà sưu tầm', e: '🎁', d: 'Món đồ sở hữu', t: [3, 10, 25, 50, 80] }
];
// Nhiệm vụ ngày: [loại, mẫu câu, các mức, XP thưởng mỗi mức]
const PT_QUESTS = [
  ['feed', 'Cho bé ăn {n} lần', [3, 4, 5], 40], ['care', 'Tắm hoặc chải lông {n} lần', [1, 2], 40], ['toy', 'Chơi đồ chơi {n} lần', [2, 3, 4], 40],
  ['game', 'Chơi mini game {n} ván', [1, 2], 50], ['trick', 'Cho bé biểu diễn {n} lần', [1, 2, 3], 40], ['spend', 'Chi {n} điểm cho bé', [60, 100, 160], 60],
  ['pat', 'Vuốt ve bé {n} lần', [5, 10, 15], 30]
];
const PT_STAGES = [[1, 'Sơ sinh'], [5, 'Bé nhí'], [15, 'Thiếu niên'], [30, 'Trưởng thành'], [50, 'Huyền thoại']];
const PT_SLOTS = { hat: 'acc', eyes: 'acc', neck: 'acc', back: 'acc', col: 'col', room: 'room', fl: 'furn', fr: 'furn', wl: 'furn', wr: 'furn', ce: 'furn', rug: 'furn' };

/* ---- Áp bảng giá (chạy 1 lần khi nạp tệp): b = giá gốc (để tính XP), p = giá thật ---- */
function ptNice_(v) { if (v <= 0) return 0; const s = v < 50 ? 1 : v < 200 ? 5 : v < 2000 ? 10 : v < 20000 ? 50 : 100; return Math.max(1, Math.round(v / s) * s); }
function ptPrice_(base, lv, rare) { return ptNice_(base * PT_PRICE_X * (1 + (lv || 0) / PT_PRICE_LV) * (1 + PT_PRICE_RARE * (rare || 0))); }
(function ptApplyPrices_() {
  [PT_FOODS, PT_CARE, PT_TOYS, PT_ACC, PT_COLORS, PT_ROOMS, PT_FURN, PT_TRICKS, PT_GAMES].forEach(function (arr) {
    arr.forEach(function (x) { if (x.b == null) { x.b = x.p; x.p = ptPrice_(x.p, x.lv); } });
  });
  const n = PT_SPECIES.length;
  PT_SPECIES.forEach(function (x, i) { if (x.b == null) { x.b = x.p; x.p = ptPrice_(x.p, 0, n > 1 ? i / (n - 1) : 0); } });
  // Mỗi lần chơi đồ chơi / biểu diễn đều tốn điểm (không còn thời gian chờ)
  PT_TOYS.forEach(function (t) { t.pp = 2 + Math.round(t.j / 6); });
  PT_TRICKS.forEach(function (t, i) { t.sp = 3 + 2 * i; });
})();
function ptBy_(arr) { const o = {}; arr.forEach(function (x) { o[x.id] = x; }); return o; }
const PT_SP_BY = ptBy_(PT_SPECIES), PT_FOOD_BY = ptBy_(PT_FOODS), PT_CARE_BY = ptBy_(PT_CARE), PT_TOY_BY = ptBy_(PT_TOYS), PT_ACC_BY = ptBy_(PT_ACC),
  PT_COL_BY = ptBy_(PT_COLORS), PT_ROOM_BY = ptBy_(PT_ROOMS), PT_FURN_BY = ptBy_(PT_FURN), PT_TRICK_BY = ptBy_(PT_TRICKS), PT_GAME_BY = ptBy_(PT_GAMES);
const PT_SHOP = { acc: PT_ACC_BY, col: PT_COL_BY, room: PT_ROOM_BY, furn: PT_FURN_BY, toy: PT_TOY_BY };
const PT_OWN_KEY = { acc: 'a', col: 'c', room: 'r', furn: 'f', toy: 't' };

/* ---------------- Tiện ích ---------------- */
function ptDay_(now) { return Math.floor((now + 7 * 3600000) / 86400000); }        // ngày theo giờ Việt Nam
function ptDayEnd_(day) { return (day + 1) * 86400000 - 7 * 3600000; }               // 0:00 (giờ VN) của ngày hôm sau, theo ms UTC
function ptMin_() { return clampInt_(cfgNum_('petDailyMin', PT_DEF_MIN), 1, 100000, PT_DEF_MIN); }
function ptErr_(c, m) { return apiError_('pet_' + c, m); }
function ptCl_(v, hi) { v = Number(v); if (!isFinite(v)) return 0; return Math.max(0, Math.min(hi == null ? 100 : hi, v)); }
function ptNeed_(lv) { return Math.round(50 * Math.pow(1.09, lv - 1)); }
function ptLevel_(xp) {
  let lv = 1, rest = Math.max(0, Number(xp) || 0);
  while (lv < PT_MAXLV && rest >= ptNeed_(lv)) { rest -= ptNeed_(lv); lv++; }
  return { lv: lv, into: Math.floor(rest), need: lv >= PT_MAXLV ? 0 : ptNeed_(lv), maxed: lv >= PT_MAXLV };
}
function ptStage_(lv) { let s = 0; PT_STAGES.forEach(function (x, i) { if (lv >= x[0]) s = i; }); return s; }
function ptName_(v, def) {
  let s = String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > 16) s = s.slice(0, 16).trim();
  return s || def;
}
function ptReviveCost_(pet) { return 200 + 20 * ptLevel_(pet.xp).lv; }
function ptHash_(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }

function ptNew_(now) {
  return { ver: PT_VER, pet: null, sr: 0, sb: 0, chk: ptDay_(now), fd: {}, ds: { d: 0, s: 0 },
    own: { a: [], c: [], r: ['phong'], f: [], t: [] }, eq: { hat: '', eyes: '', neck: '', back: '', col: '', room: 'phong', fl: '', fr: '', wl: '', wr: '', ce: '', rug: '' },
    al: [], s: { fd: 0, ps: 0, gm: 0, pl: 0, tk: 0, ad: 0, die: 0, rv: 0, lvMax: 0 }, ac: {}, q: { d: 0, p: {}, c: [] }, cd: {}, gm: null, lg: [[now, 'Chào mừng đến Nhà thú cưng!']], cr: now };
}
function ptMigrate_(st) {
  const n = ptNew_(st.cr || Date.now());
  Object.keys(n).forEach(function (k) { if (st[k] === undefined) st[k] = n[k]; });
  ['own', 'eq', 's', 'q'].forEach(function (g) { Object.keys(n[g]).forEach(function (k) { if (st[g][k] === undefined) st[g][k] = n[g][k]; }); });
  if (st.own.r.indexOf('phong') < 0) st.own.r.unshift('phong');
  if (!st.eq.room) st.eq.room = 'phong';
  st.ver = PT_VER; return st;
}
function ptLog_(st, now, txt) { st.lg.push([now, String(txt).slice(0, 90)]); if (st.lg.length > PT_LOG) st.lg.splice(0, st.lg.length - PT_LOG); }

/* ---------------- Sheet ---------------- */
function ptSh_() { return sheetT_(PT_SHEET, PT_HEADERS, [1, 2, 4, 5, 6, 11, 12]); }
function ptLoad_(sh, code) {
  const row = findRow_(sh, 1, code); if (!row) return null;
  const r = sh.getRange(row, 1, 1, 6).getValues()[0], js = String(r[1] || '');
  let st; try { st = JSON.parse(js); } catch (e) { throw ptErr_('corrupt', 'Dữ liệu thú cưng bị lỗi, hãy báo giáo viên.'); }
  return { row: row, code: code, st: ptMigrate_(st), raw: js, v: Number(r[2]) || 0, lastReqId: String(r[4] || ''), lastResp: String(r[5] || '') };
}
function ptRowArr_(code, st, v, now, rid, resp) {
  const p = st.pet, li = p ? ptLevel_(p.xp) : { lv: 0 };
  return [code, JSON.stringify(st), v, new Date(now).toISOString(), rid, resp, li.lv, p ? Math.floor(p.xp) : 0, st.sr, p && !p.dead ? 1 : 0,
    p ? safe_(p.nm) : '', p ? p.sp : '', st.sb];
}
function ptSave_(sh, L, st, v, now, rid, resp) { sh.getRange(L.row, 1, 1, PT_NCOL).setValues([ptRowArr_(L.code, st, v, now, rid, resp)]); }
function ptCreate_(sh, code, now) { appendRows_(sh, [ptRowArr_(code, ptNew_(now), 1, now, '', '')]); return ptLoad_(sh, code); }

/* ---------------- Thời gian: chỉ số giảm dần & kiểm tra khẩu phần ngày ---------------- */
function ptTick_(pet, now) {
  if (!pet || pet.dead) return;
  const dt = (now - (Number(pet.t) || now)) / 3600000;
  if (dt > 0) {
    pet.h = ptCl_(pet.h - PT_DECAY.h * dt, 130); pet.j = ptCl_(pet.j - PT_DECAY.j * dt); pet.c = ptCl_(pet.c - PT_DECAY.c * dt); pet.e = ptCl_(pet.e - PT_DECAY.e * dt);
    if (!pet.sick && (pet.h <= 0 || pet.c <= 0)) pet.sick = 1;
  }
  pet.t = now;
}
/** Duyệt các ngày đã qua kể từ lần kiểm tra trước: đủ khẩu phần → chuỗi +1; thiếu (trừ ngày ân hạn) → thú chết. Trả true nếu thú vừa chết. */
function ptCheck_(st, today, now) {
  const min = ptMin_(); let died = false;
  const from = Number(st.chk); let d = isFinite(from) ? from : today;
  if (today - d > 4000) d = today - 4000;
  for (; d < today; d++) {
    const p = st.pet, fed = Number(st.fd[d]) || 0;
    if (!p || p.dead) { st.sr = 0; continue; }
    if (fed >= min) { st.sr++; if (st.sr > st.sb) st.sb = st.sr; continue; }
    if (d <= p.bd) continue;                                   // ngày nhận nuôi / hồi sinh: ân hạn
    ptTick_(p, Math.min(now, ptDayEnd_(d)));
    p.dead = d + 1; p.dc = fed; p.t = ptDayEnd_(d); st.sr = 0; st.s.die++; died = true;
    ptLog_(st, ptDayEnd_(d), p.nm + ' đã mất vì ngày ' + ptDateStr_(d) + ' chỉ được chăm ' + fed + '/' + min + ' điểm.');
  }
  st.chk = today;
  Object.keys(st.fd).forEach(function (k) { if (Number(k) < today - 20) delete st.fd[k]; });
  return died;
}
function ptDateStr_(day) { const d = new Date(day * 86400000); return ('0' + d.getUTCDate()).slice(-2) + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2); }

/* ---------------- Nhiệm vụ ngày ---------------- */
function ptQuests_(code, day, st) {
  const learned = st.pet && st.pet.k && st.pet.k.length, pool = PT_QUESTS.filter(function (q) { return q[0] !== 'trick' || learned; });
  let h = ptHash_(code + ':' + day); const out = [], used = {};
  while (out.length < 3 && Object.keys(used).length < pool.length) {
    const i = h % pool.length; h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
    if (used[i]) continue; used[i] = 1; const q = pool[i], lvl = h % q[2].length; h = Math.imul(h ^ (h >>> 11), 1597334677) >>> 0;
    out.push({ t: q[0], n: q[2][lvl], xp: q[3] + lvl * 15, text: q[1].replace('{n}', q[2][lvl]) });
  }
  return out;
}
function ptQRoll_(st, day) { if (st.q.d !== day) st.q = { d: day, p: {}, c: [] }; }
function ptQ_(ctx, t, n) { ptQRoll_(ctx.st, ctx.day); ctx.st.q.p[t] = (ctx.st.q.p[t] || 0) + (n || 1); }

/* ---------------- Ngữ cảnh một lô ---------------- */
function ptSpend_(ctx, pts, note, feeds) {   // chi ĐIỂM (ghi nhận; trừ thật khi cả lô hợp lệ). feeds = tính vào khẩu phần ngày
  pts = Math.max(0, Math.round(pts)); if (!pts) return 0;
  const total = ctx.spend + pts;
  if (ctx.cap > 0 && ctx.spentToday + total > ctx.cap) throw ptErr_('daily_cap', 'Đã chạm giới hạn chi điểm cho thú cưng hôm nay (' + ctx.spentToday + '/' + ctx.cap + ' điểm).');
  if (total > ctx.balance) throw ptErr_('not_enough_points', 'Không đủ điểm: cần ' + total + ', bạn có ' + ctx.balance + '. Làm bài tập để có thêm điểm nhé!');
  ctx.spend = total; ctx.notes.push(note); if (feeds) ctx.feed += pts;
  ptQ_(ctx, 'spend', pts);
  return pts;
}
function ptAlive_(ctx) {
  const p = ctx.st.pet;
  if (!p) throw ptErr_('no_pet', 'Bạn chưa có thú cưng. Hãy nhận nuôi một bé nhé!');
  if (p.dead) throw ptErr_('dead', p.nm + ' đã mất. Hãy hồi sinh hoặc nhận nuôi bé mới.');
  return p;
}
function ptLv_(ctx) { return ctx.st.pet ? ptLevel_(ctx.st.pet.xp).lv : 0; }
function ptNeedLv_(ctx, lv, what) { if (lv && ptLv_(ctx) < lv) throw ptErr_('locked', what + ' cần bé đạt cấp ' + lv + '.'); }
function ptXpMul_(st) {
  const p = st.pet; if (!p) return 1;
  return (0.6 + 0.4 * ptCl_(p.j) / 100) * (p.sick ? 0.5 : 1) * (1 + Math.min(0.5, 0.02 * st.sr));
}
function ptGainXp_(ctx, xp, raw) {
  const p = ctx.st.pet; if (!p || p.dead) return 0;
  const g = Math.max(0, Math.round(raw ? xp : xp * ptXpMul_(ctx.st)));
  p.xp = Math.min(9e15, (Number(p.xp) || 0) + g); return g;
}

/* ---------------- Thao tác ---------------- */
function ptOpAdopt_(ctx, o) {
  const st = ctx.st, sp = PT_SP_BY[String(o.sp || '')];
  if (!sp) throw ptErr_('bad_request', 'Loài thú không hợp lệ.');
  if (st.pet && !st.pet.dead) throw ptErr_('has_pet', 'Bạn đang nuôi ' + st.pet.nm + ' rồi.');
  if (st.pet) ptArchive_(ctx);
  ptSpend_(ctx, sp.p, 'nhận nuôi ' + sp.n, false);
  const nm = ptName_(o.name, sp.n);
  st.pet = { sp: sp.id, nm: nm, born: ctx.now, bd: ctx.day, xp: 0, h: 50, j: 80, c: 100, e: 100, t: ctx.now, sick: 0, dead: 0, dc: 0, k: [], gen: (st.s.ad || 0) + 1 };
  st.s.ad++; ptLog_(st, ctx.now, 'Chào mừng ' + nm + ' (' + sp.n + ') về nhà!');
  return { adopted: sp.id, name: nm };
}
function ptArchive_(ctx) {
  const st = ctx.st, p = st.pet; if (!p) return;
  st.al.unshift({ sp: p.sp, nm: p.nm, lv: ptLevel_(p.xp).lv, b: p.born, e: p.dead ? ptDayEnd_(p.dead - 1) : ctx.now });
  if (st.al.length > PT_ALBUM) st.al.length = PT_ALBUM;
  st.pet = null;
}
function ptOpFeed_(ctx, o) {
  const p = ptAlive_(ctx), f = PT_FOOD_BY[String(o.id || '')];
  if (!f) throw ptErr_('bad_request', 'Món ăn không hợp lệ.');
  ptNeedLv_(ctx, f.lv, f.n);
  if (p.h >= 100) throw ptErr_('full', p.nm + ' no căng bụng rồi! Hãy tắm, chơi cùng bé hoặc đợi một lát.');
  ptSpend_(ctx, f.p, f.n, true);
  p.h = ptCl_(p.h + f.h, 130); p.j = ptCl_(p.j + (f.j || 0)); if (f.en) p.e = ptCl_(p.e + f.en);
  const xp = ptGainXp_(ctx, f.b * 3 * (f.x || 1));
  ctx.st.s.fd++; ptQ_(ctx, 'feed');
  return { food: f.id, xp: xp };
}
function ptOpCare_(ctx, o) {
  const p = ptAlive_(ctx), c = PT_CARE_BY[String(o.id || '')], st = ctx.st;
  if (!c) throw ptErr_('bad_request', 'Thao tác chăm sóc không hợp lệ.');
  ptNeedLv_(ctx, c.lv, c.n);
  if (c.cd && (st.cd[c.id] || 0) > ctx.now) throw ptErr_('cooldown', p.nm + ' vừa ' + c.n.toLowerCase() + ' xong. Thử lại sau ' + Math.ceil((st.cd[c.id] - ctx.now) / 60000) + ' phút.');
  if (c.cure && !p.sick) throw ptErr_('not_sick', p.nm + ' đang khoẻ, không cần uống thuốc.');
  if (c.id === 'ngu' && p.e >= 90) throw ptErr_('not_tired', p.nm + ' chưa buồn ngủ đâu!');
  ptSpend_(ctx, c.p, c.n, true);
  if (c.c) p.c = ptCl_(p.c + c.c); if (c.j) p.j = ptCl_(p.j + c.j); if (c.en) p.e = ptCl_(p.e + c.en);
  if (c.cure) { p.sick = 0; p.h = Math.max(p.h, 20); p.c = Math.max(p.c, 20); }
  if (c.cd) st.cd[c.id] = ctx.now + c.cd;
  const xp = c.b ? ptGainXp_(ctx, c.b * 3) : ptGainXp_(ctx, 5);
  if (c.id === 'tam' || c.id === 'chai' || c.id === 'spa') ptQ_(ctx, 'care');
  return { care: c.id, xp: xp };
}
function ptOpPlay_(ctx, o) {
  const p = ptAlive_(ctx), t = PT_TOY_BY[String(o.id || '')], st = ctx.st;
  if (!t) throw ptErr_('bad_request', 'Đồ chơi không hợp lệ.');
  if (st.own.t.indexOf(t.id) < 0) throw ptErr_('not_owned', 'Bạn chưa có ' + t.n + '. Mua ở Cửa hàng nhé.');
  if (p.e < t.en) throw ptErr_('tired', p.nm + ' mệt rồi. Cho bé ngủ hoặc ăn gì đó nhé!');
  if (p.sick) throw ptErr_('sick', p.nm + ' đang ốm, cần uống thuốc trước khi chơi.');
  ptSpend_(ctx, t.pp, 'chơi ' + t.n, true);
  p.j = ptCl_(p.j + t.j); p.e = ptCl_(p.e - t.en); p.c = ptCl_(p.c - 4);
  const xp = ptGainXp_(ctx, 4 + Math.round(t.j / 4));
  st.s.pl++; ptQ_(ctx, 'toy');
  return { toy: t.id, xp: xp };
}
function ptOpPat_(ctx, o) {
  const p = ptAlive_(ctx), n = clampInt_(o.n, 1, 30, 1);
  p.j = ptCl_(p.j + n * 0.5); ptQ_(ctx, 'pat', n);
  return { pat: n };
}
function ptOpBuy_(ctx, o) {
  const kind = String(o.kind || ''), cat = PT_SHOP[kind], st = ctx.st;
  if (!cat) throw ptErr_('bad_request', 'Loại hàng không hợp lệ.');
  const it = cat[String(o.id || '')]; if (!it) throw ptErr_('bad_request', 'Món hàng không hợp lệ.');
  const own = st.own[PT_OWN_KEY[kind]];
  if (own.indexOf(it.id) >= 0) throw ptErr_('already', 'Bạn đã có ' + it.n + ' rồi.');
  ptNeedLv_(ctx, it.lv, it.n);
  ptSpend_(ctx, it.p, 'mua ' + it.n, false);
  own.push(it.id);
  const slot = kind === 'acc' || kind === 'furn' ? it.s : kind === 'col' ? 'col' : kind === 'room' ? 'room' : '';
  if (slot && o.equip !== false) st.eq[slot] = it.id;
  const xp = ptGainXp_(ctx, it.b, true);
  ptLog_(st, ctx.now, 'Mua ' + it.n + ' (' + it.p + ' điểm).');
  return { bought: it.id, kind: kind, xp: xp };
}
function ptOpEquip_(ctx, o) {
  const slot = String(o.slot || ''), kind = PT_SLOTS[slot], st = ctx.st, id = String(o.id == null ? '' : o.id);
  if (!kind) throw ptErr_('bad_request', 'Vị trí không hợp lệ.');
  if (!id) { st.eq[slot] = slot === 'room' ? 'phong' : ''; return { slot: slot, id: st.eq[slot] }; }
  const it = PT_SHOP[kind][id];
  if (!it || (it.s && it.s !== slot)) throw ptErr_('bad_request', 'Món này không đặt ở vị trí đó được.');
  if (st.own[PT_OWN_KEY[kind]].indexOf(id) < 0) throw ptErr_('not_owned', 'Bạn chưa có ' + it.n + '.');
  st.eq[slot] = id; return { slot: slot, id: id };
}
function ptOpLearn_(ctx, o) {
  const p = ptAlive_(ctx), t = PT_TRICK_BY[String(o.id || '')];
  if (!t) throw ptErr_('bad_request', 'Kỹ năng không hợp lệ.');
  if (p.k.indexOf(t.id) >= 0) throw ptErr_('already', p.nm + ' đã biết ' + t.n + ' rồi.');
  ptNeedLv_(ctx, t.lv, 'Kỹ năng ' + t.n);
  ptSpend_(ctx, t.p, 'dạy ' + t.n, false);
  p.k.push(t.id); const xp = ptGainXp_(ctx, t.b, true);
  ptLog_(ctx.st, ctx.now, p.nm + ' đã học được ' + t.n + '!');
  return { learned: t.id, xp: xp };
}
function ptOpTrick_(ctx, o) {
  const p = ptAlive_(ctx), t = PT_TRICK_BY[String(o.id || '')], st = ctx.st;
  if (!t || p.k.indexOf(t.id) < 0) throw ptErr_('not_learned', 'Bé chưa học kỹ năng này.');
  if (p.e < 5) throw ptErr_('tired', p.nm + ' mệt rồi, cho bé nghỉ ngơi nhé!');
  ptSpend_(ctx, t.sp, 'diễn ' + t.n, true);
  p.e = ptCl_(p.e - 5); p.j = ptCl_(p.j + 8);
  const xp = ptGainXp_(ctx, 6 + PT_TRICKS.indexOf(t) * 2);
  st.s.tk++; ptQ_(ctx, 'trick');
  return { trick: t.id, xp: xp };
}
function ptOpGameStart_(ctx, o) {
  const p = ptAlive_(ctx), g = PT_GAME_BY[String(o.g || '')];
  if (!g) throw ptErr_('bad_request', 'Trò chơi không hợp lệ.');
  if (p.sick) throw ptErr_('sick', p.nm + ' đang ốm, cần uống thuốc trước khi chơi.');
  if (p.e < 10) throw ptErr_('tired', p.nm + ' mệt rồi. Cho bé ngủ hoặc ăn gì đó nhé!');
  ptSpend_(ctx, g.p, 'vé ' + g.n, false);
  ctx.st.gm = { g: g.id, t: ctx.now };
  return { game: g.id, startedAt: ctx.now };
}
function ptOpGameEnd_(ctx, o) {
  const p = ptAlive_(ctx), st = ctx.st, g = PT_GAME_BY[String(o.g || '')];
  if (!g || !st.gm || st.gm.g !== g.id) throw ptErr_('no_game', 'Không có ván ' + (g ? g.n : 'mini game') + ' nào đang chơi.');
  const score = clampInt_(o.score, 0, g.smax, 0), dur = ctx.now - st.gm.t;
  st.gm = null;
  let xp = Math.min(g.xmax, Math.round(score * g.k));
  if (dur < g.ms) xp = Math.min(xp, 10);   // kết thúc quá nhanh → coi như ván ngắn
  xp = ptGainXp_(ctx, xp);
  p.j = ptCl_(p.j + 15); p.e = ptCl_(p.e - 10); p.c = ptCl_(p.c - 5);
  st.s.gm++; ptQ_(ctx, 'game');
  if (!st.s.best) st.s.best = {};
  const best = Math.max(Number(st.s.best[g.id]) || 0, score); st.s.best[g.id] = best;
  return { game: g.id, score: score, xp: xp, best: best };
}
function ptOpRevive_(ctx) {
  const st = ctx.st, p = st.pet;
  if (!p || !p.dead) throw ptErr_('not_dead', 'Bé vẫn khoẻ mạnh!');
  if (ctx.day > p.dead + PT_REVIVE_DAYS - 1) throw ptErr_('too_late', 'Đã quá ' + PT_REVIVE_DAYS + ' ngày, không hồi sinh được nữa. Hãy tiễn bé vào Album.');
  ptSpend_(ctx, ptReviveCost_(p), 'hồi sinh ' + p.nm, false);
  p.dead = 0; p.dc = 0; p.h = 70; p.j = 60; p.c = 80; p.e = 80; p.sick = 0; p.t = ctx.now; p.bd = ctx.day;
  st.s.rv++; ptLog_(st, ctx.now, p.nm + ' đã được hồi sinh!');
  return { revived: true };
}
function ptOpRelease_(ctx) {
  const st = ctx.st, p = st.pet;
  if (!p || !p.dead) throw ptErr_('not_dead', 'Chỉ tiễn được bé đã mất.');
  ptLog_(st, ctx.now, 'Đã tiễn ' + p.nm + ' vào Album kỷ niệm.'); ptArchive_(ctx);
  return { released: true };
}
function ptOpRename_(ctx, o) {
  const p = ptAlive_(ctx), nm = ptName_(o.name, '');
  if (!nm) throw ptErr_('bad_request', 'Tên không hợp lệ.');
  if (nm === p.nm) throw ptErr_('already', 'Bé đang tên là ' + nm + ' rồi.');
  ptSpend_(ctx, PT_RENAME, 'đổi tên', false); p.nm = nm;
  return { name: nm };
}
function ptOpClaim_(ctx, o) {
  const st = ctx.st, m = /^q(\d)$/.exec(String(o.id || '')), ql = ptQuests_(ctx.code, ctx.day, st), i = m ? Number(m[1]) : -1, q = ql[i];
  ptAlive_(ctx); ptQRoll_(st, ctx.day);
  if (!q) throw ptErr_('bad_request', 'Nhiệm vụ không hợp lệ.');
  if (st.q.c.indexOf('q' + i) >= 0) throw ptErr_('already', 'Đã nhận thưởng nhiệm vụ này.');
  if ((st.q.p[q.t] || 0) < q.n) throw ptErr_('not_done', 'Chưa hoàn thành: ' + q.text + '.');
  st.q.c.push('q' + i); st.pet.j = ptCl_(st.pet.j + 10);
  return { claimed: 'q' + i, xp: ptGainXp_(ctx, q.xp, true) };
}
const PT_OPS = { adopt: ptOpAdopt_, feed: ptOpFeed_, care: ptOpCare_, play: ptOpPlay_, pat: ptOpPat_, buy: ptOpBuy_, equip: ptOpEquip_, learn: ptOpLearn_, trick: ptOpTrick_,
  gameStart: ptOpGameStart_, gameEnd: ptOpGameEnd_, revive: ptOpRevive_, release: ptOpRelease_, rename: ptOpRename_, claim: ptOpClaim_ };

/* ---------------- Thành tích ---------------- */
function ptStat_(st, id) {
  if (id === 'sb') return st.sb; if (id === 'lv') return st.s.lvMax || 0;
  if (id === 'ow') { const o = st.own; return o.a.length + o.c.length + o.r.length - 1 + o.f.length + o.t.length; }
  return Number(st.s[id]) || 0;
}
function ptAch_(ctx) {
  const st = ctx.st, out = [];
  if (st.pet) st.s.lvMax = Math.max(st.s.lvMax || 0, ptLevel_(st.pet.xp).lv);
  PT_ACH.forEach(function (a) {
    let k = st.ac[a.id] || 0; const v = ptStat_(st, a.id);
    while (k < a.t.length && v >= a.t[k]) { k++; out.push({ id: a.id, tier: k, name: a.n, e: a.e, xp: 40 * k }); ptGainXp_(ctx, 40 * k, true); }
    st.ac[a.id] = k;
  });
  if (st.pet) st.s.lvMax = Math.max(st.s.lvMax || 0, ptLevel_(st.pet.xp).lv);
  return out;
}

/* ---------------- Dữ liệu suy ra cho client ---------------- */
function ptDerived_(st, code, now) {
  const day = ptDay_(now), min = ptMin_(), fed = Number(st.fd[day]) || 0, p = st.pet, cap = Math.max(0, cfgNum_('petDailySpendCap', 0));
  const li = p ? ptLevel_(p.xp) : null, today = st.q.d === day;
  const ql = p ? ptQuests_(code, day, st).map(function (q, i) { const pr = today ? (st.q.p[q.t] || 0) : 0; return { id: 'q' + i, text: q.text, prog: Math.min(pr, q.n), target: q.n, xp: q.xp, done: pr >= q.n, claimed: today && st.q.c.indexOf('q' + i) >= 0 }; }) : [];
  const d = {
    day: day, min: min, fedToday: fed, safe: fed >= min, endsAt: ptDayEnd_(day), streak: st.sr, streakNow: st.sr + (fed >= min ? 1 : 0), best: Math.max(st.sb, st.sr + (fed >= min ? 1 : 0)),
    grace: !!(p && !p.dead && p.bd === day), xpMul: Math.round(ptXpMul_(st) * 100) / 100,
    spend: { today: st.ds.d === day ? st.ds.s : 0, cap: cap },
    quests: ql, ach: PT_ACH.map(function (a) { const k = st.ac[a.id] || 0; return { id: a.id, tier: k, max: a.t.length, val: ptStat_(st, a.id), next: k < a.t.length ? a.t[k] : null }; }),
    cd: st.cd, catVer: PT_CATVER
  };
  if (p) {
    d.lv = li.lv; d.into = li.into; d.need = li.need; d.maxed = li.maxed; d.stage = ptStage_(li.lv); d.stageName = PT_STAGES[d.stage][1];
    if (p.dead) d.dead = { day: p.dead, at: ptDayEnd_(p.dead - 1), fed: p.dc || 0, reviveCost: ptReviveCost_(p), reviveUntil: ptDayEnd_(p.dead + PT_REVIVE_DAYS - 1), canRevive: day <= p.dead + PT_REVIVE_DAYS - 1 };
    const mood = p.dead ? 'dead' : p.sick ? 'sick' : p.h < 20 ? 'hungry' : p.e < 15 ? 'tired' : p.c < 20 ? 'dirty' : p.j < 25 ? 'sad' : (p.j >= 75 && p.h >= 50) ? 'happy' : 'ok';
    d.mood = mood;
  }
  return d;
}

/* ---------------- Actions ---------------- */
function ptInfo_(p) {
  if (p && Number(p.catVer) === PT_CATVER) return { catVer: PT_CATVER, same: true };
  return { catVer: PT_CATVER, species: PT_SPECIES, foods: PT_FOODS, care: PT_CARE, toys: PT_TOYS, acc: PT_ACC, colors: PT_COLORS, rooms: PT_ROOMS, furn: PT_FURN,
    tricks: PT_TRICKS, games: PT_GAMES, ach: PT_ACH, stages: PT_STAGES, decay: PT_DECAY, reviveDays: PT_REVIVE_DAYS, maxLv: PT_MAXLV,
    rules: { min: ptMin_(), rename: PT_RENAME, note: 'Mỗi ngày (giờ Việt Nam) cần chi ít nhất ' + ptMin_() + ' điểm cho đồ ăn, chăm sóc, chơi đùa hoặc biểu diễn, nếu không thú cưng sẽ mất lúc 0:00 hôm sau.' } };
}
function ptGet_(params, student) {
  const code = student.code, now = Date.now(), sh = ptSh_();
  let L = ptLoad_(sh, code);
  if (!L) L = withLock_(function () { return ptLoad_(sh, code) || ptCreate_(sh, code, now); });
  const st = L.st, day = ptDay_(now);
  ptCheck_(st, day, now); ptTick_(st.pet, now);           // chỉ tính để hiển thị, không lưu (kết quả giống hệt khi lưu ở petAct)
  return { state: st, derived: ptDerived_(st, code, now), serverTime: now, v: L.v, balance: student.balance, catVer: PT_CATVER };
}
function ptAct_(params, student) {
  const code = student.code, rid = String(params.requestId || ''), ops = params.ops;
  if (!/^[\w-]{8,64}$/.test(rid)) throw ptErr_('bad_request', 'requestId không hợp lệ.');
  if (!Array.isArray(ops) || !ops.length) throw ptErr_('bad_request', 'Thiếu danh sách thao tác.');
  if (ops.length > PT_MAX_OPS) throw ptErr_('too_many_ops', 'Tối đa ' + PT_MAX_OPS + ' thao tác mỗi lần.');
  let js; try { js = JSON.stringify(ops); } catch (e) { throw ptErr_('bad_request', 'Thao tác không hợp lệ.'); }
  if (js.length > 4000) throw ptErr_('bad_request', 'Dữ liệu thao tác quá lớn.');
  const ck = 'ptq:' + code + ':' + rid;
  return withLock_(function () {
    const now = Date.now(), sh = ptSh_();
    const L = ptLoad_(sh, code) || ptCreate_(sh, code, now);
    const bal0 = (getStudent_(code) || student).balance;
    let prev = cget_(ck);
    if (!prev && L.lastReqId === rid) { try { prev = JSON.parse(L.lastResp); } catch (e) { prev = { results: [], spent: 0 }; } }
    if (prev) { const s0 = L.st; ptCheck_(s0, ptDay_(now), now); ptTick_(s0.pet, now); return { ok: true, replay: true, state: s0, derived: ptDerived_(s0, code, now), results: prev.results || [], spent: prev.spent || 0, balance: bal0, v: L.v, serverTime: now }; }
    const st = L.st, day = ptDay_(now);
    const died = ptCheck_(st, day, now);
    ptTick_(st.pet, now); ptQRoll_(st, day);
    const ctx = { st: st, now: now, day: day, code: code, spend: 0, feed: 0, notes: [], balance: bal0, cap: Math.max(0, cfgNum_('petDailySpendCap', 0)), spentToday: st.ds.d === day ? st.ds.s : 0 };
    const lv0 = st.pet ? ptLevel_(st.pet.xp).lv : 0, results = [];
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i], name = (o && typeof o === 'object') ? String(o.op || '') : '';
      try {
        if (!Object.prototype.hasOwnProperty.call(PT_OPS, name)) throw ptErr_('unknown_op', 'Thao tác không hợp lệ.');
        const r = PT_OPS[name](ctx, o); r.i = i; r.op = name; r.ok = true; results.push(r);
      } catch (err) {
        if (!err || !err.apiCode) throw err;
        const fresh = ptMigrate_(JSON.parse(L.raw)); ptCheck_(fresh, day, now); ptTick_(fresh.pet, now);
        return { ok: false, error: err.apiCode, message: err.message, opIndex: i, op: name, applied: false, state: fresh, derived: ptDerived_(fresh, code, now), balance: bal0, v: L.v, serverTime: now };
      }
    }
    const ach = ptAch_(ctx), lv1 = st.pet ? ptLevel_(st.pet.xp).lv : 0;
    if (st.pet && lv1 > lv0 && lv0 > 0) {
      ptLog_(st, now, st.pet.nm + ' lên cấp ' + lv1 + '!');
      if (ptStage_(lv1) > ptStage_(lv0)) ptLog_(st, now, st.pet.nm + ' đã lớn thành ' + PT_STAGES[ptStage_(lv1)][1] + '!');
    }
    let bal = bal0;
    if (ctx.spend > 0) {
      st.ds = { d: day, s: ctx.spentToday + ctx.spend }; st.s.ps = (st.s.ps || 0) + ctx.spend;
      if (ctx.feed > 0) st.fd[day] = (Number(st.fd[day]) || 0) + ctx.feed;
      const r = applyDelta_(code, -ctx.spend, 'pet', rid, ctx.notes.join('; ').slice(0, 200));
      if (r.clamped || r.delta !== -ctx.spend) {
        if (r.delta < 0) applyDelta_(code, -r.delta, 'pet', rid, 'hoàn tác');
        throw ptErr_('not_enough_points', 'Không đủ điểm để thực hiện.');
      }
      bal = r.balance;
    }
    const v = L.v + 1, resp = JSON.stringify({ results: results, spent: ctx.spend });
    try { ptSave_(sh, L, st, v, now, rid, resp.length < 20000 ? resp : JSON.stringify({ results: [], spent: ctx.spend })); }
    catch (e) { if (ctx.spend > 0) applyDelta_(code, ctx.spend, 'pet', rid, 'hoàn điểm do lỗi lưu'); throw e; }
    cput_(ck, { results: results, spent: ctx.spend }, 21600);
    return { ok: true, state: st, derived: ptDerived_(st, code, now), results: results, achievements: ach, levelUp: lv1 > lv0 && lv0 > 0 ? lv1 : 0, died: died, spent: ctx.spend, balance: bal, v: v, serverTime: now };
  });
}
function ptBoard_(params, student) {
  let list = cget_('ptboard');
  if (!list) {
    const sh = ptSh_(), n = sh.getLastRow(); list = [];
    if (n >= 2) {
      const v = sh.getRange(2, 1, n - 1, PT_NCOL).getValues();
      v.forEach(function (r) { if (r[0] && r[11]) list.push([String(r[0]), Number(r[6]) || 0, Number(r[7]) || 0, Number(r[8]) || 0, Number(r[9]) ? 1 : 0, String(r[10] || ''), String(r[11] || ''), Number(r[12]) || 0]); });
      list.sort(function (a, b) { return (b[4] - a[4]) || (b[1] - a[1]) || (b[2] - a[2]) || (b[3] - a[3]) || (a[0] < b[0] ? -1 : 1); });
    }
    cput_('ptboard', list, 60);
  }
  const row = function (r, i) { return { rank: i + 1, who: maskCode_(r[0]), lv: r[1], streak: r[3], alive: !!r[4], name: String(r[5]).replace(/^'/, ''), sp: r[6], best: r[7], me: r[0] === student.code }; };
  let me = null; for (let i = 0; i < list.length; i++) if (list[i][0] === student.code) { me = row(list[i], i); break; }
  return { board: list.slice(0, 20).map(row), me: me, total: list.length, serverTime: Date.now() };
}

/* ---------------- Đăng ký với route() ---------------- */
function registerPetActions_(reg) {
  reg.petInfo = function (params, student) { return ptInfo_(params); };
  reg.petGet = function (params, student) { return ptGet_(params, student); };
  reg.petAct = function (params, student) { return ptAct_(params, student); };
  reg.petBoard = function (params, student) { return ptBoard_(params, student); };
}
