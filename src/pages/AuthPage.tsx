import { useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isAllowedWorkEmail } from "@/lib/authConfig";

export default function AuthPage({ rejectedEmail }: { rejectedEmail?: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  function describeAuthError(rawMessage: string) {
    const normalized = rawMessage.toLowerCase();
    if (normalized.includes("rate limit") || normalized.includes("too many")) {
      return "O limite de envio de e-mails do Supabase foi atingido. Aguarde alguns minutos antes de solicitar outro código; não é erro da sua conta.";
    }
    return rawMessage;
  }

  async function sendCode() {
    const normalized = email.trim().toLowerCase();
    setError("");
    setMessage("");
    if (!isAllowedWorkEmail(normalized)) {
      setError("Este acesso está reservado ao e-mail autorizado do trabalho.");
      return;
    }
    if (cooldown) {
      setError("Aguarde alguns segundos antes de solicitar outro código.");
      return;
    }
    setCooldown(true);
    window.setTimeout(() => setCooldown(false), 60_000);
    setSending(true);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: true },
    });
    setSending(false);
    if (authError) {
      setError(describeAuthError(authError.message));
      return;
    }
    setCodeSent(true);
    setMessage("Código enviado. Verifique seu e-mail e digite o código abaixo.");
  }

  async function verifyCode() {
    const normalized = email.trim().toLowerCase();
    setError("");
    setMessage("");
    if (!isAllowedWorkEmail(normalized) || !/^\d{8}$/.test(code.trim())) {
      setError("Digite o código de 8 números recebido por e-mail.");
      return;
    }
    setVerifying(true);
    const { error: authError } = await supabase.auth.verifyOtp({
      email: normalized,
      token: code.trim(),
      type: "email",
    });
    setVerifying(false);
    if (authError) {
      setError("Código inválido ou expirado. Solicite um novo código.");
      return;
    }
    setMessage("Acesso confirmado. Carregando o aplicativo...");
  }

  return (
    <main className="min-h-screen bg-[#0d0d14] text-white grid place-items-center px-5">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-300">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <h1 className="text-center text-2xl font-bold">Acesso de trabalho</h1>
        <p className="mt-2 text-center text-sm text-white/50">
          Use o seu e-mail cadastrado para receber um código temporário de acesso.
        </p>
        {rejectedEmail && (
          <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">
            O endereço {rejectedEmail} não está autorizado neste aplicativo.
          </p>
        )}
        <label className="mt-7 block text-xs font-semibold uppercase tracking-wider text-white/50">Seu e-mail</label>
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3">
          <Mail className="h-4 w-4 text-white/40" />
          <input
            value={email}
            onChange={event => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            disabled={codeSent}
            className="w-full bg-transparent py-3 text-sm outline-none disabled:opacity-60"
            placeholder="seu@email.com"
          />
        </div>
        {codeSent && (
          <>
            <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-white/50">Código de 8 números</label>
            <input
              value={code}
              onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              autoFocus
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-center text-xl tracking-[0.4em] outline-none"
              placeholder="000000"
            />
          </>
        )}
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        {message && <p className="mt-3 text-sm text-emerald-300">{message}</p>}
        {!codeSent ? (
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={sending || cooldown}
            className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
          >
            {sending ? "Enviando código..." : cooldown ? "Aguarde para tentar novamente" : "Enviar código por e-mail"}
          </button>
        ) : (
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => void verifyCode()}
              disabled={verifying || code.length !== 8}
              className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {verifying ? "Confirmando..." : "Confirmar código"}
            </button>
            <button
              type="button"
              onClick={() => { setCodeSent(false); setCode(""); setMessage(""); setError(""); }}
              className="rounded-xl border border-white/10 px-4 py-3 text-sm text-white/70"
            >
              Novo código
            </button>
          </div>
        )}
        <p className="mt-5 text-center text-xs leading-relaxed text-white/35">
          O código é temporário e a sessão fica vinculada ao Supabase neste dispositivo.
        </p>
      </section>
    </main>
  );
}
