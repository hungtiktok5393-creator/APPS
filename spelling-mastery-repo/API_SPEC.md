# API_SPEC (Code.gs v8)
POST: body JSON (gửi `text/plain`), có `action`. GET: `?action=...` (chỉ `getPublicConfig`, `getLeaderboard` + các GET cũ). Lỗi: `{ok:false,error,message}`.
Action cũ (`submit, saveAssignment, submitTest, saveTest, deleteAssignment`, GET `ping/getAssignment/getTest/assignments/testAssignments/testResults/results`) giữ nguyên.

## Sheet (tự tạo)
- **Students**: code, createdAt, note, active, balance, totalEarned, lastActive
- **Ledger**: timestamp, code, delta, reason(vocab|test|game|teacher_adjust), refId, balanceAfter, detail
- **Config**: key, value · **Claims**: submissionId, timestamp

## Config (tự thêm nếu thiếu; cache 60s)
vocabCorrectPoints=5, vocabPeekPenalty=1, testDefaultPoints=10, maxSubmitPoints=5000 (trần |điểm| mỗi lần nộp),
gamesEnabled=true, maxBet=200, maxBetPct=25, dailyLossLimit=300, game_{slots,wheel,hilo,mines,crash}_enabled=true.

## Quyết định tự chọn
- Số dư ≥ 0: Ledger.delta = delta thực áp dụng (yêu cầu gốc nằm trong `detail.requested`).
- `totalEarned` chỉ cộng delta dương của vocab/test (không tính game, chỉnh tay) → bảng xếp hạng theo totalEarned, đồng điểm cùng hạng (1,2,2,4); chỉ hiện người có totalEarned>0.
- Mã: 6 ký tự từ `ABCDEFGHJKMNPQRSTUVWXYZ23456789`; `prefix` tối đa 3 ký tự hợp lệ, phần còn lại ngẫu nhiên. `count` ≤ 200.
- Rate limit: 1 yêu cầu/giây cho mỗi (mã, action) → `rate_limited`. Client nên chờ ≥1s giữa 2 lần gọi cùng loại.
- `submitResult` tin số liệu client nhưng bị trần `maxSubmitPoints`. Trùng `submissionId` → `{ok:true,duplicate:true}`, không cộng lại.
- Mã bị xoá mềm (`active=false`) không đăng nhập/nộp/chơi được, vẫn còn Ledger; ẩn khỏi xếp hạng.
- teacherKey: Script Properties `TEACHER_KEY` (ưu tiên), nếu không có thì dùng hằng `TEACHER_KEY` cũ. Action giáo viên mới chỉ qua POST (`teacherKey` trong body).

## Học sinh
| action | tham số | phản hồi |
|---|---|---|
| checkCode | code | `{ok:true,valid:true,code,balance,totalEarned}` |
| submitResult | code, kind `vocab`\|`test`, refId, submissionId (`[\w-]{8,64}`), vocab: correct, peeks · test: correctPoints[] (mỗi phần tử 0–100; thiếu mảng thì `correct`×testDefaultPoints) | `{ok:true,duplicate:false,delta:23,requested:23,balance:140,totalEarned:310}` |
| getProfile | code | `{ok:true,code,balance,totalEarned,rank,totalStudents,ledger:[{t,delta,reason,refId,balanceAfter,detail}×≤50]}` |
| getLeaderboard (GET/POST) | limit(1–50, mặc định 10), code (tuỳ chọn) | `{ok:true,leaderboard:[{rank:1,code:"AB12**",totalEarned:500,me:false}],me:{rank,totalEarned}\|null,totalStudents}` (cache 30s) |
| getPublicConfig (GET/POST) | — | `{ok:true,config:{vocabCorrectPoints:5,...}}` |

Vocab: `correct*vocabCorrectPoints - peeks*vocabPeekPenalty`. Test: tổng `correctPoints`.

## Giáo viên (POST, kèm `teacherKey`)
| action | tham số | phản hồi |
|---|---|---|
| createCodes | count, prefix, note | `{ok:true,codes:["AB3K7M"],created,requested}` |
| deleteCode / restoreCode | code | `{ok:true,code,active:false}` |
| adjustPoints | code, delta(±100000, ≠0), reason | `{ok:true,code,balance,delta,clamped,totalEarned}` |
| listStudents | — | `{ok:true,students:[{code,createdAt,note,active,balance,totalEarned,lastActive}]}` |
| getConfig | — | `{ok:true,config,defaults}` |
| setConfig | key, value | `{ok:true,key,value}` |
| getLedger | code (bỏ trống = tất cả), limit(≤1000, mặc định 200) | `{ok:true,ledger:[...]}` |

## Mã lỗi
bad_request, too_large, unauthorized, invalid_code, code_disabled, rate_limited, busy, games_disabled, expired, max_attempts, not_found, server_error.

## Hàm dùng chung cho Games.gs
`applyDelta_(code,delta,reason,refId,detail)`→`{balance,delta,requested,clamped,totalEarned}` · `getStudent_(code)` · `getConfigValue_(key,def)` (+`cfgNum_`, `cfgBool_`) · `requireTeacher_(key)` · `jsonOut_(obj)` · `requireStudent_(code,rlAction)` · `withLock_(fn)` · `apiError_(code,msg)` (throw) · `ledgerFor_(code,n)`.
Đăng ký game: trong Games.gs viết `function registerGameActions_(reg){ reg.slotsSpin = function(params, student){ ... return {...}; }; }`. Router tự: kiểm mã+rate limit+`gamesEnabled`, rồi gọi `fn(params, student)`; kết quả tự gói `ok:true`. Game tự kiểm `game_<tên>_enabled`, `maxBet`, `maxBetPct`, `dailyLossLimit`.
