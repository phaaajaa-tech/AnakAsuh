# AnakAsuh — Beta Publik

Aplikasi web AnakAsuh dengan autentikasi nyata, PostgreSQL, verifikasi email, reset password, akun Admin Dinas, dan fondasi matching anak asuh.

## Struktur

- `public/` — halaman web pengguna dan Admin Dinas
- `server/` — backend Node.js/Express
- `db/schema.sql` — skema PostgreSQL
- `server/init-db.js` — inisialisasi/update schema
- `server/create-admin.js` — membuat akun Admin Dinas dari environment variable
- `render.yaml` — konfigurasi deployment Render + PostgreSQL
- `Dockerfile` — image produksi

## Menjalankan lokal (Windows)

1. Install Node.js 20+ dan Docker Desktop.
2. Buka PowerShell di folder proyek.
3. Jalankan PostgreSQL:

   `docker compose up -d`

4. Salin `.env.example` menjadi `.env`.
5. Isi minimal `JWT_SECRET`, `ADMIN_EMAIL`, dan `ADMIN_PASSWORD`.
6. Install dependency:

   `npm install`

7. Buat tabel:

   `npm run db:init`

8. Buat Admin Dinas:

   `npm run create-admin`

9. Jalankan:

   `npm start`

10. Buka `http://localhost:3000/login.html`.

## Deployment beta publik dengan Render

File `render.yaml` sudah disiapkan untuk membuat satu web service Node.js dan satu PostgreSQL. Render mendukung Express sebagai Web Service dan memberikan URL publik `onrender.com`; web service harus listen pada `0.0.0.0` dan port dari `PORT`. Aplikasi ini sudah disiapkan demikian.

### Langkah

1. Buat repository GitHub baru, misalnya `anakasuh`.
2. Upload seluruh isi folder proyek ini ke repository tersebut. **Jangan upload `.env`**.
3. Di Render pilih **New → Blueprint** lalu hubungkan repository GitHub.
4. Render akan membaca `render.yaml` dan membuat service `anakasuh` serta PostgreSQL `anakasuh-db`.
5. Isi environment variable rahasia yang bertanda `sync: false`:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `SMTP_HOST`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `SMTP_FROM`
6. Setelah deploy, buka URL `onrender.com` yang diberikan Render.
7. Uji:
   - `/api/health`
   - `/login.html`
   - registrasi akun Anak Asuh
   - registrasi Orang Tua Angkat
   - verifikasi email
   - login
   - `/admin`

`DATABASE_URL` dan `JWT_SECRET` dibuat/diisi melalui Blueprint; `APP_URL` mengikuti URL publik Render. Jangan menaruh password database, JWT secret, atau password SMTP di HTML/JavaScript.

## Email produksi

SMTP wajib dikonfigurasi agar pengguna menerima link verifikasi dan reset password. Jika SMTP tidak diisi, aplikasi hanya menampilkan link di log server untuk mode development.

## Catatan penting beta

Versi ini sudah menggunakan autentikasi dan database nyata, tetapi beberapa modul bisnis PRD masih perlu dihubungkan penuh ke UI/backend sebelum dipakai sebagai layanan resmi: upload bukti/laporan, validasi transaksi, perubahan data DANA/QRIS anti-hijack, notifikasi, dan matching/RPS lengkap.

Untuk pembayaran nyata, gunakan QRIS/payment gateway resmi. QR demo tidak memproses pembayaran.
