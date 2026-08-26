import { useEffect, useRef } from "react";

/**
 * Hook que detecta quando a aplicação volta do background/segundo plano.
 * Suporta:
 * - Navegadores (mudança de aba, foco de janela)
 * - Back-forward cache (bfcache) — causa mais comum de tela branca em PWAs
 * - iOS/Android (via Capacitor)
 *
 * @param callback Função a executar quando o app volta para o foreground
 */
export function useAppForeground(callback: () => Promise<void> | void) {
  // Guarda o callback num ref para não recriar os listeners a cada render
  const callbackRef = useRef(callback);
  useEffect(() => { callbackRef.current = callback; }, [callback]);

  const isExecuting = useRef(false);
  const lastExecutionTime = useRef(0);

  useEffect(() => {
    // Debounce de 5 s — evita múltiplas execuções em transições rápidas
    const executeCallback = async () => {
      const now = Date.now();
      if (isExecuting.current || now - lastExecutionTime.current < 5000) return;

      isExecuting.current = true;
      lastExecutionTime.current = now;

      try {
        await callbackRef.current();
      } catch (error) {
        console.error("[useAppForeground] Erro:", error);
      } finally {
        isExecuting.current = false;
      }
    };

    // 1. Visibilidade (aba minimizada → visível)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") executeCallback();
    };

    // 2. Foco da janela
    const handleWindowFocus = () => executeCallback();

    // 3. Back-forward cache (bfcache) — principal causa de tela branca em PWAs
    //    Quando o browser restaura a página do bfcache, o evento pageshow
    //    chega com event.persisted = true. Recarregamos a página para garantir
    //    que o React está num estado limpo.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // Página restaurada do bfcache — força reload para evitar tela branca
        window.location.reload();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("pageshow", handlePageShow);

    // 4. Capacitor (iOS/Android nativo)
    let removeCapacitorListener: (() => void) | undefined;
    const setupCapacitor = async () => {
      try {
        const { App } = await import("@capacitor/app");
        const listener = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) executeCallback();
        });
        removeCapacitorListener = () => {
          void listener.remove();
        };
      } catch {
        // Capacitor não disponível no browser
      }
    };
    setupCapacitor();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("pageshow", handlePageShow);
      removeCapacitorListener?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // roda apenas uma vez — callback é lido via ref
}
