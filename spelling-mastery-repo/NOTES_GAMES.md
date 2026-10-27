# NOTES_GAMES – 10 trò (5 mới) + giảm độ trễ
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
