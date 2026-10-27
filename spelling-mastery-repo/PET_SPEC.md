# PET_SPEC – Game "Thú cưng" (Pet.gs + pet-art.js + pet.js + pet.css)

Tab **🐾 Thú cưng** trên trang học sinh, kế bên 🏙️ Nông trại & Phố.

## Cài đặt (Apps Script)
1. Dán **Pet.gs** và **Code.gs** (VERSION 16) vào cùng dự án Apps Script.
2. **Deploy → Manage deployments → ✎ → New version.** Sheet `Pets` tự tạo ở lần gọi đầu.

## Luật chính
- Mỗi ngày (giờ Việt Nam) học sinh phải chi **≥ `petDailyMin` điểm (mặc định 50)** cho **đồ ăn, chăm sóc, chơi đùa, biểu diễn**. Hết ngày chưa đủ → thú **mất lúc 0:00**. Ngày nhận nuôi và ngày hồi sinh được miễn.
- Thú mất: hồi sinh trong 7 ngày (200 + 20×cấp điểm, giữ cấp/kỹ năng) hoặc tiễn vào Album rồi nuôi bé mới.
- Điểm chỉ để chi (Ledger reason `pet`), không có đường sinh điểm, không có hộp quà ngẫu nhiên.
- **Không tính vào báo cáo phụ huynh** (`familyReport_` bỏ qua reason `pet`; không ghi GameLog).

## Bảng giá (bản 2026-10-27n, `PT_CATVER = 2`)
- Giá thật = giá gốc trong danh mục × `PT_PRICE_X` (2) × (1 + cấp mở / `PT_PRICE_LV` (60)); loài thú thêm hệ số độ hiếm (rẻ nhất ×1 → hiếm nhất ×1,5).
  Ví dụ: táo 4 → 8 · vương miện (cấp 12) 1.200 → 2.900 · Phượng Hoàng 3.000 → 9.000 · Gọi cầu vồng (cấp 50) 8.000 → 29.300.
- Tổng để mở khoá **mọi** loài/đồ chơi/phụ kiện/màu/phòng/nội thất/kỹ năng ≈ **201.000 điểm** (chưa tính tiền nuôi hằng ngày).
- XP vẫn tính theo giá gốc (trường `b`) → tốc độ lên cấp như cũ; mỗi điểm chi ra cho ít XP hơn.
- **Không còn thời gian chờ** ở đồ chơi và biểu diễn. Mỗi lần chơi tốn `pp` = 2 + vui/6 điểm (5–9), mỗi màn diễn tốn `sp` = 3 + 2×thứ tự kỹ năng (3–19). Giới hạn duy nhất là năng lượng của bé. Hai khoản này tính vào khẩu phần ngày.
- Vé mini game 10 điểm · đổi tên 20 điểm · nhiệm vụ "Chi n điểm" 60/100/160.

## Tính năng
12 loài (25 → 3.000 điểm) · 20 món ăn · 6 chăm sóc (tắm, chải lông, spa, thuốc, vitamin, ngủ) · 4 chỉ số giảm theo giờ (đói/vui/sạch/năng lượng; quá đói/bẩn → ốm) ·
cấp 1–100, 5 giai đoạn lớn (Huyền thoại có hào quang) · chuỗi ngày nuôi đủ (+2% XP/ngày, tối đa +50%) · 9 đồ chơi (trả điểm mỗi lần chơi) · 25 phụ kiện (mũ/kính/cổ/cánh) · 14 màu lông (có ánh kim, cầu vồng, pha lê, thiên hà) ·
10 phòng có hoạt ảnh · 24 nội thất · 9 kỹ năng biểu diễn · 3 mini game (Hứng quà, Lật thẻ, Bong bóng – vé 10 điểm, thưởng XP) · nhiệm vụ ngày · 8 huy hiệu nhiều bậc · Album · bảng xếp hạng ·
thử đồ trước khi mua · nhắc ở thẻ số dư + chấm đỏ trên tab khi thú chưa được chăm đủ.

## API (POST, kèm `code`)
`petInfo {catVer?}` danh mục · `petGet` → `{state, derived, balance}` · `petAct {ops[], requestId}` (nguyên tử, idempotent) · `petBoard`.
Op: `adopt{sp,name}` `feed{id}` `care{id}` `play{id}` `pat{n}` `buy{kind:acc|col|room|furn|toy,id}` `equip{slot,id}` `learn{id}` `trick{id}` `gameStart{g}` `gameEnd{g,score}` `revive` `release` `rename{name}` `claim{id}`.
Lỗi: `pet_*` (vd. `pet_not_enough_points`, `pet_full`, `pet_dead`, `pet_cooldown` (chỉ còn ở Đi ngủ), `pet_locked`, `pet_daily_cap`).

## Cấu hình giáo viên (Cài đặt)
`petEnabled` (bật/tắt), `petDailyMin` (điểm tối thiểu/ngày, mặc định 50 – sheet Config cũ đã ghi 25 thì giữ 25 tới khi giáo viên sửa), `petDailySpendCap` (trần chi/ngày, 0 = không giới hạn).

## Kiểm thử
`node pet_test.js` – 66 kiểm tra trên hàm thật của Code.gs + Pet.gs.
