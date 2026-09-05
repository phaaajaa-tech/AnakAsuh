import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
const {Pool}=pg; const pool=new Pool({connectionString:process.env.DATABASE_URL});
const email=process.env.ADMIN_EMAIL; const password=process.env.ADMIN_PASSWORD;
if(!email||!password) throw new Error('ADMIN_EMAIL dan ADMIN_PASSWORD wajib di .env');
const hash=await bcrypt.hash(password,12);
await pool.query(`INSERT INTO users(email,password_hash,role,status,email_verified_at) VALUES($1,$2,'ADMIN','ACTIVE',now()) ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,role='ADMIN',status='ACTIVE',email_verified_at=now(),updated_at=now()`,[email,hash]);
console.log('Admin siap:',email); await pool.end();
