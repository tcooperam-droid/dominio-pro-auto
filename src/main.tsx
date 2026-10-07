import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ensureSupabaseSession } from "./lib/supabase";
import { openNativePicker } from "./lib/nativePicker";

// Monta a interface imediatamente. A autenticação não pode bloquear o primeiro
// render — no Android isso deixava o ecrã branco quando a rede demorava.
createRoot(document.getElementById("root")!).render(<App />);

// Alguns módulos usam <input> nativo em vez do componente Input compartilhado.
// No Android, tocar no campo pode apenas marcar o texto sem abrir o seletor.
document.addEventListener("pointerdown", event => {
  const target = event.target;
  if (target instanceof HTMLInputElement) {
    openNativePicker(target, event.pointerType);
  }
});

// Inicializa a sessão em segundo plano para as operações do Supabase.
void ensureSupabaseSession().catch((err: unknown) => {
  console.warn("Supabase bootstrap error:", err);
});

// ── Service Worker — detecta nova versão e recarrega automaticamente ──
// Desabilitado em desenvolvimento para evitar cache de versões quebradas.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("/sw.js").then((registration) => {

    // Verifica updates a cada 60s enquanto o app está aberto
    setInterval(() => registration.update(), 60_000);

    const awaitingWorker = registration.waiting;
    if (awaitingWorker) {
      awaitingWorker.postMessage("SKIP_WAITING");
    }

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          newWorker.postMessage("SKIP_WAITING");
        }
      });
    });

  }).catch(console.error);

  // Recarrega quando o SW novo assumir controle
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}
