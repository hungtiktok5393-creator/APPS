# GARDEN_SPEC – Danh vọng, Kỳ quan, Nền đất (GD_STATE_VER=2, GD_CATVER=2)
Tệp backend: `Garden.gs` (không đổi Code.gs). Mọi chi điểm đi qua `gdSpend_` → tôn trọng `gardenCostPct`, `gardenDailySpendCap`, atomic cả lô, idempotent theo `requestId`.

## Op mới / đổi (trong `gardenAct.ops`)
- `{op:'build', id:'wd_…', x, y}` – xây kỳ quan giai đoạn 1 (x,y = ô TRÊN-TRÁI, chiếm w×h ô). Nếu kỳ quan đang nằm trong kho (`st.wi`, sau Mùa mới) → đặt lại MIỄN PHÍ, giữ giai đoạn.
- `{op:'upgrade', what:'wonder', id}` – lên giai đoạn kế (tối đa 5). Giá giai đoạn s = round(p×1.8^(s-1)).
- `{op:'wonder', act:'place'|'up'|'move'|'store', id, x?, y?}` – dạng gộp; `move` miễn phí, `store` cất vào kho.
- `{op:'ground', id}` – mua nền đất (id `gr_…`), đã mua thì đổi lại miễn phí; `id:'default'` = nền mặc định.
- `upgrade what:'perm'` nay trả `garden_maxed` khi hiệu ứng ≥99% (không trừ điểm). `prestige` result thêm `keptWonders`.

## State mới (st)
- `st.gr` (string) nền đang dùng ('' = mặc định); `st.go` (mảng id) nền đã mua; `st.wi` {id: giai đoạn} kỳ quan trong kho.
- Kỳ quan đã đặt nằm trong `st.b[id] = {x,y,l,ct}` (l = giai đoạn 1..5) – cùng cấu trúc công trình thường; `ctx.bpos` chiếm đủ w×h ô.
- Sheet Garden thêm cột 13 `rep` (Danh vọng, dùng cho bảng xếp hạng). Vườn cũ tự migrate khi đọc (`gdMigrate_`).
- Prestige: kỳ quan, nền đất, Danh vọng (st.s.ps) được GIỮ; công trình thường/đất/trang trí đặt ra vẫn reset như cũ.

## Derived mới (gardenGet/gardenAct → derived)
- `rep {lv, cur, base, next, title}` (next=null khi tối đa 60); `maxTier` nay = Mùa + floor(cấp/20) + rep.lv.
- `wd[12] {id,l,placed,stored,x,y,locked,needRep,aes,next,maxed}` (next = giá điểm đã nhân gardenCostPct, null nếu maxed).
- `gr {cur, owned[], cost{id:giá}}` (cost chỉ nền chưa mua); `wi` kho kỳ quan.
- `perms[id] {l, lmax, maxed, cost|null, eff}`; `spend {today, cap, remaining}` (remaining=null nếu không có trần).

## Catalog (gardenInfo; < 100KB)
- `wonders[] {id,name,e,w,h,rep,d,cost[5],aes[5]}` (cost/aes giá GỐC, chưa nhân costPct); w,h ∈ 2..4.
- `grounds[] {id,name,e,p,c1,c2}` (c1/c2 = màu gợi ý); `perms[]` thêm `lmax`.
- `repCurve {max:60, k:156.25, thresholds[0..60], titles[[lv,tên]], stages:5, stageGrow:1.8, note}`.
- `consts.chunkBase=40, chunkGrow=1.18`; gardenBoard: mỗi dòng thêm `rep`, `rt` (danh hiệu); `me` cũng có.

## Công thức
- Danh vọng l = bậc lớn nhất sao cho tổng điểm đã chi `st.s.ps` ≥ ceil(156.25×l²) (≈0.08×√điểm). 1.000→2, 10.000→8, ~100.000→25.
- Bậc trang trí mở = min(60, Mùa + floor(cấp vườn/20) + Danh vọng). Điểm đang chi trong cùng lô được tính.
- Kỳ quan mở bằng Danh vọng (không bằng XP): rep cần 2,3,4,6,8,10,13,16,20,25,30,38; giá gđ1: 300…60.000.
- Thẩm mỹ kỳ quan = round(1.6 × (tổng giá gốc các giai đoạn đã lên)^0.68), cộng vào `gdAes_`.
- Mảnh đất thứ n+1 = round(40×1.18^(n-1)). Nâng cấp vĩnh viễn: giá round(base×1.2^L), tối đa lmax=25, hiệu ứng = max×[L/(L+k)]/[lmax/(lmax+k)].

## Mã lỗi mới / dùng thêm
`garden_maxed` (nâng cấp/kỳ quan đã tối đa). Dùng lại: `garden_locked` (thiếu Danh vọng), `garden_bad_cell` (ngoài đất), `garden_cell_busy`, `garden_already`, `garden_not_enough_points`, `garden_daily_cap`, `garden_bad_request`, `garden_limit`.

## An toàn trẻ em
Mọi mua bằng điểm đều xác định: KHÔNG ngẫu nhiên/hộp quà, KHÔNG hàng giới hạn thời gian, KHÔNG đếm ngược hay nhắc mua. Giá hiển thị trước, kỳ quan khoá chỉ nêu mức Danh vọng cần. Trần chi ngày do giáo viên đặt (`gardenDailySpendCap`).

## Tên hàm/tệp cho frontend (Garden.gs)
`GD_WONDERS, GD_GROUNDS, GD_REP_TITLES, gdRep_, gdRepThr_, gdWonderCost_, gdWonderAes_, gdBpos_, gdPf_, gdPermMaxed_, gdOpWonder_, gdWonderPlace_, gdWonderUp_, gdOpGround_`.
Vẽ kỳ quan: lấy `st.b[id]` + `wonders[].w/h` từ catalog (như bldFoot), `l` = giai đoạn để đổi hình/viền. Nền đất: tô theo `grounds[].c1/c2` của `st.gr`.
Kiểm thử: `node scenarios.js` (132 kiểm tra), `node sim_economy.js [-v]` (cần harness.js cùng thư mục).
