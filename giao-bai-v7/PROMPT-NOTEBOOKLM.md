# Prompt NotebookLM: chuyển MỌI loại đề sang định dạng app hiểu

**Cách dùng (1 phút):** (1) Nạp PDF/ảnh đề vào NotebookLM. (2) Dán prompt dưới đây – điền mục "THÔNG TIN BỔ SUNG" ở cuối nếu có link YouTube cho phần nghe. (3) Copy toàn bộ kết quả. (4) Trong app: **📄 Nhập từ văn bản (dán đề)** → dán → xem bản xem trước → **Tạo bài test**.
Bạn cũng có thể bấm nút **📋 Copy prompt cho NotebookLM** ngay trong hộp thoại nhập đề của app (luôn là bản mới nhất, khớp với bộ đọc của app).

**Vì sao đáng tin?** NotebookLM chỉ *sao chép nguyên văn và gắn thẻ* (@SECTION, @PASSAGE, @Q…); app đọc thẻ một cách chắc chắn, không phải đoán bố cục. Mọi loại đề (nghe, đọc, viết, ngữ pháp, từ vựng, chỉ trắc nghiệm, tự luận, đúng/sai, toán/lý/hóa…) đều quy về 8 loại câu của app.

````text
NHIỆM VỤ
Chuyển TOÀN BỘ đề kiểm tra trong nguồn (PDF, ảnh, văn bản – bất kỳ môn, bất kỳ loại: đọc, nghe, viết, ngữ pháp, từ vựng, chỉ trắc nghiệm, tự luận, đúng/sai…) sang "ĐỊNH DẠNG CHUẨN" dưới đây để ứng dụng đọc được. Bạn là MÁY SAO CHÉP GẮN THẺ, không phải người biên tập.

NGUYÊN TẮC VÀNG
1. Sao chép NGUYÊN VĂN từng chữ, dấu câu, chính tả, số liệu, ký hiệu của đề (đoạn văn, hướng dẫn, câu hỏi, lựa chọn). TUYỆT ĐỐI không diễn đạt lại, tóm tắt, dịch, sửa lỗi, sắp xếp lại, bỏ sót hoặc thêm nội dung vào đề. Chỉ được: (a) thêm các dòng thẻ bắt đầu bằng @; (b) bỏ số thứ tự đầu câu ("1.", "Câu 1:", "Question 1") vì app tự đánh số – nhưng GIỮ nguyên nhãn chỗ trống trong đoạn văn như (14) hay [14]; (c) nối các dòng bị ngắt giữa câu do bố cục PDF; (d) chép bảng thành các dòng chữ, các ô cách nhau bằng " | ".
2. Không bỏ sót: số dòng @Q phải bằng số câu hỏi của đề (mỗi chỗ trống cần điền, mỗi mệnh đề đúng/sai, mỗi mục nối… tính theo mục 4). Đếm lại trước khi trả lời.
3. Chỉ xuất VĂN BẢN THUẦN: không markdown (không **, #, bảng |---|), không khối code, không lời dẫn. Có thể kết thúc bằng một dòng "@NOTE …" ghi điều cần tôi kiểm tra.
4. Đa cột / bố cục lạ: đọc theo đúng thứ tự người làm bài đọc (cột trái trước rồi cột phải; đoạn văn trước, câu hỏi sau).

CÁC THẺ (mỗi thẻ nằm ở ĐẦU DÒNG; nội dung chạy tiếp đến thẻ kế tiếp)
@TEST Tên bài test | số phút        (tùy chọn, 1 lần ở đầu; bỏ "| số phút" nếu đề không ghi)
@AUDIO link | bắt đầu | kết thúc | số lượt nghe | show   (chỉ khi tôi cung cấp link YouTube; xem mục 6)
@SECTION Tiêu đề phần          (mỗi Part / Section / Passage / Task / Bài / PHẦN I… mở một phần mới)
@INSTR hướng dẫn chung của phần (nguyên văn, nhiều dòng được)
@PASSAGE
đoạn văn / ngữ liệu / bài đọc / đề viết dùng chung cho cả phần (nguyên văn, giữ dòng trống giữa các đoạn)
@IMAGE https://…               (chỉ khi tôi cung cấp link ảnh)
@GROUP
hướng dẫn của một NHÓM câu, hiện ngay phía trên câu kế tiếp (vd "Questions 6–10 Choose the correct heading…", ngân hàng từ, ví dụ mẫu, phần dẫn chung của câu đúng/sai)
@Q loại [điểm]                 (mở một câu hỏi; nội dung câu ở các dòng ngay dưới)
@ANS đáp án                    (đáp án đúng – xem quy tắc mục 5)
@WHY giải thích ngắn          (1–2 câu nêu bằng chứng)

CÁC LOẠI CÂU (@Q loại)
mcq    – trắc nghiệm 1 đáp án. Dòng câu hỏi, rồi mỗi lựa chọn một dòng "A. …", "B. …"… (giữ nguyên chữ). @ANS B
multi  – chọn NHIỀU đáp án đúng ("Choose TWO letters"). Như mcq. @ANS A, C
tf     – chỉ hai khả năng Đúng/Sai. @ANS TRUE hoặc FALSE
tfng   – True / False / Not Given (không cần chép lựa chọn). @ANS TRUE | FALSE | NOT GIVEN
ynng   – Yes / No / Not Given. @ANS YES | NO | NOT GIVEN
short  – trả lời ngắn / điền một từ-cụm từ / hoàn thành câu-ghi chú-biểu mẫu-bảng. Chép câu có chỗ trống. @ANS mọi đáp án chấp nhận, cách nhau bằng " / " (vd went / has gone)
fill   – chỗ trống nằm GIỮA câu/đoạn. Chép câu và thay mỗi chỗ trống bằng {{đáp án}}; nhiều đáp án đều đúng: {{am|'m}}. Hoặc để nguyên ____ rồi @ANS đáp án từng chỗ trống theo thứ tự, cách nhau bằng dấu ";"
match  – nối cặp 1-1 (từ–nghĩa, câu hỏi–câu trả lời). Mỗi cặp ĐÚNG một dòng: vế trái => vế phải
order  – sắp xếp từ/cụm/câu/đoạn thành thứ tự đúng. Các mục theo ĐÚNG thứ tự, mỗi mục một dòng bắt đầu bằng "- "
essay  – tự luận / viết đoạn / viết bài / nói / trả lời mở. Chép đề; @ANS là bài mẫu hoặc tiêu chí chấm nếu nguồn có (không có thì bỏ @ANS)

CHỌN LOẠI CÂU CHO TỪNG KIỂU ĐỀ
- Trắc nghiệm A/B/C/D (mọi môn) → mcq. "Chọn 2/3 đáp án" → multi.
- True/False/Not Given, Yes/No/Not Given (IELTS) → tfng / ynng. Đúng/Sai thường → tf.
- Đề kiểu "Đúng/Sai" gồm 1 câu dẫn + các ý a), b), c), d): đặt câu dẫn trong @GROUP, mỗi ý a), b)… là một "@Q tf" (chép nguyên văn ý đó).
- Matching headings / matching information / matching features / ghép người–ý kiến (chọn từ DANH SÁCH CHUNG): mỗi mục cần ghép = một "@Q mcq", mà các lựa chọn là TOÀN BỘ danh sách chung (chép lại danh sách đó cho từng câu, đánh lại A., B., C.… theo thứ tự danh sách; giữ nguyên chữ). Đặt hướng dẫn chung vào @GROUP trước câu đầu tiên của nhóm.
- Ghép từ–nghĩa / câu hỏi–đáp án KHÔNG dùng chung danh sách → một "@Q match" duy nhất chứa tất cả các cặp.
- Sentence/note/summary/flow-chart/table/form completion, short-answer questions → mỗi chỗ trống hoặc mỗi câu là một "@Q short" (chép nguyên câu/dòng có chỗ trống). Nếu có NGÂN HÀNG TỪ chung: đặt ngân hàng từ trong @GROUP.
- Điền vào ĐOẠN VĂN liền mạch có nhiều chỗ trống đánh số (cloze, open cloze, summary): chép cả đoạn vào MỘT "@Q fill" với mỗi chỗ trống viết dạng (14) {{đáp án}}; đặt điểm bằng số chỗ trống (vd "@Q fill 6"). Hoặc nếu đề cho 3–4 lựa chọn cho từng chỗ trống (Cambridge Part 1) → mỗi chỗ trống là một "@Q mcq" với câu hỏi là nhãn chỗ trống, vd (14).
- Chia dạng động từ trong ngoặc, word formation, error identification, viết lại câu (rewrite/transform) → short hoặc fill; liệt kê MỌI cách viết đúng nguồn cho phép trong @ANS, cách nhau " / ".
- Sắp xếp từ thành câu, sắp xếp câu thành đoạn hội thoại → order.
- Writing Task 1/2, viết thư/email, Speaking prompt, đề tự luận mọi môn (Văn, Sử, Địa… nếu có) → essay.
- Toán/Lý/Hóa/Sinh: trắc nghiệm → mcq; điền số/kết quả → short (ghi các dạng viết tương đương, vd 0,5 / 1/2); tự luận chứng minh/giải → essay. Công thức chép ở dạng chữ/LaTeX đúng như nguồn.
- Điểm: nếu đề ghi điểm/mark cho câu thì "@Q loại điểm" (vd "@Q mcq 0.5"); không ghi thì để mặc định (không viết số).

QUY TẮC ĐÁP ÁN VÀ GIẢI THÍCH
- Có bảng đáp án / mark scheme / answer key trong nguồn → dùng NGUYÊN theo đó.
- Nguồn KHÔNG có đáp án → tự giải thật cẩn thận, vẫn ghi @ANS, và bắt đầu @WHY bằng "[AI tự giải – cần kiểm tra] ".
- @WHY: 1–2 câu, nêu bằng chứng (vd "Đoạn 2: 'rides his bicycle'"). Nếu nguồn có lời giải/transcript, dùng nó để viết @WHY. Câu tự luận có thể bỏ @WHY.
- Nhiều đáp án chấp nhận (đáp án mở/số/biến thể chính tả) → @ANS liệt kê hết, cách nhau " / ".

PHẦN NGHE (LISTENING)
- Mỗi Part/Section nghe là một @SECTION. Nếu tôi đưa link YouTube ở cuối prompt, đặt "@AUDIO link | bắt đầu | kết thúc | số lượt nghe" ngay sau @SECTION tương ứng (một file ghi âm chung cho cả bài thì đặt @AUDIO ngay dưới @TEST, trước mọi @SECTION). Số lượt nghe mặc định 1. Không có link → KHÔNG tự bịa, bỏ @AUDIO và thêm vào @NOTE cuối cùng: "Cần link nghe: Part …".
- KHÔNG đưa transcript/tapescript vào @PASSAGE (học sinh sẽ thấy đáp án). Chỉ dùng nó để viết @ANS/@WHY.
- Câu hỏi của phần nghe vẫn chép nguyên văn (kể cả biểu mẫu/ghi chú cần điền).

HÌNH, BIỂU ĐỒ, BẢN ĐỒ
- Không chép được nội dung hình: ghi đúng một dòng "[HÌNH: mô tả ngắn những gì thấy]" tại vị trí hình trong @PASSAGE hoặc câu hỏi, và thêm vào @NOTE "Cần ảnh: …". Nếu tôi cung cấp link ảnh https → dùng @IMAGE.
- Câu hỏi gắn nhãn hình/bản đồ (A–H) → mcq với các lựa chọn là nhãn.

KIỂM TRA TRƯỚC KHI TRẢ LỜI
(a) mọi câu có @Q và @ANS (trừ essay không có đáp án mẫu); (b) mcq/multi có ≥ 2 lựa chọn "A." "B." đúng thứ tự và @ANS là chữ cái nằm trong phạm vi; (c) fill có {{…}} hoặc ____ khớp số đáp án trong @ANS; (d) match ≥ 2 cặp, order ≥ 2 mục; (e) mỗi @SECTION có ít nhất một @Q; (f) văn bản đề giữ NGUYÊN VĂN, không paraphrase; (g) số @Q khớp số câu của đề.

VÍ DỤ ĐỊNH DẠNG (chỉ minh họa cấu trúc – không đưa vào kết quả)
@TEST Kiểm tra tổng hợp | 45
@SECTION Part 1 – Reading
@INSTR Read the text and answer questions 1–6.
@PASSAGE
Tom lives in Da Nang with his family. Every morning he rides his bicycle to school.

On Sundays, Tom helps his mother cook lunch.
@GROUP
Questions 1–2
Do the following statements agree with the information given in the text?
Write TRUE if the statement agrees, FALSE if it contradicts, NOT GIVEN if there is no information.
@Q tfng
Tom goes to school by bus.
@ANS FALSE
@WHY Đoạn 1: he rides his bicycle.
@Q tfng
Tom has two sisters.
@ANS NOT GIVEN
@Q mcq
Where does Tom live?
A. Hanoi
B. Hue
C. Da Nang
@ANS C
@WHY Câu đầu của đoạn 1.
@Q short 2
What does Tom do on Sundays? (Write NO MORE THAN FOUR WORDS)
@ANS helps his mother cook lunch / cooks lunch
@SECTION Part 2 – Listening
@AUDIO https://youtu.be/XXXXXXXXXXX | 0:05 | 1:30 | 1
@Q mcq
What is the speaker's job?
A. Teacher
B. Doctor
C. Driver
@ANS A
@WHY [AI tự giải – cần kiểm tra] Người nói tự giới thiệu ở đầu bài nghe.
@SECTION Part 3 – Grammar & Vocabulary
@INSTR Choose or type the correct answer.
@Q fill 2
I {{am|'m}} a student and she {{is|'s}} a teacher.
@Q match 3
Match the word with its meaning.
airport => sân bay
luggage => hành lý
passport => hộ chiếu
@Q order 2
Put the words in the correct order.
- I
- like
- playing
- football
@Q multi
Choose TWO fruits.
A. Apple
B. Carrot
C. Banana
@ANS A, C
@SECTION Part 4 – Writing
@Q essay
Write 2–3 sentences about your weekend.
@ANS Last weekend I visited my grandparents. We cooked lunch together.
@NOTE Cần link nghe cho Part 2 nếu chưa có.

THÔNG TIN BỔ SUNG TỪ TÔI (nếu có – điền trước khi gửi):
- Link YouTube: Part … = https://…  (bắt đầu 0:00, kết thúc …, số lượt nghe …)
- Link ảnh: …
- Tên bài / thời gian làm bài: …

HÃY CHUYỂN ĐỀ TRONG NGUỒN THEO ĐÚNG ĐỊNH DẠNG TRÊN. Chỉ trả về nội dung đã chuẩn hóa.
````
