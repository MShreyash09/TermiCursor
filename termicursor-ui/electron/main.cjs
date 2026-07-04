const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { spawn } = require('child_process');
const net = require('net');

let pythonProcess = null;
let backendPort = 8000;

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function startPythonBackend() {
  const isDev = !app.isPackaged;
  if (!isDev) {
    const backendPath = path.join(process.resourcesPath, 'termicursor-backend', 'termicursor-backend.exe');
    console.log("Starting Python backend at:", backendPath);
    try {
      backendPort = await findOpenPort();
      console.log("Found open port:", backendPort);
      
      const userDataPath = app.getPath('userData');
      const env = { ...process.env, TERMICURSOR_USER_DATA: userDataPath };
      
      pythonProcess = spawn(backendPath, ["--port", backendPort.toString()], { detached: false, env });
      
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

  // ── Terminal Handlers ──
  let ptyProcess = null;
  ipcMain.handle('terminal:spawn', (event, projectPath) => {
    if (ptyProcess) ptyProcess.kill();
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    ptyProcess = spawn(shell, [], {
      env: process.env,
      cwd: projectPath || app.getPath('userData'),
    });
    
    ptyProcess.stdout.on('data', (data) => {
      win.webContents.send('terminal:incomingData', data.toString());
    });
    ptyProcess.stderr.on('data', (data) => {
      win.webContents.send('terminal:incomingData', data.toString());
    });
    return true;
  });

  ipcMain.on('terminal:write', (event, data) => {
    if (ptyProcess) {
      ptyProcess.stdin.write(data);
    }
  });

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

  ipcMain.handle('dialog:writeFile', async (event, filePath, content) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8');
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('getBackendPort', () => backendPort);

  ipcMain.handle('dialog:saveSettings', async (event, settings) => {
    try {
      const settingsPath = path.join(app.getPath('userData'), 'settings.json');
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error("Failed to save settings:", e);
      return false;
    }
  });

  ipcMain.handle('dialog:loadSettings', async () => {
    try {
      const settingsPath = path.join(app.getPath('userData'), 'settings.json');
      const data = await fs.readFile(settingsPath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return {};
    }
  });

  ipcMain.handle('dialog:deleteFile', async (event, filePath) => {
    try {
      await fs.unlink(filePath);
      return { success: true };
    } catch (e) {
      console.error("Failed to delete file:", e);
      return { success: false, error: e.message };
    }
  });

  // ── Recent Folders IPC ──
  const recentFoldersPath = path.join(app.getPath('userData'), 'recent-folders.json');

  ipcMain.handle('dialog:saveRecentFolder', async (event, folderPath) => {
    try {
      let recent = [];
      try {
        const data = await fs.readFile(recentFoldersPath, 'utf-8');
        recent = JSON.parse(data);
      } catch (e) {
        // File doesn't exist yet — start fresh
      }
      // Remove duplicate if already present, then prepend
      recent = recent.filter(entry => entry.path !== folderPath);
      const folderName = path.basename(folderPath);
      recent.unshift({ path: folderPath, name: folderName });
      // Keep only the last 3
      recent = recent.slice(0, 3);
      await fs.writeFile(recentFoldersPath, JSON.stringify(recent, null, 2), 'utf-8');
      return recent;
    } catch (e) {
      console.error("Failed to save recent folder:", e);
      return [];
    }
  });

  ipcMain.handle('dialog:loadRecentFolders', async () => {
    try {
      const data = await fs.readFile(recentFoldersPath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return [];
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

app.whenReady().then(async () => {
  await startPythonBackend();
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
