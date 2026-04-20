/**
 * ProfileSelector — Seleção de perfil com biometria via digital/face
 */
import { useState } from "react";
import { type UserRole, setSession, loadAccessConfig, getDefaultRoute } from "@/lib/access";

function getAccent() {
  try { const s = localStorage.getItem("salon_config"); if (s) return JSON.parse(s).accentColor || "#ec4899"; } catch {}
  return "#ec4899";
}
function getSalonName() {
  try { const s = localStorage.getItem("salon_config"); if (s) return JSON.parse(s).salonName || "Domínio Pro"; } catch {}
  return "Domínio Pro";
}

// Tenta autenticação biométrica nativa do dispositivo
async function authenticateBiometric(): Promise<"ok" | "unavailable" | "failed"> {
  try {
    if (!window.PublicKeyCredential) return "unavailable";
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) return "unavailable";

    // Usar challenge aleatório
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    // Verificar se já existe credencial salva
    const savedId = localStorage.getItem("bio_credential_id");
    const allowCredentials = savedId
      ? [{ id: Uint8Array.from(atob(savedId), c => c.charCodeAt(0)), type: "public-key" as const, transports: ["internal"] as any }]
      : [];

    if (savedId) {
      // Autenticar com digital existente
      const assertion = await navigator.credentials.get({
        publicKey: { challenge, timeout: 30000, userVerification: "required", allowCredentials, rpId: window.location.hostname }
      } as any);
      return assertion ? "ok" : "failed";
    } else {
      // Primeira vez: registrar a digital
      const encoder = new TextEncoder();
      const reg = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "Domínio Pro", id: window.location.hostname },
          user: { id: encoder.encode("dominio-pro-user"), name: "usuario", displayName: "Usuário" },
          pubKeyCredParams: [{ alg: -7, type: "public-key" }],
          authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
          timeout: 30000,
        }
      } as any) as any;
      if (reg?.rawId) {
        const idB64 = btoa(String.fromCharCode(...new Uint8Array(reg.rawId)));
        localStorage.setItem("bio_credential_id", idB64);
        return "ok";
      }
      return "failed";
    }
  } catch (e: any) {
    if (e?.name === "NotAllowedError") return "failed";
    return "unavailable";
  }
}

interface ProfileSelectorProps {
  onSelect?: (session: { role: UserRole; profileName: string; loginAt: number }) => void;
}

export default function ProfileSelector({ onSelect }: ProfileSelectorProps = {}) {
  const accent = getAccent();
  const salonName = getSalonName();
  const cfg = loadAccessConfig();
  const [bioState, setBioState] = useState<"idle" | "checking" | "error">("idle");
  const [bioMsg, setBioMsg] = useState("");

  const profiles = [
    { role: "owner"    as UserRole, emoji: "👑", label: "Dono",                      sublabel: "Acesso total"      },
    { role: "manager"  as UserRole, emoji: "👔", label: cfg.managerName || "Gerente", sublabel: "Acesso total"      },
    { role: "employee" as UserRole, emoji: "✂️", label: "Funcionário",               sublabel: "Agenda e clientes" },
  ];

  async function handleSelect(role: UserRole, profileName: string) {
    setBioState("checking");
    setBioMsg("");

    const result = await authenticateBiometric();

    if (result === "ok") {
      setBioState("idle");
      doLogin(role, profileName);
    } else if (result === "unavailable") {
      // Dispositivo sem biometria — entra direto
      setBioState("idle");
      doLogin(role, profileName);
    } else {
      setBioState("error");
      setBioMsg("Biometria não confirmada. Toque no perfil para tentar novamente.");
    }
  }

  function doLogin(role: UserRole, profileName: string) {
    setSession(role, profileName);
    if (onSelect) {
      onSelect({ role, profileName, loginAt: Date.now() });
    } else {
      window.location.href = getDefaultRoute(role);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: 24, background: "#0d0d14",
    }}>

      {/* Ícone — tesoura igual ao ícone do app */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 40 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: "linear-gradient(135deg, #2a2012, #1a1408)",
          border: "1.5px solid rgba(90,65,30,0.7)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 16, fontSize: 36,
        }}>✂️</div>
        <h1 style={{
          fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
          fontSize: 18, letterSpacing: "0.15em", textTransform: "uppercase",
          color: "#fff", textShadow: `0 0 20px ${accent}80`, margin: 0,
        }}>{salonName}</h1>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.25em", marginTop: 4 }}>DOMÍNIO PRO</p>
      </div>

      {/* Perfis */}
      <div style={{ width: "100%", maxWidth: 360 }}>
        <p style={{
          fontSize: 11, color: "rgba(255,255,255,0.4)",
          textTransform: "uppercase", letterSpacing: "0.2em",
          textAlign: "center", marginBottom: 16,
        }}>Selecione seu perfil</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {profiles.map(p => (
            <button
              key={p.role}
              type="button"
              disabled={bioState === "checking"}
              onClick={() => handleSelect(p.role, p.label)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                padding: "18px 8px", borderRadius: 16,
                border: "2px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
                cursor: bioState === "checking" ? "wait" : "pointer",
                transition: "all 0.15s",
                opacity: bioState === "checking" ? 0.5 : 1,
              }}
            >
              <span style={{ fontSize: 28 }}>{p.emoji}</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", margin: 0 }}>{p.label}</p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{p.sublabel}</p>
              </div>
            </button>
          ))}
        </div>

        {bioState === "checking" && (
          <div style={{
            marginTop: 20, padding: "14px", borderRadius: 12,
            background: `${accent}15`, border: `1px solid ${accent}40`,
            textAlign: "center",
          }}>
            <p style={{ color: accent, fontSize: 13, margin: 0 }}>🔐 Verificando identidade...</p>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 4 }}>Use sua impressão digital</p>
          </div>
        )}

        {bioState === "error" && (
          <div style={{
            marginTop: 16, padding: "12px", borderRadius: 10,
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
            textAlign: "center",
          }}>
            <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>{bioMsg}</p>
          </div>
        )}
      </div>

      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", marginTop: 48 }}>Domínio Pro v2.0</p>
    </div>
  );
}
