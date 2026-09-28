// Membuat playlist/daftar.js dari semua pasangan  nama.mp3 + nama_chart.json  di folder playlist/
// Jalankan dari folder gameland:   node buat-daftar.js
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'playlist');
const NOTES = ['6low','1','2','3','4','5','6','7'];
const list = {};
let skip = 0;

for (const f of fs.readdirSync(dir)) {
  if (!/\.mp3$/i.test(f)) continue;
  const name = f.replace(/\.mp3$/i, '');
  const cj = path.join(dir, name + '_chart.json');
  if (!fs.existsSync(cj)) { console.log('Lewati (tidak ada ' + name + '_chart.json): ' + f); skip++; continue; }
  try {
    const d = JSON.parse(fs.readFileSync(cj, 'utf8'));
    const notes = (Array.isArray(d) ? d : d.notes || [])
      .filter(k => k && typeof k.time === 'number' && NOTES.includes(String(k.note)))
      .map(k => ({ time: k.time, note: String(k.note) }))
      .sort((a, b) => a.time - b.time);
    if (!notes.length) { console.log('Lewati (chart kosong): ' + name); skip++; continue; }
    list[name] = { file: f, notes };
    console.log('OK  ' + name + '  (' + notes.length + ' ketukan)');
  } catch (e) { console.log('Lewati (JSON rusak): ' + name); skip++; }
}

fs.writeFileSync(path.join(dir, 'daftar.js'), 'window.PLAYLIST = ' + JSON.stringify(list) + ';\n');
console.log('\nSelesai: ' + Object.keys(list).length + ' lagu masuk daftar.js' + (skip ? ', ' + skip + ' dilewati.' : '.'));
