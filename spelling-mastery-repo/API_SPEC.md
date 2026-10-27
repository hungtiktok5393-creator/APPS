# API_SPEC – thay đổi hợp đồng (Code.gs VERSION 10)

## 0. (v10) Giao bài riêng theo mã học sinh
- `ASSIGN_HEADERS` thêm cột 14 **codes**: mã học sinh được giao, cách nhau dấu phẩy. Ô trống = giao cho mọi mã.
- `saveAssignment` / `saveTest` nhận `assignment.codes` (mảng mã). Mã được chuẩn hoá như lúc học sinh nhập.
- `listOpenAssignments {code}` chỉ trả bài giao chung + bài có mã này; mỗi item thêm `personal` (giao riêng) và `max`; không trả danh sách mã.
- `checkCode {code, refId?}`: có `refId` mà bài không giao cho mã → `not_assigned`. `submit`, `submitTest`, `submitResult` cũng trả `not_assigned`.
- `assignments` / `testAssignments` (giáo viên) trả thêm `codes`.
- Trang học sinh: tab **Bài được giao** (`#bai-giao`, mặc định) → mở `index.html#/assign|taketest?id=…&s=…&hs=1`; mã dùng chung qua localStorage `sm_studentCode`.

Tất cả action: POST JSON `{action, code?, ...}` tới URL `/exec`. Lỗi: `{ok:false,error,message}`. Số dư/điểm chỉ tin server.

## 1. Sheet Assignments – 2 cột mới (cột 12, 13)
`ASSIGN_HEADERS` = id,name,due,max,req,createdAt,wordsJson,ttsJson,shuffle,kind,link,**correctPts**,**peekPenalty**.
- Ô trống = dùng mặc định chung (Config `vocabCorrectPoints` / `vocabPeekPenalty`). Giá trị: số nguyên 0–1000 (`ptsOrNull_`).
- `sheet_()` migration: sheet cũ thiếu cột → chỉ ghi thêm tiêu đề thiếu (không đụng dữ liệu). Cache bài đổi khoá `a2:`/`aw2:`.
- `saveAssignment` nhận `assignment.correctPts/peekPenalty` (thiếu/không phải số → ô trống). `saveTest` không đổi.

## 2. Điểm bài từ vựng
`submitResult {kind:'vocab', refId, correct, peeks, submissionId}`: pts = correct×(a.correctPts ?? cfg) − peeks×(a.peekPenalty ?? cfg),
a = dòng Assignments theo refId (bắt buộc phải có, quá hạn + GRACE_MS → `expired`). Client KHÔNG gửi điểm. Vẫn kẹp `maxSubmitPoints`, chống trùng submissionId, withLock_.
Chỉ cộng khi đã có bản nộp (`submit` / `submitTest`) cùng submissionId, đúng refId và đúng mã học sinh; chưa có → `not_ready` (client giữ trong hàng đợi, gửi lại sau), hết lượt → `max_attempts`. `correct` ≤ số từ không bỏ qua trong bản nộp (và ≤ số từ của bài), `peeks` ≥ số lần xem lại trong bản nộp; điểm test ≤ điểm bài test đã nộp. Client gửi bản nộp TRƯỚC rồi mới gửi submitResult.

## 3. getAssignment (GET, công khai)
`assignment` thêm `correctPts`, `peekPenalty` (số hoặc `null`). Link inline `#/assign?d=` có thêm khoá nén `cp`,`pp` (chỉ hiển thị).

## 4. listOpenAssignments (POST, học sinh)
Vào `{code}` → `{ok, items:[{id,name,kind:'vocab'|'test',due,count,correctPts,peekPenalty}], serverTime}`.
Chỉ bài `due > now` còn dữ liệu; sắp hạn gần nhất trước; tối đa 100; cache 30 giây (`ola`, xoá khi lưu/xoá bài). Không trả link/kết quả/từ.
`count` = số từ (bài lưu trong ô) hoặc 0 (bài lớn / test). Không rate limit.

## 5. Ledger & cấu hình
- `LEDGER_REASONS` thêm `'garden'` (không làm tăng `totalEarned`; chỉ `vocab`/`test` tăng).
- `CONFIG_DEFAULTS` thêm: game_dice_enabled, game_plinko_enabled, game_scratch_enabled, game_keno_enabled, game_coin_enabled (true), gardenEnabled (true), gardenCostPct (100; 10–500).

## 6. route()
- Action trong `GAME_ACTIONS`: `requireStudent_(code)` KHÔNG rate limit 1 giây (an toàn nhờ requestId + `withLock_`), kiểm `gamesEnabled`.
- Sau `registerGameActions_` gọi `registerGardenActions_(GARDEN_ACTIONS)` nếu hàm tồn tại (Garden.gs). Chữ ký: `reg.<action> = function (params, student) {...}`.
  route: `requireStudent_(code)` → `cfgBool_('gardenEnabled',true)` (tắt → `garden_disabled` "Khu vườn đang tắt.") → `okWrap_(fn(params, student))`.
- Vẫn có rate limit: checkCode, submitResult, getProfile, getLeaderboard.

## 7. Helper dùng chung trong Code.gs
- `applyDelta_(code,delta,reason,refId,detail)` – đổi số dư trong khoá; trả `{balance,delta(thực),requested,clamped,totalEarned}`; số dư không <0.
- `getStudent_(code)` – dòng Students `{row,code,balance,totalEarned,active,...}` hoặc null.
- `requireStudent_(code, rlAction?)` – chuẩn hoá mã, kiểm tồn tại/active, ném `apiError_`; có rlAction thì rate limit.
- `withLock_(fn)` – chạy trong khoá script (không lồng khoá).
- `apiError_(code,msg)` – tạo lỗi để route() trả `{ok:false,error:code,message}`.
- `cfgNum_(key,def)` / `cfgBool_(key,def)` – đọc cấu hình (cache 60 giây) dạng số / đúng-sai.
- `findRow_(sh,col,id)` – số dòng (≥2) có cột `col` (1-based) = id; 0 nếu không có. Chỉ đọc 1 cột.
- `appendRows_(sh,rows)` – thêm nhiều dòng một lần (tự mở rộng lưới).
- `sheetT_(name,headers,textCols)` – lấy/tạo sheet, các cột mã định dạng văn bản.
- `clampInt_(v,min,max,def)` – ép số nguyên trong khoảng.
- `cput_(key,obj,sec)` / `cget_(key)` – CacheService JSON (<32.000 ký tự).
- `okWrap_(r)` – bọc kết quả thành `{ok:true,...}`.

## 8. Trò mới (bật/tắt bằng `game_<tên>_enabled`; Games.gs đăng ký qua registerGameActions_)
| Trò | Tên | Action |
|---|---|---|
| Xúc xắc | dice | `diceRoll` |
| Plinko | plinko | `plinkoDrop` |
| Thẻ cào | scratch | `scratchBuy` |
| Keno mini | keno | `kenoPlay` |
| Tung xu | coin | `coinStart`, `coinFlip`, `coinCashout` |

## 9. Trang học sinh (client)
Tab: ho-so | kiem-diem | khu-vuon | tro-choi | xep-hang. Khu vườn: `SMGarden.mount(root, {api,getBalance,setBalance,toast,sfx,requestId,code})` / `SMGarden.unmount()`.
`SMGame.addGame(key,icon,name)` để games2.js thêm tab trò. Mã học sinh dùng chung với trang làm bài qua localStorage `sm_studentCode`.
