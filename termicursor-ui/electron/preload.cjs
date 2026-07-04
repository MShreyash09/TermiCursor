const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  readDir: (dirPath) => ipcRenderer.invoke('dialog:readDir', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('dialog:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('dialog:writeFile', filePath, content),
  saveSettings: (settings) => ipcRenderer.invoke('dialog:saveSettings', settings),
  loadSettings: () => ipcRenderer.invoke('dialog:loadSettings'),
  getBackendPort: () => ipcRenderer.invoke('getBackendPort'),
  deleteFile: (filePath) => ipcRenderer.invoke('dialog:deleteFile', filePath),
  saveRecentFolder: (folderPath) => ipcRenderer.invoke('dialog:saveRecentFolder', folderPath),
  loadRecentFolders: () => ipcRenderer.invoke('dialog:loadRecentFolders'),
  spawnTerminal: (projectPath) => ipcRenderer.invoke('terminal:spawn', projectPath),
  writeTerminal: (data) => ipcRenderer.send('terminal:write', data),
  onTerminalData: (callback) => ipcRenderer.on('terminal:incomingData', (_event, value) => callback(value)),
});
