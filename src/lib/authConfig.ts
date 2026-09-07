export const AUTHORIZED_WORK_EMAIL = "tcooperam@gmail.com";

export function isAllowedWorkEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === AUTHORIZED_WORK_EMAIL;
}
