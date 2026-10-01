const { contextBridge, ipcRenderer } = require('electron');

// sandi.html memakai window.sandi.cek(...) dan window.sandi.batal()
contextBridge.exposeInMainWorld('sandi', {
  cek:   (teks) => ipcRenderer.invoke('sandi:cek', teks),
  batal: () => ipcRenderer.invoke('sandi:batal')
});