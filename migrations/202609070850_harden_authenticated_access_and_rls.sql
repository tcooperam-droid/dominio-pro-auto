-- Primeira camada de segurança compatível com os dois apps.
-- Aplicada no projeto Supabase rjffysqedqqahthywhjs em 2026-09-07.
-- Ambos os apps executam signInAnonymously() antes das consultas.
-- Esta migração exige o papel authenticated, mas ainda não cria isolamento por salão.

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_company_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_appointment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_employees ON public.employees;
DROP POLICY IF EXISTS allow_all_services ON public.services;
DROP POLICY IF EXISTS allow_all_clients ON public.clients;
DROP POLICY IF EXISTS allow_all_appointments ON public.appointments;
DROP POLICY IF EXISTS allow_all_cash_sessions ON public.cash_sessions;
DROP POLICY IF EXISTS allow_all_cash_entries ON public.cash_entries;
DROP POLICY IF EXISTS allow_all_audit_logs ON public.audit_logs;
DROP POLICY IF EXISTS "Permitir tudo para anon em expenses" ON public.expenses;
DROP POLICY IF EXISTS "Permitir tudo para anon em commission_closings" ON public.commission_closings;

CREATE POLICY authenticated_employees_access ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_services_access ON public.services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_clients_access ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_appointments_access ON public.appointments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_cash_sessions_access ON public.cash_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_cash_entries_access ON public.cash_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_audit_logs_access ON public.audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_expenses_access ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_commission_closings_access ON public.commission_closings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_service_packages_access ON public.service_packages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_accounting_companies_access ON public.accounting_companies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_accounting_memberships_access ON public.accounting_company_memberships FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_accounting_assignments_access ON public.accounting_appointment_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_accounting_exports_access ON public.accounting_exports FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE EXECUTE ON FUNCTION public.update_employee_working_hours() FROM anon;
GRANT EXECUTE ON FUNCTION public.update_employee_working_hours() TO authenticated;
ALTER FUNCTION public.update_employee_working_hours() SET search_path = public;
