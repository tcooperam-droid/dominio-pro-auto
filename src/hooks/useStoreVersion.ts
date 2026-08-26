import { useEffect, useState } from "react";

const STORE_EVENTS = [
  "store_updated",
  "appointments_updated",
  "expenses_updated",
  "bootstrap_updated",
] as const;

/**
 * Incrementa uma versão local sempre que dados persistidos ou o bootstrap
 * mudam. Stores continuam simples e as páginas usam a versão para invalidar
 * seus useMemo sem precisar de um gerenciador global adicional.
 */
export function useStoreVersion(): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const onStoreUpdate = () => setVersion(current => current + 1);
    STORE_EVENTS.forEach(event => window.addEventListener(event, onStoreUpdate));
    return () => STORE_EVENTS.forEach(event => window.removeEventListener(event, onStoreUpdate));
  }, []);

  return version;
}
