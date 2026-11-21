/**
 * ComHost — backend Apps Script.
 *
 * Pasang: buka spreadsheet → Extensions → Apps Script → ganti seluruh isi Code.gs dengan file ini → simpan.
 * Jalankan fungsi `setup` sekali dari editor (untuk izin Spreadsheet & Drive), lalu
 * Deploy → Manage deployments → Edit → Version: New version → Deploy (Execute as: Me, Who has access: Anyone).
 *
 * Sheet:
 *   Nama Toko  — daftar toko (hanya dibaca).
 *   Jabatan    — daftar jabatan (dibuat otomatis, bisa diubah).
 *   Member     — akun penilai. Role default "Member"; ganti ke "Admin" agar bisa melihat semua riwayat.
 *   Penilaian  — hasil penilaian. Foto & rekaman disimpan di folder Drive "ComHost".
 *
 * AI dikte (suara → teks) memakai Gemini. Isi API key di Project Settings → Script properties:
 *   GEMINI_API_KEY = <key dari aistudio.google.com>
 *   GEMINI_MODEL   = (opsional) nama model, default di konstanta GEMINI_MODEL.
 */
const APP = 'ComHost';
const VERSION = '1.0';
const SPREADSHEET_ID = '1sTMtK0qkXUd9cHLR2XzJCkygWvrNTHWQFhujY2M9YS0';
const TZ = 'Asia/Jakarta';
const SHEET = { toko: 'Nama Toko', jabatan: 'Jabatan', member: 'Member', nilai: 'Penilaian' };
const DEFAULT_JABATAN = ['Store Leader', 'Asisten Leader', 'Kasir', 'Crew', 'Cook'];
const MEMBER_COLS = ['Nama', 'Jabatan', 'Kode Akses', 'Role', 'Dibuat', 'Terakhir masuk'];
const NILAI_COLS = ['ID', 'Waktu', 'Tanggal', 'Jam', 'Toko', 'Penilai', 'Jabatan Penilai', 'Dinilai', 'Jabatan Dinilai',
  'Situasi', 'Foto Situasi', 'Suara Situasi', 'Tindakan', 'Foto Tindakan', 'Suara Tindakan',
  'Komunikasi', 'Suara Komunikasi', 'Dikirim'];
// [kunci, judul kolom, boleh foto]
const SECS = [['situasi', 'Situasi', true], ['tindakan', 'Tindakan', true], ['komunikasi', 'Komunikasi', false]];
const MAX_REKAM = 60;   // detik
const MAX_FOTO = 30;    // per bagian
const MAX_SUARA = 10;   // per bagian
const GEMINI_MODEL = 'gemini-flash-latest';
const DIKTE_PROMPT = 'Transkripsikan rekaman suara ini menjadi teks bahasa Indonesia persis seperti yang diucapkan. ' +
  'Tulis hanya hasil transkripsi dengan tanda baca yang wajar, tanpa judul, label pembicara, catatan, atau tanda kutip. ' +
  'Jika tidak ada ucapan yang jelas, balas dengan teks kosong.';

/* ---------- pintu masuk ---------- */
function doGet(e) { return run_((e && e.parameter) || {}); }
function doPost(e) {
  let p;
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ status: 'error', app: APP, version: VERSION, error: 'Data tidak valid' }); }
  return run_(p);
}
function run_(p) {
  const actions = { ping: () => ({}), master: master_, register: register_, login: login_, sync: sync_, riwayat: riwayat_, submit: submit_, media: media_, transcribe: transcribe_ };
  try {
    const fn = actions[p.action];
    if (!fn) fail_('Aksi tidak dikenal');
    return json_(Object.assign({ status: 'ok', app: APP, version: VERSION }, fn(p)));
  } catch (err) {
    return json_({ status: 'error', app: APP, version: VERSION, code: err.code || '', error: err.message || String(err) });
  }
}
/** Jalankan sekali dari editor: membuat sheet, folder Drive, dan memicu izin akses. */
function setup() {
  table_(SHEET.member, MEMBER_COLS);
  table_(SHEET.nilai, NILAI_COLS);
  jabatan_();
  Logger.log('Toko: %s, folder: %s', toko_().length, folder_().getUrl());
}

/* ---------- aksi ---------- */
function master_() { return { toko: toko_(), jabatan: jabatan_() }; }

function register_(p) {
  const nama = norm_(p.nama), jabatan = norm_(p.jabatan), kode = kode_(p.kode);
  if (!nama) fail_('Isi nama');
  if (nama.length > 60) fail_('Nama terlalu panjang');
  if (!jabatan) fail_('Pilih jabatan');
  if (kode.length < 4) fail_('Kode minimal 4 karakter');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (members_().some(m => m.key === nama.toLowerCase())) fail_('Nama sudah dipakai', 'TAKEN');
    const t = now_();
    append_(table_(SHEET.member, MEMBER_COLS), { 'Nama': nama, 'Jabatan': jabatan, 'Kode Akses': kode, 'Role': 'Member', 'Dibuat': t, 'Terakhir masuk': t });
  } finally { lock.releaseLock(); }
  return { user: { nama, jabatan, role: 'Member' } };
}

function login_(p) {
  const m = auth_(p), t = table_(SHEET.member, MEMBER_COLS);
  t.sh.getRange(m.row, t.idx['Terakhir masuk'] + 1).setNumberFormat('@').setValue(now_());
  return { user: pub_(m) };
}

/** Data saat app dibuka: akun (role terbaru), toko, jabatan, dan riwayat penilaian milik sendiri. */
function sync_(p) {
  const m = auth_(p);
  return { user: pub_(m), toko: toko_(), jabatan: jabatan_(), mine: records_().filter(r => r.pen.toLowerCase() === m.key) };
}

function riwayat_(p) {
  const m = auth_(p);
  if (m.role !== 'Admin') fail_('Khusus admin', 'ROLE');
  return { all: records_() };
}

function submit_(p) {
  const m = auth_(p), r = p.record || {}, sec = r.sec || {};
  const id = norm_(r.id);
  if (!/^[\w-]{6,40}$/.test(id)) fail_('ID penilaian tidak valid');
  const toko = norm_(r.toko), din = norm_(r.din), jdin = norm_(r.jdin);
  if (!toko || !din || !jdin) fail_('Data penilaian belum lengkap');
  SECS.forEach(([k, label]) => {
    const s = sec[k] || {};
    if (!norm_(s.text) && !(s.clips || []).length) fail_(label + ' wajib diisi');
  });

  const t = table_(SHEET.nilai, NILAI_COLS);
  if (hasId_(t, id)) return { id, dup: true };   // kiriman ulang dari antrean

  let at = new Date(r.at);
  if (isNaN(at) || at > new Date(Date.now() + 864e5)) at = new Date();
  const folder = folder_(), made = [];
  const save = (k, kind, list, max) => (list || []).slice(0, max).map((x, i) => {
    const mime = String(x.mime || (kind === 'foto' ? 'image/jpeg' : 'audio/webm')).split(';')[0];
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'audio/wav': 'wav', 'audio/webm': 'webm', 'audio/mp4': 'm4a',
      'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/aac': 'aac' }[mime] || 'bin';
    const f = folder.createFile(Utilities.newBlob(Utilities.base64Decode(String(x.data || '')), mime, `${id}_${k}_${kind}${i + 1}.${ext}`));
    f.setDescription(JSON.stringify({ app: APP, rec: id, pen: m.nama }));
    made.push(f);
    return kind === 'suara' ? `${f.getUrl()} (${dur_(x.dur)})` : f.getUrl();
  }).join('\n');

  const row = {
    'ID': id, 'Waktu': at.toISOString(), 'Tanggal': Utilities.formatDate(at, TZ, 'yyyy-MM-dd'), 'Jam': Utilities.formatDate(at, TZ, 'HH:mm'),
    'Toko': toko, 'Penilai': m.nama, 'Jabatan Penilai': m.jabatan, 'Dinilai': din, 'Jabatan Dinilai': jdin, 'Dikirim': now_()
  };
  SECS.forEach(([k, label, foto]) => {
    const s = sec[k] || {};
    row[label] = String(s.text || '').trim();
    if (foto) row['Foto ' + label] = save(k, 'foto', s.photos, MAX_FOTO);
    row['Suara ' + label] = save(k, 'suara', s.clips, MAX_SUARA);
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (hasId_(t, id)) { made.forEach(f => f.setTrashed(true)); return { id, dup: true }; }
    append_(t, row);
  } finally { lock.releaseLock(); }
  return { id };
}

/** Foto/rekaman untuk ditampilkan di app. Member hanya file miliknya; Admin semua. */
function media_(p) {
  const m = auth_(p);
  let f;
  try { f = DriveApp.getFileById(String(p.id || '')); } catch (e) { fail_('File tidak ditemukan'); }
  let meta = {};
  try { meta = JSON.parse(f.getDescription() || '{}'); } catch (e) { /* bukan file ComHost */ }
  if (meta.app !== APP) fail_('File tidak ditemukan');
  if (m.role !== 'Admin' && String(meta.pen || '').toLowerCase() !== m.key) fail_('Tidak punya akses', 'ROLE');
  const b = f.getBlob();
  return { mime: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) };
}

/** AI dikte: rekaman (base64) → teks, lewat Gemini. Hanya untuk akun yang masuk. */
function transcribe_(p) {
  auth_(p);
  const props = PropertiesService.getScriptProperties(), key = props.getProperty('GEMINI_API_KEY');
  if (!key) fail_('AI dikte belum aktif. Admin perlu mengisi GEMINI_API_KEY di Apps Script', 'AI_OFF');
  const data = String(p.data || '');
  if (!data) fail_('Rekaman kosong');
  if (data.length > 14e6) fail_('Rekaman terlalu panjang');
  const model = props.getProperty('GEMINI_MODEL') || GEMINI_MODEL;
  const res = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({
      contents: [{ parts: [{ text: DIKTE_PROMPT }, { inline_data: { mime_type: String(p.mime || 'audio/wav').split(';')[0], data } }] }],
      generationConfig: { temperature: 0 }
    })
  });
  const code = res.getResponseCode();
  let j = {};
  try { j = JSON.parse(res.getContentText()); } catch (e) { /* respons bukan JSON */ }
  if (code !== 200) {
    console.warn('Gemini %s: %s', code, res.getContentText().slice(0, 500));
    if (code === 429) fail_('AI sedang sibuk, coba lagi sebentar');
    if (code === 400 || code === 401 || code === 403 || code === 404) fail_('AI dikte gagal: cek GEMINI_API_KEY atau GEMINI_MODEL', 'AI_OFF');
    fail_('AI dikte gagal, coba lagi');
  }
  const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  return { text: parts.map(x => x.text || '').join('').trim() };
}

/* ---------- data ---------- */
function members_() {
  return rows_(table_(SHEET.member, MEMBER_COLS)).filter(r => norm_(r['Nama'])).map(r => ({
    row: r._row,
    nama: norm_(r['Nama']),
    jabatan: norm_(r['Jabatan']),
    kode: kode_(r['Kode Akses']),
    role: /^admin$/i.test(norm_(r['Role'])) ? 'Admin' : 'Member',
    key: norm_(r['Nama']).toLowerCase()
  }));
}
function auth_(p) {
  const key = norm_(p.nama).toLowerCase(), kode = kode_(p.kode);
  const m = key ? members_().find(x => x.key === key) : null;
  if (!m || !kode || m.kode !== kode) fail_('Nama atau kode salah', 'AUTH');
  return m;
}
const pub_ = m => ({ nama: m.nama, jabatan: m.jabatan, role: m.role });

function records_() {
  return rows_(table_(SHEET.nilai, NILAI_COLS)).filter(r => norm_(r['ID'])).map(r => {
    const rec = {
      id: norm_(r['ID']), at: when_(r), toko: norm_(r['Toko']),
      pen: norm_(r['Penilai']), jpen: norm_(r['Jabatan Penilai']),
      din: norm_(r['Dinilai']), jdin: norm_(r['Jabatan Dinilai']), sec: {}
    };
    SECS.forEach(([k, label, foto]) => {
      rec.sec[k] = {
        text: String(r[label] == null ? '' : r[label]).trim(),
        photos: foto ? files_(r['Foto ' + label]).map(f => f.id) : [],
        clips: files_(r['Suara ' + label])
      };
    });
    return rec;
  }).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
function when_(r) {
  const w = r['Waktu'];
  if (w instanceof Date) return w.toISOString();
  const s = norm_(w);
  if (s && !isNaN(Date.parse(s))) return new Date(s).toISOString();
  // Cadangan bila kolom Waktu diubah manual: Tanggal + Jam (WIB).
  const tg = r['Tanggal'] instanceof Date ? Utilities.formatDate(r['Tanggal'], TZ, 'yyyy-MM-dd') : norm_(r['Tanggal']);
  const jm = r['Jam'] instanceof Date ? Utilities.formatDate(r['Jam'], TZ, 'HH:mm') : (norm_(r['Jam']) || '00:00');
  const d = new Date(`${tg}T${jm.replace('.', ':')}:00+07:00`);
  return isNaN(d) ? new Date(0).toISOString() : d.toISOString();
}
// Satu file per baris: tautan Drive, opsional diikuti durasi "(0:12)".
function files_(s) {
  return String(s || '').split(/\n+/).map(line => {
    const id = (line.match(/\/d\/([\w-]{10,})/) || line.match(/[?&]id=([\w-]{10,})/) || line.match(/^\s*([\w-]{20,})\s*$/) || [])[1];
    const d = line.match(/\((\d+):(\d{2})\)/);
    return id ? { id, dur: d ? Number(d[1]) * 60 + Number(d[2]) : 0 } : null;
  }).filter(Boolean);
}
function toko_() {
  const sh = ss_().getSheetByName(SHEET.toko);
  return sh ? list_(sh, ['Nama Toko', 'Toko', 'Nama Store', 'Store', 'Cabang', 'Outlet']) : [];
}
function jabatan_() {
  const ss = ss_();
  let sh = ss.getSheetByName(SHEET.jabatan);
  if (!sh) {
    sh = ss.insertSheet(SHEET.jabatan);
    sh.getRange(1, 1, DEFAULT_JABATAN.length + 1, 1).setValues([['Jabatan']].concat(DEFAULT_JABATAN.map(j => [j])));
    sh.getRange(1, 1).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return list_(sh, ['Jabatan']);
}
// Satu kolom daftar: kolom dengan header yang dikenali, atau kolom pertama.
function list_(sh, names) {
  const last = sh.getLastRow(), cols = sh.getLastColumn();
  if (last < 1 || cols < 1) return [];
  const v = sh.getRange(1, 1, last, cols).getValues();
  const head = v[0].map(h => norm_(h).toLowerCase());
  let c = -1;
  names.some(n => (c = head.indexOf(n.toLowerCase())) >= 0);
  const known = c >= 0;
  if (!known) c = 0;
  const hasHead = known || /toko|nama|store|cabang|outlet|jabatan/.test(head[0] || '');
  const seen = {}, out = [];
  v.slice(hasHead ? 1 : 0).forEach(r => {
    const s = norm_(r[c]);
    if (s && !seen[s.toLowerCase()]) { seen[s.toLowerCase()] = true; out.push(s); }
  });
  return out;
}

/* ---------- utilitas sheet & drive ---------- */
let ss__;
function ss_() { return ss__ || (ss__ = SpreadsheetApp.openById(SPREADSHEET_ID)); }
// Ambil sheet (buat bila belum ada) dan pastikan semua kolom ada; kolom dibaca berdasarkan nama header.
function table_(name, cols) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  let head = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(norm_) : [];
  const missing = cols.filter(c => head.indexOf(c) < 0);
  if (missing.length) {
    sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    head = head.concat(missing);
  }
  const idx = {};
  head.forEach((h, i) => { if (h && !(h in idx)) idx[h] = i; });
  return { sh, head, idx };
}
function rows_(t) {
  const n = t.sh.getLastRow() - 1;
  if (n < 1) return [];
  return t.sh.getRange(2, 1, n, t.head.length).getValues().map((v, i) => {
    const o = { _row: i + 2 };
    t.head.forEach((h, j) => { if (h) o[h] = v[j]; });
    return o;
  });
}
// Baris baru disimpan sebagai teks agar tanggal, jam, dan kode tidak diubah format oleh Sheets.
function append_(t, obj) {
  const row = t.head.map(h => (h in obj ? String(obj[h]) : ''));
  t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, row.length).setNumberFormat('@').setValues([row]);
}
function hasId_(t, id) {
  const n = t.sh.getLastRow() - 1;
  if (n < 1) return false;
  return t.sh.getRange(2, t.idx['ID'] + 1, n, 1).getValues().some(v => norm_(v[0]) === id);
}
function folder_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('FOLDER_ID');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* folder hilang, buat baru */ }
  }
  const f = DriveApp.createFolder(APP);
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

/* ---------- kecil-kecil ---------- */
function fail_(msg, code) { const e = new Error(msg); if (code) e.code = code; throw e; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function norm_(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function kode_(s) { return String(s == null ? '' : s).trim(); }
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function dur_(s) { s = Math.max(0, Math.min(MAX_REKAM, Math.round(Number(s) || 0))); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
