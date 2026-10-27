# CITY_SPEC – Game "Nông trại & Thành phố" (City.gs + city-core.js + city-art.js + city.js + city.css)

Tab **🏙️ Nông trại & Phố** trên trang học sinh (thay cho Khu vườn cũ đã bị xoá).

## Tệp
| Tệp | Vai trò |
|---|---|
| `city-core.js` | **Luật chơi duy nhất** (danh mục, thao tác, công thức). Chạy ở trình duyệt (phản hồi tức thì) VÀ trong City.gs (máy chủ kiểm tra lại). |
| `city-server.js` | Phần máy chủ: Sheet `City`, trừ điểm qua `applyDelta_` (reason `city`), xếp hạng, thăm, thả tim. |
| `City.gs` | **Tệp dán vào Apps Script** = city-core.js + city-server.js. Tự sinh: `node build-city.js` (đừng sửa tay). |
| `city-art.js` | Đồ hoạ canvas đẳng cự (không cần ảnh): mọi công trình, cây trồng, xe cộ, con vật, hiệu ứng. |
| `city.js`, `city.css` | Giao diện, điều khiển, đồng bộ. `window.SMCity.mount(root, ctx)` / `unmount()`. |
| `city_test.js` | `node city_test.js` – 90 kiểm tra trên hàm thật của Code.gs + City.gs (Sheet giả lập). |

## Cài đặt (Apps Script)
1. Dán **City.gs** (mới) và **Code.gs** (VERSION 15). **Xoá Garden.gs** khỏi dự án.
2. Deploy → Manage deployments → ✎ → **New version**. Sheet `City` tự tạo.

## Luật chính
- Hai loại tiền: 🪙 **Xu** (kiếm trong game) và ⭐ **Điểm học tập** (chỉ có từ làm bài; game không bao giờ sinh Điểm).
- Không có gì bị mất/reset: cây chín chờ mãi, thuế giữ tối đa 6 giờ (có 🤖 Robot thì không giới hạn), cất công trình giữ nguyên cấp.
- Mọi thứ chi bằng Điểm đều xác định, giá hiện trước, không hộp quà may rủi, không đếm ngược ép mua.
- Không tính vào báo cáo phụ huynh; không ghi GameLog.

## Nội dung
19 cây trồng (5 giống quý mua bằng điểm) · 6 chuồng trại · 13 nhà máy/mỏ, 40+ sản phẩm · 10 loại nhà (cao tầng dần theo cấp, nâng cấp vô hạn) ·
11 dịch vụ · 31 trang trí (17 cao cấp, có hoạt ảnh) · đường/đường lát đá/hồ nước tự nối · 12 kỳ quan (nâng cấp vô hạn bằng điểm) ·
đất mở rộng vô hạn (mảnh 8×8, giá = 30 + 12n + 0,5n² điểm) · đơn hàng · chợ · nhiệm vụ ngày (3, xong cả 3 thưởng gấp đôi) · quà ghé thăm (cộng dồn số ngày) ·
11 thành tích nhiều bậc · danh hiệu theo dân số · 5 trợ lý · 8 nâng cấp vĩnh viễn · 4 bùa x2 · đổi điểm→xu · 12 xe/thú/vật bay · 7 chủ đề mặt đất · 7 hiệu ứng ·
ngày/đêm theo giờ Việt Nam · thăm & thả tim thành phố bạn · hướng dẫn chơi lần đầu.

## Điều khiển
Chạm = thu hoạch/thu thuế/thu sản phẩm/mở thông tin · kéo = di chuyển bản đồ · 2 ngón hoặc con lăn = thu phóng · chọn hạt rồi **kéo qua nhiều ruộng** để gieo/thu ·
giữ lâu công trình = di chuyển · phím mũi tên, +/−, Esc trên máy tính · nút ⛶ toàn màn hình.

## API (POST, kèm `code` + token học sinh)
`cityGet` → `{state, derived, balance, serverTime, ver}` · `cityAct {ops[], requestId}` (nguyên tử cả lô, idempotent theo requestId) · `cityBoard` · `cityVisit {who}` · `cityLike {who}`.
Op: `place{t,x,y,f?,inv?}` `move{id,x,y,f?}` `flip{id}` `store{id}` `plant{c,ids[]}` `harvest{ids[]}` `clear{x,y}` `feed{id}` `queue{id,r,n?}` `collect{id}` `collectAll`
`tax{ids[]|all}` `upgrade{id}` `buyChunk{cx,cy}` `speed{ids[]}` `sell{k,n}` `order{i}` `discard{i}` `helper{k}` `perm{k}` `boost{k,h}` `exchange{n}` `rare{k}` `theme{k}` `effect{k}` `vehicle{k}`
`claimQuest{i}` `daily` `rename{name}` `night{v}`. Lỗi: `city_*` (vd. `city_not_enough_points`, `city_not_enough_xu`, `city_daily_cap`, `city_locked`, `city_cell_busy`, `city_storage_full`).

## Cấu hình giáo viên (Cài đặt)
`cityEnabled` (bật/tắt), `cityCostPct` (giá điểm %, 10–500), `cityDailySpendCap` (trần chi điểm/ngày, 0 = không giới hạn).
