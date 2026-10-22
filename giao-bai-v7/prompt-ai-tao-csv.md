# Prompt để AI chuyển tài liệu bài test thành file CSV cho Spelling Mastery

> **Lưu ý:** với đề từ PDF/văn bản, cách chính xác và nhanh hơn là **Nhập từ văn bản** trong app (xem `HUONG-DAN-NHAP-DE.md`) – chữ gốc không đi qua AI nên không bị diễn đạt lại. Chỉ dùng CSV khi bạn muốn tự soạn bảng tính.

**Cách dùng:** (1) Mở ChatGPT / Claude / Gemini. (2) Dán toàn bộ khối prompt bên dưới. (3) Đính kèm tài liệu (PDF, Word, ảnh chụp đề…) hoặc dán nội dung đề. (4) Chép kết quả vào Excel/Notepad, lưu **UTF-8** đuôi `.csv` (hoặc để AI xuất file CSV nếu nó hỗ trợ). (5) Trong app: **Nhập CSV/Excel** → xem báo lỗi → **Tạo bài test**.
Nếu đề có nhiều trang/phần, hãy làm từng phần rồi nối các dòng (chỉ giữ một dòng tiêu đề).

---

````text
Bạn là trợ lý chuyển đổi đề kiểm tra thành file CSV để nhập vào ứng dụng "Spelling Mastery". Hãy đọc tài liệu tôi cung cấp và xuất ra DUY NHẤT một khối CSV (trong khối code, không giải thích dài dòng).

## CẤU TRÚC ĐỀ: BÀI TEST → PHẦN → CÂU HỎI
Đề được chia thành các PHẦN (Part / Section / Reading Passage / Listening Section…). Mỗi phần có thể có: tiêu đề, hướng dẫn, MỘT đoạn văn dùng chung, hình dùng chung, và/hoặc MỘT bài nghe dùng chung cho nhiều câu hỏi. Đoạn văn/bài nghe chung chỉ được viết MỘT LẦN ở dòng "section", KHÔNG chép lặp lại ở từng câu hỏi.

## ĐỊNH DẠNG CSV
- Dòng đầu tiên là tiêu đề đúng như sau (13 cột, đúng thứ tự, không thêm bớt):
type,question,answer,options,points,explanation,passage,audio_url,audio_start,audio_end,max_plays,hide_video,image_url
- Mỗi dòng là MỘT trong các loại: meta (tối đa 1, ngay dưới tiêu đề) · section (mở một phần mới) · câu hỏi (mcq, multi, tf, short, fill, match, order, essay). Các câu hỏi ĐI SAU dòng section nào thì thuộc phần đó, cho tới dòng section kế tiếp. Câu hỏi đứng trước dòng section đầu tiên sẽ thuộc "Phần 1" không tên.
- Ô nào có dấu phẩy, xuống dòng hoặc dấu nháy kép thì đặt cả ô trong "dấu nháy kép" và nhân đôi dấu nháy kép bên trong (""). Ô không dùng để trống nhưng vẫn giữ đủ 13 cột. Đoạn văn dài nhiều đoạn: giữ xuống dòng bên trong ô (trong nháy kép).
- Mã hóa UTF-8, giữ nguyên tiếng Việt có dấu.

## DÒNG meta (tùy chọn)
type=meta · question=tên bài test · answer=số phút làm bài (trống nếu không rõ) · explanation=mô tả ngắn · audio_url/audio_start/audio_end/max_plays/hide_video = bài nghe CHẠY SUỐT TOÀN BÀI TEST (chỉ dùng khi cả đề dùng một file ghi âm liền mạch, ví dụ IELTS Listening).

## DÒNG section
type=section
- question = tiêu đề phần (ví dụ "Part 1", "Reading Passage 1", "Listening – Section 2")
- answer = hướng dẫn làm phần (ví dụ "Read the text and answer questions 1–5." hoặc "You will hear the recording once.")
- passage = ĐOẠN VĂN DÙNG CHUNG của phần (nếu có; đã loại bỏ số thứ tự câu hỏi lẫn vào)
- image_url = hình dùng chung của phần (https://…, nếu có)
- audio_url, audio_start, audio_end, max_plays, hide_video = bài nghe dùng chung của phần (chỉ khi tài liệu cho link YouTube; không bịa link). Bài nghe nằm cố định trên đầu màn hình trong suốt thời gian học sinh làm các câu của phần.
- Các cột còn lại để trống.

## CÁC LOẠI CÂU HỎI (cột type)
1. mcq – trắc nghiệm 1 đáp án đúng. options: các lựa chọn cách nhau bằng | (KHÔNG ghi A., B. ở đầu). answer: chữ cái đáp án đúng (A, B, C…) theo thứ tự lựa chọn.
2. multi – nhiều đáp án đúng. options như mcq; answer: các chữ cái cách nhau bằng | (ví dụ A|C).
3. tf – Đúng/Sai (cũng dùng cho True/False/Not Given: khi đó dùng mcq với options True|False|Not Given). answer: TRUE hoặc FALSE.
4. short – trả lời ngắn / điền 1 từ-cụm từ (kể cả dạng "Complete the notes", "Sentence completion"). answer: mọi đáp án được chấp nhận, cách nhau bằng | (ví dụ: 9 am|9:00|nine o'clock). options trống.
5. fill – điền vào chỗ trống trong câu/đoạn. Đặt chỗ trống trong question dạng {{đáp án}}; nhiều đáp án đều đúng: {{am|'m}}. Một câu có thể có nhiều chỗ trống. answer và options trống.
6. match – nối cặp (matching headings, matching information…). options: "vế trái=>vế phải" cách nhau bằng |. answer trống. Tối thiểu 2 cặp.
7. order – sắp xếp từ/câu/đoạn theo đúng thứ tự. options: các mục theo ĐÚNG thứ tự, cách nhau bằng |. answer trống.
8. essay – tự luận/viết đoạn (không chấm tự động). answer: gợi ý đáp án hoặc tiêu chí chấm (có thể trống).

## CÁC CỘT CỦA CÂU HỎI
- points: điểm của câu (số). Có ghi trong đề thì dùng; không thì để 1 (essay có thể trống).
- explanation: giải thích NGẮN GỌN (1–2 câu) vì sao đáp án đúng, nên chỉ rõ chỗ trong đoạn văn/bài nghe có bằng chứng (ví dụ: "Câu 2 của đoạn 1: 'rides his bicycle'"). Dùng lời giải của tài liệu nếu có; nếu không, tự viết cho TỪNG câu. Đây là phần học sinh đọc khi làm sai nên không để trống nếu có thể.
- passage, image_url, audio_*: chỉ điền ở cấp câu khi câu đó có ngữ liệu RIÊNG (khác với phần). Thông thường để trống vì đã đặt ở dòng section.

## QUY TẮC QUAN TRỌNG
1. KHÔNG tự bịa nội dung: câu hỏi, lựa chọn, đáp án, đoạn văn phải lấy từ tài liệu. Nếu tài liệu không có đáp án, hãy tự giải CẨN THẬN và ghi tiền tố "[AI tự giải – cần kiểm tra] " vào cột explanation.
2. Giữ nguyên cách viết gốc (chính tả, dấu câu). Bỏ số thứ tự câu ("Câu 1.", "1)") và ký hiệu đầu lựa chọn ("A.", "B)").
3. Không dùng ký tự | bên trong nội dung một lựa chọn/đáp án (thay bằng /). Không dùng => bên trong vế của câu match.
4. Gom câu hỏi theo PHẦN đúng như bố cục đề. Đề chỉ có một đoạn văn/bài nghe cho nhiều câu → một dòng section + các câu đi sau. Đề không chia phần → không cần dòng section (hoặc dùng một dòng section duy nhất).
5. Chọn loại câu sát nhất: chia động từ trong ngoặc → fill hoặc short; "Chọn đúng/sai" → tf; "Chọn tất cả đáp án đúng" → multi; "Sắp xếp các từ thành câu" → order; "Nối cột A với cột B" → match; "Viết đoạn văn" → essay.
6. Câu điền từ có sẵn ngân hàng từ: vẫn dùng fill, ghi ngân hàng từ vào đầu question ("Choose from: go, went, gone. She has {{gone}} home.") hoặc vào hướng dẫn của phần.
7. Câu có hình mà tôi không cung cấp link: giữ câu chữ, để trống image_url, ghi "[có hình minh họa]" cuối question.
8. Phần nghe mà tài liệu KHÔNG có link YouTube: để trống audio_url và ghi vào answer của dòng section: "(Chưa có link bài nghe – giáo viên bổ sung)". Nếu có transcript, KHÔNG đưa vào passage (sẽ lộ đáp án); có thể đưa vào cột explanation của câu liên quan.
9. Kiểm tra lại trước khi trả lời: (a) mọi dòng đủ 13 cột; (b) mcq/multi có ≥ 2 lựa chọn và answer nằm trong phạm vi lựa chọn; (c) fill có ít nhất một {{...}}; (d) match/order có ≥ 2 mục; (e) mỗi phần có ít nhất 1 câu; (f) không bỏ sót câu nào – tổng số dòng câu hỏi phải bằng số câu trong tài liệu.
10. Sau khối CSV, thêm tối đa 5 dòng ghi chú: tổng số phần và số câu đã chuyển, danh sách câu cần tôi kiểm tra (câu mơ hồ / AI tự giải / thiếu hình / thiếu link nghe).

## VÍ DỤ (chỉ để minh họa định dạng – không đưa vào kết quả)
type,question,answer,options,points,explanation,passage,audio_url,audio_start,audio_end,max_plays,hide_video,image_url
meta,Kiểm tra giữa kỳ,40,,,Đề đọc – nghe – ngữ pháp,,,,,,,
section,Part 1 – Reading,Read the text and answer questions 1–3.,,,,"Tom lives in Da Nang with his family. Every morning he rides his bicycle to school.

On Sundays, Tom helps his mother cook lunch.",,,,,,
mcq,Where does Tom live?,C,Hanoi|Hue|Da Nang,1,Câu đầu của đoạn 1: Tom lives in Da Nang.,,,,,,,
tf,Tom goes to school by bus.,FALSE,,1,Anh ấy đi bằng xe đạp (rides his bicycle).,,,,,,,
short,What does Tom do on Sundays?,helps his mother cook lunch|cooks lunch,,1,Đoạn 2.,,,,,,,
section,Part 2 – Listening,You will hear the recording ONCE.,,,,,https://youtu.be/XXXXXXXXXXX,0:05,1:30,1,1,
mcq,What is the speaker's job?,A,Teacher|Doctor|Driver,1,Người nói tự giới thiệu ở đầu bài nghe.,,,,,,,
short,What time does the class start?,9 am|9:00,,1,Nghe đoạn giữa bài.,,,,,,,
section,Part 3 – Grammar,Choose or type the correct answer.,,,,,,,,,,
fill,"I {{am|'m}} a student and she {{is|'s}} a teacher.",,,2,I đi với am; she đi với is.,,,,,,,
match,Match the words.,,airport=>sân bay|luggage=>hành lý,2,Từ vựng du lịch.,,,,,,,
order,Put the words in order.,,I|like|playing|football,2,S + like + V-ing.,,,,,,,

BẮT ĐẦU: hãy xử lý tài liệu tôi gửi và chỉ trả về khối CSV + ghi chú cuối.
````

---

## Mẹo
- **Đề nhiều phần / nhiều bài đọc:** yêu cầu AI làm lần lượt từng phần ("làm Part 1, tôi sẽ nhắc làm tiếp"), sau đó nối các khối CSV lại (chỉ giữ MỘT dòng tiêu đề và MỘT dòng meta).
- **Đề dài (>40 câu):** yêu cầu AI "làm câu 1–30, tôi sẽ nhắc làm tiếp" để không bị cắt giữa chừng, rồi nối các phần lại (chỉ giữ một dòng tiêu đề).
- **Ảnh chụp/PDF scan:** AI đọc sai chính tả khá thường xuyên – hãy xem bảng xem trước khi nhập và mở từng câu trong trình soạn để kiểm tra.
- **Lưu file:** nếu AI trả về văn bản, dán vào Notepad → *Save As* → Encoding **UTF-8** → tên `ten-bai.csv`. Mở bằng Excel rồi lưu lại *CSV UTF-8* cũng được; app đọc cả `.xlsx`.
- **Đã nhập nhưng sai loại câu?** Mở bài trong trình soạn, đổi "Loại câu hỏi" ở từng câu (nội dung được giữ).
