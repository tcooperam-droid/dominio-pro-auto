import { createClient } from "@supabase/supabase-js";

export async function requireAuthorizedUser(req, res) {
  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!accessToken || !url || !key) {
    res.status(401).json({ error: "Sessão autenticada obrigatória." });
    return null;
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  const email = authData.user?.email?.trim().toLowerCase();
  if (authError || !email) {
    res.status(401).json({ error: "Sessão inválida." });
    return null;
  }
  const { data: authorized, error: authorizedError } = await supabase
    .from("authorized_users")
    .select("id, email, display_name, role, active")
    .eq("email", email)
    .maybeSingle();
  if (authorizedError || !authorized?.active) {
    res.status(401).json({ error: "Usuário não autorizado." });
    return null;
  }
  return { ...authData.user, authorized };
}
