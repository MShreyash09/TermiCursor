import os

# 1. Patch preload.cjs
preload_file = "termicursor-ui/electron/preload.cjs"
with open(preload_file, "r", encoding="utf-8") as f:
    preload_content = f.read()

if "saveSettings:" not in preload_content:
    preload_content = preload_content.replace(
        "readFile: (filePath) => ipcRenderer.invoke('dialog:readFile', filePath),",
        "readFile: (filePath) => ipcRenderer.invoke('dialog:readFile', filePath),\n  saveSettings: (settings) => ipcRenderer.invoke('dialog:saveSettings', settings),\n  loadSettings: () => ipcRenderer.invoke('dialog:loadSettings'),\n  getBackendPort: () => ipcRenderer.invoke('getBackendPort'),"
    )
    with open(preload_file, "w", encoding="utf-8") as f:
        f.write(preload_content)

# 2. Patch main.cjs
main_file = "termicursor-ui/electron/main.cjs"
with open(main_file, "r", encoding="utf-8") as f:
    main_content = f.read()

# Replace top imports and state
main_imports_old = """const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { spawn } = require('child_process');

let pythonProcess = null;

function startPythonBackend() {"""

main_imports_new = """const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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

async function startPythonBackend() {"""
main_content = main_content.replace(main_imports_old, main_imports_new)

# Replace python spawn logic
spawn_old = """    const backendPath = path.join(process.resourcesPath, 'termicursor-backend', 'termicursor-backend.exe');
    console.log("Starting Python backend at:", backendPath);
    try {
      pythonProcess = spawn(backendPath, [], { detached: false });
      
      pythonProcess.stdout.on('data', (data) => console.log(`Python STDOUT: ${data}`));
      pythonProcess.stderr.on('data', (data) => console.error(`Python STDERR: ${data}`));
    } catch(err) {"""

spawn_new = """    const backendPath = path.join(process.resourcesPath, 'termicursor-backend', 'termicursor-backend.exe');
    console.log("Starting Python backend at:", backendPath);
    try {
      backendPort = await findOpenPort();
      console.log("Found open port:", backendPort);
      
      const userDataPath = app.getPath('userData');
      const env = { ...process.env, TERMICURSOR_USER_DATA: userDataPath };
      
      pythonProcess = spawn(backendPath, ["--port", backendPort.toString()], { detached: false, env });
      
      pythonProcess.stdout.on('data', (data) => console.log(`Python STDOUT: ${data}`));
      pythonProcess.stderr.on('data', (data) => console.error(`Python STDERR: ${data}`));
    } catch(err) {"""
if "findOpenPort" not in spawn_old and "findOpenPort" in main_imports_new:
    main_content = main_content.replace(spawn_old, spawn_new)

# Add IPC handlers for settings and port
ipc_old = """  ipcMain.handle('dialog:readFile', async (event, filePath) => {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (e) {
      console.error(e);
      return `Error reading file: ${e.message}`;
    }
  });"""

ipc_new = """  ipcMain.handle('dialog:readFile', async (event, filePath) => {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (e) {
      console.error(e);
      return `Error reading file: ${e.message}`;
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
  });"""
if "getBackendPort" not in ipc_old:
    main_content = main_content.replace(ipc_old, ipc_new)

# Replace app.whenReady
ready_old = """app.whenReady().then(() => {
  startPythonBackend();
  createWindow();"""
ready_new = """app.whenReady().then(async () => {
  await startPythonBackend();
  createWindow();"""
main_content = main_content.replace(ready_old, ready_new)

with open(main_file, "w", encoding="utf-8") as f:
    f.write(main_content)

print("preload.cjs and main.cjs updated successfully")
