-- ============================================================
-- TH Mourão — Seed: Profissionais + Serviços
-- Dados extraídos do index.html
-- Execute no Supabase SQL Editor:
-- https://supabase.com/dashboard/project/gwycwjhhdladlcvqlred/sql
-- ============================================================

-- IDs fixos para facilitar referência nos serviços
-- Thiago   → prof-0001
-- Carioca  → prof-0002
-- Miranda  → prof-0003

-- ============================================================
-- PROFISSIONAIS
-- ============================================================
INSERT INTO professionals (
  id,
  company_id,
  name,
  profession,
  city,
  phone,
  whatsapp_number,
  avatar_url,
  bio,
  active,
  working_hours,
  break_between_appointments
) VALUES
(
  '00000000-0000-0000-0000-000000000001',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Thiago',
  'Master Barber',
  'Blumenau',
  '47996786835',
  '47996786835',
  null,
  'Fundador e idealizador da TH Mourão. Mais de uma década refinando técnicas e elevando a experiência da barbearia em Blumenau a outro patamar.',
  true,
  '{
    "monday":    {"enabled": true,  "start": "09:00", "end": "20:00"},
    "tuesday":   {"enabled": true,  "start": "09:00", "end": "20:00"},
    "wednesday": {"enabled": true,  "start": "09:00", "end": "20:00"},
    "thursday":  {"enabled": true,  "start": "09:00", "end": "20:00"},
    "friday":    {"enabled": true,  "start": "09:00", "end": "20:00"},
    "saturday":  {"enabled": true,  "start": "09:00", "end": "18:00"},
    "sunday":    {"enabled": false, "start": "09:00", "end": "13:00"}
  }',
  10
),
(
  '00000000-0000-0000-0000-000000000002',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Carioca',
  'Barbeiro',
  'Blumenau',
  null,
  null,
  'assets/foto-carioca.jpg',
  null,
  true,
  '{
    "monday":    {"enabled": true,  "start": "09:00", "end": "20:00"},
    "tuesday":   {"enabled": true,  "start": "09:00", "end": "20:00"},
    "wednesday": {"enabled": true,  "start": "09:00", "end": "20:00"},
    "thursday":  {"enabled": true,  "start": "09:00", "end": "20:00"},
    "friday":    {"enabled": true,  "start": "09:00", "end": "20:00"},
    "saturday":  {"enabled": true,  "start": "09:00", "end": "18:00"},
    "sunday":    {"enabled": false, "start": "09:00", "end": "13:00"}
  }',
  10
),
(
  '00000000-0000-0000-0000-000000000003',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Mauricio Miranda',
  'Barbeiro',
  'Blumenau',
  null,
  null,
  'assets/foto-miranda.jpg',
  null,
  true,
  '{
    "monday":    {"enabled": true,  "start": "09:00", "end": "20:00"},
    "tuesday":   {"enabled": true,  "start": "09:00", "end": "20:00"},
    "wednesday": {"enabled": true,  "start": "09:00", "end": "20:00"},
    "thursday":  {"enabled": true,  "start": "09:00", "end": "20:00"},
    "friday":    {"enabled": true,  "start": "09:00", "end": "20:00"},
    "saturday":  {"enabled": true,  "start": "09:00", "end": "18:00"},
    "sunday":    {"enabled": false, "start": "09:00", "end": "13:00"}
  }',
  10
)
ON CONFLICT (id) DO UPDATE SET
  name               = EXCLUDED.name,
  profession         = EXCLUDED.profession,
  bio                = EXCLUDED.bio,
  avatar_url         = EXCLUDED.avatar_url,
  active             = EXCLUDED.active,
  working_hours      = EXCLUDED.working_hours,
  updated_at         = now();

-- ============================================================
-- SERVIÇOS (tabela de preços do index.html)
-- Cada serviço é criado para TODOS os 3 barbeiros
-- Duração estimada: corte ~45min, combos ~60–90min
-- ============================================================

-- Thiago
INSERT INTO services (professional_id, company_id, name, description, duration_minutes, price, active) VALUES
('00000000-0000-0000-0000-000000000001', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo', 'Corte de cabelo com técnica e acabamento premium.', 45, 70.00, true),
('00000000-0000-0000-0000-000000000001', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Barba', 'Corte de cabelo e barba completa.', 75, 135.00, true),
('00000000-0000-0000-0000-000000000001', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Sobrancelha', 'Corte de cabelo com design de sobrancelha.', 55, 88.00, true),
('00000000-0000-0000-0000-000000000001', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Barba + Sobrancelha', 'Combo completo: corte, barba e sobrancelha.', 90, 153.00, true),
('00000000-0000-0000-0000-000000000001', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Limpeza de Pele', 'Corte de cabelo com limpeza de pele facial.', 75, 135.00, true),
('00000000-0000-0000-0000-000000000001', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Depilação (nariz + orelha)', 'Corte de cabelo com depilação de nariz e orelha.', 60, 100.00, true),
('00000000-0000-0000-0000-000000000001', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Barba + Sobrancelha + Depilação', 'Combo premium completo com todos os serviços.', 105, 183.00, true);

-- Carioca
INSERT INTO services (professional_id, company_id, name, description, duration_minutes, price, active) VALUES
('00000000-0000-0000-0000-000000000002', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo', 'Corte de cabelo com técnica e acabamento premium.', 45, 70.00, true),
('00000000-0000-0000-0000-000000000002', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Barba', 'Corte de cabelo e barba completa.', 75, 135.00, true),
('00000000-0000-0000-0000-000000000002', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Sobrancelha', 'Corte de cabelo com design de sobrancelha.', 55, 88.00, true),
('00000000-0000-0000-0000-000000000002', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Barba + Sobrancelha', 'Combo completo: corte, barba e sobrancelha.', 90, 153.00, true),
('00000000-0000-0000-0000-000000000002', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Limpeza de Pele', 'Corte de cabelo com limpeza de pele facial.', 75, 135.00, true),
('00000000-0000-0000-0000-000000000002', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Depilação (nariz + orelha)', 'Corte de cabelo com depilação de nariz e orelha.', 60, 100.00, true),
('00000000-0000-0000-0000-000000000002', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Barba + Sobrancelha + Depilação', 'Combo premium completo com todos os serviços.', 105, 183.00, true);

-- Mauricio Miranda
INSERT INTO services (professional_id, company_id, name, description, duration_minutes, price, active) VALUES
('00000000-0000-0000-0000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo', 'Corte de cabelo com técnica e acabamento premium.', 45, 70.00, true),
('00000000-0000-0000-0000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Barba', 'Corte de cabelo e barba completa.', 75, 135.00, true),
('00000000-0000-0000-0000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Sobrancelha', 'Corte de cabelo com design de sobrancelha.', 55, 88.00, true),
('00000000-0000-0000-0000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Barba + Sobrancelha', 'Combo completo: corte, barba e sobrancelha.', 90, 153.00, true),
('00000000-0000-0000-0000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Limpeza de Pele', 'Corte de cabelo com limpeza de pele facial.', 75, 135.00, true),
('00000000-0000-0000-0000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Depilação (nariz + orelha)', 'Corte de cabelo com depilação de nariz e orelha.', 60, 100.00, true),
('00000000-0000-0000-0000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Cabelo + Barba + Sobrancelha + Depilação', 'Combo premium completo com todos os serviços.', 105, 183.00, true);

-- ============================================================
-- ATUALIZAR ADMIN: vincular lucas.bnu@icloud.com como admin
-- Substitua o UUID abaixo pelo auth.uid() real do usuário
-- Para encontrar: Dashboard → Authentication → Users → copiar o ID
-- ============================================================
-- INSERT INTO user_roles (user_id, role, company_id)
-- VALUES (
--   '<UUID_DO_LUCAS>',
--   'admin',
--   'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
-- )
-- ON CONFLICT (user_id, role) DO NOTHING;

-- ============================================================
-- VERIFICAÇÃO
-- ============================================================
SELECT 'professionals' AS tabela, count(*) FROM professionals WHERE company_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
UNION ALL
SELECT 'services', count(*) FROM services WHERE company_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
