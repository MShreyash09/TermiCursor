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
  onSettingsChanged: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('settings-changed', listener);
    return () => ipcRenderer.removeListener('settings-changed', listener);
  },
  loadSettings: () => ipcRenderer.invoke('dialog:loadSettings'),
  getBackendPort: () => ipcRenderer.invoke('getBackendPort'),
  getBackendToken: () => ipcRenderer.invoke('getBackendToken'),
  deleteFile: (filePath) => ipcRenderer.invoke('dialog:deleteFile', filePath),
  saveRecentFolder: (folderPath) => ipcRenderer.invoke('dialog:saveRecentFolder', folderPath),
  loadRecentFolders: () => ipcRenderer.invoke('dialog:loadRecentFolders'),
  spawnTerminal: (projectPath) => ipcRenderer.invoke('terminal:spawn', projectPath),
  writeTerminal: (data) => ipcRenderer.send('terminal:write', data),
  onTerminalData: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('terminal:incomingData', listener);
    return () => ipcRenderer.removeListener('terminal:incomingData', listener);
  },
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_event, version) => callback(version)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', () => callback()),
  installUpdate: () => ipcRenderer.send('install-update'),
});
