-- Manual Supabase Migration Dump
-- Generated on: 2026-03-22T01:34:17.446Z

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. DDL (SCHEMA)
CREATE TABLE public.monthly_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  pet_name text NOT NULL,
  pet_breed text,
  owner_name text NOT NULL,
  owner_address text,
  whatsapp text NOT NULL,
  service text NOT NULL,
  weight text NOT NULL,
  price numeric NOT NULL,
  recurrence_type text NOT NULL,
  recurrence_day integer NOT NULL,
  recurrence_time integer NOT NULL,
  is_active boolean DEFAULT true,
  payment_status text DEFAULT 'Pendente',
  payment_due_date date,
  condominium text,
  extra_services jsonb,
  pet_photo_url text,
  excluded_dates text[] DEFAULT '{}'
);

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  name text NOT NULL,
  phone text
);

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  appointment_time timestamptz NOT NULL,
  pet_name text NOT NULL,
  owner_name text NOT NULL,
  whatsapp text NOT NULL,
  service text NOT NULL,
  weight text NOT NULL,
  addons text[],
  price numeric NOT NULL,
  status text DEFAULT 'pending',
  pet_breed text,
  owner_address text,
  monthly_client_id uuid REFERENCES public.monthly_clients(id),
  condominium text,
  extra_services jsonb,
  observation text,
  responsible text
);

CREATE TABLE public.controle_bloqueio_chat (
  id SERIAL PRIMARY KEY,
  telefone varchar UNIQUE,
  bloqueado_em timestamp,
  expira_em timestamp
);

CREATE TABLE public.daycare_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  pet_name text NOT NULL,
  pet_breed text,
  is_neutered boolean,
  pet_sex text,
  pet_age text,
  has_sibling_discount boolean,
  tutor_name text NOT NULL,
  tutor_rg text,
  address text NOT NULL,
  contact_phone text NOT NULL,
  emergency_contact_name text,
  emergency_contact_phone text,
  vet_phone text,
  gets_along_with_others boolean,
  last_vaccine text,
  last_deworming text,
  last_flea_remedy text,
  has_allergies boolean,
  allergies_description text,
  needs_special_care boolean,
  special_care_description text,
  delivered_items jsonb,
  contracted_plan text,
  total_price numeric,
  payment_date date,
  status text DEFAULT 'Pendente',
  extra_services jsonb,
  pet_photo_url text,
  check_in_date date,
  check_in_time time,
  check_out_date date,
  check_out_time time,
  attendance_days integer[],
  enrollment_date date,
  payment_status text DEFAULT 'Pendente'
);

CREATE TABLE public.pet_movel_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  appointment_time timestamptz NOT NULL,
  pet_name text NOT NULL,
  pet_breed text,
  owner_name text NOT NULL,
  owner_address text,
  condominium text,
  whatsapp text NOT NULL,
  service text NOT NULL,
  weight text NOT NULL,
  addons text[],
  price numeric,
  status text DEFAULT 'AGENDADO',
  monthly_client_id uuid REFERENCES public.monthly_clients(id),
  extra_services jsonb,
  observation text,
  address text,
  condo text,
  responsible text
);

CREATE TABLE public.feriados (
  id SERIAL PRIMARY KEY,
  data date NOT NULL,
  nome text NOT NULL
);

CREATE TABLE public.hotel_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  pet_name text NOT NULL,
  pet_sex text CHECK (pet_sex = ANY (ARRAY['Macho', 'Fêmea'])),
  pet_breed text,
  is_neutered boolean,
  pet_age text,
  tutor_name text NOT NULL,
  tutor_rg text,
  tutor_address text,
  tutor_phone text NOT NULL,
  tutor_email text,
  tutor_social_media text,
  vet_phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  has_rg_document boolean DEFAULT false,
  has_residence_proof boolean DEFAULT false,
  has_vaccination_card boolean DEFAULT false,
  has_vet_certificate boolean DEFAULT false,
  has_flea_tick_remedy boolean DEFAULT false,
  flea_tick_remedy_date date,
  photo_authorization boolean DEFAULT false,
  retrieve_at_checkout boolean DEFAULT false,
  preexisting_disease text,
  allergies text,
  behavior text,
  fears_traumas text,
  wounds_marks text,
  food_brand text,
  food_quantity text,
  feeding_frequency text,
  accepts_treats text,
  special_food_care text,
  check_in_date date,
  check_in_time time,
  check_out_date date,
  check_out_time time,
  service_bath boolean DEFAULT false,
  service_transport boolean DEFAULT false,
  service_daily_rate boolean DEFAULT false,
  service_extra_hour boolean DEFAULT false,
  service_vet boolean DEFAULT false,
  service_training boolean DEFAULT false,
  total_services_price numeric,
  additional_info text,
  professional_name text,
  registration_date date,
  tutor_check_in_signature text,
  tutor_check_out_signature text,
  declaration_accepted boolean DEFAULT false,
  status text DEFAULT 'Ativo' CHECK (status = ANY (ARRAY['Ativo', 'Concluído', 'Cancelado'])),
  checked_in_at timestamp,
  checked_out_at timestamp,
  check_in_status varchar DEFAULT 'pending' CHECK (check_in_status = ANY (ARRAY['pending', 'checked_in', 'checked_out'])),
  extra_services jsonb,
  food_observations text,
  tutor_signature text,
  veterinarian text,
  responsible_signature text,
  approval_status text DEFAULT 'pending' CHECK (approval_status = ANY (ARRAY['pending', 'approved', 'rejected'])),
  approval_observation text,
  pet_weight text,
  contract_accepted boolean DEFAULT false,
  last_vaccination_date date,
  pet_photo_url text,
  payment_status text DEFAULT 'Pendente'
);

CREATE TABLE public.notifications (
  id SERIAL PRIMARY KEY,
  type varchar NOT NULL,
  data jsonb NOT NULL,
  read boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);

CREATE TABLE public.daycare_diary_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid REFERENCES public.daycare_enrollments(id),
  date date NOT NULL,
  mood text CHECK (mood = ANY (ARRAY['Animado', 'Normal', 'Sonolento', 'Agitado'])),
  behavior integer CHECK (behavior >= 1 AND behavior <= 5),
  social_outros boolean DEFAULT false,
  social_descanso boolean DEFAULT false,
  social_quieto boolean DEFAULT false,
  feeding text CHECK (feeding = ANY (ARRAY['Comeu tudo', 'Comeu pouco', 'Não comeu'])),
  needs_logs jsonb DEFAULT '[]',
  obs text,
  media_urls text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  social_notes jsonb DEFAULT '[]',
  emotional_notes jsonb DEFAULT '[]'
);

CREATE TABLE public.disabled_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  service text CHECK (service = ANY (ARRAY['BATH_GROOM', 'PET_MOVEL'])),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.service_prices (
  weight_category text PRIMARY KEY,
  bath_price numeric,
  bath_and_grooming_price numeric,
  grooming_only_price numeric,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.pets (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  name text NOT NULL,
  breed text NOT NULL,
  service text NOT NULL,
  before_image_url text NOT NULL,
  after_image_url text NOT NULL
);

-- 3. DATA (INSERTS)

-- Error reading data for public.monthly_clients: Unexpected token 'b', " boundaries"... is not valid JSON

-- Error reading data for public.clients: Unexpected token 'b', " boundaries"... is not valid JSON

-- Error reading data for public.appointments: Unexpected token 'b', " boundaries"... is not valid JSON

-- Error reading data for public.pet_movel_appointments: Unexpected token 'b', " boundaries"... is not valid JSON

-- Error reading data for public.daycare_enrollments: Unexpected token 'b', " boundaries"... is not valid JSON

-- Error reading data for public.hotel_registrations: Unexpected token 'b', " boundaries"... is not valid JSON

-- Error reading data for public.disabled_dates: Unexpected token 'b', " boundaries"... is not valid JSON

-- Error reading data for public.controle_bloqueio_chat: Unexpected token 'b', " boundaries"... is not valid JSON

-- Error reading data for public.notifications: Unexpected token 'b', " boundaries"... is not valid JSON

-- Error reading data for public.daycare_diary_entries: Unexpected token 'b', " boundaries"... is not valid JSON

-- Data for public.service_prices
INSERT INTO public.service_prices (weight_category, bath_price, bath_and_grooming_price, grooming_only_price, updated_at) VALUES 
('UP_TO_5','70','140','70','2026-03-18 00:39:00.309+00'),
('KG_10','80','160','80','2026-03-18 00:39:00.309+00'),
('KG_15','90','180','90','2026-03-18 00:39:00.309+00'),
('KG_20','100','200','100','2026-03-18 00:39:00.309+00'),
('KG_25','120','240','120','2026-03-18 00:39:00.309+00'),
('KG_30','160','310','150','2026-03-18 00:39:00.309+00'),
('OVER_30','160','310','150','2026-03-18 00:39:00.309+00');

-- Data for public.feriados
INSERT INTO public.feriados (id, data, nome) VALUES 
(1,'2025-01-01','Confraternização Universal'),
(2,'2025-03-04','Carnaval'),
(3,'2025-03-05','Quarta-feira de Cinzas'),
(4,'2025-04-18','Sexta-feira Santa'),
(5,'2025-04-21','Tiradentes'),
(6,'2025-05-01','Dia do Trabalhador'),
(7,'2025-06-19','Corpus Christi'),
(8,'2025-09-07','Independência do Brasil'),
(9,'2025-10-12','Nossa Senhora Aparecida'),
(10,'2025-11-02','Finados'),
(11,'2025-11-15','Proclamação da República'),
(12,'2025-12-25','Natal'),
(13,'2026-01-01','Confraternização Universal'),
(14,'2026-02-17','Carnaval'),
(15,'2026-02-18','Quarta-feira de Cinzas'),
(16,'2026-04-03','Sexta-feira Santa'),
(17,'2026-04-21','Tiradentes'),
(18,'2026-05-01','Dia do Trabalhador'),
(19,'2026-06-04','Corpus Christi'),
(20,'2026-09-07','Independência do Brasil'),
(21,'2026-10-12','Nossa Senhora Aparecida'),
(22,'2026-11-02','Finados'),
(23,'2026-11-15','Proclamação da República'),
(24,'2026-12-25','Natal'),
(25,'2025-07-09','Revolução Constitucionalista de 1932 (SP)'),
(26,'2026-07-09','Revolução Constitucionalista de 1932 (SP)'),
(27,'2025-01-25','Aniversário da Cidade de São Paulo'),
(28,'2025-11-20','Dia da Consciência Negra'),
(29,'2026-01-25','Aniversário da Cidade de São Paulo'),
(30,'2026-11-20','Dia da Consciência Negra');

-- Table public.pets is empty.

-- 4. AUTH USERS (MANUAL REFERENCE)
-- WARNING: Inserting directly into auth.users is complex. 
-- It's recommended to recreate these users via Supabase Dashboard or API.
-- Here is the data for reference:
/*
Email: login@sandypetshop.com, ID: 69146261-9aef-460a-bf4a-114144317bda, Hash: $2a$10$PR6Rg/h9DHImREiN3JCoquP2ms9WUSi9Ey4SbHws05IrgvJ1znMwa
Email: askrique@gmail.com, ID: b1e37896-5002-4712-b8b0-6c77bf4b6b0a, Hash: $2a$10$5TUSzIiPkbc6FFD24zadmeNKXcN0IwCp8d97mINsaJkl1ylvtPE5q
*/
