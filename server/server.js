import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000
});
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('JWT_SECRET wajib diisi dan minimal 32 karakter.');

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan. Silakan coba lagi beberapa menit.' }
});
const sensitiveAuthRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan. Silakan coba lagi beberapa menit.' }
});
app.use(express.static(path.join(root, 'public')));




const publicBaseUrl = () =>
  (process.env.APP_URL || 'https://anak-asuh.vercel.app').replace(/\/$/, '');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sign(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function setAuth(res, token) {
  res.cookie('anakAsuhToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

function clearAuth(res) {
  res.clearCookie('anakAsuhToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });
}

async function auth(req, res, next) {
  try {
    const token = req.cookies?.anakAsuhToken;

    if (!token) {
      return res.status(401).json({ error: 'Belum login.' });
    }

    const payload = jwt.verify(token, JWT_SECRET);

    const { rows } = await pool.query(
      `SELECT id,email,phone_number,role,status,email_verified_at
       FROM users
       WHERE id=$1`,
      [payload.id]
    );

    const user = rows[0];

    if (!user) {
      clearAuth(res);
      return res.status(401).json({ error: 'Akun tidak ditemukan.' });
    }

    if (user.status === 'SUSPENDED') {
      clearAuth(res);
      return res.status(403).json({ error: 'Akun Anda ditangguhkan.' });
    }

    if (!user.email_verified_at) {
      clearAuth(res);
      return res.status(403).json({ error: 'Email belum diverifikasi.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      phone: user.phone_number,
      role: user.role,
      status: user.status,
      email_verified_at: user.email_verified_at
    };

    next();
  } catch (e) {
    console.error('Auth error:', e.message);
    clearAuth(res);
    return res.status(401).json({
      error: 'Sesi login tidak valid atau sudah kedaluwarsa.'
    });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }
    next();
  };
}


const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_FROM_EMAIL = process.env.BREVO_FROM_EMAIL || 'phaaajaa@gmail.com';

async function sendEmail({ to, subject, html }) {
  if (!BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY belum diset.');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: {
        name: 'AnakAsuh',
        email: BREVO_FROM_EMAIL
      },
      to: [
        {
          email: to
        }
      ],
      subject,
      htmlContent: html
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo error: ${errorText}`);
  }

  return response.json();
}
async function sendVerificationEmail(user, rawToken) {
  const url = `${publicBaseUrl()}/verify-email.html?token=${encodeURIComponent(rawToken)}`;

  await sendEmail({
    to: user.email,
    subject: 'Verifikasi Email AnakAsuh',
    html: `
      <p>Selamat datang di AnakAsuh.</p>
      <p>Klik tombol berikut untuk memverifikasi email:</p>
      <p>
        <a href="${url}"
           style="display:inline-block;padding:10px 16px;background:#16a34a;color:white;text-decoration:none;border-radius:6px;">
          Verifikasi Email
        </a>
      </p>
      <p>Link berlaku 24 jam.</p>
    `
  });
}

async function sendResetEmail(user, rawToken) {
  const url = `${publicBaseUrl()}/reset-password.html?token=${encodeURIComponent(rawToken)}`;

  await sendEmail({
    to: user.email,
    subject: 'Reset Password AnakAsuh',
    html: `
      <p>Gunakan link berikut untuk membuat password baru:</p>
      <p>
        <a href="${url}"
           style="display:inline-block;padding:10px 16px;background:#16a34a;color:white;text-decoration:none;border-radius:6px;">
          Reset Password
        </a>
      </p>
      <p>Link berlaku 1 jam.</p>
    `
  });
}


app.get('/api/health', async (req,res) => { const {rows}=await pool.query('SELECT now()'); res.json({ok:true, database:true, time:rows[0].now}); });

app.post('/api/auth/register', authRateLimit, async (req,res) => {
  const { email, password, phone, role, fullName } = req.body;
  if (!email || !password || !fullName || !['CHILD','SPONSOR'].includes(role)) return res.status(400).json({error:'Nama, email, password, dan role wajib diisi.'});
  if (password.length < 8) return res.status(400).json({error:'Password minimal 8 karakter.'});
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM users WHERE lower(email)=lower($1)', [email.trim()]);
    if (existing.rowCount) return res.status(409).json({error:'Email sudah terdaftar. Gunakan email milik Anda sendiri atau login.'});
    const hash = await bcrypt.hash(password, 12);
    const userRes = await client.query(`INSERT INTO users(email,password_hash,phone_number,role,status) VALUES($1,$2,$3,$4,'PENDING') RETURNING id,email,role,status`, [email.trim().toLowerCase(),hash,phone||null,role]);
    const user = userRes.rows[0];
    if (role === 'CHILD') await client.query('INSERT INTO child_profiles(user_id,full_name,visible) VALUES($1,$2,FALSE)', [user.id,fullName]);
    else await client.query('INSERT INTO sponsor_profiles(user_id,full_name) VALUES($1,$2)', [user.id,fullName]);
    const raw = crypto.randomBytes(32).toString('hex');
    await client.query('INSERT INTO email_verification_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval \'24 hours\')', [user.id,hashToken(raw)]);
    await client.query('COMMIT');
    try { await sendVerificationEmail(user, raw); } catch(e) { console.error(e); }
    res.status(201).json({message:'Pendaftaran berhasil. Cek email untuk verifikasi. Akun akan menunggu validasi Admin Dinas.', user:{email:user.email,role:user.role,status:user.status}});
  } catch(e) { await client.query('ROLLBACK'); console.error(e); res.status(500).json({error:'Pendaftaran gagal.'}); } finally { client.release(); }
});

app.post('/api/auth/login', authRateLimit, async (req,res) => {
  const { email,password }=req.body;
  const {rows}=await pool.query('SELECT id,email,password_hash,phone_number,role,status,email_verified_at FROM users WHERE lower(email)=lower($1)', [email||'']);
  const user=rows[0];
  if (!user || !(await bcrypt.compare(password||'',user.password_hash))) return res.status(401).json({error:'Email atau password salah.'});
  if (!user.email_verified_at) return res.status(403).json({error:'Email belum diverifikasi. Silakan cek email Anda.'});
  setAuth(res,sign(user));
  res.json({message:'Login berhasil.',user:{id:user.id,email:user.email,phone:user.phone_number,role:user.role,status:user.status}});
});

app.post('/api/auth/resend-verification', async (req,res)=>{
  const {rows}=await pool.query('SELECT id,email,role,email_verified_at FROM users WHERE lower(email)=lower($1)',[req.body.email||'']);
  const user=rows[0]; if (!user || user.email_verified_at) return res.json({message:'Jika akun membutuhkan verifikasi, email verifikasi akan dikirim ulang.'});
  const raw=crypto.randomBytes(32).toString('hex'); await pool.query('INSERT INTO email_verification_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval \'24 hours\')',[user.id,hashToken(raw)]); await sendVerificationEmail(user,raw); res.json({message:'Email verifikasi dikirim ulang.'});
});

app.get('/api/auth/verify-email', async(req,res)=>{
  const token=req.query.token; if(!token) return res.status(400).json({error:'Token tidak ada.'});
  const client=await pool.connect(); try { await client.query('BEGIN'); const {rows}=await client.query(`SELECT id,user_id FROM email_verification_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE`,[hashToken(token)]); if(!rows[0]) {await client.query('ROLLBACK'); return res.status(400).json({error:'Link verifikasi tidak valid atau sudah kedaluwarsa.'});} await client.query('UPDATE email_verification_tokens SET used_at=now() WHERE id=$1',[rows[0].id]); await client.query('UPDATE users SET email_verified_at=now(),updated_at=now() WHERE id=$1',[rows[0].user_id]); await client.query('COMMIT'); res.json({message:'Email berhasil diverifikasi. Silakan login.'}); } catch(e){await client.query('ROLLBACK');res.status(500).json({error:'Verifikasi gagal.'});} finally{client.release();}
});

app.post('/api/auth/forgot-password', sensitiveAuthRateLimit, async(req,res)=>{
  const {rows}=await pool.query('SELECT id,email FROM users WHERE lower(email)=lower($1)',[req.body.email||'']); const user=rows[0];
  if(user){ const raw=crypto.randomBytes(32).toString('hex'); await pool.query('INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval \'1 hour\')',[user.id,hashToken(raw)]); try{await sendResetEmail(user,raw);}catch(e){console.error(e);} }
  res.json({message:'Jika email terdaftar, instruksi reset password telah dikirim.'});
});

app.post('/api/auth/reset-password', sensitiveAuthRateLimit, async(req,res)=>{
  const {token,password}=req.body; if(!token||!password||password.length<8)return res.status(400).json({error:'Token dan password baru minimal 8 karakter wajib diisi.'});
  const client=await pool.connect(); try{await client.query('BEGIN');const {rows}=await client.query('SELECT id,user_id FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE',[hashToken(token)]);if(!rows[0]){await client.query('ROLLBACK');return res.status(400).json({error:'Token reset tidak valid atau kedaluwarsa.'});}const h=await bcrypt.hash(password,12);await client.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',[h,rows[0].user_id]);await client.query('UPDATE password_reset_tokens SET used_at=now() WHERE id=$1',[rows[0].id]);await client.query('COMMIT');res.json({message:'Password berhasil diubah.'});}catch(e){await client.query('ROLLBACK');res.status(500).json({error:'Reset password gagal.'});}finally{client.release();}
});

app.get('/api/auth/me', auth, async(req,res)=>res.json({user:req.user}));
app.post('/api/auth/logout',(req,res)=>{clearAuth(res);res.json({message:'Berhasil logout.'});});

app.get('/api/children', auth, async(req,res)=>{
  const q=(req.query.q||'').trim(); const {rows}=await pool.query(`SELECT cp.id,cp.full_name,cp.gender,cp.birth_date,cp.total_points,cp.active_sponsors_count FROM child_profiles cp JOIN users u ON u.id=cp.user_id WHERE cp.visible=true AND u.status='ACTIVE' AND ($1='' OR cp.full_name ILIKE '%'||$1||'%') ORDER BY (cp.total_points::numeric/(cp.active_sponsors_count+1)) DESC, cp.total_points DESC`,[q]); res.json({children:rows});
});

app.get('/api/admin/pending', auth, requireRole('ADMIN'), async(req,res)=>{
  const {rows}=await pool.query(`SELECT u.id,u.email,u.phone_number,u.role,u.status,u.email_verified_at,u.created_at, COALESCE(cp.full_name,sp.full_name) AS full_name FROM users u LEFT JOIN child_profiles cp ON cp.user_id=u.id LEFT JOIN sponsor_profiles sp ON sp.user_id=u.id WHERE u.status='PENDING' ORDER BY u.created_at ASC`);
  res.json({users:rows});
});

app.post('/api/admin/users/:id/approve', auth, requireRole('ADMIN'), async(req,res)=>{
  const id=req.params.id;
  const client=await pool.connect();
  try { await client.query('BEGIN'); const {rows}=await client.query('SELECT id,role FROM users WHERE id=$1 FOR UPDATE',[id]); if(!rows[0]){await client.query('ROLLBACK');return res.status(404).json({error:'Pengguna tidak ditemukan.'});} await client.query(`UPDATE users SET status='ACTIVE',updated_at=now() WHERE id=$1`,[id]); if(rows[0].role==='CHILD') await client.query(`UPDATE child_profiles SET visible=true,updated_at=now() WHERE user_id=$1`,[id]); await client.query('COMMIT'); res.json({message:'Akun diaktifkan.'}); } catch(e){await client.query('ROLLBACK');res.status(500).json({error:'Gagal mengaktifkan akun.'});} finally{client.release();}
});

app.post('/api/admin/users/:id/suspend', auth, requireRole('ADMIN'), async(req,res)=>{
  const id=req.params.id; await pool.query(`UPDATE users SET status='SUSPENDED',updated_at=now() WHERE id=$1`,[id]); await pool.query(`UPDATE child_profiles SET visible=false,updated_at=now() WHERE user_id=$1`,[id]); res.json({message:'Akun ditangguhkan.'});
});

app.get('/api/profile', auth, async(req,res)=>{
  if(req.user.role==='CHILD'){const {rows}=await pool.query(`SELECT u.email,u.phone_number,cp.* FROM users u JOIN child_profiles cp ON cp.user_id=u.id WHERE u.id=$1`,[req.user.id]);return res.json({profile:rows[0]});}
  if(req.user.role==='SPONSOR'){const {rows}=await pool.query(`SELECT u.email,u.phone_number,sp.* FROM users u JOIN sponsor_profiles sp ON sp.user_id=u.id WHERE u.id=$1`,[req.user.id]);return res.json({profile:rows[0]});}
  res.json({profile:req.user});
});

app.put('/api/profile', auth, async(req,res)=>{
  const {fullName,phone,gender,birthDate,education,classSemester,school,achievements,training,jobTitle,jobCategory,monthlyIncome,address} = req.body;
  await pool.query('UPDATE users SET phone_number=COALESCE($1,phone_number),updated_at=now() WHERE id=$2',[phone||null,req.user.id]);
  if(req.user.role==='CHILD') await pool.query(`UPDATE child_profiles SET full_name=COALESCE($1,full_name),gender=$2,birth_date=$3,education_level=$4,class_semester=$5,school=$6,achievements=$7,training=$8,updated_at=now() WHERE user_id=$9`,[fullName||null,gender||null,birthDate||null,education||null,classSemester||null,school||null,achievements||null,training||null,req.user.id]);
  if(req.user.role==='SPONSOR') await pool.query(`UPDATE sponsor_profiles SET full_name=COALESCE($1,full_name),job_title=$2,job_category=$3,monthly_income=$4,address_ktp=$5,updated_at=now() WHERE user_id=$6`,[fullName||null,jobTitle||null,jobCategory||null,monthlyIncome||null,address||null,req.user.id]);
  res.json({message:'Profil berhasil disimpan.'});
});

app.get('/admin', (req,res)=>res.sendFile(path.join(root,'public','admin.html')));

app.use((req,res,next)=>{ if(req.path.startsWith('/api/')) return next(); res.sendFile(path.join(root,'public','app.html')); });

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Terjadi kesalahan server.'});});

export default app;
