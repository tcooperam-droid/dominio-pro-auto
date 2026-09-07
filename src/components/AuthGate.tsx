import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import AuthPage from "@/pages/AuthPage";
import { normalizeEmail, type AuthorizedRole } from "@/lib/authConfig";
import { clearSession, setSession } from "@/lib/access";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "signed-out" | "ready">("loading");
  const [rejectedEmail, setRejectedEmail] = useState<string | undefined>();

  useEffect(() => {
    let mounted = true;
    const acceptSession = async (session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]) => {
      if (!mounted) return;
      if (!session || (session.user as { is_anonymous?: boolean }).is_anonymous) {
        if (session) await supabase.auth.signOut();
        clearSession();
        setRejectedEmail(undefined);
        setStatus("signed-out");
        return;
      }
      const email = normalizeEmail(session.user.email);
      const { data: authorized, error } = await supabase
        .from("authorized_users")
        .select("id, email, display_name, role, active")
        .eq("email", email)
        .maybeSingle();
      if (error || !authorized || !authorized.active) {
        await supabase.auth.signOut();
        clearSession();
        setRejectedEmail(email);
        setStatus("signed-out");
        return;
      }
      setSession(authorized.role as AuthorizedRole, authorized.display_name || email);
      setRejectedEmail(undefined);
      setStatus("ready");
    };
    supabase.auth.getSession()
      .then(({ data }) => acceptSession(data.session))
      .catch(() => { if (mounted) setStatus("signed-out"); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void acceptSession(session);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (status === "loading") {
    return <div className="min-h-screen bg-[#0d0d14] text-white grid place-items-center">Verificando acesso...</div>;
  }
  if (status === "signed-out") return <AuthPage rejectedEmail={rejectedEmail} />;
  return <>{children}</>;
}
