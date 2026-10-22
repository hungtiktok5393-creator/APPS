# Chuyển đề PDF → bài test trong app (giữ nguyên chữ 100%)

**Vì sao cách cũ bị sai?** AI phải *chép lại* cả đề thành CSV (13 cột, dấu nháy, dấu |…) nên hay diễn đạt lại câu hỏi, bỏ đoạn văn, vỡ cột.
**Cách mới:** văn bản đề đi thẳng vào app, app tự tách phần / đoạn văn / câu hỏi / lựa chọn bằng quy tắc cố định – **không qua AI nên không thể bị paraphrase**. AI chỉ còn việc *giải đề* (bảng đáp án ngắn), và việc đó không thể làm hỏng chữ của đề.

## 3 bước (khoảng 2–3 phút / đề)

### Bước 1 – NotebookLM chuẩn hóa đề (mọi loại đề)
Nạp PDF/ảnh đề vào NotebookLM → dán **prompt trong `PROMPT-NOTEBOOKLM.md`** (hoặc bấm **📋 Copy prompt cho NotebookLM** trong hộp thoại nhập đề của app). Điền cuối prompt các link YouTube cho phần nghe nếu có. Prompt này:
- ép NotebookLM **sao chép nguyên văn** (cấm diễn đạt lại / tóm tắt / bỏ sót) và chỉ **gắn thẻ** `@SECTION`, `@PASSAGE`, `@GROUP`, `@Q loại`, `@ANS`, `@WHY`, `@AUDIO`…;
- có bảng chọn loại câu cho từng kiểu đề: IELTS (TFNG, matching headings, completion…), Cambridge (cloze, multiple-choice cloze…), ngữ pháp (chia động từ, word formation, viết lại câu, sắp xếp từ), đúng/sai nhiều ý, tự luận/viết, nghe, trắc nghiệm thuần, toán–lý–hóa;
- bắt buộc dùng bảng đáp án của đề; nếu đề không có thì NotebookLM tự giải và gắn "[AI tự giải – cần kiểm tra]" để app báo cho bạn soát lại.

### Bước 2 – Dán vào app
Trang chủ → **📄 Nhập từ văn bản (dán đề)** (hoặc nút cùng tên trong trình soạn).
1. Dán kết quả của NotebookLM (hoặc chọn file .txt). Bản xem trước hiện ngay: “✓ Định dạng chuẩn · N phần · M câu”, câu nào ⚠ chưa có đáp án, bao nhiêu câu do AI tự giải.
2. (Tùy chọn) Nếu thiếu đáp án: mở mục “Bảng đáp án & giải thích riêng”, dán bảng dạng `1: B | giải thích` (đánh số theo thứ tự câu) – có nút copy câu lệnh hỏi AI.
3. Bấm **Tạo bài test**.

### Bước 3 – Soát nhanh trong trình soạn
Xem các câu ⚠, thêm link YouTube nếu chưa có, **Làm thử** (đoạn văn bên trái, câu hỏi bên phải) để so với PDF, rồi **Giao bài**.

> App vẫn đọc được văn bản **thường** (không thẻ) bằng quy tắc nhận dạng ở bảng dưới – hữu ích khi đề đã có sẵn dạng chữ chuẩn. Nếu văn bản có dòng bắt đầu bằng `@TEST`, `@SECTION` hoặc `@Q`, app tự dùng chế độ **định dạng chuẩn**.

## Chế độ văn bản thường: app tự nhận những gì
| Trong văn bản | App tạo ra |
|---|---|
| `Part 1`, `Section 2`, `Reading Passage 1`, `Listening …`, `Phần 1` (một dòng riêng) · hoặc `### Tên phần` | một **Phần** mới |
| Các dòng văn xuôi sau tên phần, trước câu hỏi | **đoạn văn dùng chung** của phần |
| `Questions 1–5` + dòng hướng dẫn sau nó | hướng dẫn nhóm, hiện ngay **phía trên câu 1** của nhóm |
| `Choose …` / `Read …` ở đầu phần không có “Questions” | hướng dẫn của phần |
| `1.` `1)` `Q1` `Câu 1:` (số tăng dần) | một **câu hỏi** |
| `A.` `B.` `C.` `D.` (xuống dòng hoặc cùng dòng) | trắc nghiệm; chọn nhiều đáp án khi đáp án có nhiều chữ cái (A, C) |
| Nhóm có chữ TRUE / FALSE / NOT GIVEN (hoặc YES / NO) | câu 3 lựa chọn True / False / Not Given |
| `____` hoặc `……` trong câu + có đáp án | câu **điền chỗ trống** `{{đáp án}}` |
| Câu không có lựa chọn và không có chỗ trống | câu trả lời ngắn |
| `Answer: B`, `Explanation: …` ngay dưới câu | đáp án / giải thích của câu đó |
| Dấu `*` hoặc `✓` sau đáp án đúng | đáp án đúng |
| Mục `Answer key` / `Đáp án` cuối đề, hoặc ô “Bảng đáp án” | đáp án + giải thích theo số câu |

## Mẹo khi đề đặc biệt
- **Đoạn văn không có tên phần** → thêm một dòng `### Tên phần` trước nó, hoặc bọc bằng `[passage]` … `[/passage]` (mọi thứ trong đó là đoạn văn, giữ nguyên).
- **Đoạn văn bị ngắt dòng lung tung (copy từ PDF)** → tick “Nối các dòng bị ngắt giữa câu”.
- **Đề đánh số lại từ 1 ở mỗi phần** → vẫn nhận; khi dán bảng đáp án, hãy đánh số nối tiếp theo thứ tự câu (1…N).
- **Matching headings / điền đoạn văn có ngân hàng từ** → app giữ hướng dẫn & ngân hàng từ ở phần “hướng dẫn nhóm”, các câu thành câu trả lời ngắn; chỉnh đáp án (A–F…) trong trình soạn.
- **Bài nghe** → văn bản không có link nên thêm YouTube ở ô “Âm thanh dùng chung” của phần (hoặc “Âm thanh cho cả bài test”).
- **Muốn kiểm tra lại độ giống** → trong trình soạn bấm **Làm thử**: đoạn văn bên trái, câu hỏi bên phải, so với PDF.

## Khi nào còn dùng CSV?
Chỉ khi bạn tự soạn bảng tính. Với đề từ PDF, hãy dùng **Nhập từ văn bản** ở trên. (CSV không lưu “hướng dẫn nhóm câu”.)
