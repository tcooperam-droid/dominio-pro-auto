import { createClient } from "@supabase/supabase-js";

const configuredUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const configuredKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const hasSupabaseConfig = Boolean(configuredUrl && configuredKey);
const isPreviewWithoutData = import.meta.env.DEV && !hasSupabaseConfig;

if (!hasSupabaseConfig && !isPreviewWithoutData) {
  throw new Error(
    "VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórias em produção.",
  );
}

// A prévia local pode montar a interface sem dados reais. Em produção,
// as variáveis são obrigatórias e o erro acima impede uma inicialização silenciosa.
const supabaseUrl = configuredUrl ?? "https://preview-placeholder.supabase.co";
const supabaseKey = configuredKey ?? "preview-anon-key";

export const supabase = createClient(supabaseUrl, supabaseKey);

// Garante sessão anônima antes de qualquer query quando o Supabase está configurado.
// A Promise é compartilhada durante o bootstrap e reiniciada se houver falha,
// permitindo uma nova tentativa sem exigir reload do navegador.
let sessionPromise: Promise<void> | null = null;

export function ensureSupabaseSession(): Promise<void> {
  if (!hasSupabaseConfig) return Promise.resolve();
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
    }
  })().catch((error) => {
    sessionPromise = null;
    throw error;
  });

  return sessionPromise;
}
