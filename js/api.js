// Penyimpanan di perangkat dan koneksi ke Apps Script.

/** Pengaturan kecil & cache data (localStorage). */
const Store = {
  get(k, d) { try { const v = localStorage.getItem('comhost_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('comhost_' + k, JSON.stringify(v)); } catch (e) { /* penyimpanan penuh/diblokir */ } },
  del(k) { try { localStorage.removeItem('comhost_' + k); } catch (e) { /* abaikan */ } }
};

/** Draft & antrean kiriman beserta foto/rekaman (IndexedDB, karena berisi file). */
const DB = (() => {
  let opening;
  const open = () => opening || (opening = new Promise((res, rej) => {
    const r = indexedDB.open('comhost', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('queue', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (store, mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode), req = fn(t.objectStore(store));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = t.onabort = () => rej(t.error);
    });
  };
  return {
    get: k => tx('kv', 'readonly', s => s.get(k)),
    set: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
    del: k => tx('kv', 'readwrite', s => s.delete(k)),
    qAll: () => tx('queue', 'readonly', s => s.getAll()),
    qPut: v => tx('queue', 'readwrite', s => s.put(v)),
    qDel: id => tx('queue', 'readwrite', s => s.delete(id))
  };
})();

class ApiError extends Error {
  constructor(msg, code, net) { super(msg); this.code = code || ''; this.net = !!net; }
}

const Api = {
  /** Semua permintaan memakai POST text/plain agar tidak kena preflight CORS Apps Script. */
  async call(action, data, timeout = 30000) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeout);
    let res, text;
    try {
      res = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action }, data)),
        signal: ctrl.signal
      });
      text = await res.text();
    } catch (e) {
      throw new ApiError(e.name === 'AbortError' ? 'Koneksi terlalu lama. Coba lagi.' : 'Tidak ada koneksi internet', 'NET', true);
    } finally { clearTimeout(timer); }
    if (!res.ok) throw new ApiError(`Server sedang bermasalah (HTTP ${res.status})`, 'HTTP', res.status >= 500);
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new ApiError('Apps Script belum siap. Cek deployment.', 'SETUP'); }
    if (j.app !== 'ComHost') throw new ApiError('Apps Script belum versi ComHost. Tempel apps-script/Code.gs lalu deploy versi baru.', 'SETUP');
    if (j.status !== 'ok') throw new ApiError(j.error || 'Permintaan gagal', j.code);
    return j;
  }
};

/** Ubah Blob ke base64 (tanpa awalan data:). */
const toB64 = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});
const fromB64 = (b64, mime) => {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: mime || 'application/octet-stream' });
};
