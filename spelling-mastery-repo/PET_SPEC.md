# PET_SPEC – Game "Thú cưng" (Pet.gs + pet-art.js + pet.js + pet.css)

Tab **🐾 Thú cưng** trên trang học sinh, kế bên 🏙️ Nông trại & Phố.

## Cài đặt (Apps Script)
1. Dán **Pet.gs** (tệp mới) và **Code.gs** (VERSION 14) vào cùng dự án Apps Script.
2. **Deploy → Manage deployments → ✎ → New version.** Sheet `Pets` tự tạo ở lần gọi đầu.

## Luật chính
- Mỗi ngày (giờ Việt Nam) học sinh phải chi **≥ `petDailyMin` điểm (mặc định 25)** cho **đồ ăn + chăm sóc**. Hết ngày chưa đủ → thú **mất lúc 0:00**. Ngày nhận nuôi và ngày hồi sinh được miễn.
- Thú mất: hồi sinh trong 7 ngày (100 + 10×cấp điểm, giữ cấp/kỹ năng) hoặc tiễn vào Album rồi nuôi bé mới.
- Điểm chỉ để chi (Ledger reason `pet`), không có đường sinh điểm, không có hộp quà ngẫu nhiên.
- **Không tính vào báo cáo phụ huynh** (`familyReport_` bỏ qua reason `pet`; không ghi GameLog).

## Tính năng
12 loài (25 → 3.000 điểm) · 20 món ăn · 6 chăm sóc (tắm, chải lông, spa, thuốc, vitamin, ngủ) · 4 chỉ số giảm theo giờ (đói/vui/sạch/năng lượng; quá đói/bẩn → ốm) ·
cấp 1–100, 5 giai đoạn lớn (Huyền thoại có hào quang) · chuỗi ngày nuôi đủ (+2% XP/ngày, tối đa +50%) · 9 đồ chơi · 25 phụ kiện (mũ/kính/cổ/cánh) · 14 màu lông (có ánh kim, cầu vồng, pha lê, thiên hà) ·
10 phòng có hoạt ảnh · 24 nội thất · 9 kỹ năng biểu diễn · 3 mini game (Hứng quà, Lật thẻ, Bong bóng – vé 5 điểm, thưởng XP) · nhiệm vụ ngày · 8 huy hiệu nhiều bậc · Album · bảng xếp hạng ·
thử đồ trước khi mua · nhắc ở thẻ số dư + chấm đỏ trên tab khi thú chưa được chăm đủ.

## API (POST, kèm `code`)
`petInfo {catVer?}` danh mục · `petGet` → `{state, derived, balance}` · `petAct {ops[], requestId}` (nguyên tử, idempotent) · `petBoard`.
Op: `adopt{sp,name}` `feed{id}` `care{id}` `play{id}` `pat{n}` `buy{kind:acc|col|room|furn|toy,id}` `equip{slot,id}` `learn{id}` `trick{id}` `gameStart{g}` `gameEnd{g,score}` `revive` `release` `rename{name}` `claim{id}`.
Lỗi: `pet_*` (vd. `pet_not_enough_points`, `pet_full`, `pet_dead`, `pet_cooldown`, `pet_locked`, `pet_daily_cap`).

## Cấu hình giáo viên (Cài đặt)
`petEnabled` (bật/tắt), `petDailyMin` (điểm tối thiểu/ngày), `petDailySpendCap` (trần chi/ngày, 0 = không giới hạn).

## Kiểm thử
`node pet_test.js` – 63 kiểm tra trên hàm thật của Code.gs + Pet.gs.
