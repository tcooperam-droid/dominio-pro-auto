import { createClient } from "@supabase/supabase-js";

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "❌ Variáveis de ambiente Supabase não configuradas.\n" +
    "Crie um arquivo .env na raiz do projeto com:\n" +
    "VITE_SUPABASE_URL=https://xxxx.supabase.co\n" +
    "VITE_SUPABASE_ANON_KEY=eyJxxx..."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Garante sessão anônima antes de qualquer query.
// Exportado para que o app possa aguardar antes de carregar dados.
export const sessionReady: Promise<void> = (async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    await supabase.auth.signInAnonymously();
  }
})();
