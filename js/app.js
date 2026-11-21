/* ComHost — logika tampilan. Data disimpan lewat Apps Script (js/api.js). */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const ICON = n => `<svg class="i"><use href="#i-${n}"/></svg>`;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, '0');
const fmtDate = (d, o) => d.toLocaleDateString('id-ID', o || { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = d => `${pad(d.getHours())}.${pad(d.getMinutes())}`;
const fmtYMD = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDur = s => { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + pad(s % 60); };
const sameDay = (a, b) => a.toDateString() === b.toDateString();
const initial = s => esc((String(s || '').trim()[0] || '?').toUpperCase());
const flag = el => { el.classList.remove('miss'); void el.offsetWidth; el.classList.add('miss'); el.focus({ preventScroll: true }); };
const lower = s => String(s || '').toLowerCase();

const SEC = {
  situasi:    { label: 'Situasi',    ic: 'eye',  photo: true,  ph: 'Customer lansia…' },
  tindakan:   { label: 'Tindakan',   ic: 'hand', photo: true,  ph: 'Antar pesanan ke meja…' },
  komunikasi: { label: 'Komunikasi', ic: 'chat', photo: false, ph: '“Saya bantu antar ke meja ya”' }
};
const KEYS = Object.keys(SEC);
const DEFAULT_JABATAN = ['Store Leader', 'Asisten Leader', 'Kasir', 'Crew', 'Cook'];
const fresh = () => ({ situasi: { text: '', photos: [], clips: [] }, tindakan: { text: '', photos: [], clips: [] }, komunikasi: { text: '', photos: [], clips: [] } });
const revive = list => (list || []).map(r => Object.assign({}, r, { at: new Date(r.at) }));
const newId = () => 'CH' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const S = {
  user: Store.get('session', null),          // { nama, jabatan, role, kode }
  toko: Store.get('toko', []), jabatan: Store.get('jabatan', []),
  mine: revive(Store.get('mine', [])), all: revive(Store.get('all', [])),
  names: Store.get('names', []),
  pref: Object.assign({ theme: 'auto', pal: 'mint' }, Store.get('pref', {})),
  queue: [], f: { toko: Store.get('lastToko', ''), din: '', jdin: '', at: new Date() }, sec: fresh(),
  mode: 'new', tab: 'auth', step: 1, aJab: '', q: '', ft: { toko: '', pen: '', tgl: 'all' },
  pk: null, out: false, syncing: false, loadingAll: false, allErr: '', homeLimit: 30, allLimit: 100
};
const creds = () => ({ nama: S.user.nama, kode: S.user.kode });
const attach = s => { s.photos.forEach(p => { p.url = URL.createObjectURL(p.blob); }); s.clips.forEach(c => { c.url = URL.createObjectURL(c.blob); }); };

/* ---------- dropdown (bukan bawaan perangkat) ---------- */
const jabList = () => (S.jabatan.length ? S.jabatan : DEFAULT_JABATAN).map(j => [j, j]);
const uniq = k => [...new Set(S.all.map(h => h[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));
const DD = {
  aJab:  { ph: 'Jabatan', opts: jabList, get: () => S.aJab, set: v => { S.aJab = v; } },
  fJDin: { ph: 'Jabatan', opts: jabList, get: () => S.f.jdin, set: v => { S.f.jdin = v; saveDraft(); } },
  fToko: { opts: () => [['', 'Semua toko'], ...uniq('toko').map(v => [v, v])], get: () => S.ft.toko, set: v => { S.ft.toko = v; S.allLimit = 100; renderRiwayat(); } },
  fPenF: { opts: () => [['', 'Semua penilai'], ...uniq('pen').map(v => [v, v])], get: () => S.ft.pen, set: v => { S.ft.pen = v; S.allLimit = 100; renderRiwayat(); } },
  fTgl:  { opts: () => [['all', 'Semua tanggal'], ['today', 'Hari ini'], ['7', '7 hari'], ['30', '30 hari']], get: () => S.ft.tgl, set: v => { S.ft.tgl = v; S.allLimit = 100; renderRiwayat(); } }
};
function ddPaint(key) {
  const c = DD[key], v = c.get(), o = c.opts().find(x => x[0] === v), val = $('#' + key + ' .dd-val');
  val.textContent = o ? o[1] : (v || c.ph);
  val.classList.toggle('ph', !o && !v);
}
let ddOpen = null;
function ddToggle(btn) {
  const key = btn.dataset.dd, was = ddOpen === key;
  ddClose(); if (was) return;
  const c = DD[key], v = c.get(), pop = $('#ddPop');
  pop.innerHTML = c.opts().map(([ov, l]) => `<button type="button" role="option" data-ddv="${esc(ov)}" aria-selected="${ov === v}">${esc(l)}${ov === v ? ICON('check') : ''}</button>`).join('');
  pop.hidden = false; ddOpen = key; btn.setAttribute('aria-expanded', 'true');
  const r = btn.getBoundingClientRect(), w = Math.max(r.width, 190), limit = innerHeight - ($('.tabs').hidden ? 12 : 96);
  pop.style.width = w + 'px';
  pop.style.left = Math.min(Math.max(12, r.left), innerWidth - w - 12) + 'px';
  const h = pop.offsetHeight, up = r.bottom + 6 + h > limit && r.top - 6 - h > 12;
  pop.classList.toggle('up', up);
  pop.style.top = (up ? r.top - 6 - h : r.bottom + 6) + 'px';
  (pop.querySelector('[aria-selected="true"]') || pop.firstElementChild).focus({ preventScroll: true });
}
function ddClose() {
  if (!ddOpen) return;
  $('#' + ddOpen).setAttribute('aria-expanded', 'false');
  $('#ddPop').hidden = true; ddOpen = null;
}
function ddPick(v) {
  const key = ddOpen, btn = $('#' + key);
  ddClose(); DD[key].set(v); ddPaint(key);
  btn.classList.remove('miss'); btn.focus({ preventScroll: true });
}

/* ---------- akun ---------- */
function renderAuth() {
  const isNew = S.mode === 'new';
  $$('#authSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.am === S.mode));
  $('#aJabWrap').hidden = !isNew;
  $('#aKode').placeholder = isNew ? 'Min. 4 karakter' : '';
  $('#authBtn').textContent = isNew ? 'Buat akun' : 'Masuk';
  ddPaint('aJab');
}
async function loadMaster() {
  try {
    const j = await Api.call('master', {});
    S.toko = j.toko; S.jabatan = j.jabatan;
    Store.set('toko', j.toko); Store.set('jabatan', j.jabatan);
    if (S.tab === 'auth') ddPaint('aJab');
  } catch (e) { if (e.code === 'SETUP') toast(e.message); }
}
async function submitAuth(e) {
  e.preventDefault();
  const isNew = S.mode === 'new', btn = $('#authBtn');
  const nama = $('#aNama').value.replace(/\s+/g, ' ').trim(), kode = $('#aKode').value.trim();
  const bad = (sel, msg) => { flag($(sel)); toast(msg); };
  if (!nama) return bad('#aNama', 'Isi nama');
  if (isNew && !S.aJab) return bad('#aJab', 'Pilih jabatan');
  if (isNew && kode.length < 4) return bad('#aKode', 'Kode minimal 4 karakter');
  if (!kode) return bad('#aKode', 'Isi kode akses');
  busy(btn, true, isNew ? 'Membuat akun…' : 'Masuk…');
  try {
    const j = await Api.call(isNew ? 'register' : 'login', { nama, kode, jabatan: S.aJab });
    busy(btn, false);
    await startSession(Object.assign({}, j.user, { kode }));
  } catch (err) {
    busy(btn, false);
    if (err.code === 'TAKEN') bad('#aNama', err.message);
    else if (err.code === 'AUTH') bad('#aKode', err.message);
    else toast(err.message);
  }
}
async function startSession(u) {
  S.user = u; Store.set('session', u);
  S.mine = []; S.all = []; Store.del('mine'); Store.del('all');
  S.f = { toko: Store.get('lastToko', ''), din: '', jdin: '', at: new Date() };
  S.sec = fresh(); S.step = 1; S.q = ''; S.ft = { toko: '', pen: '', tgl: 'all' };
  $('#authForm').reset(); S.aJab = ''; $('#fCari').value = '';
  DB.del('draft').catch(() => {});
  applyRole(); go('home');
  await sync();
  flushQueue();
}
function logout(msg) {
  closeSheet();
  S.user = null; S.out = false; S.mode = 'in'; S.sec = fresh(); S.step = 1; S.mine = []; S.all = [];
  ['session', 'mine', 'all'].forEach(k => Store.del(k));
  DB.del('draft').catch(() => {});
  go('auth');
  if (msg) toast(msg);
}
function applyRole() {
  const admin = !!S.user && S.user.role === 'Admin';
  $('#tabRiwayat').hidden = !admin;
  $('.tabs .bar').classList.toggle('two', !admin);
  if (!admin && S.tab === 'riwayat') go('home');
}
async function sync(loud) {
  if (!S.user || S.syncing) return;
  S.syncing = true;
  if (S.tab === 'home') renderHome();
  try {
    const j = await Api.call('sync', creds());
    S.user = Object.assign({}, j.user, { kode: S.user.kode });
    S.toko = j.toko; S.jabatan = j.jabatan; S.mine = revive(j.mine);
    Store.set('session', S.user); Store.set('toko', j.toko); Store.set('jabatan', j.jabatan); Store.set('mine', j.mine);
    applyRole();
  } catch (e) {
    if (e.code === 'AUTH') { S.syncing = false; return logout('Nama atau kode akses berubah. Silakan masuk lagi.'); }
    if (loud || e.code === 'SETUP') toast(e.message);
  } finally {
    S.syncing = false;
  }
  if (S.tab === 'home') renderHome();
  if (S.tab === 'nilai' && S.step === 1) renderS1();
}

/* ---------- navigasi ---------- */
function go(tab) {
  ddClose(); stopRec(true); stopPlay();
  if (!S.user) tab = 'auth';
  else if (tab === 'auth' || (tab === 'riwayat' && S.user.role !== 'Admin')) tab = 'home';
  S.tab = tab;
  const auth = tab === 'auth';
  $$('.view').forEach(v => { v.hidden = v.id !== 'v-' + tab; });
  $('.top').hidden = auth; $('.tabs').hidden = auth;
  $$('.tabs button').forEach(b => (b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  if (auth) renderAuth();
  if (tab === 'home') renderHome();
  if (tab === 'nilai') setStep(S.step);
  if (tab === 'riwayat') { renderRiwayat(); loadAll(); }
  window.scrollTo(0, 0);
}
const hasDraft = () => !!S.f.din.trim() || KEYS.some(k => S.sec[k].text.trim() || S.sec[k].photos.length || S.sec[k].clips.length);
const weekStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d; };
const asPending = r => Object.assign({}, r, { at: new Date(r.at), wait: true });
const mine = () => [...S.queue.filter(r => lower(r.pen) === lower(S.user.nama)).map(asPending), ...S.mine].sort((a, b) => b.at - a.at);

function renderHome() {
  const list = mine(), today = new Date(), ws = weekStart();
  $('#hName').textContent = S.user.nama;
  $('#hDate').textContent = fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#stToday').textContent = list.filter(r => sameDay(r.at, today)).length;
  $('#stWeek').textContent = list.filter(r => r.at >= ws).length;
  $('#stAll').textContent = list.length;
  $('#draftCard').hidden = !hasDraft();
  $('#draftSub').textContent = S.f.din ? `${S.f.din}${S.f.jdin ? ' · ' + S.f.jdin : ''}` : 'Belum selesai';
  $('#sendNow').hidden = !list.some(r => r.wait);
  const shown = list.slice(0, S.homeLimit);
  $('#myList').innerHTML = list.length
    ? groupHtml(shown, false) + (list.length > shown.length ? `<button type="button" class="btn-soft" id="moreMine">Tampilkan lebih banyak</button>` : '')
    : `<p class="empty">${S.syncing ? 'Memuat…' : 'Belum ada penilaian'}</p>`;
}

/* ---------- daftar riwayat ---------- */
function dayLabel(d) {
  const t = new Date(), y = new Date(t); y.setDate(t.getDate() - 1);
  if (sameDay(d, t)) return 'Hari ini';
  if (sameDay(d, y)) return 'Kemarin';
  return fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
}
function rowHtml(h, showPen) {
  const foto = KEYS.reduce((a, k) => a + h.sec[k].photos.length, 0);
  const suara = KEYS.reduce((a, k) => a + h.sec[k].clips.length, 0);
  const st = h.wait ? `<span class="${h.err ? 'err' : 'wait'}" title="${h.err ? 'Gagal terkirim' : 'Menunggu kirim'}" aria-label="${h.err ? 'Gagal terkirim' : 'Menunggu kirim'}">${ICON('cloud')}</span>` : '';
  return `<button type="button" class="hrow" data-h="${esc(h.id)}"><span class="av">${initial(h.din)}</span>
    <span class="hmain"><b>${esc(h.din)} <em>${esc(h.jdin)}</em></b><small>${esc(h.toko)} · ${fmtTime(h.at)}${showPen ? ' · ' + esc(h.pen) : ''}</small></span>
    <span class="hmeta">${st}${foto ? `<span>${ICON('img')}${foto}</span>` : ''}${suara ? `<span>${ICON('mic')}${suara}</span>` : ''}</span></button>`;
}
function groupHtml(list, showPen) {
  const groups = [];
  list.forEach(h => { const l = dayLabel(h.at), g = groups.find(x => x.l === l); g ? g.items.push(h) : groups.push({ l, items: [h] }); });
  return groups.map(g => `<p class="gh">${g.l}</p><div class="card hlist">${g.items.map(h => rowHtml(h, showPen)).join('')}</div>`).join('');
}
function filtered() {
  const q = lower(S.q.trim()), t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const since = S.ft.tgl === 'all' ? null : S.ft.tgl === 'today' ? t0 : new Date(t0 - (Number(S.ft.tgl) - 1) * 864e5);
  return S.all.filter(h => (!q || lower([h.din, h.toko, h.pen].join(' ')).includes(q))
    && (!S.ft.toko || h.toko === S.ft.toko) && (!S.ft.pen || h.pen === S.ft.pen) && (!since || h.at >= since));
}
function renderRiwayat() {
  ['fToko', 'fPenF', 'fTgl'].forEach(ddPaint);
  $('#fToko').classList.toggle('set', !!S.ft.toko);
  $('#fPenF').classList.toggle('set', !!S.ft.pen);
  $('#fTgl').classList.toggle('set', S.ft.tgl !== 'all');
  const list = filtered(), shown = list.slice(0, S.allLimit);
  $('#histCount').textContent = S.loadingAll && !S.all.length ? 'Memuat…' : `${list.length} penilaian${S.loadingAll ? ' · memperbarui…' : ''}`;
  if (S.allErr && !S.all.length) {
    $('#histList').innerHTML = `<p class="empty">${esc(S.allErr)}</p><button type="button" class="btn-soft" id="reloadAll">Coba lagi</button>`;
    return;
  }
  $('#histList').innerHTML = list.length
    ? groupHtml(shown, true) + (list.length > shown.length ? `<button type="button" class="btn-soft" id="moreAll">Tampilkan lebih banyak</button>` : '')
    : `<p class="empty">${S.loadingAll ? 'Memuat…' : S.all.length ? 'Tidak ada yang cocok' : 'Belum ada penilaian'}</p>`;
}
async function loadAll() {
  if (S.loadingAll || !S.user) return;
  S.loadingAll = true; S.allErr = ''; renderRiwayat();
  try {
    const j = await Api.call('riwayat', creds(), 60000);
    S.all = revive(j.all); Store.set('all', j.all);
  } catch (e) {
    if (e.code === 'AUTH') { S.loadingAll = false; return logout('Nama atau kode akses berubah. Silakan masuk lagi.'); }
    if (e.code === 'ROLE') { S.user.role = 'Member'; Store.set('session', S.user); S.loadingAll = false; applyRole(); return toast('Akses admin sudah dicabut'); }
    S.allErr = e.message;
    if (S.all.length) toast(e.message);
  } finally {
    S.loadingAll = false;
  }
  if (S.tab === 'riwayat') renderRiwayat();
}
function findRec(id) {
  const q = S.queue.find(x => x.id === id);
  return q ? asPending(q) : (S.mine.find(x => x.id === id) || S.all.find(x => x.id === id));
}
function openDetail(id) {
  const h = findRec(id);
  if (!h) return;
  const status = !h.wait ? ''
    : h.err ? `<dt>Status</dt><dd class="err">${ICON('cloud')}Gagal: ${esc(h.err)}</dd>`
    : `<dt>Status</dt><dd class="wait">${ICON('cloud')}Menunggu kirim</dd>`;
  openSheet(`<div class="sheet-head"><div class="who" style="padding:0"><span class="av">${initial(h.din)}</span><div><b>${esc(h.din)}</b><small>${esc(h.jdin)}</small></div></div><button type="button" class="round sm" data-close aria-label="Tutup">${ICON('x')}</button></div>
    <dl>${metaRows(h)}${status}</dl>${secCards(h.sec)}
    ${h.wait ? `<button type="button" class="btn-soft" id="retryBtn">${ICON('send')}Kirim sekarang</button>` : ''}`);
  hydrate($('#sheetBody'));
}
async function unduhExcel(btn) {
  const list = filtered();
  if (!list.length) return toast('Tidak ada data untuk diunduh');
  busy(btn, true, 'Menyiapkan…');
  try {
    if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const link = id => `https://drive.google.com/file/d/${id}/view`;
    const rows = list.map(h => {
      const o = { 'Tanggal': fmtYMD(h.at), 'Jam': fmtTime(h.at).replace('.', ':'), 'Toko': h.toko, 'Penilai': h.pen, 'Jabatan Penilai': h.jpen, 'Dinilai': h.din, 'Jabatan Dinilai': h.jdin };
      KEYS.forEach(k => {
        const s = h.sec[k], L = SEC[k].label;
        o[L] = s.text;
        if (SEC[k].photo) o['Foto ' + L] = s.photos.map(link).join('\n');
        o['Suara ' + L] = s.clips.map(c => link(c.id)).join('\n');
      });
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: /^(Situasi|Tindakan|Komunikasi)$/.test(k) ? 40 : /Foto|Suara/.test(k) ? 28 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Riwayat');
    XLSX.writeFile(wb, `ComHost Riwayat ${fmtYMD(new Date())}.xlsx`);
  } catch (e) {
    toast('Gagal membuat Excel. Cek koneksi lalu coba lagi.');
  } finally { busy(btn, false); }
}
const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });

/* ---------- media (foto & rekaman tersimpan) ---------- */
const MEDIA = new Map();
function media(fid) {
  if (!MEDIA.has(fid)) {
    MEDIA.set(fid, Api.call('media', Object.assign(creds(), { id: fid }), 60000)
      .then(j => URL.createObjectURL(fromB64(j.data, j.mime)))
      .catch(e => { MEDIA.delete(fid); throw e; }));
  }
  return MEDIA.get(fid);
}
function hydrate(root) {
  root.querySelectorAll('.ph.load[data-fid]').forEach(async el => {
    try { const u = await media(el.dataset.fid); el.dataset.src = u; el.innerHTML = `<img src="${u}" alt="">`; }
    catch (e) { el.classList.add('err'); el.innerHTML = ICON('img'); el.title = e.message; }
    finally { el.classList.remove('load'); }
  });
  root.querySelectorAll('.play[data-fid]').forEach(el => { media(el.dataset.fid).then(u => { el.dataset.src = u; }).catch(() => {}); });
}
const player = $('#player');
let playing = null, silentUrl = null;
function unlockPlayer() {
  if (!silentUrl) silentUrl = URL.createObjectURL(wavBlob(new Float32Array(800), 16000));
  player.src = silentUrl;
  const p = player.play();
  if (p && p.catch) p.catch(() => {});
}
function stopPlay() {
  if (!playing) return;
  player.pause();
  playing.btn.innerHTML = ICON('play'); playing.bar.style.width = '0'; playing = null;
}
async function playClip(btn) {
  if (playing && playing.btn === btn) return stopPlay();
  stopPlay();
  let src = btn.dataset.src;
  if (!src) {
    unlockPlayer();   // iPhone: aktifkan pemutar selagi masih dalam ketukan, sebelum menunggu unduhan
    btn.innerHTML = '<span class="spin"></span>';
    try { src = await media(btn.dataset.fid); btn.dataset.src = src; }
    catch (e) { btn.innerHTML = ICON('play'); return toast(e.message); }
    btn.innerHTML = ICON('play');
  }
  playing = { btn, bar: btn.parentElement.querySelector('.wave i'), dur: Number(btn.dataset.dur) || 0 };
  player.src = src;
  try { await player.play(); btn.innerHTML = ICON('pause'); }
  catch (e) { stopPlay(); toast('Rekaman tidak bisa diputar di perangkat ini'); }
}
player.addEventListener('timeupdate', () => {
  if (!playing) return;
  const d = isFinite(player.duration) && player.duration > 0 ? player.duration : playing.dur;
  if (d) playing.bar.style.width = Math.min(100, (player.currentTime / d) * 100) + '%';
});
player.addEventListener('ended', stopPlay);
function openLb(src) { $('#lbImg').src = src; $('#lightbox').hidden = false; }
function closeLb() { $('#lightbox').hidden = true; $('#lbImg').removeAttribute('src'); }

/* ---------- nilai ---------- */
function setStep(n) {
  if (n !== 2) { stopRec(true); stopPlay(); }
  S.step = n;
  ['s1', 's2', 's3'].forEach((id, i) => { $('#' + id).hidden = i + 1 !== n; });
  $$('#steps span').forEach((s, i) => s.classList.toggle('on', i < n));
  if (n === 1) renderS1();
  if (n === 2) renderS2();
  if (n === 3) renderS3();
  window.scrollTo(0, 0);
}
function renderS1() {
  if (!hasDraft()) S.f.at = new Date();
  $('#mDate').textContent = fmtDate(S.f.at);
  $('#mTime').textContent = fmtTime(S.f.at);
  $('#mPen').textContent = S.user.nama;
  const tv = $('#tokoVal');
  tv.textContent = S.f.toko || 'Pilih toko';
  tv.className = S.f.toko ? '' : 'ph';
  if (document.activeElement !== $('#fDin')) $('#fDin').value = S.f.din;
  ddPaint('fJDin');
  const names = [...new Set([...S.names, ...S.mine.map(r => r.din)])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'id'));
  $('#dlNama').innerHTML = names.map(n => `<option value="${esc(n)}"></option>`).join('');
}
function checkS1() {
  const need = [['toko', '#tokoBtn', 'Pilih toko dulu'], ['din', '#fDin', 'Isi nama yang dinilai'], ['jdin', '#fJDin', 'Pilih jabatan yang dinilai']];
  for (const [k, sel, msg] of need) if (!String(S.f[k]).trim()) { flag($(sel)); return toast(msg); }
  setStep(2);
}
const secHead = k => `<div class="sec-h"><span class="ib">${ICON(SEC[k].ic)}</span><h2>${SEC[k].label}</h2></div>`;
function buildSecs() {
  $('#secs').innerHTML = KEYS.map(k => `
    <div class="card sec s-${k}" id="sec-${k}">
      ${secHead(k)}
      ${SEC[k].photo ? `<div class="photos" data-sec="${k}"></div>` : ''}
      <textarea class="input ta" id="t-${k}" data-k="${k}" rows="3" placeholder="${SEC[k].ph}" aria-label="${SEC[k].label}"></textarea>
      <div class="clips" data-clips="${k}"></div>
      <div class="vbtns">
        <button type="button" class="vbtn" data-dikte="${k}">${ICON('mic')}<span>Dikte</span></button>
        <button type="button" class="vbtn" data-rekam="${k}">${ICON('rec')}<span>Rekam</span></button>
      </div>
    </div>`).join('');
}
function renderS2() {
  $('#whoChip').innerHTML = `<span class="av">${initial(S.f.din)}</span><div><b>${esc(S.f.din)}</b><small>${esc(S.f.jdin)} · ${esc(S.f.toko)}</small></div>`;
  KEYS.forEach(k => { $('#t-' + k).value = S.sec[k].text; renderPhotos(k); renderClips(k); });
}
function renderPhotos(k) {
  const el = $(`.photos[data-sec="${k}"]`);
  if (!el) return;
  const ps = S.sec[k].photos;
  el.innerHTML = ps.map((p, i) => `<div class="ph"><img src="${p.url}" alt="Foto ${i + 1}" data-view="${p.url}"><button type="button" class="x" data-delp="${k}:${i}" aria-label="Hapus foto">${ICON('x')}</button></div>`).join('')
    + (ps.length < CONFIG.MAX_FOTO ? `<button type="button" class="ph add" data-addp="${k}" aria-label="Tambah foto">${ICON('cam')}<span>Foto</span></button>` : '')
    + (ps.length ? `<span class="cnt">${ps.length} foto</span>` : '');
}
const clipHtml = (c, del) => `<div class="clip"><button type="button" class="play" ${c.url ? `data-src="${c.url}"` : `data-fid="${esc(c.id)}"`} data-dur="${c.dur || 0}" aria-label="Putar rekaman">${ICON('play')}</button><div class="wave"><i></i></div><b>${c.dur ? fmtDur(c.dur) : 'Suara'}</b>${del ? `<button type="button" class="x2" data-delc="${del}" aria-label="Hapus rekaman">${ICON('x')}</button>` : ''}</div>`;
function renderClips(k) {
  $(`[data-clips="${k}"]`).innerHTML = S.sec[k].clips.map((c, i) => clipHtml(c, `${k}:${i}`)).join('');
}
async function checkS2() {
  await stopRec(true);
  if (transcribing) return toast('Tunggu, dikte sedang ditulis');
  for (const k of KEYS) {
    const s = S.sec[k];
    if (!s.text.trim() && !s.clips.length) {
      const card = $('#sec-' + k);
      flag(card); card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return toast(`Isi ${SEC[k].label} dulu`);
    }
  }
  setStep(3);
}
function secCards(o) {
  return KEYS.map(k => {
    const s = o[k];
    const ph = s.photos.length ? `<div class="photos">${s.photos.map(p => (typeof p === 'string'
      ? `<button type="button" class="ph view load" data-fid="${esc(p)}" aria-label="Lihat foto"><span class="spin"></span></button>`
      : `<button type="button" class="ph view" data-src="${p.url}" aria-label="Lihat foto"><img src="${p.url}" alt=""></button>`)).join('')}</div>` : '';
    const cl = s.clips.length ? `<div class="clips">${s.clips.map(c => clipHtml(c)).join('')}</div>` : '';
    return `<div class="card sec s-${k}">${secHead(k)}${ph}${s.text.trim() ? `<p class="txt">${esc(s.text.trim())}</p>` : ''}${cl}</div>`;
  }).join('');
}
const metaRows = r => `
  <dt>Toko</dt><dd>${esc(r.toko)}</dd>
  <dt>Waktu</dt><dd>${fmtDate(r.at)} · ${fmtTime(r.at)}</dd>
  <dt>Penilai</dt><dd>${esc(r.pen)} <em>${esc(r.jpen)}</em></dd>
  <dt>Dinilai</dt><dd>${esc(r.din)} <em>${esc(r.jdin)}</em></dd>`;
function renderS3() {
  $('#sumHead').innerHTML = metaRows(Object.assign({}, S.f, { pen: S.user.nama, jpen: S.user.jabatan }));
  $('#sumBody').innerHTML = secCards(S.sec);
}

/* ---------- kirim & antrean ---------- */
async function kirim(btn) {
  const rec = {
    id: newId(), at: S.f.at.toISOString(), toko: S.f.toko, din: S.f.din.trim(), jdin: S.f.jdin,
    pen: S.user.nama, jpen: S.user.jabatan, sec: S.sec, auth: creds(), created: Date.now()
  };
  busy(btn, true, 'Mengirim…');
  try { await DB.qPut(rec); }
  catch (e) { busy(btn, false); return toast('Gagal menyimpan di HP. Kosongkan memori lalu coba lagi.'); }
  S.queue.push(rec);
  if (!S.names.includes(rec.din)) { S.names.push(rec.din); Store.set('names', S.names.slice(-200)); }
  Store.set('lastToko', rec.toko);
  S.f = { toko: rec.toko, din: '', jdin: '', at: new Date() };
  S.sec = fresh(); S.step = 1;
  DB.del('draft').catch(() => {});
  let err = null;
  try { await sendOne(rec); } catch (e) { err = e; if (!e.net) { rec.err = e.message; DB.qPut(rec).catch(() => {}); } }
  busy(btn, false);
  if (!err) {
    $('#doneSub').textContent = `${rec.din} · ${fmtTime(new Date(rec.at))}`;
    $('#done').hidden = false;
    sync();
    await wait(1500);
    $('#done').hidden = true;
  } else {
    toast(err.net ? 'Tersimpan. Terkirim otomatis saat online' : `${err.message}. Tersimpan, coba kirim lagi nanti`);
  }
  go('home');
}
async function sendOne(rec) {
  const sec = {};
  for (const k of KEYS) {
    const s = rec.sec[k];
    sec[k] = {
      text: s.text.trim(),
      photos: await Promise.all(s.photos.map(async p => ({ mime: p.blob.type || 'image/jpeg', data: await toB64(p.blob) }))),
      clips: await Promise.all(s.clips.map(async c => ({ mime: c.mime || c.blob.type, dur: c.dur, data: await toB64(c.blob) })))
    };
  }
  await Api.call('submit', Object.assign({}, rec.auth, { record: { id: rec.id, at: rec.at, toko: rec.toko, din: rec.din, jdin: rec.jdin, sec } }), 180000);
  await DB.qDel(rec.id).catch(() => {});
  S.queue = S.queue.filter(x => x.id !== rec.id);
}
let flushing = false;
async function flushQueue(loud) {
  if (flushing || !S.queue.length) return;
  if (navigator.onLine === false) { if (loud) toast('Belum ada koneksi internet'); return; }
  flushing = true;
  let sent = 0, netErr = null;
  try {
    for (const rec of [...S.queue]) {
      try { await sendOne(rec); sent++; continue; } catch (e) { netErr = e.net ? e : null; if (e.net) break; rec.err = e.message; }
      // Kode akses diganti setelah penilaian dibuat: kirim ulang dengan akun yang sedang masuk.
      if (S.user && lower(S.user.nama) === lower(rec.pen) && S.user.kode !== rec.auth.kode) {
        rec.auth = creds();
        try { await sendOne(rec); sent++; continue; } catch (e) { rec.err = e.message; }
      }
      DB.qPut(rec).catch(() => {});
    }
  } finally { flushing = false; }
  if (sent) { toast(sent > 1 ? `${sent} penilaian terkirim` : 'Penilaian terkirim'); await sync(); }
  else if (loud) toast(netErr ? netErr.message : 'Belum bisa dikirim, coba lagi nanti');
  if (S.tab === 'home') renderHome();
}
async function manualFlush(btn) {
  busy(btn, true, 'Mengirim…');
  await flushQueue(true);
  busy(btn, false);
  if (btn.id === 'retryBtn') closeSheet();
}

/* ---------- draft ---------- */
let draftT;
function saveDraftNow() {
  clearTimeout(draftT);
  if (!S.user) return;
  if (!hasDraft()) { DB.del('draft').catch(() => {}); return; }
  DB.set('draft', { owner: S.user.nama, f: Object.assign({}, S.f, { at: S.f.at.toISOString() }), sec: S.sec }).catch(() => {});
}
function saveDraft() { clearTimeout(draftT); draftT = setTimeout(saveDraftNow, 500); }

/* ---------- foto ---------- */
function pickPhoto(k) {
  S.pk = k;
  openSheet(`<div class="sheet-head"><h2>Tambah foto</h2><button type="button" class="round sm" data-close aria-label="Tutup">${ICON('x')}</button></div>
    <div class="opts">
      <button type="button" class="opt" data-src="cam"><span class="ib">${ICON('cam')}</span>Kamera</button>
      <button type="button" class="opt" data-src="gal"><span class="ib">${ICON('img')}</span>Galeri</button>
    </div>`);
}
async function compress(file) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) {
    src = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(file); });
  }
  const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
  const s = Math.min(1, CONFIG.FOTO_MAX_PX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  if (src.close) src.close();
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', CONFIG.FOTO_KUALITAS));
  return blob || file;
}
async function onFiles(e) {
  const files = [...e.target.files];
  e.target.value = '';
  const k = S.pk;
  if (!files.length || !k) return;
  const room = CONFIG.MAX_FOTO - S.sec[k].photos.length;
  if (room <= 0) return toast(`Maksimal ${CONFIG.MAX_FOTO} foto`);
  let ok = 0;
  for (const f of files.slice(0, room)) {
    try { const blob = await compress(f); S.sec[k].photos.push({ blob, url: URL.createObjectURL(blob) }); ok++; } catch (err) { /* lewati file rusak */ }
  }
  renderPhotos(k); saveDraft();
  if (!ok) return toast('Foto gagal diproses');
  toast(files.length > room ? `${ok} foto ditambahkan (maks ${CONFIG.MAX_FOTO})` : ok > 1 ? `${ok} foto ditambahkan` : 'Foto ditambahkan');
}

/* ---------- rekam & dikte (AI) ---------- */
// Rekaman diubah ke WAV 16 kHz mono: bisa diputar di semua HP (termasuk iPhone) dan dibaca AI dikte.
function wavBlob(f32, rate) {
  const n = f32.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const x = Math.max(-1, Math.min(1, f32[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}
async function toWav(blob) {
  if (/wav/.test(blob.type)) return blob;
  const AC = window.AudioContext || window.webkitAudioContext, OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AC || !OAC) return blob;
  const data = await blob.arrayBuffer(), ac = new AC();
  try {
    const src = await new Promise((res, rej) => { const p = ac.decodeAudioData(data, res, rej); if (p && p.then) p.then(res, rej); });
    const rate = 16000, oc = new OAC(1, Math.max(1, Math.ceil(src.duration * rate)), rate), node = oc.createBufferSource();
    node.buffer = src; node.connect(oc.destination); node.start(0);
    const out = await new Promise((res, rej) => { oc.oncomplete = e => res(e.renderedBuffer); const p = oc.startRendering(); if (p && p.then) p.then(res, rej); });
    return wavBlob(out.getChannelData(0), rate);
  } finally { if (ac.close) ac.close().catch(() => {}); }
}
let rec = null, recStarting = false, transcribing = 0;
const recLabel = (r, s) => (r.kind === 'rekam' ? `${fmtDur(s)} / ${fmtDur(CONFIG.MAX_REKAM)}` : `Selesai ${fmtDur(s)}`);
async function toggleRec(kind, k, btn) {
  if (rec) { const same = rec.k === k && rec.kind === kind; await stopRec(true); if (same) return; }
  if (recStarting || btn.disabled) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return toast('Perekam suara belum didukung di browser ini');
  recStarting = true;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { recStarting = false; return toast('Izinkan mikrofon untuk merekam'); }
  recStarting = false;
  const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
  let mr;
  try { mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
  catch (e) { stream.getTracks().forEach(t => t.stop()); return toast('Perekam suara gagal dimulai'); }
  const chunks = [], lbl = btn.querySelector('span'), idle = kind === 'rekam' ? 'Rekam' : 'Dikte';
  const r = { kind, k, btn, mr, t0: Date.now(), save: true };
  r.done = new Promise(res => {
    mr.onstop = async () => {
      if (r.stopped) return;
      r.stopped = true;
      stream.getTracks().forEach(t => t.stop());
      clearInterval(r.timer); btn.classList.remove('rec', 'on'); lbl.textContent = idle;
      const dur = Math.min(CONFIG.MAX_REKAM, Math.max(1, Math.round((Date.now() - r.t0) / 1000)));
      try {
        if (r.save && chunks.length) {
          const raw = new Blob(chunks, { type: mr.mimeType || mime || 'audio/webm' });
          if (kind === 'dikte') transcribe(k, raw, dur, btn);   // berjalan di belakang, dipantau lewat `transcribing`
          else addClip(k, await toWav(raw).catch(() => raw), dur);
        }
      } finally { res(); }
    };
  });
  mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  mr.start(1000);
  btn.classList.add(kind === 'rekam' ? 'rec' : 'on'); lbl.textContent = recLabel(r, 0);
  r.timer = setInterval(() => {
    const s = (Date.now() - r.t0) / 1000;
    if (s >= CONFIG.MAX_REKAM) { stopRec(true); toast('Maksimal 1 menit'); } else lbl.textContent = recLabel(r, Math.floor(s));
  }, 250);
  rec = r;
}
function stopRec(save) {
  if (!rec) return Promise.resolve();
  const r = rec; rec = null; r.save = save; clearInterval(r.timer);
  try { if (r.mr.state !== 'inactive') r.mr.stop(); else r.mr.onstop(); } catch (e) { r.mr.onstop(); }
  return r.done;
}
function addClip(k, blob, dur) {
  S.sec[k].clips.push({ blob, dur, mime: blob.type, url: URL.createObjectURL(blob) });
  renderClips(k); $('#sec-' + k).classList.remove('miss'); saveDraft();
}
async function transcribe(k, raw, dur, btn) {
  transcribing++;
  const lbl = btn.querySelector('span');
  btn.disabled = true; btn.classList.add('busy'); lbl.textContent = 'Menulis…';
  const wav = await toWav(raw).catch(() => raw);
  try {
    if (!S.user) throw new ApiError('Masuk dulu', 'AUTH');
    const j = await Api.call('transcribe', Object.assign(creds(), { mime: wav.type, data: await toB64(wav) }), 90000);
    const t = String(j.text || '').trim();
    if (!t) { toast('Suara kurang jelas, coba ulangi'); return; }
    const cur = S.sec[k].text.trim();
    S.sec[k].text = cur ? `${cur} ${t}` : t;
    $('#t-' + k).value = S.sec[k].text; $('#sec-' + k).classList.remove('miss'); saveDraft();
  } catch (e) {
    addClip(k, wav, dur);   // ucapan tidak hilang: disimpan sebagai rekaman
    toast(e.net ? 'Tanpa internet: disimpan sebagai rekaman' : `${e.message}. Disimpan sebagai rekaman`);
  } finally {
    transcribing--; btn.disabled = false; btn.classList.remove('busy'); lbl.textContent = 'Dikte';
  }
}

/* ---------- pengaturan ---------- */
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
function openSettings() {
  const u = S.user;
  S.out = false;
  const pending = S.queue.filter(r => lower(r.pen) === lower(u.nama)).length;
  openSheet(`<div class="sheet-head"><h2>Pengaturan</h2><button type="button" class="round sm" data-close aria-label="Tutup">${ICON('x')}</button></div>
    <div class="who acct"><span class="av">${initial(u.nama)}</span><div><b>${esc(u.nama)}</b><small>${esc(u.jabatan)} · ${esc(u.role)}</small></div></div>
    <div class="field"><span class="label">Warna</span><div class="swatches">${['mint', 'lavender', 'peach'].map(p => `<button type="button" data-pal="${p}" style="--sw:var(--sw-${p})" aria-pressed="${S.pref.pal === p}"><i></i>${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div></div>
    <div class="field"><span class="label">Tema</span><div class="seg">${[['light', 'Terang'], ['dark', 'Gelap'], ['auto', 'Otomatis']].map(([v, l]) => `<button type="button" data-th="${v}" aria-pressed="${S.pref.theme === v}">${l}</button>`).join('')}</div></div>
    ${standalone() ? '' : `<button type="button" class="btn-soft" id="installBtn">${ICON('dl')}Install aplikasi</button>`}
    <button type="button" class="btn-soft out" id="outBtn" data-pending="${pending}">${ICON('out')}<span>Keluar</span></button>
    <p class="ver">ComHost v1.0</p>`);
}
function applyPref() {
  const root = document.documentElement;
  if (S.pref.theme === 'auto') delete root.dataset.theme; else root.dataset.theme = S.pref.theme;
  if (S.pref.pal === 'mint') delete root.dataset.palette; else root.dataset.palette = S.pref.pal;
  Store.set('pref', S.pref);
}
async function install() {
  if (installEvt) { installEvt.prompt(); const c = await installEvt.userChoice.catch(() => null); installEvt = null; if (c && c.outcome === 'accepted') closeSheet(); return; }
  toast(isIOS ? 'Di iPhone: ketuk Bagikan lalu "Tambah ke Layar Utama"' : 'Buka menu browser lalu pilih "Install aplikasi"');
}

/* ---------- lembar, toast, tombol ---------- */
function openSheet(html) { ddClose(); $('#sheetBody').innerHTML = html; $('#scrim').hidden = false; $('#sheet').hidden = false; }
function closeSheet() { $('#scrim').hidden = true; $('#sheet').hidden = true; }
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.hidden = true; void t.offsetWidth;
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
}
function busy(btn, on, label) {
  if (on) {
    if (btn.dataset.label != null) return;
    btn.dataset.label = btn.innerHTML; btn.disabled = true;
    btn.innerHTML = `<span class="spin"></span>${esc(label || '')}`;
  } else if (btn.dataset.label != null) {
    btn.disabled = false; btn.innerHTML = btn.dataset.label; delete btn.dataset.label;
  }
}
function tokoSheet() {
  openSheet(`<div class="sheet-head"><h2>Toko</h2><button type="button" class="round sm" data-close aria-label="Tutup">${ICON('x')}</button></div>
    <label class="search flat">${ICON('search')}<input id="tokoQ" placeholder="Cari toko" autocomplete="off"></label>
    <div class="tlist" id="tlist"></div>`);
  const all = [...S.toko].sort((a, b) => a.localeCompare(b, 'id'));
  const draw = q => {
    $('#tlist').innerHTML = all.filter(t => lower(t).includes(lower(q))).map(t => `<button type="button" data-toko="${esc(t)}" aria-selected="${t === S.f.toko}">${esc(t)}${t === S.f.toko ? ICON('check') : ''}</button>`).join('')
      || `<p class="empty">${all.length ? 'Toko tidak ditemukan' : 'Daftar toko belum ada di sheet "Nama Toko"'}</p>`;
  };
  draw('');
  $('#tokoQ').addEventListener('input', e => draw(e.target.value));
}

/* ---------- event ---------- */
document.addEventListener('click', e => {
  if (ddOpen && !e.target.closest('#ddPop, [data-dd]')) ddClose();
  const img = e.target.closest('img[data-view]');
  if (img) return openLb(img.dataset.view);
  const t = e.target.closest('button');
  if (!t) return;
  const d = t.dataset;
  if ('ddv' in d) return ddPick(d.ddv);
  if (d.dd) return ddToggle(t);
  if (d.am) { S.mode = d.am; return renderAuth(); }
  if (d.tab) return go(d.tab);
  if (d.go) return go(d.go);
  if ('close' in d) return closeSheet();
  if ('closeLb' in d) return closeLb();
  if (d.step) return setStep(Number(d.step));
  if (d.addp) return pickPhoto(d.addp);
  if (d.src && t.classList.contains('opt')) { closeSheet(); return $(d.src === 'cam' ? '#fCam' : '#fGal').click(); }
  if (t.classList.contains('play')) return playClip(t);
  if (t.classList.contains('view')) { if (d.src) openLb(d.src); return; }
  if (d.delp) { const [k, i] = d.delp.split(':'); const [p] = S.sec[k].photos.splice(Number(i), 1); if (p) URL.revokeObjectURL(p.url); renderPhotos(k); return saveDraft(); }
  if (d.delc) { stopPlay(); const [k, i] = d.delc.split(':'); const [c] = S.sec[k].clips.splice(Number(i), 1); if (c) URL.revokeObjectURL(c.url); renderClips(k); return saveDraft(); }
  if (d.dikte) return toggleRec('dikte', d.dikte, t);
  if (d.rekam) return toggleRec('rekam', d.rekam, t);
  if (d.toko) { S.f.toko = d.toko; Store.set('lastToko', d.toko); closeSheet(); $('#tokoBtn').classList.remove('miss'); saveDraft(); return renderS1(); }
  if (d.h) return openDetail(d.h);
  if (d.pal) { S.pref.pal = d.pal; applyPref(); $$('[data-pal]').forEach(b => b.setAttribute('aria-pressed', b.dataset.pal === d.pal)); return; }
  if (d.th) { S.pref.theme = d.th; applyPref(); $$('[data-th]').forEach(b => b.setAttribute('aria-pressed', b.dataset.th === d.th)); return; }
  switch (t.id) {
    case 'setBtn': return openSettings();
    case 'tokoBtn': return tokoSheet();
    case 'toS2': return checkS1();
    case 'toS3': return checkS2();
    case 'kirim': return kirim(t);
    case 'sendNow': case 'retryBtn': return manualFlush(t);
    case 'xlsBtn': return unduhExcel(t);
    case 'reloadAll': return loadAll();
    case 'moreMine': S.homeLimit += 30; return renderHome();
    case 'moreAll': S.allLimit += 100; return renderRiwayat();
    case 'installBtn': return install();
    case 'outBtn':
      if (!S.out) {
        S.out = true;
        t.querySelector('span').textContent = Number(d.pending) ? `${d.pending} belum terkirim. Tetap keluar?` : 'Yakin keluar?';
        return;
      }
      return logout();
  }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.k) { S.sec[el.dataset.k].text = el.value; $('#sec-' + el.dataset.k).classList.remove('miss'); return saveDraft(); }
  if (el.id === 'fDin') { S.f.din = el.value; el.classList.remove('miss'); return saveDraft(); }
  if (el.id === 'aNama' || el.id === 'aKode') return el.classList.remove('miss');
  if (el.id === 'fCari') { S.q = el.value; S.allLimit = 100; renderRiwayat(); }
});
$('#authForm').addEventListener('submit', submitAuth);
$('#scrim').addEventListener('click', closeSheet);
$('#lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox' || e.target.id === 'lbImg') closeLb(); });
$('#fCam').addEventListener('change', onFiles);
$('#fGal').addEventListener('change', onFiles);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (ddOpen) { const b = $('#' + ddOpen); ddClose(); return b.focus(); }
    if (!$('#lightbox').hidden) return closeLb();
    return closeSheet();
  }
  if (ddOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const b = $$('#ddPop button'), i = b.indexOf(document.activeElement);
    b[(i + (e.key === 'ArrowDown' ? 1 : -1) + b.length) % b.length].focus();
  }
});
addEventListener('scroll', e => { if (!(e.target.closest && e.target.closest('#ddPop'))) ddClose(); }, true);
addEventListener('resize', ddClose);
addEventListener('online', () => flushQueue());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return saveDraftNow();
  if (S.user) sync().then(() => flushQueue());
});
setInterval(() => { if (S.queue.length) flushQueue(); }, 60000);

/* ---------- mulai ---------- */
async function init() {
  applyPref();
  buildSecs();
  try { S.queue = await DB.qAll(); S.queue.forEach(r => KEYS.forEach(k => attach(r.sec[k]))); } catch (e) { S.queue = []; }
  if (!S.user) { go('auth'); loadMaster(); flushQueue(); return; }
  try {
    const d = await DB.get('draft');
    if (d && d.owner === S.user.nama) { S.f = Object.assign({}, d.f, { at: new Date(d.f.at) }); S.sec = d.sec; KEYS.forEach(k => attach(S.sec[k])); }
  } catch (e) { /* draft tidak terbaca */ }
  applyRole();
  go(new URLSearchParams(location.search).get('tab') === 'nilai' ? 'nilai' : 'home');
  await sync();
  flushQueue();
}
init();
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
