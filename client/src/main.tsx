import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { supabase } from "./lib/supabase";

async function bootstrap() {
  // Garante sessão autenticada antes de renderizar
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    await supabase.auth.signInAnonymously();
  }
  createRoot(document.getElementById("root")!).render(<App />);
}

bootstrap();
