const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');
const { spawn } = require('child_process');
const net = require('net');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Setup logging for updates
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';


// Only one instance: two would fight over the local Qdrant store (it locks its folder).
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

let pythonProcess = null;
let backendPort = 8000;
// Per-launch secret the backend requires on every request (see server.py). Dev mode
// runs the backend by hand without a token, so the renderer sends none there.
const backendToken = app.isPackaged ? crypto.randomBytes(32).toString('hex') : '';
let quitting = false;
let backendRestarts = 0;

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  // The backend can have children (Playwright driver, browser); kill them too.
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else {
    child.kill();
  }
}

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
    log.info("Starting Python backend at:", backendPath);
    try {
      if (!pythonProcess) backendPort = await findOpenPort();
      log.info("Backend port:", backendPort);
      
      const userDataPath = app.getPath('userData');
      const env = { ...process.env, TERMICURSOR_USER_DATA: userDataPath, TERMICURSOR_TOKEN: backendToken };

      // windowsHide: the backend is a console exe; without it a black window pops up.
      pythonProcess = spawn(backendPath, ["--port", backendPort.toString()], { detached: false, env, windowsHide: true });

      // electron-log writes these to %APPDATA%/Termicursor/logs/main.log for bug reports.
      pythonProcess.stdout.on('data', (data) => log.info(`[backend] ${data}`));
      pythonProcess.stderr.on('data', (data) => log.warn(`[backend] ${data}`));
      pythonProcess.on('exit', (code) => {
        if (quitting) return;
        log.error(`Backend exited with code ${code}`);
        // ponytail: fixed 3-restart cap, no backoff; add backoff if crash loops show up in logs.
        if (backendRestarts++ < 3) setTimeout(startPythonBackend, 1000);
      });
    } catch(err) {
      log.error("Failed to start python backend:", err);
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

  // ── Keep untrusted pages out of this window ──
  // The preload gives this window file read/write and a shell, so it must only ever
  // show the app. External links open in the user's browser; backend artifact files
  // (logs, recordings) open in a plain child window.
  const isBackendUrl = (url) => url.startsWith(`http://127.0.0.1:${backendPort}/`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isBackendUrl(url)) return { action: 'allow', overrideBrowserWindowOptions: { frame: true, autoHideMenuBar: true } };
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url === win.webContents.getURL()) return;  // reloads / HMR
    event.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });

  // ── Auto-Updater Events & IPC Handlers ──
  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update-available', info.version);
  });

  autoUpdater.on('update-downloaded', () => {
    win.webContents.send('update-downloaded');
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
  });


  // ── Terminal Handlers ──
  let ptyProcess = null;
  ipcMain.handle('terminal:spawn', (event, projectPath) => {
    if (ptyProcess) ptyProcess.kill();
    const shellExe = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const args = process.platform === 'win32' ? ['-NoLogo'] : [];
    ptyProcess = spawn(shellExe, args, {
      env: process.env,
      cwd: projectPath || app.getPath('userData'),
      windowsHide: true,
    });
    
    ptyProcess.stdout.on('data', (data) => {
      win.webContents.send('terminal:incomingData', data.toString().replace(/\x00/g, ''));
    });
    ptyProcess.stderr.on('data', (data) => {
      win.webContents.send('terminal:incomingData', data.toString().replace(/\x00/g, ''));
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
  ipcMain.handle('getBackendToken', () => backendToken);

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
    win.loadURL('http://localhost:5180');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Trigger update check when window is ready to show
  win.once('ready-to-show', () => {
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      log.error('Auto-update check failed: ', err);
    });
  });
}

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

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
  quitting = true;
  killTree(pythonProcess);
});
