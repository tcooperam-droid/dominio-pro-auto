import { createClient } from "@supabase/supabase-js";

const AUTHORIZED_EMAIL = "tcooperam@gmail.com";

export async function requireAuthorizedUser(req, res) {
  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!accessToken || !url || !key) {
    res.status(401).json({ error: "Sessão autenticada obrigatória." });
    return null;
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || data.user?.email?.trim().toLowerCase() !== AUTHORIZED_EMAIL) {
    res.status(401).json({ error: "Usuário não autorizado." });
    return null;
  }
  return data.user;
}
