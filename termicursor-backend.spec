# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

# Playwright's Python package ships a Node driver as data files; bundle it so the
# browser tools work in the installed app (browsers themselves: see browser_tools.py).
pw_datas, pw_binaries, pw_hiddenimports = collect_all('playwright')


a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=pw_binaries,
    datas=pw_datas,
    hiddenimports=['uvicorn', 'aiohttp', 'langchain_ollama', 'qdrant_client'] + pw_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='termicursor-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='termicursor-backend',
)
