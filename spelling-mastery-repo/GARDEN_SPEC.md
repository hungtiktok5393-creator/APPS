# GARDEN_SPEC – Khu vườn (Garden.gs, catVer 1, state ver 1)
Tất cả action: POST `{action, code, ...}`. Route kiểm mã + `gardenEnabled` (tắt → `garden_disabled` "Khu vườn đang tắt."). Điểm CHỈ để chi; Xu 🪙 / Tinh hoa 🌸 không đổi được thành điểm.
## 3 action chính (+1 phụ)
| Action | Tham số | Phản hồi |
|---|---|---|
| gardenInfo | `{catVer?}` | `{catVer, crops, buildings, perms, themes, decos[[id,tên,emoji,chủđề,giáGốc,thẩmMỹ]], tiers, ach, consts, formulas}`; nếu catVer khớp → `{catVer, same:true}` |
| gardenGet | `{}` | `{state, derived, serverTime, v, balance, catVer}` (tạo vườn mới nếu chưa có) |
| gardenAct | `{ops[≤40], requestId, baseV?}` | OK: `{ok, state, derived, results[], achievements, levelUps, spent, balance, v, serverTime, stale}`. Lỗi: `{ok:false, error, message, opIndex, op, applied:false, state(gốc), derived, balance, v}` |
| gardenBoard | `{}` | `{board[top20:{rank,who(đã che),lv,aes,sn,me}], me, total}` xếp theo Điểm thẩm mỹ rồi cấp |
**Nguyên tử TOÀN LÔ**: một op sai → không áp dụng gì (cả Xu lẫn điểm), trả state gốc để client đồng bộ. `requestId` `[\w-]{8,64}`: gửi lại cùng id → `{replay:true}` kết quả cũ, không trừ lần hai (cache `gdq:` 6h + `lastReqId/lastResp` trong sheet). `baseV` chỉ để báo `stale:true`, op vẫn được kiểm trên dữ liệu server. Ledger: 1 dòng `garden` mỗi lô có chi điểm, detail = "buyPlot 1,0; build gieng…".
## Op (mỗi phần tử `{op:'...', ...}`; ô = toạ độ nguyên toàn cục x,y; `cells:[[x,y],…≤64]` thay cho x,y; ≤400 ô/lô)
| op | trường | chi phí / điều kiện |
|---|---|---|
| plant | k (id cây), x,y hoặc cells | Xu = round(giáHạt×hệsốHạt); ô phải là đất canh tác trống; đủ cấp/công trình/mùa |
| harvest | x,y hoặc cells | ô phải chín (`readyAt` ≤ giờ server) |
| harvestAll | – | thu mọi ô đã chín (0 ô vẫn ok) |
| till | x,y/cells | cuốc ô thành đất: round(15×1.05^số ô đất) Xu |
| buyPlot | cx,cy (toạ độ mảnh 8×8, liền kề) | ĐIỂM round(40×1.3^(n-1)), n = số mảnh đang có |
| build | id, x,y | ĐIỂM giá công trình (bảng), cần cấp vườn; mỗi loại 1 cái |
| upgrade | what:'bld'\|'perm', id | bld: Xu round(ux×1.32^L); perm: ĐIỂM round(base×rate^L); cấp không trần |
| decorate | act:'place' (id,x,y) / 'move' (x,y,nx,ny) / 'remove' (x,y) | place: lấy từ kho (miễn phí) hoặc mua bằng ĐIỂM; remove → kho, không hoàn |
| collect | id hoặc all:true | sản vật = Xu tích luỹ, tối đa 24 giờ |
| boost | x,y | ĐIỂM max(1, ceil(giâyCòn/300 × hệsốThợ)); cây chín ngay |
| claimQuest | id 'q0'..'q2' | đủ tiến độ, nhận 1 lần/ngày |
| claimDaily | – | 1 lần/ngày (giờ VN); Xu, + Tinh hoa mỗi chuỗi 7 ngày; KHÔNG điểm |
| prestige | confirm:true | cấp vườn ≥10 và Tinh hoa nhận ≥1 |
Giá điểm thực = ceil(giá gốc × gardenCostPct/100). Trần chi ngày: Config `gardenDailySpendCap` (0 = không giới hạn; giáo viên sửa trực tiếp trên Sheet). `derived.costPct` cho client biết hệ số.
## State (JSON gọn, sheet `Garden`: code,state,v,updatedAt,lastReqId,lastResp,+lvl,aes,sn,state2-4)
`ver, sn` (Mùa−1), `xu, es` (Tinh hoa), `xp`, `ch` ["cx,cy"…], `f` {"x,y": 0 (đất trống) | [idCây, readyAt ms]}, `b` {idCT:{x,y,l,ct}}, `d` {"x,y": idTrangTrí}, `iv` {id: số lượng trong kho}, `up` {idNângCấp: cấp}, `q` {d,l,p,c} nhiệm vụ ngày, `dl` {d,s} quà ngày/chuỗi, `ac` thành tựu, `ds` {d,s} chi điểm trong ngày, `lg` nhật ký (50), `s` thống kê trọn đời, `xs` Xu kiếm trong mùa, `cr`. >40.000 ký tự → gzip+base64 "Z:…" chia ≤4 ô (45.000/ô). Trần: 1.500 ô đất, 1.500 trang trí, 400 mảnh, 3.000 vật trong kho → không bao giờ tràn ô.
## Công thức chính
- Cấp vườn: cần(l)=round(60×1.2^(l-1)) XP; lên cấp thưởng 30×l Xu. Cây: g giây (60s…4h), 25 loại; 8 cây cần cấp, 5 cần mùa khí hậu (đổi mỗi 7 ngày; Nhà kính bỏ qua), 6 cần Giếng/Nhà kính, 3 cần Mùa mới≥1/2.
- Thời gian lớn = g×(1−0.35·G/(G+15))×(1−0.5·L/(L+25)) (G cấp Giếng, L cấp "Phân bón"); tối thiểu 5 giây.
- Sản lượng = y×(1+1.5·Ly/(Ly+30))×(1+0.4·N/(N+15))×(1+thưởngThẩmMỹ)×(1+0.03×Tinh hoa). Thưởng thẩm mỹ = (0.10+0.20·La/(La+30))×A/(A+400).
- Sản vật/giờ = r×(1+0.7×(L−1))×hệsố; công trình: gieng 30, chuongga 50, kho 60, nhakinh 120, tongong 90, chuongbo 150, coixay 220, aoca 350, lobanh 600 điểm.
- Trang trí: 156 mục cơ bản (12 chủ đề×13); bậc t: id `"hoa1~t"`, giá×2.6^t, thẩm mỹ×2.2^t, tên + vật liệu (+ tính từ khi t>10); mở đến bậc = (Mùa−1) + floor(cấp/20), tối đa 60.
- Prestige "Sang mùa mới": Tinh hoa = floor(√(Xu kiếm trong mùa/1500)); hệ số = 1+0.03×Tinh hoa. Reset đất/công trình/Xu (Xu khởi đầu 60+40×mùa); GIỮ: nâng cấp vĩnh viễn, XP, thống kê, thành tựu, và 8+4×mùa trang trí có thẩm mỹ cao nhất (vào kho, phải đặt lại); phần còn lại mất.
- Nhiệm vụ/ngày: 3 nhiệm vụ sinh theo (ngày, cấp/5) bằng PRNG có seed, thưởng Xu/XP tăng 1.09^cấp. Thành tựu: bậc k cần round(base×mul^k), thưởng 100×1.8^k Xu, mỗi 5 bậc +1 Tinh hoa.
## Mã lỗi (apiCode → ý nghĩa; message tiếng Việt kèm "Thao tác #n (op): …")
garden_disabled · garden_bad_request (tham số/toạ độ/requestId sai, JSON quá sâu) · garden_too_many_ops (>40) · garden_too_many_cells · garden_unknown_op · garden_bad_cell (ô chưa mở/không hợp lệ) · garden_cell_busy · garden_no_crop · garden_not_ready · garden_locked (thiếu cấp/công trình/mùa/bậc) · garden_not_enough_xu · garden_not_enough_points · garden_daily_cap · garden_already · garden_nothing · garden_not_done · garden_limit · garden_full (state quá lớn) · garden_corrupt · busy (từ withLock_).
## Client cache danh mục
Lưu `gardenInfo` vào localStorage kèm `catVer`; mỗi lần mở vườn gọi `gardenGet` (có `catVer` trong phản hồi); nếu khác bản đã lưu → gọi `gardenInfo` rồi thay cache; có thể gọi `gardenInfo {catVer}` và nhận `same:true`. Thêm cây/công trình/chủ đề mới chỉ được THÊM VÀO CUỐI mảng (chỉ số cây lưu trong state), tăng `GD_CATVER`, và thêm bước nâng cấp trong `gdMigrate_` theo `st.ver`.
## Con số quan trọng
Trần số 9e15 · ≤40 op/lô · ≤30.000 ký tự ops · sản vật ≤24h · nhật ký 50 mục · mảnh 8×8 · vườn khởi đầu: 1 mảnh, 6 ô đất, 60 Xu.
