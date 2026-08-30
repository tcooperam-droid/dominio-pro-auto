-- Módulo contábil isolado do Domínio Pro.
-- Não altera appointments, employees, services, expenses ou qualquer tabela existente.

create table if not exists public.accounting_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text not null unique,
  trade_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.accounting_companies(id) on delete cascade,
  employee_id bigint not null references public.employees(id) on delete restrict,
  valid_from date not null default '2026-01-01',
  valid_until date,
  created_at timestamptz not null default now(),
  unique(company_id, employee_id, valid_from)
);

create table if not exists public.accounting_appointment_assignments (
  id uuid primary key default gen_random_uuid(),
  appointment_id bigint not null references public.appointments(id) on delete cascade,
  company_id uuid not null references public.accounting_companies(id) on delete restrict,
  employee_id bigint not null references public.employees(id) on delete restrict,
  assignment_source text not null default 'employee_membership',
  assigned_at timestamptz not null default now(),
  unique(appointment_id)
);

create table if not exists public.accounting_exports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.accounting_companies(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  format text not null,
  row_count integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.accounting_companies is 'Cadastro isolado das empresas do módulo contábil';
comment on table public.accounting_company_memberships is 'Vínculos de colaboradores por empresa, editáveis sem alterar employees';
comment on table public.accounting_appointment_assignments is 'Classificação contábil dos agendamentos, derivada da agenda';
comment on table public.accounting_exports is 'Histórico de exportações contábeis';
