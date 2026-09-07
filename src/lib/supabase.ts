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

// A sessão é criada pelo fluxo de login e validada pelo AuthGate. Não criar
// sessões anônimas: elas não representam uma identidade confiável para o RLS.
let sessionPromise: Promise<void> | null = null;

export function ensureSupabaseSession(): Promise<void> {
  if (!hasSupabaseConfig) return Promise.resolve();
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) return;
  })().catch((error) => {
    sessionPromise = null;
    throw error;
  });

  return sessionPromise;
}
