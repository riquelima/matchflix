const fs = require('fs');
const path = require('path');

const baseDir = 'C:\\Users\\henri\\.gemini\\antigravity\\brain\\7fbb3869-91a8-4ac0-ac95-a5778055584d\\.system_generated\\steps\\';

const tables = [
    { name: 'public.monthly_clients', file: baseDir + '133\\output.txt' },
    { name: 'public.clients', file: baseDir + '119\\output.txt' },
    { name: 'public.appointments', file: baseDir + '118\\output.txt' },
    { name: 'public.pet_movel_appointments', file: baseDir + '120\\output.txt' },
    { name: 'public.daycare_enrollments', file: baseDir + '121\\output.txt' },
    { name: 'public.hotel_registrations', file: baseDir + '122\\output.txt' },
    { name: 'public.disabled_dates', file: baseDir + '124\\output.txt' },
    { name: 'public.controle_bloqueio_chat', file: baseDir + '126\\output.txt' },
    { name: 'public.notifications', file: baseDir + '127\\output.txt' },
    { name: 'public.daycare_diary_entries', file: baseDir + '128\\output.txt' },
    // These had JSON directly in previous steps output
    { name: 'public.service_prices', data: [
        {"weight_category":"UP_TO_5","bath_price":"70","bath_and_grooming_price":"140","grooming_only_price":"70","updated_at":"2026-03-18 00:39:00.309+00"},
        {"weight_category":"KG_10","bath_price":"80","bath_and_grooming_price":"160","grooming_only_price":"80","updated_at":"2026-03-18 00:39:00.309+00"},
        {"weight_category":"KG_15","bath_price":"90","bath_and_grooming_price":"180","grooming_only_price":"90","updated_at":"2026-03-18 00:39:00.309+00"},
        {"weight_category":"KG_20","bath_price":"100","bath_and_grooming_price":"200","grooming_only_price":"100","updated_at":"2026-03-18 00:39:00.309+00"},
        {"weight_category":"KG_25","bath_price":"120","bath_and_grooming_price":"240","grooming_only_price":"120","updated_at":"2026-03-18 00:39:00.309+00"},
        {"weight_category":"KG_30","bath_price":"160","bath_and_grooming_price":"310","grooming_only_price":"150","updated_at":"2026-03-18 00:39:00.309+00"},
        {"weight_category":"OVER_30","bath_price":"160","bath_and_grooming_price":"310","grooming_only_price":"150","updated_at":"2026-03-18 00:39:00.309+00"}
    ]},
    { name: 'public.feriados', data: [
        {"id":1,"data":"2025-01-01","nome":"Confraternização Universal"}, {"id":2,"data":"2025-03-04","nome":"Carnaval"}, {"id":3,"data":"2025-03-05","nome":"Quarta-feira de Cinzas"}, {"id":4,"data":"2025-04-18","nome":"Sexta-feira Santa"}, {"id":5,"data":"2025-04-21","nome":"Tiradentes"}, {"id":6,"data":"2025-05-01","nome":"Dia do Trabalhador"}, {"id":7,"data":"2025-06-19","nome":"Corpus Christi"}, {"id":8,"data":"2025-09-07","nome":"Independência do Brasil"}, {"id":9,"data":"2025-10-12","nome":"Nossa Senhora Aparecida"}, {"id":10,"data":"2025-11-02","nome":"Finados"}, {"id":11,"data":"2025-11-15","nome":"Proclamação da República"}, {"id":12,"data":"2025-12-25","nome":"Natal"}, {"id":13,"data":"2026-01-01","nome":"Confraternização Universal"}, {"id":14,"data":"2026-02-17","nome":"Carnaval"}, {"id":15,"data":"2026-02-18","nome":"Quarta-feira de Cinzas"}, {"id":16,"data":"2026-04-03","nome":"Sexta-feira Santa"}, {"id":17,"data":"2026-04-21","nome":"Tiradentes"}, {"id":18,"data":"2026-05-01","nome":"Dia do Trabalhador"}, {"id":19,"data":"2026-06-04","nome":"Corpus Christi"}, {"id":20,"data":"2026-09-07","nome":"Independência do Brasil"}, {"id":21,"data":"2026-10-12","nome":"Nossa Senhora Aparecida"}, {"id":22,"data":"2026-11-02","nome":"Finados"}, {"id":23,"data":"2026-11-15","nome":"Proclamação da República"}, {"id":24,"data":"2026-12-25","nome":"Natal"}, {"id":25,"data":"2025-07-09","nome":"Revolução Constitucionalista de 1932 (SP)"}, {"id":26,"data":"2026-07-09","nome":"Revolução Constitucionalista de 1932 (SP)"}, {"id":27,"data":"2025-01-25","nome":"Aniversário da Cidade de São Paulo"}, {"id":28,"data":"2025-11-20","nome":"Dia da Consciência Negra"}, {"id":29,"data":"2026-01-25","nome":"Aniversário da Cidade de São Paulo"}, {"id":30,"data":"2026-11-20","nome":"Dia da Consciência Negra"}
    ]},
    { name: 'public.pets', data: [] }
];

const authUsers = [
    {"id":"69146261-9aef-460a-bf4a-114144317bda","email":"login@sandypetshop.com","encrypted_password":"$2a$10$PR6Rg/h9DHImREiN3JCoquP2ms9WUSi9Ey4SbHws05IrgvJ1znMwa"},
    {"id":"b1e37896-5002-4712-b8b0-6c77bf4b6b0a","email":"askrique@gmail.com","encrypted_password":"$2a$10$5TUSzIiPkbc6FFD24zadmeNKXcN0IwCp8d97mINsaJkl1ylvtPE5q"}
];

function escapeSql(val) {
    if (val === null) return 'NULL';
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'number') return val;
    if (Array.isArray(val)) {
        if (val.length === 0) return "'{}'";
        return `'${JSON.stringify(val).replace(/\[/g, '{').replace(/\]/g, '}').replace(/"/g, '')}'`;
    }
    if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
    if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
    return `'${val}'`;
}

let fullSql = `-- Manual Supabase Migration Dump
-- Generated on: ${new Date().toISOString()}

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
`;

for (const table of tables) {
    let rows = table.data;
    if (table.file) {
        try {
            const content = fs.readFileSync(table.file, 'utf8');
            const match = content.match(/<untrusted-data-.*?>(.*?)<\/untrusted-data-.*?>/s);
            if (match) {
                rows = JSON.parse(match[1]);
            }
        } catch (e) {
            fullSql += `\n-- Error reading data for ${table.name}: ${e.message}\n`;
            continue;
        }
    }

    if (!rows || rows.length === 0) {
        fullSql += `\n-- Table ${table.name} is empty.\n`;
        continue;
    }

    const columns = Object.keys(rows[0]);
    fullSql += `\n-- Data for ${table.name}\n`;
    
    // Batch inserts for performance and to avoid very long lines
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const valuesSql = batch.map(row => `(${columns.map(col => escapeSql(row[col])).join(',')})`).join(',\n');
        fullSql += `INSERT INTO ${table.name} (${columns.join(', ')}) VALUES \n${valuesSql};\n`;
    }
}

fullSql += `
-- 4. AUTH USERS (MANUAL REFERENCE)
-- WARNING: Inserting directly into auth.users is complex. 
-- It's recommended to recreate these users via Supabase Dashboard or API.
-- Here is the data for reference:
/*
`;

authUsers.forEach(u => {
    fullSql += `Email: ${u.email}, ID: ${u.id}, Hash: ${u.encrypted_password}\n`;
});

fullSql += `*/
`;

fs.writeFileSync('c:\\Users\\henri\\OneDrive\\Documentos\\Henrique\\Projetos Sistemas\\Sandy\'s PetShop\\git\\sandypetshop\\.agent\\supabase_dump.sql', fullSql);
console.log('Dump generated at .agent/supabase_dump.sql');
