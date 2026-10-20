# 🔤 Spelling Mastery

SPA tĩnh giúp giáo viên tiếng Anh giao bài chính tả từ vựng và theo dõi kết quả học sinh.
Chạy 100 % trên **GitHub Pages** (không backend riêng); kết quả học sinh được ghi vào **Google Sheet** qua **Google Apps Script**.

```
index.html · style.css · app.js
apps-script/Code.gs
```

## 1. Deploy lên GitHub Pages
1. Tạo repo công khai (vd. `spelling-mastery`), đẩy 3 file `index.html`, `style.css`, `app.js` (và thư mục `apps-script/` để lưu trữ) lên nhánh `main`.
2. **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root → Save**.
3. Sau ~1 phút truy cập `https://<user>.github.io/<repo>/`.
4. Không cần build. Thư viện (lz-string, PapaParse, SheetJS, jsPDF, qrcode) nạp qua CDN, nên máy giáo viên/học sinh cần Internet.

## 2. Cấu hình Google Apps Script (từng bước)
1. Tạo Google Sheet mới (vd. "Spelling Mastery – Kết quả").
2. **Extensions → Apps Script**. Xóa code mẫu, dán toàn bộ `apps-script/Code.gs`.
3. Sửa dòng `const TEACHER_KEY = '...'` thành mật khẩu của bạn (script **từ chối** hoạt động với mật khẩu mặc định).
4. Bấm **Deploy → New deployment → Select type: Web app**:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
5. Bấm **Deploy**, cấp quyền khi được hỏi (Advanced → Go to project), rồi copy **Web app URL** (kết thúc bằng `/exec`).
6. Mở app → **Cài đặt**: dán URL + Teacher Key → **Kiểm tra kết nối**. Thấy "✓ Kết nối thành công và Teacher Key hợp lệ" là xong (menu **Thống kê** sẽ hiện).
7. Mỗi lần sửa `Code.gs` phải **Deploy → Manage deployments → ✎ → Version: New version** để URL cũ nhận code mới.

Hai sheet `Results` và `Assignments` tự được tạo ở lần gọi đầu.

## 3. Lựa chọn kiến trúc chia sẻ bài (giải thích)
Không có backend nên dữ liệu bài phải nằm trong chính đường link:

`#/assign?d=<lz-string → base64url>` – chứa tên bộ từ, danh sách từ, cấu hình TTS (en-US/en-GB, tốc độ), hạn nộp (timestamp UTC, ms), `assignmentId`, cờ shuffle, số lần tối đa, cờ bắt buộc tên/lớp và URL Apps Script. Chuỗi được nén bằng lz-string rồi đổi sang base64url (chỉ gồm `A–Z a–z 0–9 - _`) để các ứng dụng chat (Zalo, Messenger…) không làm hỏng link. Link cũ dạng `compressToEncodedURIComponent` vẫn đọc được.

- **Link ≤ 2000 ký tự** → dùng link "tự chứa" (inline): chạy được ngay cả khi máy chủ không phản hồi lúc tải bài.
- **Link > 2000 ký tự** (bộ từ dài) → app tự chuyển sang **link ngắn**: bộ từ được lưu lên sheet `Assignments` (cần Apps Script + Teacher Key), link chỉ còn `#/assign?id=<assignmentId>&s=<Apps Script URL>`; học sinh tải bài bằng `doGet?action=getAssignment`. Nếu chưa cấu hình Apps Script, app vẫn cho link dài kèm cảnh báo (mã QR có thể không tạo được).
- Teacher Key **không bao giờ** nằm trong link.
- Hạn nộp & số lần làm: khi giáo viên tạo link, app đăng ký siêu dữ liệu lên sheet `Assignments`; **máy chủ (giờ Google) là nguồn quyết định**. Client chỉ hiển thị đếm ngược. Nếu bài chưa đăng ký, máy chủ tạm dùng hạn có trong gói dữ liệu học sinh gửi (có thể bị làm giả → hãy cấu hình Teacher Key khi giao bài).
- Cho phép nộp trễ tối đa `GRACE_MS` (mặc định 2 phút) để bù độ trễ mạng/hàng đợi.

## 4. Phím tắt
| Phím | Khi nào | Tác dụng |
|---|---|---|
| `Space` / click | SHOW, RECALL | Ẩn từ → chuyển sang gõ (TYPE) |
| `Enter` | TYPE | Nộp đáp án (SHOW/RECALL: giống Space) |
| `Tab` hoặc `Ctrl`+`Space` | TYPE | "Quên / Xem lại" → RECALL (+1 lượt xem) |
| `Space` | TYPE | Ký tự thường (để gõ cụm từ) |
| `Esc` | Mọi lúc khi đang làm | Tạm dừng / tiếp tục (đồng hồ dừng) |
| `Shift`+`Tab` | TYPE | Di chuyển focus bình thường |

> macOS: `Ctrl+Space` thường bị chiếm bởi đổi bộ gõ – hãy dùng `Tab` hoặc nút "Quên".

## 5. Thuật toán chấm điểm
- Lượt xem (views): SHOW đầu = 1; mỗi lần vào RECALL +1.
- Điểm từ = `max(0, 10 − 2×(views−1))`; views ≥ 5 → 0.
- Gõ sai chỉ ghi `wrongCount`. "Cần cải thiện" = `wrongCount ≥ 1` hoặc `views ≥ 3`.
- **Điểm bài = TỔNG điểm từng từ** (không còn thang 10). Điểm tối đa = 10 × số từ. Ví dụ bài 8 từ: tối đa 80; kết quả hiển thị dạng `78/80`.
- Đồng hồ không chạy khi Pause, tab ẩn, hoặc trong khoảng chờ sau khi gõ đúng.
- So khớp: không phân biệt hoa/thường, trim, gộp khoảng trắng, quy đổi nháy cong ’ ‘ → '.

## 5b. Đồng bộ bộ từ + thiết lập giữa máy bạn và GitHub (`data.json`)
**Quy trình:** chỉnh sửa trên máy → **Xuất JSON** (tải `data.json`) → tải `data.json` lên thư mục gốc repo (cạnh `index.html`) → mở app trên GitHub Pages sẽ thấy banner "Có bản dữ liệu mới" → **Xem & cập nhật** (Gộp hoặc Ghi đè). Trong **Cài đặt** có thể bật "Tự động ghi đè khi repo có bản mới" và nút "⟳ Đồng bộ ngay".

Cách này hợp lý cho nhu cầu "một nguồn chuẩn, nhiều nơi dùng", nhưng cần lưu ý:
- Đồng bộ **một chiều** (máy bạn → repo → app GitHub) và **thủ công** (phải upload `data.json` mỗi lần). Đừng chỉnh sửa trên cả hai nơi: nếu bật tự động ghi đè, thay đổi chưa xuất trên máy nhận sẽ bị đè.
- Repo GitHub Pages thường **công khai**: mọi thứ trong `data.json` ai cũng đọc được. Mặc định tệp **không có Teacher Key** (chỉ khi bạn tick riêng). **Không** đưa Teacher Key hay dữ liệu học sinh lên repo công khai.
- Tệp chứa: toàn bộ bộ từ (mã, tên, từ, giọng đọc, tốc độ, trộn từ, thời điểm sửa) và thiết lập (giao diện, âm thanh, Apps Script URL). Không chứa dữ liệu theo học sinh (tên đã nhớ, số lần làm, hàng đợi nộp bài) và không chứa kết quả (đã nằm trên Google Sheet).
- GitHub Pages có thể cache vài phút sau khi upload; app tự thêm `?v=` để tránh cache trình duyệt.
- Link đã giao **không đổi** khi bạn sửa bộ từ: link "tự chứa" đã mang sẵn bản từ vựng tại thời điểm giao; link ngắn dùng bản đã lưu trên Sheet lúc tạo link.
- Đồng bộ chỉ chạy khi mở **trang chủ** qua http(s) (không chạy khi mở file `index.html` trực tiếp bằng `file://`; hãy chạy `python -m http.server` trong thư mục dự án để thử trên máy).
- Định dạng `version: 2`; tệp `version: 1` cũ vẫn nhập được. Gộp: so theo mã bộ từ, bản có `updatedAt` mới hơn thắng, bộ chỉ có trên máy được giữ lại. Ghi đè: giống hệt tệp.

## 5c. Tương thích thiết bị
Đã xử lý: `<dialog>` dự phòng cho Safari/WebView cũ; thay `replaceChildren` bằng bản tự viết; viewport `dvh` + vùng an toàn tai thỏ (safe-area); cỡ chữ ô nhập 16px (iOS không tự phóng to); `touch-action: manipulation`; nút ≥ 44px; trì hoãn nhẹ trước khi đọc (iOS/Android hay bỏ câu nếu `speak` ngay sau `cancel`); cuộn ô nhập vào giữa khi bàn phím ảo mở; link base64url; không dùng cú pháp JS quá mới (`?.`, `??`).
Mục tiêu hỗ trợ: Chrome/Edge/Firefox/Safari 14+ (iOS 14+, Android 8+). Hạn chế vốn có của trình duyệt: iOS Safari chỉ phát âm sau lần chạm đầu (đã có nút **Bắt đầu**); thiết bị không có giọng tiếng Anh sẽ dùng giọng mặc định hoặc im lặng (có cảnh báo); phím `Tab`/`Ctrl+Space` chỉ có trên bàn phím cứng, trên điện thoại dùng nút **Quên**.

## 6. Bảo mật & quyền riêng tư
- **Teacher Key chỉ là bảo vệ cơ bản**: được gửi dạng tham số URL tới Apps Script và lưu `localStorage` trên máy giáo viên; ai biết key đều đọc được kết quả. Dùng chuỗi dài, khó đoán; đổi định kỳ; không dùng trên máy dùng chung.
- URL Web app công khai (Anyone) – ai có link có thể nộp bài; máy chủ có chống nộp trùng, kiểm tra hạn, giới hạn kích thước và vô hiệu hóa công thức (`=`, `+`, `-`, `@`) ở ô Sheet.
- Dữ liệu học sinh (**họ tên, lớp**) là dữ liệu cá nhân: giáo viên cần quản lý theo quy định của nhà trường/pháp luật (thông báo mục đích, hạn chế chia sẻ Sheet, xóa khi không cần).
- Không có xác thực học sinh: tên/lớp do học sinh tự khai.

## 7. Ghi chú kỹ thuật
- Dữ liệu bộ từ lưu `localStorage` (~5 MB, đủ cho hàng nghìn từ). Chưa dùng IndexedDB vì chưa cần.
- PDF: bảng được vẽ bằng canvas rồi nhúng vào jsPDF để hiển thị đúng tiếng Việt Unicode mà không cần tải font (chữ trong PDF là ảnh, không bôi chọn được).
- Hàng đợi retry: kết quả chưa gửi được nằm trong `localStorage`; tự gửi lại khi có mạng (`online`) hoặc khi mở lại app/bấm "Thử lại". `submissionId` (UUID) chống nộp trùng cả phía client lẫn Apps Script.
- Autoplay: giọng đọc chỉ bắt đầu sau khi học sinh bấm **Bắt đầu**.

## 8. Dữ liệu mẫu (8 dòng) – dán vào "Tạo bộ từ"
```
well-known - nổi tiếng
airport - sân bay
luggage - hành lý
passport - hộ chiếu
delicious - ngon
it's a deal - đồng ý nhé
look forward to – mong đợi
make up your mind — quyết định
```
(Hoặc bấm **Thêm dữ liệu mẫu** ở trang chủ khi chưa có bộ từ.)

## 9. Kiểm thử nghiệm thu
1. Mở trên Chrome/Safari mobile → Tạo bộ từ mẫu → **Làm thử** trọn bài → xem kết quả, "Làm lại chỉ các từ yếu".
2. Cài đặt → nhập Apps Script URL + Teacher Key → **Kiểm tra kết nối**.
3. **Giao bài** → copy link / quét QR bằng điện thoại khác → nhập tên + lớp → làm bài → thấy "✓ Đã nộp bài".
4. Thống kê → chọn bài → xem bảng điểm, top từ khó, xuất CSV/Excel/PDF.
5. Thử tắt mạng khi nộp → thấy "Lỗi – chưa gửi được", bật mạng → tự gửi / bấm "Thử lại".
