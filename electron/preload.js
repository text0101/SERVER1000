import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  // Add any secure IPC methods here if needed in future
  openExternal: (url) => ipcRenderer.send('open-external', url),
  platform: process.platform
});
