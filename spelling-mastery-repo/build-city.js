// Tạo City.gs (tệp dán vào Apps Script) = city-core.js (luật chung) + city-server.js (phần máy chủ).
// Chạy lại mỗi khi sửa một trong hai tệp:  node build-city.js
'use strict';
const fs = require('fs'), path = require('path');
const dir = __dirname;
function build() {
  const core = fs.readFileSync(path.join(dir, 'city-core.js'), 'utf8').replace(/\nif \(typeof module[^\n]*\n?$/, '\n');
  const srv = fs.readFileSync(path.join(dir, 'city-server.js'), 'utf8');
  return '/* =====================================================================\n' +
    ' * City.gs – máy chủ game "Nông trại & Thành phố" (Nhà Thầy Hưng / Spelling Mastery)\n' +
    ' * TỆP TỰ SINH bằng `node build-city.js` từ city-core.js + city-server.js – đừng sửa trực tiếp.\n' +
    ' * Cài: dán nguyên tệp này vào Apps Script (cùng dự án với Code.gs), rồi Deploy → New version.\n' +
    ' * ===================================================================== */\n' + core + '\n' + srv;
}
if (require.main === module) { fs.writeFileSync(path.join(dir, 'City.gs'), build()); console.log('Đã tạo City.gs'); }
module.exports = build;
