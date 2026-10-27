# API_SPEC_GAMES (Games.gs, cần Code.gs v8)
> **Bản 20261027e:** tỷ lệ thắng mỗi ván ≈ 45%, RTP ≈ 90% — bảng hệ số/xác suất hiện hành nằm ở đầu Games.gs và NOTES_GAMES.md (các bảng slots/wheel/hilo/mines/crash bên dưới là bản cũ, giữ để tham khảo công thức).
> Tham số mới: `auto` (Tự rút ở ×X, 0 = tắt) cho hiloStart/minesStart/coinStart/crashStart; `minesStart {cell}` mở ván + lật ô; `coinStart {flip:true}` mở ván + tung; `diceRoll {dir}` tỷ lệ 45% cố định; keno 1–22, trả thêm `pool, drawCount`; plinko `path[16]`, `slot 0–16`. Phản hồi ván nhiều bước có `auto`; crash có `rate` theo ván (0,2) và có thể kết thúc `result:"cashout", auto:true`.
POST JSON, mọi action kèm `code`. Ngẫu nhiên do server sinh. Rate limit 1 yêu cầu/giây/(mã, action) → chờ ≥1s giữa 2 lần gọi cùng loại.
**Action ghi** cần `requestId` (`[\w-]{8,64}`, sinh mới cho MỖI thao tác). Gửi lại cùng `requestId` (mạng chập chờn) → nhận đúng phản hồi cũ + `replay:true`, không trừ/cộng lần 2.
Chung: mọi phản hồi có `balance`; kết thúc ván có `bet, payout, net`. Một học sinh chỉ có 1 ván đang mở (kể cả slots/wheel). Tắt trò `game_<tên>_enabled=false` chỉ chặn ván MỚI (đang chơi vẫn rút được). `dailyLossLimit ≤ 0` = không giới hạn.

## Action
| action | tham số | phản hồi (ngoài `ok, balance`) |
|---|---|---|
| slotsSpin | bet | `reels:[3 key], mult, payout, net` |
| wheelSpin | bet | `index (0–39), mult, segments[40], payout, net` |
| hiloStart | bet | view: `card{rank 1–13,suit 0–3}, steps:0, mult:null, next{higher,lower}` |
| hiloGuess | guess `higher\|lower` | thắng: `result:"win"`+view · thua: `active:false,result:"lose",prev,card` |
| hiloCashout | — | `active:false,result:"cashout",mult,payout` (cần ≥1 lần đúng) |
| minesStart | bet, mines (1–10) | view: `mines, revealed:[], steps, mult, nextMult` |
| minesReveal | cell (0–24, hàng trước cột sau) | an toàn: `result:"safe"`+view · mìn: `result:"lose",hit,mines[]` · lật hết/đạt trần: tự rút |
| minesCashout | — | `result:"cashout",mines[],mult,payout` (cần ≥1 ô) |
| crashStart | bet | `startedAt, serverNow (ms), rate:0.1, minCash:1.01` (KHÔNG lộ điểm nổ) |
| crashCashout | — | `result:"cashout"\|"crash", crashPoint, mult, payout` |
| getActiveGame | — | `{active:false}` hoặc view ván đang mở; crash đã nổ → tất toán thua, trả `result:"crash",crashPoint` |
| getGameStats | — | `total, games{slots..crash:{plays,wins,bet,payout,net,best}}, today{net,dailyLossLimit,remainingLoss}, maxBetNow` |

Ví dụ:
```json
{"action":"slotsSpin","code":"AB3K7M","bet":20,"requestId":"r-170000001"}
→ {"ok":true,"game":"slots","reels":["cherry","cherry","star"],"mult":1.5,"bet":20,"payout":30,"net":10,"balance":150}
{"action":"minesStart","code":"AB3K7M","bet":20,"mines":3,"requestId":"r-170000002"}
→ {"ok":true,"game":"mines","active":true,"bet":20,"mines":3,"revealed":[],"steps":0,"mult":null,"payoutNow":0,"nextMult":1.0227,"balance":130}
{"action":"minesReveal","code":"AB3K7M","cell":12,"requestId":"r-170000003"}
→ {"ok":true,"result":"safe","cell":12,"revealed":[12],"steps":1,"mult":1.0227,"payoutNow":20,"nextMult":1.1688,...}
{"action":"crashCashout","code":"AB3K7M","requestId":"r-170000004"}
→ {"ok":true,"game":"crash","active":false,"result":"cashout","crashPoint":3.87,"mult":2.31,"bet":20,"payout":46,"net":26,"balance":176}
```
Crash: server trả `mult` tại thời điểm NHẬN yêu cầu (độ trễ mạng tính vào đó); client nên rút sớm hơn một chút, và gọi `getActiveGame` mỗi ~2s để biết tên lửa đã nổ.

## Chốt an toàn (server)
Cược nguyên dương ≤ số dư, ≤ min(`maxBet`, ⌊số dư·`maxBetPct`/100⌋), ≤ hạn mức lỗ còn lại trong ngày (Asia/Ho_Chi_Minh, tính từ GameLog; lỗ ròng không bao giờ vượt `dailyLossLimit`). Điểm đi qua `applyDelta_` reason `game` (ván nhiều bước: trừ cược lúc bắt đầu, cộng payout lúc kết thúc). Sheet: `GameState` (1 dòng/HS: trạng thái ván + phản hồi gần nhất), `GameLog(timestamp,code,game,bet,payout,net,detail)`. `payout = round(bet × mult)` → RTP lệch nhẹ với cược rất nhỏ.

## Xác suất, hệ số, RTP (RTP = Σ xác suất × hệ số)
**Slots** — 3 cuộn độc lập, trọng số /100: 🍒30 🍋25 🔔18 ⭐14 💎9 7️⃣4.
| 3 giống | ×5 🍒 | ×8 🍋 | ×15 🔔 | ×30 ⭐ | ×80 💎 | ×250 7️⃣ |
|---|---|---|---|---|---|---|
| P = p³ | .027 | .015625 | .005832 | .002744 | .000729 | .000064 |
Đúng 2 giống (P=3p²(1−p)) trả ×1.5 cho 🍒 .189 · ⭐ .050568 · 💎 .022113 · 7️⃣ .004608 (🍋🔔 đôi: ×0).
RTP = (.135+.125+.08748+.08232+.05832+.016) + 1.5×.266289 = .50412 + .39943 = **0.9036**. Thắng (net>0) = .051994 + .266289 = **31.8%**.

**Wheel** — 40 ô đều xác suất: ×0 ×21 · ×0.5 ×4 · ×1.5 ×12 · ×3 ×2 · ×10 ×1.
RTP = (4×0.5 + 12×1.5 + 2×3 + 1×10)/40 = 36/40 = **0.90**. Thắng = (12+2+1)/40 = **37.5%**.

**Hilo** — rút lá 1–13 có hoàn lại, đúng = lá kế cao/thấp hơn hẳn (bằng = thua). n = số lá thắng (cao hơn: 13−rank; thấp hơn: rank−1). Hệ số tích luỹ M = 0.90 / Π(nᵢ/13) → bước đầu ×11.7/n, các bước sau ×13/n.
| n | 12 | 9 | 6 | 3 | 1 |
|---|---|---|---|---|---|
| ×bước đầu | 0.975 | 1.30 | 1.95 | 3.90 | 11.7 |
Sống sót P ⇒ M=0.9/P ⇒ E[M·1{sống}] = P·0.9/P = **0.90 với mọi chiến thuật rút (≥1 lần đoán)**. Thắng: chiến thuật "rút khi ≥×2.5" ≤ 0.9/2.5 = **≤36%** (bất đẳng thức Markov; thực tế thấp hơn chút). Trần ×100 tự rút.

**Mines** — 25 ô, m mìn; sống sót sau k ô an toàn P_k = C(25−m,k)/C(25,k); hệ số = 0.90/P_k ⇒ RTP **0.90** với mọi k≥1. Ví dụ m=3:
| k | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| P_k | .880 | .770 | .6696 | .5783 | .4957 | .4213 | .3548 | .2957 |
| ×  | 1.023 | 1.169 | 1.344 | 1.556 | 1.816 | 2.136 | 2.537 | 3.044 |
Ví dụ: lật 7 ô rồi rút → thắng .3548 × 2.537 = 0.90, tỷ lệ thắng **35.5%**. Trần ×100 tự rút.

**Crash** — điểm nổ C = 0.90/(1−U), U~đều[0,1), C<1 → nổ ngay 1.00 (10%), trần 100. P(C>c) = 0.90/c.
Hệ số theo giờ server: **m(t) = floor(100·e^(0.10·t))/100**, t = giây từ `startedAt` (×2 ≈ 6.9s, ×10 ≈ 23s, ×100 ≈ 46s). Rút khi m < C → nhận bet·m; m ≥ C → mất cược.
RTP khi rút ở c = P(C>c)·c = (0.90/c)·c = **0.90** với mọi c. Thắng khi rút ở ×2.5 = 0.9/2.5 = **36%** (×2.25→40%, ×3→30%).

## Mã lỗi (thêm vào danh sách của Code.gs)
`bad_request` (cược/tham số/requestId sai) · `bet_too_high` · `daily_limit` · `game_active` (đang có ván dở) · `no_game` (không có ván cần thao tác) · `games_disabled` · `rate_limited` · `busy` · `invalid_code` · `code_disabled` · `server_error`.
