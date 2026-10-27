# 🏠 Nhà Thầy Hưng (Spelling Mastery)

SPA tĩnh giúp giáo viên tiếng Anh giao bài chính tả từ vựng và theo dõi kết quả học sinh.
Giao **bài chính tả từ vựng** và **bài test nhiều dạng câu hỏi** (xem mục 10). Chạy 100 % trên **GitHub Pages** (không backend riêng); kết quả học sinh được ghi vào **Google Sheet** qua **Google Apps Script**.

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

Hai sheet `Results` và `Assignments` tự được tạo ở lần gọi đầu. Nếu bạn đã có sheet `Results` từ phiên bản cũ, script tự bổ sung 2 cột tiêu đề mới (`status`, `totalWords`) và các dòng cũ vẫn dùng được. **Sau khi dán `Code.gs` mới nhớ Deploy → Manage deployments → ✎ → New version.**

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
- Điểm từ = `max(0, 10 − 2×(views−1))`; views ≥ 5 → 0. **Từ bấm "Bỏ qua" = 0 điểm.**
- Gõ sai chỉ ghi `wrongCount`. "Cần cải thiện" = bỏ qua, hoặc `wrongCount ≥ 1`, hoặc `views ≥ 3`.
- **Điểm bài = TỔNG điểm các từ đã làm** (không còn thang 10). Điểm tối đa = 10 × số từ đã làm; ví dụ làm 11 từ → tối đa 110, hiển thị `100/110`. Từ chưa làm không được tính vào điểm lẫn điểm tối đa.
- Đồng hồ không chạy khi Pause, tab ẩn, hoặc trong khoảng chờ sau khi gõ đúng.
- So khớp: không phân biệt hoa/thường, trim, gộp khoảng trắng, quy đổi nháy cong ’ ‘ → '.

### Bỏ qua, Dừng lại, tự lưu
- **Bỏ qua**: nút có ở mọi trạng thái của từ; bấm 2 lần (lần 1 hỏi lại, tự hủy sau 3 giây) để tránh bấm nhầm. Từ đó tính 0 điểm và là "đã làm".
- **Dừng lại & lưu điểm**: chỉ xuất hiện sau khi học sinh đã **gõ đúng ≥ 10 từ** (từ bỏ qua không tính vào 10) và bộ từ còn từ chưa làm. Có hộp xác nhận (đồng hồ tạm dừng). Điểm tính trên các từ đã làm; từ đang làm dở không tính.
- **Tự lưu** (chỉ với bài giao): mỗi lần làm có một `submissionId` cố định → chỉ **một dòng** trên Sheet, được cập nhật dần:
  - Khi tắt/ẩn trang (đóng tab, chuyển app, khóa màn hình): gửi bằng `sendBeacon` và đồng thời lưu vào hàng đợi `localStorage` (mở lại app sẽ tự gửi bù). Trạng thái **Tự lưu (thoát)**.
  - Mỗi 10 từ hoàn thành: lưu tạm một lần (phòng máy hết pin/trình duyệt bị tắt đột ngột).
  - **30 phút không thao tác** (chạm/phím/gõ): tự kết thúc, lưu điểm, hiện kết quả. Trạng thái **Tự lưu (30 phút)**.
  - Cuối cùng: **Hoàn thành** (hết bộ từ) hoặc **Dừng sớm** (bấm Dừng lại).
  - Máy chủ chỉ cập nhật dòng khi có thêm từ so với bản đang lưu (hoặc bản cuối thay bản tạm), nên gửi trùng/bản cũ không làm sai điểm; số lần làm tối đa được tính theo số dòng, không tính các lần cập nhật.
  - Chưa làm xong từ nào thì không lưu gì (không có điểm để lưu).
  - Không thể bắt được trường hợp thiết bị tắt nguồn đột ngột hoặc hệ điều hành giết trình duyệt không báo trước: khi đó chỉ còn bản lưu tạm gần nhất.

### Chế độ học sinh (khóa giao diện giáo viên)
Khi mở link giao bài, tên app ở góc trái không còn bấm được, thanh điều hướng bị ẩn và mọi cố gắng đổi sang trang khác (`#/`, `#/settings`, `#/stats`, `#/practice/...`) trong tab đó sẽ bị đưa về bài đang làm (khóa lưu bằng `sessionStorage`, hết khi đóng tab). Ngoại lệ: máy **đã xác thực giáo viên** (Cài đặt → Kiểm tra kết nối thành công) không bị khóa để giáo viên xem thử link.
Lưu ý quan trọng: đây là khóa ở giao diện (app tĩnh trên GitHub Pages không có tài khoản). Học sinh vẫn có thể mở trang gốc của app ở tab mới, nhưng sẽ chỉ thấy dữ liệu trống của chính trình duyệt đó; **kết quả của cả lớp chỉ đọc được khi có Teacher Key đúng, và việc kiểm tra này nằm ở máy chủ Apps Script**, không phải ở giao diện.

### Thống kê: tổng điểm theo học sinh
Trong **Thống kê**, mục "Tổng điểm theo học sinh" cộng điểm của mọi lần làm cùng một **tên** (không phân biệt hoa/thường, bỏ khoảng trắng thừa): học sinh "a" làm 5 lần, mỗi lần 50 điểm → tổng 250. Có thể tích "Tách theo lớp" nếu cùng tên nhưng khác lớp là hai người. Chọn "★ Tất cả các bài" để cộng điểm qua mọi bài đã giao. Bảng sắp xếp được theo mọi cột, phân trang, và xuất ra CSV (riêng), Excel (sheet "Tổng theo học sinh") và PDF. Bảng "Kết quả từng lần làm" có thêm cột số từ đã làm và trạng thái.

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
- Bộ từ và bài test lưu bằng **IndexedDB** (mục 18), mỗi bộ / bài là một bản ghi riêng. `localStorage` chỉ còn giữ cài đặt, hàng đợi nộp bài và làm chế độ dự phòng.
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

## 10. Bài test (mới)
**Tạo:** Trang chủ → **📝 Tạo bài test** (cạnh **＋ Tạo bộ từ**). Trình soạn tự lưu sau ~1 giây (localStorage). Mỗi bài tối đa 500 câu (xem mục 13 về Phần).

**Dạng câu hỏi:** `mcq` trắc nghiệm 1 đáp án · `multi` nhiều đáp án đúng (chấm một phần: đúng − sai) · `tf` Đúng/Sai · `short` trả lời ngắn (nhiều đáp án chấp nhận) · `fill` điền chỗ trống (`{{am|'m}}`, mỗi chỗ trống chấm riêng) · `match` nối cặp · `order` sắp xếp thứ tự (chấm theo số vị trí đúng) · `essay` tự luận (không tự chấm, bài viết gửi về Sheet).
Mỗi câu có thể kèm: điểm riêng, đoạn văn (reading), hình ảnh (https), **âm thanh YouTube** và **giải thích**.

**YouTube chỉ nghe:** video bị phủ lớp chặn chuột/chạm, tắt phím tắt, không có thanh tua/tạm dừng; học sinh chỉ có nút **Nghe** (đặt số lượt nghe 0–20, đoạn bắt đầu/kết thúc `0:05`–`0:30`, tùy chọn ẩn hình). Cần Internet và video cho phép nhúng; không chạy khi mở `file://`.

**Làm bài:** từng câu một, bảng số câu (xanh = đã làm), đồng hồ đếm ngược (tự nộp khi hết giờ), cảnh báo khi thoát giữa chừng.
**Xem kết quả tại chỗ:** sau khi nộp, bấm vào số câu → câu đó hiện lại với đáp án đúng/sai, đáp án chuẩn và **giải thích** (khi sai/bỏ trống/đúng một phần). Giáo viên có thể tắt xem lại cho từng bài.

**Giao bài / thống kê:** giống bài từ vựng (link tự chứa ≤ 2000 ký tự, nếu dài thì lưu đề lên sheet `Tests` và dùng link ngắn; hạn nộp & số lần do máy chủ quyết định). Kết quả vào sheet `TestResults` (điểm được máy chủ tính lại từ từng câu). Xem ở menu **Thống kê test**: bảng điểm, chi tiết từng học sinh, tỉ lệ đúng theo câu, xuất CSV. **Sau khi cập nhật `Code.gs` nhớ Deploy → New version.**
Lưu ý: không có máy chủ chấm riêng nên đáp án nằm trong dữ liệu đề – phù hợp kiểm tra tại lớp/luyện tập, không phải thi chống gian lận.

### Nhập CSV / Excel
Nút **⬆ Nhập CSV/Excel** (trang chủ hoặc trong trình soạn) · **⬇ File CSV mẫu** · **⬇ Xuất bài này ra CSV**. Mỗi dòng là một câu; dòng đầu là tiêu đề cột. Lưu CSV dạng **UTF-8** (Excel: *CSV UTF-8*); dấu phân cách `,` hoặc `;` đều được.

| Cột | Ý nghĩa |
|---|---|
| `type` | `mcq`, `multi`, `tf`, `short`, `fill`, `match`, `order`, `essay` (hoặc `meta` – dòng thông tin bài) |
| `question` | Nội dung câu hỏi. Với `fill`: chứa chỗ trống `{{đáp án}}` hoặc `{{đáp án 1|đáp án 2}}` |
| `answer` | mcq: chữ cái `B` hoặc nội dung lựa chọn · multi: `A|C` · tf: `TRUE`/`FALSE` · short: các đáp án chấp nhận cách nhau `|` · essay: gợi ý đáp án · fill/match/order: để trống |
| `options` | mcq/multi: `Lựa chọn 1|Lựa chọn 2|…` · match: `trái=>phải|trái=>phải` · order: các mục theo **đúng thứ tự** `|` |
| `points` | Điểm câu (mặc định 1) |
| `explanation` | Giải thích hiện khi học sinh sai |
| `passage` | Đoạn văn hiển thị trên câu hỏi |
| `audio_url`, `audio_start`, `audio_end`, `max_plays`, `hide_video` | YouTube: link, giây hoặc `m:ss`, số lượt nghe (0 = vô hạn, mặc định 2), `1` ẩn hình / `0` hiện |
| `image_url` | Link ảnh `https://…` |

Dòng `meta`: `question` = tên bài, `answer` = số phút làm bài, `explanation` = mô tả. Dòng lỗi bị bỏ qua và được liệt kê (số dòng + lý do) trước khi nhập. Ký tự `|` trong nội dung lựa chọn không dùng được (dùng `/`).
**Prompt cho AI để chuyển tài liệu đề thi thành CSV:** xem `prompt-ai-tao-csv.md`.

### Giao diện học sinh
Khi học sinh mở link giao bài (từ vựng hoặc test), **thanh header (tên app + menu) bị ẩn hoàn toàn**, nên không còn gì để bấm vào trang giáo viên; mọi đường dẫn khác vẫn bị khóa về bài đang làm. Giáo viên muốn thoát khỏi một link đang xem thử: sửa địa chỉ về `#/` hoặc dùng nút Back.

## 11. Nhân bản, Gộp và dung lượng
- **⧉ Nhân bản**: có trên mọi thẻ (bộ từ và bài test) – tạo bản sao tên "… (bản sao)" ngay sau thẻ gốc, mã mới.
- **⛓ Gộp**: chọn từ 2 thẻ trở lên (cùng loại) → tạo một thẻ mới. Tùy chọn bỏ trùng (bộ từ: trùng từ tiếng Anh; bài test: cùng loại và cùng nội dung câu) và xóa các thẻ gốc sau khi gộp. Giọng đọc / thời gian / cài đặt trộn lấy từ thẻ bạn bấm Gộp.
- **Giới hạn hiện tại:** bộ từ không giới hạn số từ ở phía app (đã thử 12.000 từ); giao bài lên Sheet tối đa 5.000 từ/bộ; bài test tối đa 500 câu; một lần làm bài từ vựng lưu tối đa 2.000 từ. Bộ từ/đề lớn hơn 2.000 ký tự link tự dùng link ngắn (cần Apps Script + Teacher Key).
- **Bộ nhớ trình duyệt:** từ phiên bản 23/10/2026 dùng IndexedDB (mục 18), không còn trần ~5 MB. Xem mức dùng ở **Cài đặt → Bộ nhớ trên máy**. Luôn **Xuất JSON** để sao lưu.
- **data.json trên GitHub:** file đơn lẻ tối đa 25 MiB nếu tải lên bằng giao diện web, 100 MiB nếu đẩy bằng git (cảnh báo từ 50 MiB). Repo nên < 1 GB. File càng lớn thì mỗi lần mở trang chủ (đồng bộ) càng chậm.

## 12. Khắc phục: thống kê bài test không có dữ liệu
1. **Kết quả bài test nằm ở menu "Thống kê test"**, không phải "Thống kê" (trang đó chỉ dành cho bài từ vựng).
2. Phải dán lại `Code.gs` mới nhất **và** Deploy → Manage deployments → ✎ → Version: **New version**. Cài đặt → **Kiểm tra kết nối** sẽ báo đỏ nếu Apps Script còn bản cũ.
3. Link giao bài phải được tạo SAU khi cấu hình Apps Script URL (URL nằm trong link). Link tạo khi chưa có URL sẽ không gửi được kết quả.
4. Bài nộp lúc Apps Script còn bản cũ sẽ ở lại hàng đợi trên máy học sinh và hiện "Lỗi – Thử lại"; sau khi bạn cập nhật, học sinh mở lại link/bấm **Thử lại** để gửi.

## 13. Phần (Section) và giao diện làm bài kiểu IELTS / Cambridge
**Cấu trúc:** Bài test → **Phần** → Câu hỏi. Mỗi phần có tiêu đề, hướng dẫn, **đoạn văn dùng chung**, hình dùng chung và/hoặc **bài nghe YouTube dùng chung** – chỉ nhập một lần cho cả nhóm câu. Có thể thêm **bài nghe cho cả bài test** (đề Listening ghi âm liền mạch). Đề tạo ở phiên bản cũ được tự gói vào "Phần 1".
**Học sinh:** đoạn văn bên trái, các câu của phần bên phải (cuộn độc lập; điện thoại thì xếp dọc); thanh dưới liệt kê các phần và số câu (xanh = đã làm, viền vàng = đánh dấu xem lại) – bấm số để cuộn tới câu. Bài nghe nằm cố định phía trên và **chạy liên tục khi học sinh chuyển giữa các câu/phần**; chỉ có nút Nghe (số lượt do giáo viên đặt, mặc định 1), không tạm dừng/tua được.
**Xem lại:** bấm số câu → mở đúng phần (đoạn văn, bài nghe nghe lại tự do) với mọi câu hiện đúng/sai, đáp án và giải thích; điểm từng phần ở bảng tóm tắt.
**CSV:** thêm dòng `type=section` (question = tiêu đề, answer = hướng dẫn, passage = đoạn văn chung, image_url, audio_*) – các câu ngay sau nó thuộc phần đó; dòng `meta` có thể mang bài nghe cho cả bài. Chi tiết trong `prompt-ai-tao-csv.md`. Sau khi cập nhật `Code.gs` (VERSION 4) nhớ Deploy → New version.

## 14. Nhập đề từ văn bản (khuyến nghị cho đề PDF)
Trang chủ → **📄 Nhập từ văn bản (dán đề)**. Văn bản được tách trực tiếp bằng quy tắc trong app (không qua AI) nên chữ gốc được giữ 100%; AI chỉ được dùng để lập **bảng đáp án + giải thích** (app có sẵn nút copy câu lệnh). Quy trình đầy đủ, bảng quy tắc nhận dạng và mẹo xử lý đề đặc biệt: xem `HUONG-DAN-NHAP-DE.md`. Mỗi câu có thêm trường **Hướng dẫn nhóm câu** (hiện phía trên câu đó, ví dụ “Questions 6–10 …”).

## 15. Định dạng chuẩn (thẻ @) và prompt NotebookLM đa năng
Văn bản có dòng `@TEST` / `@SECTION` / `@Q` được đọc ở chế độ **định dạng chuẩn**: `@SECTION`, `@INSTR`, `@PASSAGE`, `@IMAGE`, `@AUDIO url | bắt đầu | kết thúc | lượt | show`, `@GROUP` (hướng dẫn nhóm câu), `@Q loại [điểm]` với loại `mcq multi tf tfng ynng short fill match order essay`, `@ANS`, `@WHY`, `@NOTE`. Prompt NotebookLM hoàn chỉnh (kèm bảng chọn loại cho mọi kiểu đề và ví dụ) nằm trong `PROMPT-NOTEBOOKLM.md` và trong nút **📋 Copy prompt cho NotebookLM** của hộp thoại nhập đề. Câu có giải thích bắt đầu bằng "[AI tự giải" được app đếm và cảnh báo.

## 16. Nâng cấp: link nghe/xem mọi loại, phóng to hình, tên bài giao, link & xóa dữ liệu trong Thống kê
**Cần làm sau khi cập nhật:** thay `app.js`, `style.css` trên GitHub và dán lại `Code.gs` (VERSION 5) → **Deploy → Manage deployments → ✎ → New version**. Cài đặt → *Kiểm tra kết nối* sẽ báo đỏ nếu Apps Script còn bản cũ. Sheet `Assignments` tự thêm cột `link`.

- **Link âm thanh / video bất kỳ** (ô “Link âm thanh / video” trong trình soạn, CSV `audio_url`, thẻ `@AUDIO`): YouTube (mọi dạng link) · Google Drive (chia sẻ “Bất kỳ ai có link”) · Vimeo · Dropbox · file trực tiếp `.mp3 .m4a .wav .ogg .mp4 .webm…` · link https khác (thử phát trực tiếp). YouTube và file trực tiếp vẫn **chỉ có nút Nghe, đếm lượt, không tua**. Vimeo / Drive (dự phòng) chạy trong khung riêng nên **không giới hạn lượt**. Link không nhúng được (chủ video YouTube tắt nhúng, Facebook, TikTok…) vẫn được chấp nhận và hiện nút **↗ Mở trong tab mới** cho học sinh. Đề / link cũ vẫn dùng bình thường. Lưu ý: nếu chủ video YouTube tắt nhúng thì không ứng dụng nào nhúng được – hãy dùng file mp3/mp4 hoặc Drive.
- **Biểu tượng 🎧 gọn lại:** chế độ chỉ nghe là một thanh nhỏ (40px) thay vì khung 16:9 với biểu tượng lớn.
- **Hình phóng to:** bấm vào hình trong bài test (đoạn văn/câu hỏi) → trình xem toàn màn hình: nút +/−, lăn chuột, chụm 2 ngón, chạm đúp, kéo để di chuyển, `Esc` để đóng, “Ảnh gốc” mở tab mới.
- **Tên bài giao:** hộp thoại **Giao bài** (bộ từ và bài test) có ô *Tên bài giao*; tên này hiện cho học sinh và trong Thống kê, không đổi tên thẻ.
- **Thống kê (cả bài từ vựng và test):** chọn bài → thẻ **Thông tin bài giao** có hạn nộp, **link giao bài (copy lại được)**. Bài giao từ phiên bản cũ chưa lưu link: nếu đề/bộ từ nằm trên Sheet thì link ngắn được dựng lại, không thì hiện hướng dẫn tạo link mới.
- **Xóa dữ liệu bài hết hạn:** nút **🗑 Xóa dữ liệu bài này** chỉ bật khi bài đã hết hạn (máy chủ cũng kiểm tra). Xóa vĩnh viễn: kết quả (`Results`/`TestResults`), dòng đăng ký (`Assignments`), đề/bộ từ lưu ở `Tests`, và dữ liệu của bài trong trình duyệt (số lần làm, hàng đợi gửi). Thẻ bộ từ / bài test của bạn không bị xóa. Nên xuất CSV/Excel trước.

## 17. Nâng cấp giao diện & bài nghe (22/10/2026)
- **Link giao bài ngắn hơn:** khi đã kết nối Apps Script + Teacher Key, link dài hơn ~900 ký tự (trước đây 2000) tự chuyển sang link ngắn `#/taketest?id=…&s=<mã triển khai>`; chỉ còn ~100–150 ký tự. Tự thử lại 3 lần nếu mạng chập chờn; nếu vẫn lỗi có nút **↻ Thử tạo link ngắn lại** và thông báo rõ nguyên nhân. Link cũ (mang cả URL Apps Script) vẫn mở bình thường. *Không cần sửa `Code.gs`.* Nếu chưa kết nối Apps Script thì không có cách nào rút gọn (dữ liệu bài phải nằm trong link).
- **Hình lớn:** hình trong đoạn văn / câu hỏi rộng hết khung chứa (giữ tỉ lệ), bấm vào để phóng to thêm.
- **Khung nghe nhỏ, đứng yên:** nằm ở đầu phần, không đi theo khi cuộn, không che câu hỏi. Chỉ-nghe chỉ còn là một nút nhỏ.
- **Google Drive không cho tua / tạm dừng:** app thử phát trực tiếp (không có thanh điều khiển). Nếu Drive chặn, app dùng khung xem của Drive nhưng **khóa** ngay khi học sinh bấm ▶ (lớp phủ chặn chạm, bỏ focus để phím Space không dừng được); muốn nghe lại phải bấm **↺ Nghe lại** (trừ một lượt). Mọi loại file còn lại cũng chặn nút tạm dừng / tua ở màn hình khóa & thông báo (Media Session). *Cách chắc chắn nhất:* đặt file mp3 ngay trong repo GitHub Pages (vd. thư mục `audio/`) và dán link đầy đủ `https://<user>.github.io/<repo>/audio/ten.mp3`.
- **Hết khoảng trống dưới menu cuối:** nguyên nhân là các nút radio ẩn của đáp án làm trang dài thêm; đã sửa. Màn hình làm bài lấp đầy chiều cao thiết bị, đoạn văn | câu hỏi cuộn riêng, thanh số câu luôn sát đáy.
- **Điện thoại / máy tính bảng:** thanh điều hướng cuộn ngang và không dính khi cuộn (điện thoại), thanh trên và thanh số câu gọn hơn, thanh số câu cuộn ngang, điện thoại xoay ngang chia đôi đoạn văn | câu hỏi.

## 18. Lưu trữ bằng IndexedDB + tìm kiếm trên trang chủ (23/10/2026)
**Cần làm:** thay `app.js`, `style.css`, `index.html` trên GitHub. Không cần sửa `Code.gs`.

- **Trước:** toàn bộ bộ từ nằm trong một key `localStorage` (~5 MB), mỗi lần sửa phải nén và ghi lại tất cả; mở app phải giải nén tất cả.
- **Nay:** kho IndexedDB `spelling-mastery` gồm `sets`, `tests` (mỗi bản ghi một bộ / một bài) và `meta` (thứ tự hiển thị). Sửa một bộ chỉ ghi đúng bộ đó; xóa / đổi thứ tự chỉ ghi phần chênh lệch. Dung lượng do trình duyệt cấp (thường hàng trăm MB đến GB), app còn xin quyền lưu bền (`navigator.storage.persist`).
- **Tự chuyển dữ liệu cũ:** lần mở đầu tiên sau khi cập nhật, app chép dữ liệu từ localStorage sang IndexedDB, **đếm lại cho khớp rồi mới xóa bản cũ**. Nếu có lỗi ở bước này, app giữ nguyên dữ liệu cũ và chạy chế độ localStorage như trước. Vẫn nên **Xuất JSON** sao lưu trước khi cập nhật.
- **Dự phòng:** trình duyệt không có IndexedDB (một số chế độ riêng tư) → tự quay về chế độ cũ (~5 MB) và báo ở Cài đặt.
- **Nếu không đọc được dữ liệu** khi mở app, app **chặn ghi** và báo lỗi để không đè mất dữ liệu; tải lại trang là thường được.
- **Trang chủ:** khi có hơn 8 bộ từ / bài test sẽ hiện ô **tìm theo tên**, sắp xếp (thứ tự của tôi / mới sửa / A→Z) và chỉ vẽ 48 thẻ mỗi lần, bấm **Hiện thêm** để xem tiếp. Nhờ vậy cuộn vẫn mượt với hàng nghìn mục.
- **Giới hạn còn lại (biết trước):** danh sách vẫn được nạp hết vào RAM khi mở app, nên 1 triệu từ + hàng chục nghìn câu có thể chiếm vài trăm MB RAM trên máy yếu. `data.json` trên GitHub vẫn là một file (tối đa 100 MB) và được tải lại mỗi lần mở trang chủ; với kho rất lớn, nên dùng **Xuất JSON** để sao lưu thủ công thay vì đồng bộ qua repo, hoặc chia dữ liệu thành nhiều file ở bước nâng cấp sau. Hai tab cùng sửa một dữ liệu: bản lưu sau cùng thắng ở mức từng bộ / bài.


## 19. Mật khẩu học sinh · Góc phụ huynh · Nút sáng/tối (v11)
**Sau khi dán `Code.gs` mới: Deploy → Manage deployments → ✎ → New version.** Sheet `Students` tự có thêm cột `password`, sheet `Parents` tự được tạo.

**Mật khẩu học sinh**
- Giáo viên đặt tự do (tối đa 32 ký tự, phân biệt hoa/thường): khi tạo mã (dòng `MÃ | ghi chú | mật khẩu`, hoặc tích "Tự tạo mật khẩu 4 chữ số"), nút 🔑 ở từng dòng, hoặc **🔑 Mật khẩu hàng loạt**. Ô trống = mã không cần mật khẩu.
- Cần mã + mật khẩu để vào **trang học sinh** và **làm bài được giao**. Đăng nhập đúng → máy nhớ (token), lần sau vào thẳng. Đổi mật khẩu → mọi máy phải đăng nhập lại. Sai 6 lần / 10 phút → khóa 10 phút.
- Máy chủ kiểm tra token ở mọi thao tác của học sinh (hồ sơ, bài giao, nộp bài, cộng điểm, trò chơi, khu vườn) – không chỉ ở giao diện.
- Mật khẩu hiện trong bảng học sinh, CSV và thẻ in.
- **Mã học sinh không còn bị che** ở bất kỳ đâu (bảng xếp hạng, khu vườn).

**Trang học sinh:** tab "Bài được giao" tách thành **📚 Bài chung** (giao cho mọi mã) và **👤 Bài của riêng bạn** (chỉ giao cho mã đó).

**Góc phụ huynh (`phu-huynh.html`)**
- Giáo viên tạo ở tab **👪 Phụ huynh**: mã phụ huynh + mật khẩu tự đặt + danh sách mã các con (tối đa 20). Nút **🔗 Lời mời** sao chép sẵn link + mã + mật khẩu để gửi Zalo.
- Phụ huynh đăng nhập **một lần**, xem được tất cả các con (chạm tên con để chuyển, không phải đăng nhập lại).
- **Trang phụ huynh chỉ hiện bài giao riêng** (bài có chọn mã học sinh). Bài giao cho tất cả học sinh là bài tự chọn: chỉ học sinh và giáo viên thấy; máy chủ (Code.gs v12) không gửi bất kỳ dữ liệu nào về bài này cho phụ huynh (không danh sách, kết quả, lịch, từ sai hay điểm). Tab Phụ huynh của giáo viên cảnh báo nếu Apps Script chưa được Deploy bản mới.
- Mỗi con có (chỉ tính bài giao riêng): đánh giá **Chăm chỉ** (làm đủ / đúng hạn) và **Độ chính xác** (% đúng); 4 chỉ số chính; lịch học 4 tuần (có đánh dấu ngày chơi trò chơi); bài chưa làm & bài bỏ lỡ; kết quả từng lần làm; **từ con hay sai** để ôn cùng con; điểm thưởng và số ván trò chơi.
- Số liệu 30 ngày gần nhất, giờ Việt Nam; máy chủ lưu đệm 2 phút (nút ↻ Cập nhật lấy mới).

**Nút ☀️/🌙** có trên thanh trên cùng của trang giáo viên, học sinh, phụ huynh và trên màn hình vào làm bài; lựa chọn dùng chung mọi trang (`theme.js`).
