# NOTES_GAMES – 10 trò, tỷ lệ thắng ≈ 45% + nhịp nhanh (bản 20261027e)

## Tỷ lệ thắng 45% (thắng = ván có net > 0), hoàn trả (RTP) giữ ≈ 90%
Đo bằng node, 200.000 ván/mục, HÀM THẬT trong Games.gs (stub Sheet/Cache), cược 10:
| Trò | Thay đổi | Thắng | RTP |
|---|---|---|---|
| Máy quay | trọng số 21/17/17/16/15/14; MỌI cặp đều trả (×1,2–×2); bộ ba ×4–×45 | 45,0% | ≈90% |
| Vòng quay | 40 ô: ×0:14 · ×0,5:8 · ×1,5:14 · ×2:3 · ×5:1 | 45,0% (18/40) | 90% |
| Xúc xắc | cố định: Dưới = số ≤45, Trên = số ≥56, ×2 (bỏ thanh trượt; `target` cũ bị bỏ qua) | 45,0% | 90% |
| Plinko | 16 hàng / 17 ô; chỉ 3 ô giữa < ×1, còn lại ≥ ×1,5 (cả 3 mức rủi ro) | 45,45% | 88,8–90% |
| Thẻ cào | trọng số 12,12,12,9,9,9,6,6,6,3,3,2,2,1,1,1; hệ số biểu tượng ×1,2–×30 | 44,8% | ≈89% |
| Keno mini | 22 số; số bóng rút theo số chọn: 1→10, 2→15, 3→17, 4→13, 5→19 | 44,1–45,4% | 88–91% |
| Tung xu | Ngửa 45%/lần, hệ số 0,9/0,45^k (×2, ×4,44…); Tự rút mặc định ×2 | 45,0% | 90% |
| Tên lửa | tốc độ ×2 (m = e^(0,2·t), ×2 sau 3,5s); Tự rút mặc định ×2 (máy chủ trả đúng ×2 dù lệnh trễ) | 45,1% | 90% |
| Dò mìn | mặc định 8 mìn + Tự rút ×1,55 (= sau 2 ô an toàn) | 45,1% | 90% |
| Cao–Thấp | Tự rút mặc định ×1,55, đoán phía nhiều lá (phím Space làm sẵn) | 45,5% | 90% |
Ván nhiều bước (hilo, mines, coin, crash) phụ thuộc cách chơi: 45% là với cài đặt mặc định; đổi số mìn / mức Tự rút thì tỷ lệ thắng đổi theo (giao diện hiện tỷ lệ thắng ước tính của cài đặt hiện tại: crash = 90/X %, coin, mines). RTP vẫn 90% với mọi cách chơi.
`gPay_`: hệ số > 1 thì luôn lãi ≥ 1 điểm (cược nhỏ không bị làm tròn thành hoà) → RTP với cược 1–4 điểm cao hơn chút.

## Nhịp nhanh, liên tục
- Mỗi ván một lần bấm: Xúc xắc bấm Dưới/Trên là lăn; Thẻ cào tự cào 9 ô (35 ms/ô); Tung xu `coinStart {flip:true}` = mở ván + tung trong 1 yêu cầu; Dò mìn bấm thẳng vào ô = `minesStart {cell}` mở ván + lật trong 1 yêu cầu.
- "Tự rút ở ×X" (`auto` trong hiloStart/minesStart/coinStart/crashStart; 0 = tắt; thiếu = mặc định G_AUTO_DEF): máy chủ tự chốt ngay trong yêu cầu làm hệ số đạt X → bớt một lần bấm + một lượt gọi máy chủ. Tên lửa: đã chạm X mà chưa nổ thì trả đúng ×X (cả khi lệnh tới muộn, khi thăm dò getActiveGame, hoặc khi mở ván mới).
- Phím Space/Enter = thao tác chính của trò đang mở (chơi ván kế, đoán phía có lợi, lật ô ngẫu nhiên, phóng/rút). Vẫn không có nút tự lặp cược; nhắc nghỉ sau 20 ván giữ nguyên.
- Diễn hoạt ngắn lại: xèng dừng so le 60 ms, hãm 200 ms, bỏ chờ tối thiểu; vòng quay 0,8 s (Nhanh 0,3 s); plinko 0,7 s (Nhanh 0,25 s); keno 18 ms/bóng; lật bài 110 ms; ô mìn 150 ms; xu 100 ms. Tên lửa thăm dò 1 s (cũ 2 s).
- Hàng đợi client cho action trò chơi: cách nhau ≥ 50 ms (cũ 150); gặp rate_limited thì thử lại sau 0,5 s.
- Ván cũ đang dở vẫn chơi tiếp: state không có `a`/`p`/`r` → không tự rút, xu 50%, tên lửa tốc độ 0,1.
- Đổi ?v= → 20261027e (index.html, hoc-sinh.html, student.js) để trình duyệt / service worker tải bản mới. Cần dán Games.gs mới vào Apps Script và Deploy lại.

---
# (Lịch sử) bản 20261027d
Mọi action ghi cần `requestId` (8–64 ký tự [\w-]); gửi lại cùng requestId → `replay:true`, không tính điểm lần hai.
Phản hồi chung: `ok, game, bet, payout, net, balance`.

## 5 trò mới
| Trò | Action + tham số | Trường phản hồi thêm |
|---|---|---|
| Xúc xắc | `diceRoll {bet,target 2–98,dir 'under'\|'over'}` (tỉ lệ thắng 5–95%) | `roll(1–100),target,dir,chance,mult,win` |
| Plinko | `plinkoDrop {bet,risk 'low'\|'mid'\|'high'}` | `path[10] (0/1),slot 0–10,mult,risk,table[11]` |
| Thẻ cào | `scratchBuy {bet}` | `cells[9] (tên biểu tượng),win{symbol,count}\|null,mult` |
| Keno mini | `kenoPlay {bet,picks[1–5 số khác nhau 1–20]}` | `picks,draw[8],hits,mult,table` |
| Tung xu | `coinStart {bet}`, `coinFlip {}`, `coinCashout {}` | start/flip thắng: `active:true,steps,mult,payoutNow,nextMult`; flip: `side 'heads'\|'tails',result 'win'\|'lose'`; kết thúc: `active:false,result 'lose'\|'cashout',steps,mult,auto` |
Hệ số: dice = floor(90/chance, 2 số lẻ); coin sau k lần thắng = min(100, 0.9/0.5^k) (người chơi luôn chọn Ngửa); bảng plinko/keno/thẻ cào nằm đầu Games.gs (G_PLINKO, G_KENO, G_SCR_*).
Bật/tắt: `game_dice|plinko|scratch|keno|coin_enabled` (qua gCheckBet_, cấu hình đã có). Hạn mức lỗ ngày/cược tối đa dùng gCheckBet_ như cũ.

## RTP đo được (node, 1.000.000 ván/mục, Math.random thật, hàm thật trong Games.gs)
slots 90,44% · wheel 89,70% · plinko thấp 90,49% / vừa 89,91% / cao 89,83% · thẻ cào 89,97% (trúng 31,6%)
keno chọn 1..5 số: 89,96 / 89,78 / 89,63 / 89,46 / 89,47% · dice: ngưỡng 50% 90,0%; 10% 90,0%; 5% và 95% ≈ 89,3% (làm tròn xuống)
coin: rút sau 1/2/3/5 lần thắng: 89,85 / 90,03 / 89,87 / 90,22%. Script: sim.js, func.js (kiểm thử chức năng 23 ca, gồm idempotent, hạn mức lỗ, tắt trò, ván coin dở).
Không "suýt thắng" giả: 9 ô thẻ cào, 10 hàng plinko, 8 số keno đều là rút độc lập/hoán vị thật, không sắp lại.

## Giảm độ trễ
Client: action trò chơi bỏ cổng 1,1 giây → xếp hàng cùng action + cách ≥150ms (getLeaderboard/getProfile giữ 1,1 giây). Cược trừ trên màn hình ngay; cuộn/quay bắt đầu tức thì; chờ tối thiểu 250ms (xèng)/150ms (vòng); xèng dừng so le 120ms/cuộn, hãm 300ms; vòng quay ≤1,5s sau khi có kết quả; Cao–Thấp lật 150ms, bỏ wait(250). Làm nóng: getActiveGame khi vào tab Trò chơi + mỗi 4 phút chỉ khi tab mở và trang hiển thị; dọn khi rời tab.
Server: bỏ ghi GameState cho ván một phát (phản hồi nằm trong cache 6 giờ và được đọc lại để kiểm; cache hỏng → ghi sheet như cũ); nhớ số dòng GameState trong cache (kiểm lại mã ở dòng đó, sai → tìm lại); lỗ-trong-ngày cache 30 phút theo (mã, ngày), cập nhật trong gLog_, mất cache thì quét lại GameLog (chỉ ghi cache khi đang giữ khoá). Còn lại mỗi ván ≈ 6 thao tác sheet (đọc Students ×2, ghi Students, ghi Ledger, ghi GameLog + đọc GameState).
Giới hạn có thể còn: Code.gs hiện tải (VERSION 8) vẫn rate limit 1 giây theo action cho mọi action trò chơi (route → requireStudent_(code, action)). Cần Code.gs VERSION 9 (API_SPEC §6: không rate limit game) thì mới hết trễ; nếu chưa, client tự thử lại sau 1,3 giây khi gặp rate_limited.

## Thay đổi hợp đồng
G_LIST thêm 5 trò; `getActiveGame` trả thêm ván `coin`; `getGameStats` tính 10 trò. Không đổi sheet GameState/GameLog (ván cũ chơi tiếp được). Không sửa Code.gs, không đổi ?v=.
Client: `window.SMGameKit` (games.js) cho games2.js; `SMGame.fast`; nút `#btn-fast` trong hoc-sinh.html; hoc-sinh.html được thêm thẻ games2.css/games2.js (bản tải lên chưa có; sw.js không được tải lên nên chưa kiểm).

## Chế độ Nhanh
Nút "⚡ Nhanh" trong thanh game (lưu localStorage `sm_fast`='1'/'0'); tắt bằng bấm lại hoặc xoá khoá. Bật: diễn hoạt ngắn còn ~25%, chờ ~30%. prefers-reduced-motion vẫn được tôn trọng.
