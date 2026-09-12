import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import AuthPage from "@/pages/AuthPage";
import { normalizeEmail, type AuthorizedRole } from "@/lib/authConfig";
import { clearSession, setSession } from "@/lib/access";
import type { Session } from "@supabase/supabase-js";

type GateStatus = "loading" | "signed-out" | "ready" | "verification-error";

const RETRY_DELAYS = [0, 500, 1500];

function sameIdentity(left: Session | null, right: Session | null): boolean {
  return Boolean(left && right && left.user.id === right.user.id && normalizeEmail(left.user.email) === normalizeEmail(right.user.email));
}

async function loadAuthorizedUser(email: string) {
  let lastError: unknown = null;
  for (const delay of RETRY_DELAYS) {
    if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
    const { data, error } = await supabase
      .from("authorized_users")
      .select("id, email, display_name, role, active")
      .eq("email", email)
      .maybeSingle();
    if (!error) return { data, error: null };
    lastError = error;
  }
  return { data: null, error: lastError };
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GateStatus>("loading");
  const [rejectedEmail, setRejectedEmail] = useState<string | undefined>();
  const [verificationMessage, setVerificationMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    let currentSession: Session | null = null;
    let processing: Promise<void> | null = null;
    let sessionReady = false;

    const acceptSession = async (session: Session | null) => {
      if (!mounted) return;
      if (!session || (session.user as { is_anonymous?: boolean }).is_anonymous) {
        currentSession = null;
        sessionReady = false;
        clearSession();
        setRejectedEmail(undefined);
        setVerificationMessage("");
        if (mounted) setStatus("signed-out");
        return;
      }

      // TOKEN_REFRESHED é normal e não deve refazer a consulta de autorização
      // nem derrubar o usuário por uma falha transitória de rede.
      if (sameIdentity(currentSession, session) && sessionReady) return;
      currentSession = session;
      const email = normalizeEmail(session.user.email);
      const { data: authorized, error } = await loadAuthorizedUser(email);
      if (!mounted) return;

      if (error) {
        // Uma falha de rede/RLS temporária não é prova de que o usuário foi
        // revogado. Nunca faça signOut nesse caso, pois isso força novo OTP.
        setVerificationMessage("Não foi possível verificar a autorização agora. Sua sessão foi preservada; tente novamente.");
        sessionReady = false;
        setStatus("verification-error");
        return;
      }
      if (!authorized || !authorized.active) {
        // Só revoga a sessão quando a consulta respondeu corretamente e
        // confirmou que o e-mail não está autorizado ou está inativo.
        await supabase.auth.signOut();
        if (!mounted) return;
        currentSession = null;
        clearSession();
        setRejectedEmail(email);
        setStatus("signed-out");
        return;
      }
      setSession(authorized.role as AuthorizedRole, authorized.display_name || email);
      setRejectedEmail(undefined);
      setVerificationMessage("");
      sessionReady = true;
      setStatus("ready");
    };

    const scheduleSession = (session: Session | null) => {
      if (processing) return;
      processing = acceptSession(session).finally(() => { processing = null; });
    };

    void supabase.auth.getSession()
      .then(({ data }) => scheduleSession(data.session))
      .catch(() => {
        if (mounted) {
          setVerificationMessage("Não foi possível carregar sua sessão. Verifique a conexão e tente novamente.");
          setStatus("verification-error");
        }
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // O callback do Supabase não deve aguardar chamadas Supabase dentro dele.
      // Adiar o processamento evita deadlocks entre refreshSession/getSession
      // e impede que INITIAL_SESSION seja processado duas vezes em paralelo.
      if (event === "TOKEN_REFRESHED" && sameIdentity(currentSession, session)) return;
      window.setTimeout(() => { if (mounted) scheduleSession(session); }, 0);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (status === "loading") {
    return <div className="min-h-screen bg-[#0d0d14] text-white grid place-items-center">Verificando acesso...</div>;
  }
  if (status === "verification-error") {
    return (
      <div className="min-h-screen bg-[#0d0d14] text-white grid place-items-center px-5">
        <section className="w-full max-w-md rounded-2xl border border-amber-400/20 bg-white/[0.04] p-6 text-center">
          <h1 className="text-lg font-semibold">Sessão preservada</h1>
          <p className="mt-2 text-sm text-white/60">{verificationMessage}</p>
          <button type="button" className="mt-5 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black" onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
          <button type="button" className="mt-3 block w-full text-xs text-white/40" onClick={() => void supabase.auth.signOut()}>
            Encerrar sessão e entrar novamente
          </button>
        </section>
      </div>
    );
  }
  if (status === "signed-out") return <AuthPage rejectedEmail={rejectedEmail} />;
  return <>{children}</>;
}

export { sameIdentity };
