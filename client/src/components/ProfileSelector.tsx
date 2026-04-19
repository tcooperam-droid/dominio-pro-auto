/**
 * ProfileSelector — Seleção de perfil com biometria opcional
 */
import { useState } from "react";
import { type UserRole, setSession, loadAccessConfig, getDefaultRoute } from "@/lib/access";

function getAccent() {
  try {
    const s = localStorage.getItem("salon_config");
    if (s) return JSON.parse(s).accentColor || "#ec4899";
  } catch { /* ignore */ }
  return "#ec4899";
}

function getSalonName() {
  try {
    const s = localStorage.getItem("salon_config");
    if (s) return JSON.parse(s).salonName || "Domínio Pro";
  } catch { /* ignore */ }
  return "Domínio Pro";
}

// Verifica se o dispositivo suporta biometria (WebAuthn / credencial de plataforma)
async function isBiometricAvailable(): Promise<boolean> {
  try {
    if (!window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

// Solicita verificação biométrica (impressão digital / Face ID)
async function requestBiometric(label: string): Promise<boolean> {
  try {
    const cred = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        timeout: 30000,
        userVerification: "required",
        rpId: window.location.hostname,
        allowCredentials: [],
      },
    } as any);
    return !!cred;
  } catch {
    // Fallback: usar a API de autenticação simples se disponível
    try {
      const result = await (navigator as any).credentials?.get?.({
        password: true,
        mediation: "optional",
      });
      return !!result;
    } catch { return false; }
  }
}

interface ProfileSelectorProps {
  onSelect?: (session: { role: UserRole; profileName: string; loginAt: number }) => void;
}

export default function ProfileSelector({ onSelect }: ProfileSelectorProps = {}) {
  const accent = getAccent();
  const salonName = getSalonName();
  const cfg = loadAccessConfig();
  const [loading, setLoading] = useState<UserRole | null>(null);
  const [error, setError] = useState("");

  const profiles = [
    { role: "owner" as UserRole,    emoji: "👑", label: "Dono",       sublabel: "Acesso total",      secure: true },
    { role: "manager" as UserRole,  emoji: "👔", label: cfg.managerName || "Gerente", sublabel: "Acesso total", secure: true },
    { role: "employee" as UserRole, emoji: "✂️", label: "Funcionário", sublabel: "Agenda e clientes", secure: false },
  ];

  async function handleSelect(role: UserRole, secure: boolean) {
    setError("");
    setLoading(role);

    try {
      // Perfis seguros tentam biometria se disponível
      if (secure) {
        const hasBio = await isBiometricAvailable();
        if (hasBio) {
          const verified = await requestBiometric(role === "owner" ? "Dono" : "Gerente");
          if (!verified) {
            setError("Verificação biométrica cancelada.");
            setLoading(null);
            return;
          }
        }
        // Se não tiver biometria disponível, entra direto
      }

      let name = "Usuário";
      if (role === "owner")    name = "Dono";
      if (role === "manager")  name = cfg.managerName || "Gerente";
      if (role === "employee") name = "Funcionário";

      setSession(role, name);

      if (onSelect) {
        onSelect({ role, profileName: name, loginAt: Date.now() });
      } else {
        window.location.href = getDefaultRoute(role);
      }
    } catch {
      setError("Erro ao autenticar. Tente novamente.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: 24, background: "#0d0d14",
    }}>

      {/* Logo com tesoura SVG */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 40 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 18,
          background: `linear-gradient(135deg, ${accent}30, ${accent}10)`,
          border: `1.5px solid ${accent}60`,
          boxShadow: `0 4px 32px ${accent}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 16,
        }}>
          {/* Tesoura SVG - igual ao ícone do app */}
          <svg width="40" height="40" viewBox="0 0 100 100" fill="none">
            <circle cx="28" cy="35" r="12" stroke={accent} strokeWidth="7" fill="none"/>
            <circle cx="28" cy="70" r="12" stroke={accent} strokeWidth="7" fill="none"/>
            <line x1="38" y1="30" x2="82" y2="15" stroke={accent} strokeWidth="7" strokeLinecap="round"/>
            <line x1="38" y1="75" x2="82" y2="90" stroke={accent} strokeWidth="7" strokeLinecap="round"/>
            <circle cx="55" cy="52" r="4" fill={accent}/>
          </svg>
        </div>
        <h1 style={{
          fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
          fontSize: 18, letterSpacing: "0.15em", textTransform: "uppercase",
          color: "#fff", textShadow: `0 0 20px ${accent}80`, margin: 0,
        }}>
          {salonName}
        </h1>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.25em", marginTop: 4 }}>
          DOMÍNIO PRO
        </p>
      </div>

      <div style={{ width: "100%", maxWidth: 360 }}>
        <p style={{
          fontSize: 11, color: "rgba(255,255,255,0.4)",
          textTransform: "uppercase", letterSpacing: "0.2em",
          textAlign: "center", marginBottom: 16,
        }}>
          Selecione seu perfil
        </p>

        <div style={{ display: "grid", gridTemplateColumns: `repeat(${profiles.length}, 1fr)`, gap: 12 }}>
          {profiles.map(p => (
            <button
              key={p.role}
              type="button"
              disabled={loading !== null}
              onClick={() => handleSelect(p.role, p.secure)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                padding: "20px 8px", borderRadius: 16,
                border: `2px solid ${loading === p.role ? accent : "rgba(255,255,255,0.1)"}`,
                background: loading === p.role ? `${accent}20` : "rgba(255,255,255,0.04)",
                boxShadow: loading === p.role ? `0 0 24px ${accent}40` : "none",
                cursor: loading !== null ? "wait" : "pointer",
                transition: "all 0.15s", opacity: loading !== null && loading !== p.role ? 0.5 : 1,
              }}
            >
              <span style={{ fontSize: 28 }}>
                {loading === p.role ? "⏳" : p.emoji}
              </span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", margin: 0 }}>{p.label}</p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{p.sublabel}</p>
                {p.secure && (
                  <p style={{ fontSize: 9, color: accent, marginTop: 4, opacity: 0.8 }}>🔐 biometria</p>
                )}
              </div>
            </button>
          ))}
        </div>

        {error && (
          <p style={{
            marginTop: 16, fontSize: 12, color: "#ef4444",
            textAlign: "center", padding: "10px",
            background: "rgba(239,68,68,0.1)", borderRadius: 8,
            border: "1px solid rgba(239,68,68,0.2)",
          }}>
            {error}
          </p>
        )}

        <p style={{
          fontSize: 10, color: "rgba(255,255,255,0.2)",
          textAlign: "center", marginTop: 20,
        }}>
          Toque no perfil para entrar
        </p>
      </div>

      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", marginTop: 48 }}>
        Domínio Pro v2.0
      </p>
    </div>
  );
}

