CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone_number TEXT,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','CHILD','SPONSOR')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','SUSPENDED')),
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS child_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  gender TEXT,
  birth_date DATE,
  dana_number TEXT,
  qris_image_url TEXT,
  temp_dana_number TEXT,
  temp_qris_image_url TEXT,
  dana_change_status TEXT NOT NULL DEFAULT 'NONE' CHECK (dana_change_status IN ('NONE','PENDING','REJECTED')),
  total_points INTEGER NOT NULL DEFAULT 0,
  active_sponsors_count INTEGER NOT NULL DEFAULT 0,
  visible BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS child_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_profile_id UUID NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('EDUCATION','ACHIEVEMENT','BIMBEL')),
  title TEXT NOT NULL,
  detail_level TEXT,
  description TEXT,
  proof_file_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  assigned_points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sponsor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  job_title TEXT,
  job_category TEXT CHECK (job_category IN ('ASN','BUMN','PRIVATE','BUSINESS','FREELANCE')),
  monthly_income NUMERIC(14,2),
  income_proof_url TEXT,
  address_ktp TEXT,
  ktp_image_url TEXT,
  financial_points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS donation_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO donation_categories(category_name) VALUES
('Pendidikan'),('Makanan'),('Tempat Tinggal'),('Kesehatan')
ON CONFLICT (category_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS donation_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_profile_id UUID NOT NULL REFERENCES sponsor_profiles(id),
  child_profile_id UUID NOT NULL REFERENCES child_profiles(id),
  category_id UUID NOT NULL REFERENCES donation_categories(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 1000),
  proof_transfer_url TEXT,
  transaction_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (transaction_status IN ('PENDING','APPROVED','REJECTED')),
  transfer_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS progress_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_profile_id UUID NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  condition_text TEXT NOT NULL,
  education_proof_url TEXT NOT NULL,
  activity_photo_url TEXT NOT NULL,
  thank_you_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  due_date DATE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_child_visible_rps ON child_profiles(visible, total_points DESC);
CREATE INDEX IF NOT EXISTS idx_donations_child ON donation_transactions(child_profile_id);
CREATE INDEX IF NOT EXISTS idx_reports_child ON progress_reports(child_profile_id);

-- Kolom profil tambahan yang dipakai aplikasi
ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS education_level TEXT;
ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS class_semester TEXT;
ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS school TEXT;
ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS achievements TEXT;
ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS training TEXT;
