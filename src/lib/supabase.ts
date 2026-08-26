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
// Sem configuração, a interface continua navegável apenas para prévia local.
export const sessionReady: Promise<void> = hasSupabaseConfig
  ? (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        await supabase.auth.signInAnonymously();
      }
    })()
  : Promise.resolve();
