// Every URL to the Python backend goes through here so the per-launch auth token
// (set by Electron in the packaged app, empty in dev) is always attached. It's a
// query param rather than a header because <a href>, <video src> and WebSocket
// can't set headers.
let token = '';

export function setBackendToken(t: string) {
  token = t;
}

export function backendUrl(port: number, path: string, { ws = false } = {}) {
  const sep = path.includes('?') ? '&' : '?';
  const auth = token ? `${sep}token=${encodeURIComponent(token)}` : '';
  return `${ws ? 'ws' : 'http'}://127.0.0.1:${port}${path}${auth}`;
}
