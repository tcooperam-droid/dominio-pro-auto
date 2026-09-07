-- Autoriza múltiplos usuários por e-mail, mantendo o proprietário inicial.
-- O código OTP do Supabase cria/autentica a identidade; esta tabela controla o acesso ao app.

CREATE TABLE IF NOT EXISTS public.authorized_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('owner', 'manager', 'employee')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT authorized_users_email_unique UNIQUE (email)
);

CREATE UNIQUE INDEX IF NOT EXISTS authorized_users_email_lower_idx
  ON public.authorized_users (lower(email));

INSERT INTO public.authorized_users (email, display_name, role, active)
VALUES ('tcooperam@gmail.com', 'Proprietário', 'owner', true)
ON CONFLICT (email) DO UPDATE
SET display_name = EXCLUDED.display_name,
    role = 'owner',
    active = true,
    updated_at = now();

ALTER TABLE public.authorized_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.authorized_users FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.authorized_users TO authenticated;

CREATE OR REPLACE FUNCTION public.is_authorized_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.authorized_users
    WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.authorized_users
    WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      AND role = 'owner'
      AND active = true
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_authorized_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_owner_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_authorized_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner_user() TO authenticated;

DROP POLICY IF EXISTS authorized_users_self_or_owner_select ON public.authorized_users;
DROP POLICY IF EXISTS authorized_users_owner_insert ON public.authorized_users;
DROP POLICY IF EXISTS authorized_users_owner_update ON public.authorized_users;
DROP POLICY IF EXISTS authorized_users_owner_delete ON public.authorized_users;
CREATE POLICY authorized_users_self_or_owner_select ON public.authorized_users
  FOR SELECT TO authenticated
  USING (public.is_owner_user() OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
CREATE POLICY authorized_users_owner_insert ON public.authorized_users
  FOR INSERT TO authenticated
  WITH CHECK (public.is_owner_user() AND role <> 'owner');
CREATE POLICY authorized_users_owner_update ON public.authorized_users
  FOR UPDATE TO authenticated
  USING (public.is_owner_user())
  WITH CHECK (public.is_owner_user());
CREATE POLICY authorized_users_owner_delete ON public.authorized_users
  FOR DELETE TO authenticated
  USING (public.is_owner_user() AND role <> 'owner');

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'employees', 'services', 'clients', 'appointments', 'cash_sessions',
    'cash_entries', 'audit_logs', 'expenses', 'commission_closings',
    'service_packages', 'accounting_companies',
    'accounting_company_memberships', 'accounting_appointment_assignments',
    'accounting_exports'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS authenticated_%I_access ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY authenticated_%I_access ON public.%I FOR ALL TO authenticated USING (public.is_authorized_user()) WITH CHECK (public.is_authorized_user())',
      table_name, table_name
    );
  END LOOP;
END $$;

COMMENT ON TABLE public.authorized_users IS 'Usuários autorizados a acessar o aplicativo e seus perfis de permissão';
