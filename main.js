const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// ---- Mode: "permainan" (biasa) atau "editor" (dengan --editor)
const MODE = process.argv.includes('--editor') ? 'editor' : 'permainan';

// ---- Kiosk: aktif di mode permainan, kecuali dijalankan dengan --jendela (untuk uji coba)
const KIOSK = MODE === 'permainan' && !process.argv.includes('--jendela');
let izinKeluar = false;   // jadi true hanya setelah kata sandi benar

// Suara bukan "klik pengguna", jadi tanpa ini Chromium bisa menahan bunyinya
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

ipcMain.handle('app:info', () => ({ mode: MODE }));

// ---- Folder lagu dan pembuat daftar.js
const FOLDER_LAGU = path.join(__dirname, 'playlist');
const NADA_SAH = ['6low', '1', '2', '3', '4', '5', '6', '7'];

// Membuat playlist/daftar.js dari semua pasangan nama.mp3 + nama_chart.json
function buatDaftar() {
  try {
    fs.mkdirSync(FOLDER_LAGU, { recursive: true });
    const daftar = {};
    for (const f of fs.readdirSync(FOLDER_LAGU)) {
      if (!/\.mp3$/i.test(f)) continue;
      const nama = f.replace(/\.mp3$/i, '');
      const fileChart = path.join(FOLDER_LAGU, nama + '_chart.json');
      if (!fs.existsSync(fileChart)) { console.log('Lewati (tidak ada ' + nama + '_chart.json)'); continue; }
      try {
        const d = JSON.parse(fs.readFileSync(fileChart, 'utf8'));
        const notes = (Array.isArray(d) ? d : d.notes || [])
          .filter(k => k && typeof k.time === 'number' && NADA_SAH.includes(String(k.note)))
          .map(k => ({ time: k.time, note: String(k.note) }))
          .sort((a, b) => a.time - b.time);
        if (!notes.length) { console.log('Lewati (chart kosong): ' + nama); continue; }
        daftar[nama] = { file: f, notes };
      } catch (e) { console.log('Lewati (JSON rusak): ' + nama); }
    }
    fs.writeFileSync(path.join(FOLDER_LAGU, 'daftar.js'), 'window.PLAYLIST = ' + JSON.stringify(daftar) + ';\n', 'utf8');
    console.log('daftar.js dibuat: ' + Object.keys(daftar).length + ' lagu');
  } catch (e) {
    console.log('Gagal membuat daftar.js: ' + e.message);
  }
}

// ---- Simpan lagu dari editor: mp3 + chart + daftar.js sekaligus
ipcMain.handle('lagu:simpan', (event, p) => {
  try {
    if (MODE !== 'editor') return { ok: false, pesan: 'Hanya bisa dari editor' };
    const { nama, chart, mp3, timpa } = p || {};
    const id = path.basename(String(nama || '').replace(/[\\\/:*?"<>|]/g, '').trim());
    if (!id) return { ok: false, pesan: 'Nama lagu tidak valid' };
    if (!chart || !Array.isArray(chart.notes) || chart.notes.length === 0) return { ok: false, pesan: 'Chart masih kosong' };
    if (!mp3) return { ok: false, pesan: 'Data mp3 tidak ada' };

    fs.mkdirSync(FOLDER_LAGU, { recursive: true });
    const fMp3 = path.join(FOLDER_LAGU, id + '.mp3');
    const fJson = path.join(FOLDER_LAGU, id + '_chart.json');
    if ((fs.existsSync(fMp3) || fs.existsSync(fJson)) && !timpa) {
      return { ok: false, ada: true, pesan: 'Lagu "' + id + '" sudah ada' };
    }

    // Tulis ke berkas sementara dulu, baru ganti nama (lagu lama tidak rusak bila mati di tengah)
    fs.writeFileSync(fMp3 + '.tmp', Buffer.from(mp3));
    fs.renameSync(fMp3 + '.tmp', fMp3);
    fs.writeFileSync(fJson + '.tmp', JSON.stringify(chart, null, 2), 'utf8');
    fs.renameSync(fJson + '.tmp', fJson);

    buatDaftar();
    return { ok: true, id: id };
  } catch (e) {
    return { ok: false, pesan: 'Gagal menyimpan: ' + e.message };
  }
});

// ---- Kata sandi untuk keluar. Ganti di sini bila perlu.
const SANDI = 'gameland';
let gagal = 0, kunciSampai = 0, jendelaSandi = null;

ipcMain.handle('sandi:cek', (event, teks) => {
  // Hanya jendela kata sandi yang boleh memeriksa
  if (!jendelaSandi || event.sender !== jendelaSandi.webContents) return { ok: false, pesan: '' };
  const sisa = Math.ceil((kunciSampai - Date.now()) / 1000);
  if (sisa > 0) return { ok: false, pesan: 'Terkunci, coba lagi ' + sisa + ' detik' };
  if (teks === SANDI) {
    izinKeluar = true;
    app.quit();
    return { ok: true };
  }
  gagal++;
  if (gagal >= 3) {
    gagal = 0; kunciSampai = Date.now() + 10000;
    return { ok: false, pesan: 'Salah 3 kali. Terkunci 10 detik' };
  }
  return { ok: false, pesan: 'Kata sandi salah' };
});

ipcMain.handle('sandi:batal', () => { if (jendelaSandi) jendelaSandi.close(); });

// Dipanggil halaman game saat window.close() (tombol Keluar bawaan game)
ipcMain.handle('sandi:buka', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && KIOSK) mintaSandi(win);
});

function mintaSandi(jendelaGame) {
  if (jendelaSandi) return;   // sudah terbuka
  jendelaSandi = new BrowserWindow({
    parent: jendelaGame, modal: true,
    width: 420, height: 290,
    frame: false, resizable: false, show: false, alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-sandi.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  jendelaSandi.once('ready-to-show', () => jendelaSandi.show());
  jendelaSandi.on('closed', () => {
    jendelaSandi = null;
    if (!jendelaGame.isDestroyed()) jendelaGame.focus();
  });
  jendelaSandi.loadFile(path.join(__dirname, 'sandi.html'));
}

// ---- Jendela
function bukaJendela() {
  const editor = MODE === 'editor';
  const halaman = path.join(__dirname, editor ? 'chart-editor.html' : 'index.html');

  if (!fs.existsSync(halaman)) {
    dialog.showErrorBox('File tidak ditemukan', 'Tidak ada: ' + halaman);
    app.quit();
    return;
  }

  // Hilangkan menu bawaan (sekalian mematikan Ctrl+R, Ctrl+W, dll.)
  if (KIOSK) Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: editor ? 'Gamelan Rhythm - Chart Editor' : 'Gamelan Rhythm',
    kiosk: KIOSK,
    fullscreen: KIOSK,
    frame: !KIOSK,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (KIOSK) {
    // Percobaan menutup (Alt+F4) ditahan, diganti kotak sandi
    win.on('close', (e) => {
      if (izinKeluar) return;
      e.preventDefault();
      console.log('Penutupan jendela ditahan, meminta sandi');
      mintaSandi(win);
    });

    // Cegah halaman dialihkan ke about:blank oleh tombol Keluar bawaan game
    win.webContents.on('will-navigate', (e) => e.preventDefault());

    // Tombol Keluar bawaan game memanggil window.close(), yang menutup jendela
    // langsung tanpa melewati penahan 'close'. Di kiosk, ganti jadi permintaan sandi.
    win.webContents.on('dom-ready', () => {
      win.webContents.executeJavaScript(
        'window.close = function(){ if (window.gamelan && window.gamelan.mintaKeluar) window.gamelan.mintaKeluar(); };'
      );
    });

    // Blokir pintasan yang bisa dipakai pengunjung usil
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const k = input.key.toLowerCase();
      const ctrl = input.control || input.meta;
      if (
        k === 'f11' || k === 'f12' || k === 'f5' ||
        (ctrl && ['r', 'w', 'q', 'p'].includes(k)) ||
        (ctrl && input.shift && ['i', 'j', 'r'].includes(k))
      ) event.preventDefault();
    });
    win.webContents.on('devtools-opened', () => win.webContents.closeDevTools());

    // Tidak boleh membuka jendela baru
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  }

  if (!editor) buatDaftar();   // perbarui daftar lagu sebelum game dimuat
  win.loadFile(halaman);
}

app.whenReady().then(bukaJendela);
app.on('window-all-closed', () => app.quit());