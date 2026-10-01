const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gamelan', {
  infoApp:     () => ipcRenderer.invoke('app:info'),
  mintaKeluar: () => ipcRenderer.invoke('sandi:buka'),
  simpanLagu:  (p) => ipcRenderer.invoke('lagu:simpan', p)
});