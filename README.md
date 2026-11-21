# ComHost

PWA (bisa di-install) untuk leader store mencatat dan memantau **hospitality** crew dengan pola **Situasi → Tindakan → Komunikasi**. Tampilan menyesuaikan HP, tablet, dan PC.

## Fitur

- **Akun**: pertama buka pilih **Buat akun** (Nama, Jabatan, Kode akses) atau **Masuk**. Riwayat penilaian tersimpan di server, jadi tetap ada saat ganti HP.
- **Beranda**: sapaan, jumlah penilaian *Hari ini / Minggu ini / Semua*, dan riwayat penilaian milik sendiri (hanya bisa dilihat, tidak bisa diubah).
- **Nilai**, tiga langkah:
  1. **Data**: Toko, nama dan jabatan yang dinilai. Penilai otomatis dari akun; tanggal dan jam otomatis.
  2. **Penilaian**: Situasi dan Tindakan (foto opsional, bisa banyak), Komunikasi. Setiap bagian wajib berisi teks, **Dikte** (suara diubah AI menjadi teks), atau **Rekam** (maks 1 menit).
  3. **Cek**: ringkasan sebelum **Kirim**.
- **Tanpa sinyal**: kiriman masuk antrean (ikon awan) dan terkirim otomatis saat online. Isian yang belum selesai tersimpan sebagai draft.
- **Riwayat** (khusus Admin): semua penilaian dari semua toko, pencarian, filter toko/penilai/tanggal, dan **Unduh Excel**.
- **Pengaturan**: warna (Mint/Lavender/Peach), tema (Terang/Gelap/Otomatis), install, keluar.

## Spreadsheet

| Sheet | Isi |
|---|---|
| `Nama Toko` | Daftar toko, hanya dibaca. Header yang dikenali: `Nama Toko`, `Toko`, `Nama Store`, `Store`, `Cabang`, `Outlet` (jika tidak ada, kolom pertama dipakai). |
| `Jabatan` | Dibuat otomatis berisi Store Leader, Asisten Leader, Kasir, Crew, Cook. Silakan diubah atau ditambah. |
| `Member` | Dibuat otomatis. Akun penilai: `Nama`, `Jabatan`, `Kode Akses`, `Role`, `Dibuat`, `Terakhir masuk`. |
| `Penilaian` | Dibuat otomatis. Satu baris per penilaian: `ID`, `Waktu`, `Tanggal`, `Jam`, `Toko`, `Penilai`, `Jabatan Penilai`, `Dinilai`, `Jabatan Dinilai`, `Situasi`, `Foto Situasi`, `Suara Situasi`, `Tindakan`, `Foto Tindakan`, `Suara Tindakan`, `Komunikasi`, `Suara Komunikasi`, `Dikirim`. |

- Foto dan rekaman disimpan di folder Google Drive **ComHost** (dibuat otomatis). Kolom foto/suara berisi tautan Drive, satu per baris; tautan suara diikuti durasinya, misalnya `(0:12)`.
- Kolom dibaca berdasarkan **nama header**, jadi urutan kolom boleh diubah. Kolom yang hilang ditambahkan otomatis di ujung kanan.
- **Jadikan Admin**: ubah `Role` di sheet `Member` menjadi `Admin`. Berlaku saat app dibuka berikutnya dalam keadaan online. Role selain `Admin` dianggap `Member`.
- **Lupa kode akses**: lihat atau ubah `Kode Akses` di sheet `Member`.

## Setup Apps Script

1. Buka spreadsheet → **Extensions → Apps Script**.
2. Ganti seluruh isi `Code.gs` dengan isi [`apps-script/Code.gs`](apps-script/Code.gs), lalu simpan.
3. Pilih fungsi **`setup`** di toolbar → **Run** → setujui izin akses (Spreadsheet dan Drive). Ini membuat sheet `Member`, `Jabatan`, `Penilaian`, dan folder Drive `ComHost`.
4. **Aktifkan AI dikte** (opsional, tapi dibutuhkan agar tombol Dikte menulis teks):
   - Buat API key gratis di [aistudio.google.com](https://aistudio.google.com) → *Get API key*.
   - Di Apps Script: **Project Settings** (ikon gerigi) → **Script properties** → **Add script property** → nama `GEMINI_API_KEY`, nilai = API key → **Save**.
   - (Opsional) tambahkan `GEMINI_MODEL` untuk memakai model lain. Default: `gemini-flash-latest`.
5. **Deploy → Manage deployments** → pilih deployment yang URL-nya sudah dipakai (`…AKfycbz6Lw2T…/exec`) → ikon pensil (**Edit**) → **Version: New version** → **Deploy**. URL tetap sama, jadi `js/config.js` tidak perlu diubah.
   Jika membuat deployment baru: *Execute as: Me*, *Who has access: Anyone*, lalu salin URL baru ke `APPS_SCRIPT_URL` di [`js/config.js`](js/config.js).

Jika app menampilkan "Apps Script belum versi ComHost", langkah 2–5 belum dilakukan. Setiap kali `Code.gs` berubah: jalankan `setup` lagi (jika diminta izin baru) lalu ulangi langkah 5.

## Hosting & install

Aplikasi berupa file statis. Cara termudah: **GitHub Pages** (Settings → Pages → Deploy from branch → pilih branch → `/ (root)`). PWA butuh HTTPS; GitHub Pages sudah HTTPS.

- **Android / Chrome / Edge**: Pengaturan → **Install aplikasi**, atau menu browser → *Install app*.
- **iPhone / iPad**: Safari → Bagikan → *Tambah ke Layar Utama*.

Setelah mengubah file app, naikkan `VERSION` di [`service-worker.js`](service-worker.js) agar perangkat mengambil versi baru.

## Catatan

- **Dikte**: ketuk *Dikte*, bicara, ketuk *Selesai*. Suara dikirim ke AI (Gemini lewat Apps Script) lalu hasilnya ditambahkan ke kolom teks. Butuh internet; jika offline atau AI belum aktif, ucapan otomatis disimpan sebagai rekaman agar tidak hilang. Claude API belum menerima input audio, karena itu dikte memakai Gemini.
- **Privasi AI**: pada API key gratis (free tier), Google dapat memakai data yang dikirim untuk meningkatkan layanannya. Untuk rekaman yang sensitif, aktifkan billing di Google AI Studio (paid tier) atau matikan AI dikte dengan menghapus `GEMINI_API_KEY`.
- **Rekam** tetap bisa dipakai tanpa internet. Dikte dan Rekam tidak berjalan bersamaan; memulai yang satu menghentikan yang lain.
- Semua rekaman baru disimpan sebagai **WAV** (16 kHz mono, sekitar 32 KB per detik) agar bisa diputar di semua HP, termasuk iPhone.
- Foto dikompres (sisi terpanjang 1280 px), maksimal 12 foto per bagian. Batas bisa diubah di [`js/config.js`](js/config.js).
- Rekaman lama yang tersimpan sebelum pembaruan ini (WebM) mungkin tidak bisa diputar di iPhone.
- `mockup.html` adalah mockup awal (data contoh) dan tidak dipakai oleh app.

## Struktur

```
index.html            halaman app
css/style.css         tampilan (token warna mengikuti Jadwalin/Loyalin)
js/config.js          URL Apps Script & batas foto/rekaman
js/api.js             koneksi Apps Script, cache, antrean (IndexedDB)
js/app.js             logika tampilan
service-worker.js     cache offline
manifest.json, icons/ data install PWA
apps-script/Code.gs   backend (tempel ke Apps Script)
```
