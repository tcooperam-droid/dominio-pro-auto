-- ============================================================
-- Domínio Pro v2.0 — Schema Supabase
-- Execute este SQL no Supabase: SQL Editor → New Query → Run
-- ============================================================

-- Funcionários
create table if not exists employees (
  id bigserial primary key,
  name text not null,
  email text not null default '',
  phone text not null default '',
  color text not null default '#ec4899',
  photo_url text,
  specialties jsonb not null default '[]',
  commission_percent numeric not null default 0,
  working_hours jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Serviços
create table if not exists services (
  id bigserial primary key,
  name text not null,
  description text,
  duration_minutes integer not null default 60,
  price numeric not null default 0,
  color text not null default '#ec4899',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Clientes
create table if not exists clients (
  id bigserial primary key,
  name text not null,
  email text,
  phone text,
  birth_date text,
  cpf text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

-- Agendamentos
create table if not exists appointments (
  id bigserial primary key,
  client_name text,
  client_id bigint references clients(id) on delete set null,
  employee_id bigint not null references employees(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'scheduled',
  total_price numeric,
  notes text,
  payment_status text,
  group_id text,
  services jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- Sessões de caixa
create table if not exists cash_sessions (
  id bigserial primary key,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_balance numeric not null default 0,
  total_revenue numeric,
  total_commissions numeric,
  closing_notes text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

-- Lançamentos do caixa
create table if not exists cash_entries (
  id bigserial primary key,
  session_id bigint not null references cash_sessions(id) on delete cascade,
  appointment_id bigint references appointments(id) on delete set null,
  client_name text not null default '',
  employee_id bigint not null references employees(id) on delete cascade,
  description text not null default '',
  amount numeric not null default 0,
  payment_method text not null default 'dinheiro',
  commission_percent numeric not null default 0,
  commission_value numeric not null default 0,
  is_auto_launch boolean not null default false,
  created_at timestamptz not null default now()
);

-- Log de auditoria
create table if not exists audit_logs (
  id bigserial primary key,
  entity_type text not null,
  entity_id bigint not null,
  action text not null,
  description text not null,
  user_name text,
  created_at timestamptz not null default now()
);

-- ─── Índices para performance ────────────────────────────
create index if not exists idx_appointments_start_time on appointments(start_time);
create index if not exists idx_appointments_employee_id on appointments(employee_id);
create index if not exists idx_appointments_status on appointments(status);
create index if not exists idx_cash_entries_session_id on cash_entries(session_id);
create index if not exists idx_audit_logs_entity_type on audit_logs(entity_type);

-- ─── Row Level Security (RLS) ────────────────────────────
-- Desativa RLS para uso simples (acesso via anon key)
-- Para produção com múltiplos usuários, configure políticas de acesso
alter table employees    disable row level security;
alter table services     disable row level security;
alter table clients      disable row level security;
alter table appointments disable row level security;
alter table cash_sessions disable row level security;
alter table cash_entries  disable row level security;
alter table audit_logs    disable row level security;
