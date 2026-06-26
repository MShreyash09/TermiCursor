const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { spawn } = require('child_process');

let pythonProcess = null;

function startPythonBackend() {
  const isDev = !app.isPackaged;
  if (!isDev) {
    const backendPath = path.join(process.resourcesPath, 'termicursor-backend', 'termicursor-backend.exe');
    console.log("Starting Python backend at:", backendPath);
    try {
      pythonProcess = spawn(backendPath, [], { detached: false });
      
      pythonProcess.stdout.on('data', (data) => console.log(`Python STDOUT: ${data}`));
      pythonProcess.stderr.on('data', (data) => console.error(`Python STDERR: ${data}`));
    } catch(err) {
      console.error("Failed to start python backend:", err);
    }
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: false,           // Completely remove OS frame — we draw our own
    backgroundColor: '#0a0a0a',
  });

  // ── Window control IPC handlers ──
  ipcMain.on('window-minimize', () => win.minimize());
  ipcMain.on('window-maximize', () => {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });
  ipcMain.on('window-close', () => win.close());

  ipcMain.handle('dialog:openFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    });
    if (!canceled) {
      return filePaths[0];
    }
    return null;
  });

  ipcMain.handle('dialog:readDir', async (event, dirPath) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries.map(ent => ({
        name: ent.name,
        isDirectory: ent.isDirectory(),
        path: path.join(dirPath, ent.name)
      }));
    } catch (e) {
      console.error(e);
      return [];
    }
  });

  ipcMain.handle('dialog:readFile', async (event, filePath) => {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (e) {
      console.error(e);
      return `Error reading file: ${e.message}`;
    }
  });

  // ── Load content ──
  const isDev = !app.isPackaged;

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  startPythonBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});
