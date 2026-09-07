export type AuthorizedRole = "owner" | "manager" | "employee";

export interface AuthorizedUser {
  id: string;
  email: string;
  display_name: string;
  role: AuthorizedRole;
  active: boolean;
}

export function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

// A autorização real vem da tabela public.authorized_users no Supabase.
export function isAllowedWorkEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email).length > 0;
}
