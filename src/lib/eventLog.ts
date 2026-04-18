export function log(msg: string) {
  try {
    const MAX = 150;
    const key = 'estbirding.log.v1';
    const ts = new Date().toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const line = `[${ts}] ${msg}`;
    const raw = localStorage.getItem(key) || '';
    const lines = raw ? raw.split('\n') : [];
    lines.push(line);
    if (lines.length > MAX) lines.splice(0, lines.length - MAX);
    localStorage.setItem(key, lines.join('\n'));
  } catch {}
}

export function getLog(): string {
  try {
    return localStorage.getItem('estbirding.log.v1') || '(tühi)';
  } catch { return '(viga)'; }
}

export function clearLog() {
  try { localStorage.removeItem('estbirding.log.v1'); } catch {}
}
