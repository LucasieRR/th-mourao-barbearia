-- ============================================================
-- TH Mourão Barbearia & Spa — Schema completo
-- Execute no Supabase SQL Editor: https://supabase.com/dashboard/project/gwycwjhhdladlcvqlred/sql
-- ============================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELA: companies
-- Identifica a empresa dona dos dados (multi-tenant futuro)
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  cidade TEXT,
  telefone TEXT,
  whatsapp TEXT,
  email TEXT,
  logo_url TEXT,
  site_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inserir TH Mourão com ID fixo para referência
INSERT INTO companies (id, slug, nome, cidade, telefone, whatsapp, email, site_url)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'thmourao',
  'TH Mourão Barbearia & Spa',
  'São Paulo',
  NULL,
  NULL,
  NULL,
  'https://thmourao.com.br'
) ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- TABELA: user_roles
-- Controla permissões: admin ou professional
-- ============================================================
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'professional', 'client');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'client',
  company_id UUID REFERENCES companies(id),
  UNIQUE(user_id, role)
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own roles" ON user_roles;
DROP POLICY IF EXISTS "Service role full access" ON user_roles;
CREATE POLICY "Users see own roles" ON user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access" ON user_roles USING (auth.role() = 'service_role');

-- Função auxiliar para verificar role
CREATE OR REPLACE FUNCTION has_role(user_uuid UUID, check_role app_role)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = user_uuid AND role = check_role
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- TABELA: professionals (barbeiros)
-- ============================================================
CREATE TABLE IF NOT EXISTS professionals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) DEFAULT 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  profession TEXT DEFAULT 'Barbeiro',
  city TEXT,
  phone TEXT,
  whatsapp_number TEXT,
  avatar_url TEXT,
  bio TEXT,
  working_hours JSONB DEFAULT '{
    "monday":    {"enabled": true,  "start": "09:00", "end": "19:00"},
    "tuesday":   {"enabled": true,  "start": "09:00", "end": "19:00"},
    "wednesday": {"enabled": true,  "start": "09:00", "end": "19:00"},
    "thursday":  {"enabled": true,  "start": "09:00", "end": "19:00"},
    "friday":    {"enabled": true,  "start": "09:00", "end": "19:00"},
    "saturday":  {"enabled": true,  "start": "09:00", "end": "17:00"},
    "sunday":    {"enabled": false, "start": "09:00", "end": "13:00"}
  }',
  break_between_appointments INTEGER DEFAULT 10,
  daily_summary_enabled BOOLEAN DEFAULT false,
  daily_summary_time TIME DEFAULT '08:00',
  google_refresh_token TEXT,
  google_calendar_enabled BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active professionals" ON professionals;
DROP POLICY IF EXISTS "Professional manages own" ON professionals;
DROP POLICY IF EXISTS "Admin full access professionals" ON professionals;
CREATE POLICY "Public read active professionals" ON professionals FOR SELECT USING (active = true);
CREATE POLICY "Professional manages own" ON professionals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admin full access professionals" ON professionals USING (has_role(auth.uid(), 'admin'));

-- ============================================================
-- TABELA: services (serviços oferecidos por cada barbeiro)
-- ============================================================
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) DEFAULT 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active services" ON services;
DROP POLICY IF EXISTS "Professional manages own services" ON services;
DROP POLICY IF EXISTS "Admin full access services" ON services;
CREATE POLICY "Public read active services" ON services FOR SELECT USING (active = true);
CREATE POLICY "Professional manages own services" ON services USING (
  EXISTS (SELECT 1 FROM professionals p WHERE p.id = professional_id AND p.user_id = auth.uid())
);
CREATE POLICY "Admin full access services" ON services USING (has_role(auth.uid(), 'admin'));

-- ============================================================
-- TABELA: clients (clientes da barbearia)
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) DEFAULT 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  phone TEXT,
  whatsapp_number TEXT,
  email TEXT,
  cpf TEXT,
  data_nascimento DATE,
  notes TEXT,
  last_appointment TIMESTAMPTZ,
  total_appointments INTEGER DEFAULT 0,
  google_refresh_token TEXT,
  google_calendar_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- CPF único por empresa (não por toda a tabela — suporte a multi-tenant futuro)
  UNIQUE(company_id, cpf)
);

-- Índices
CREATE INDEX IF NOT EXISTS clients_user_id_idx ON clients(user_id);
CREATE INDEX IF NOT EXISTS clients_cpf_idx ON clients(company_id, cpf) WHERE cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS clients_company_id_idx ON clients(company_id);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Client sees own data" ON clients;
DROP POLICY IF EXISTS "Client updates own data" ON clients;
DROP POLICY IF EXISTS "Anon insert client" ON clients;
DROP POLICY IF EXISTS "Admin full access clients" ON clients;
CREATE POLICY "Client sees own data" ON clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Client updates own data" ON clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Anon insert client" ON clients FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin full access clients" ON clients USING (has_role(auth.uid(), 'admin'));

-- ============================================================
-- TABELA: appointments (agendamentos)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE appointment_source AS ENUM ('manual', 'whatsapp', 'website');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) DEFAULT 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  professional_id UUID NOT NULL REFERENCES professionals(id),
  client_id UUID REFERENCES clients(id),
  service_id UUID REFERENCES services(id),
  client_name TEXT NOT NULL,
  client_phone TEXT,
  client_cpf TEXT,
  service_name TEXT NOT NULL,
  service_price DECIMAL(10,2),
  duration_minutes INTEGER DEFAULT 30,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status appointment_status DEFAULT 'scheduled',
  source appointment_source DEFAULT 'website',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointments_professional_start_idx ON appointments(professional_id, start_time);
CREATE INDEX IF NOT EXISTS appointments_client_id_idx ON appointments(client_id);
CREATE INDEX IF NOT EXISTS appointments_status_idx ON appointments(status);
CREATE INDEX IF NOT EXISTS appointments_company_id_idx ON appointments(company_id);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Client sees own appointments" ON appointments;
DROP POLICY IF EXISTS "Anon insert appointment" ON appointments;
DROP POLICY IF EXISTS "Professional sees own appointments" ON appointments;
DROP POLICY IF EXISTS "Professional updates own appointments" ON appointments;
DROP POLICY IF EXISTS "Admin full access appointments" ON appointments;
CREATE POLICY "Client sees own appointments" ON appointments FOR SELECT USING (
  client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
);
CREATE POLICY "Anon insert appointment" ON appointments FOR INSERT WITH CHECK (true);
CREATE POLICY "Professional sees own appointments" ON appointments FOR SELECT USING (
  professional_id IN (SELECT id FROM professionals WHERE user_id = auth.uid())
);
CREATE POLICY "Professional updates own appointments" ON appointments FOR UPDATE USING (
  professional_id IN (SELECT id FROM professionals WHERE user_id = auth.uid())
);
CREATE POLICY "Admin full access appointments" ON appointments USING (has_role(auth.uid(), 'admin'));

-- ============================================================
-- TABELA: blocked_slots (bloqueios de horário)
-- ============================================================
CREATE TABLE IF NOT EXISTS blocked_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE blocked_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read blocked slots" ON blocked_slots;
DROP POLICY IF EXISTS "Professional manages own slots" ON blocked_slots;
DROP POLICY IF EXISTS "Admin full access blocked_slots" ON blocked_slots;
CREATE POLICY "Public read blocked slots" ON blocked_slots FOR SELECT USING (true);
CREATE POLICY "Professional manages own slots" ON blocked_slots USING (
  professional_id IN (SELECT id FROM professionals WHERE user_id = auth.uid())
);
CREATE POLICY "Admin full access blocked_slots" ON blocked_slots USING (has_role(auth.uid(), 'admin'));

-- ============================================================
-- TABELA: store_products (produtos afiliados da store)
-- ============================================================
CREATE TABLE IF NOT EXISTS store_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) DEFAULT 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL,
  preco DECIMAL(10,2) NOT NULL,
  preco_original DECIMAL(10,2),
  avaliacao DECIMAL(2,1) DEFAULT 5.0,
  avaliacoes INTEGER DEFAULT 0,
  badge TEXT,
  link TEXT NOT NULL,
  imagem TEXT,
  ativo BOOLEAN DEFAULT true,
  destaque BOOLEAN DEFAULT false,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE store_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active products" ON store_products;
DROP POLICY IF EXISTS "Admin full access products" ON store_products;
CREATE POLICY "Public read active products" ON store_products FOR SELECT USING (ativo = true);
CREATE POLICY "Admin full access products" ON store_products USING (has_role(auth.uid(), 'admin'));

-- ============================================================
-- MIGRAÇÃO: 14 produtos existentes da store.html
-- ============================================================
INSERT INTO store_products (company_id, nome, categoria, preco, preco_original, avaliacao, avaliacoes, badge, link, imagem, destaque, ordem) VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Balm Para Barba Bozzano Controle & Estilo 170g', 'barba', 19.90, 24.90, 4.7, 2341, 'Mais Vendido', 'https://meli.la/21BUvto', 'https://http2.mlstatic.com/D_Q_NP_2X_618381-MLA80762474684_112024-V.webp', true, 1),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Kit Barba Completo Shampoo + Óleo + Balm Viking', 'barba', 89.90, 129.90, 4.9, 1876, 'Oferta', 'https://meli.la/2gQ5QJG', 'https://http2.mlstatic.com/D_Q_NP_2X_780420-MLA80762474684_112024-V.webp', true, 2),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Shampoo Para Barba Limpeza Profunda Barba de Respeito 140ml', 'barba', 34.90, null, 4.8, 987, null, 'https://meli.la/2gQ7RXa', 'https://http2.mlstatic.com/D_Q_NP_2X_623451-MLA80341274684_112024-V.webp', false, 3),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Óleo Para Barba Hidratante Don Alcides Premium 30ml', 'barba', 29.90, 39.90, 4.6, 743, null, 'https://meli.la/2kFuj1U', 'https://http2.mlstatic.com/D_Q_NP_2X_891234-MLA80341274684_112024-V.webp', false, 4),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Pomada Capilar Modeladora Matte Efeito Fosco Forte 60g', 'cabelo', 24.90, 34.90, 4.7, 3421, 'Mais Vendido', 'https://meli.la/2kFuj1U', 'https://http2.mlstatic.com/D_Q_NP_2X_712345-MLA80341274684_112024-V.webp', true, 5),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Shampoo Antiqueda Fortalecedor Capilar Kérastase 250ml', 'cabelo', 79.90, 99.90, 4.8, 1654, null, 'https://meli.la/2kFuj1U', 'https://http2.mlstatic.com/D_Q_NP_2X_834567-MLA80341274684_112024-V.webp', false, 6),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Hidratante Facial Masculino Nivea Men Sensitive 75ml', 'skincare', 22.90, 29.90, 4.6, 2109, null, 'https://meli.la/2kFuj1U', 'https://http2.mlstatic.com/D_Q_NP_2X_956789-MLA80341274684_112024-V.webp', false, 7),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Protetor Solar Facial FPS60 L''Oréal Men Expert 50ml', 'skincare', 49.90, 64.90, 4.7, 876, 'Frete Grátis', 'https://meli.la/2kFuj1U', 'https://http2.mlstatic.com/D_Q_NP_2X_078901-MLA80341274684_112024-V.webp', false, 8),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Aparador Philips Série 3000 Barba e Cabelo MG3730', 'aparadores', 149.90, 199.90, 4.8, 4231, 'Mais Vendido', 'https://meli.la/2kFuj1U', 'https://http2.mlstatic.com/D_Q_NP_2X_198765-MLA80341274684_112024-V.webp', true, 9),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Keune 1922 By J.M. Keune Premium Clay Pomada 100ml', 'cabelo', 180.80, null, 4.8, 543, null, 'https://meli.la/1wE7J7c', 'https://http2.mlstatic.com/D_Q_NP_2X_787563-MLA107686638668_032026-V.webp', false, 10),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Keune Beard Oil Óleo De Barba Nutrição Intensa 50ml', 'barba', 327.82, null, 4.9, 234, null, 'https://meli.la/33KnRbq', 'https://http2.mlstatic.com/D_Q_NP_2X_980226-MLB94580757243_102025-V.webp', false, 11),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Kit Fibra Capilar Preta 25g Fixador Resistente Água Alta Fix', 'cabelo', 94.97, null, 4.7, 312, null, 'https://meli.la/1wtN4DC', 'https://http2.mlstatic.com/D_NQ_NP_831336-MLB110377714879_042026-O.webp', false, 12),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Máquina De Acabamento Corta Cabelo Profissional Kemei 2299 P Preto 127/220v', 'aparadores', 78.89, null, 4.6, 891, null, 'https://meli.la/2ghTFEz', 'https://http2.mlstatic.com/D_NQ_NP_982596-MLB100956707906_122025-O.webp', false, 13),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Fibra Capilar Pó De Queratina Maquiagem Cabelos E Barba 25g', 'cabelo', 77.99, null, 4.8, 178, null, 'https://meli.la/12PLZN2', 'https://http2.mlstatic.com/D_NQ_NP_747107-MLB110854766324_052026-O.webp', false, 14);

-- ============================================================
-- MIGRAÇÃO: colunas de endereço em clients (para Asaas)
-- ============================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_number TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address_complement TEXT;

-- ============================================================
-- FIM DA MIGRATION
-- Execute no SQL Editor e confirme que todas as tabelas foram criadas
-- ============================================================
