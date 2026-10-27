# GARDEN_UI_NOTES – API engine Khu vườn (garden.js v1.0.0, garden.css)
Đồ họa: đẳng cự 2:1 (ô 64×32, mảnh 8×8), vẽ canvas. `window.SMGarden` do `student.js` gọi: `mount(root, ctx)` / `unmount()`.
ctx = {api, getBalance, setBalance, toast, sfx, requestId, code}. Engine KHÔNG tự mua gì ngoài thao tác người chơi bấm.
## API (đều gọi được trước/sau mount, trừ khi ghi chú)
- `mount(root, ctx)`, `unmount()` – dọn hết rAF/timer/listener/observer; gửi nốt hàng đợi khi rời tab.
- `act(ops|op, {immediate?, silent?})` → Promise (giải quyết bằng phản hồi gardenAct của lô chứa op; reject có `.code`, `.message` tiếng Việt). Op đúng GARDEN_SPEC: `act({op:'upgrade',what:'bld',id:'gieng'})`, `act([{op:'claimQuest',id:'q0'}],{immediate:true})`. Op sai ở client bị từ chối ngay (toast, trừ `silent`). Op không có hiệu ứng lạc quan (upgrade, claim…) chờ server rồi state được thay.
- `setTool(tool, arg)`: tool ∈ select|plant|harvest|till|place|move|remove. `setTool('plant', idCây)` chọn hạt; `setTool('place', itemId)` đặt trang trí (id kể cả "hoa1~2") HOẶC công trình (id có trong buildings) – có bóng xanh/đỏ + thanh "✔ Đặt/✖"; trên chuột bấm là đặt luôn. Không có tool 'water' (SPEC không có).
- `getTool()` → {tool,arg}; `getState()` bản sao state view (đã gồm thao tác chờ); `getDerived()` (nguyên văn server); `getCatalog()` (gardenInfo thô); `level()` → {lv,into,need,frac}; `getStatus()` ∈ idle|saved|sync|offline|error; `serverNow()` ms theo giờ server.
- `refresh()` (gửi nốt hàng đợi rồi gardenGet), `flush()`, `fmt(n)` (K M B T aa ab… vô hạn), `fmtTime(ms)`, `cropInfo(k)`, `buildingInfo(id)`, `decoInfo(id)` → {id,name,emoji,theme,price,aes,tier}.
- `registerPanel(name, factory)`: name ∈ shop|upgrades|quests|prestige|stats|settings. `factory(bodyEl, SMGarden, data)` trả `{update(SMGarden)?, destroy()?}`; `update` được gọi mỗi khi state đổi. `openPanel(name,data)`, `closePanel()`. Panel hiện trong `.gd-sheet` (bottom sheet). `settings` có bản dựng sẵn (chất lượng đồ họa).
- `scene`: `camera` {x,y,zoom}, `goTo(x,y,zoom?)`, `center()`, `zoomBy(f)`, `pick(px,py)`→[x,y], `toScreen(x,y)`→[px,py] tâm ô, `flash(x,y,text,color)`, `burst(x,y,color)`, `select(x,y)`, `invalidate()`, `quality`, `setQuality('auto'|'low'|'mid'|'high')`.
- `on(evt, fn)` / `off(evt, fn)`; `constants` (PERF bên dưới).
## Sự kiện
| evt | dữ liệu |
|---|---|
| ready | {state, derived} (sau lần tải đầu) |
| state | {state, derived} mỗi khi view đổi (kể cả lạc quan) |
| select | {x,y,item,cell} item: null hoặc {type:'plant',crop,k,readyAt,ripe} / {type:'deco',id,info} / {type:'building',id,b,info}; cell {owned,soil} |
| openpanel | {panel, data} – bấm menu hoặc "Nâng cấp" ở thẻ công trình ({panel:'upgrades', data:{id}}) |
| expand | {cx,cy,cost} – bấm mảnh khóa kề vườn (cost = điểm đã nhân gardenCostPct). Để UI tự gọi `act({op:'buyPlot',cx,cy})` |
| tool | {tool,arg} · sync {status} · result (nguyên phản hồi gardenAct ok) · rejected {code,message,opIndex} · achievement [..] · quality {quality} · refresh · unmount |
## Cấu trúc state/derived
`getState()` = state server (GARDEN_SPEC: xu, es, xp, ch[], f{"x,y":0|[k,readyAtMs]}, b{id:{x,y,l,ct}}, d{"x,y":id}, iv, up, q, dl, ac, ds, lg, s…). `derived` giữ nguyên server; engine đọc tùy chọn: `lv|level, xpInto|xpIn, xpNeed, costPct (100 hoặc 1.0 đều hiểu), seedMul, boostMul`.
## Hợp đồng đồng bộ
Gộp op liền kề cùng loại (plant/harvest/till) thành `cells` ≤64; ≤40 op, ≤400 ô/lô; gửi sau 400ms yên lặng, hoặc `immediate`, hoặc khi ẩn trang/rời tab. Một lô bay tại một thời điểm; lỗi mạng/`busy` → thử lại CÙNG requestId (2s, 4s, 8s, 15s); mã `garden_*` → hoàn tác cả lô, thay state bằng bản gốc server, toast `message`. Thao tác chờ được áp lại lên state mới.
## Giả định phải kiểm với server thật (SPEC không nêu cấu trúc)
`gardenInfo.crops` là mảng hoặc object, mỗi cây có tên/emoji/giáHạt/thờiGianLớn/cấp (tên trường đoán: id,name,emoji,g,seed,lvl; mảng: [id,tên,emoji,g,giáHạt,y,cấp]); `buildings` có thể kèm w,h (mặc định 1×1). Nếu khác, sửa `normCrop`/`normBld` (garden.js đầu file, ~10 dòng).
## Lớp & biến CSS (garden.css)
`.gd-root`(biến `--gd-tap:44px, --gd-tb` chiều cao thanh công cụ, `--gd-glass, --gd-r`) · `.gd-stage .gd-canvas` · `.gd-top .gd-pills .gd-pill .gd-sync[data-s] .gd-lv .gd-bar` · `.gd-zoom` · `.gd-toolbar .gd-row .gd-btn(.on/.ok/.no/.ready)` · `.gd-card` · `.gd-confirm` · `.gd-pop .gd-seedpop .gd-menu .gd-mi` · `.gd-sheet .gd-sh .gd-sb` · `.gd-ov` · `.gd-sr`. Màu lấy từ --primary --surface --bg --border --muted --success --danger --text --primary-text.
## Hằng số hiệu năng (`SMGarden.constants`)
dprMax 2 · zoom 0.4–2.6 · chunkCache 48 mảnh · spriteCache 400 · chunkBuildPerFrame 3 · lowFps 24 (tự hạ chất lượng khi FPS TB < ~24 liên tục 45 khung) · debounceMs 400 · retryMs [2,4,8,15 s]. Chất lượng: Thấp (nền 1×, không sinh vật/thời tiết/bóng/đung đưa, chỉ vẽ khi cần), Vừa (nền 1,5×, 20fps nền, 6 sinh vật), Cao (2×, 30fps, 14 sinh vật). `prefers-reduced-motion`: không quán tính, không hoạt ảnh nền (vẽ lại 0,5 giây/lần để đồng hồ cây chạy).
## Lưu ý tích hợp
- `student.js` (bản đã upload) CHƯA có tab Khu vườn, `#garden-root` hay lời gọi `SMGarden.mount`; cần thêm ở chat tích hợp. Cũng nên thêm `garden` vào regex `GAME_ACT` để gardenAct không bị chờ 1,1 giây/lần.
- Chưa lưu hàng đợi chưa gửi khi tải lại trang (mất mạng rồi đóng hẳn trang thì thao tác chưa gửi mất).
