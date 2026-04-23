/**
 * ProfileSelector — Seleção de perfil com senha e biometria
 */
import { useState } from "react";
import { type UserRole, setSession, loadAccessConfig, getDefaultRoute, isAccessControlEnabled } from "@/lib/access";
import { Eye, EyeOff, Lock, Fingerprint } from "lucide-react";

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
  const accessEnabled = isAccessControlEnabled();

  const [selectedProfile, setSelectedProfile] = useState<{role: UserRole, label: string} | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const profiles = [
    { role: "owner"    as UserRole, emoji: "👑", label: "Dono",                      sublabel: "Acesso total",      enabled: true },
    { role: "manager"  as UserRole, emoji: "👔", label: cfg.managerName || "Gerente", sublabel: "Acesso total",      enabled: cfg.managerEnabled },
    { role: "employee" as UserRole, emoji: "✂️", label: "Funcionário",               sublabel: "Agenda e clientes", enabled: cfg.employeesAccessEnabled },
  ].filter(p => p.enabled);

  async function handleProfileClick(role: UserRole, label: string) {
    if (!accessEnabled) {
      doLogin(role, label);
      return;
    }
    setSelectedProfile({ role, label });
    setError("");
    setPassword("");
  }

  async function handleLogin() {
    if (!selectedProfile) return;
    
    setLoading(true);
    setError("");

    const role = selectedProfile.role;
    let expectedPwd = "";
    if (role === "owner") expectedPwd = cfg.ownerPassword;
    else if (role === "manager") expectedPwd = cfg.managerPassword;
    else if (role === "employee") expectedPwd = cfg.employeePassword;

    if (password === expectedPwd) {
      doLogin(role, selectedProfile.label);
    } else {
      setError("Senha incorreta. Tente novamente.");
      setLoading(false);
    }
  }

  async function handleBiometric() {
    if (!selectedProfile) return;
    setLoading(true);
    setError("");

    const result = await authenticateBiometric();
    if (result === "ok") {
      doLogin(selectedProfile.role, selectedProfile.label);
    } else if (result === "unavailable") {
      setError("Biometria não disponível neste dispositivo.");
      setLoading(false);
    } else {
      setError("Falha na biometria. Use sua senha.");
      setLoading(false);
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

      {/* Ícone */}
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

      <div style={{ width: "100%", maxWidth: 360 }}>
        {!selectedProfile ? (
          <>
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
                  onClick={() => handleProfileClick(p.role, p.label)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                    padding: "18px 8px", borderRadius: 16,
                    border: "2px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.04)",
                    cursor: "pointer",
                    transition: "all 0.15s",
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
          </>
        ) : (
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 24,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 32 }}>
                {profiles.find(p => p.role === selectedProfile.role)?.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 700, margin: 0 }}>{selectedProfile.label}</h2>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: 0 }}>Digite sua senha para entrar</p>
              </div>
              <button 
                onClick={() => setSelectedProfile(null)}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 12 }}
              >
                Alterar
              </button>
            </div>

            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }}>
                <Lock size={16} />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Sua senha"
                autoFocus
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                style={{
                  width: "100%",
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  padding: "12px 40px",
                  color: "#fff",
                  fontSize: 16,
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.3)",
                  cursor: "pointer",
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <p style={{ color: "#ef4444", fontSize: 12, margin: "-10px 0 0 4px" }}>{error}</p>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={handleLogin}
                disabled={loading || password.length < 4}
                style={{
                  flex: 1,
                  background: accent,
                  color: "#fff",
                  border: "none",
                  borderRadius: 12,
                  padding: "14px",
                  fontWeight: 600,
                  cursor: (loading || password.length < 4) ? "not-allowed" : "pointer",
                  opacity: (loading || password.length < 4) ? 0.5 : 1,
                }}
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>
              
              <button
                onClick={handleBiometric}
                disabled={loading}
                title="Usar Biometria"
                style={{
                  width: 54,
                  background: "rgba(255,255,255,0.08)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <Fingerprint size={24} />
              </button>
            </div>
          </div>
        )}
      </div>

      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", marginTop: 48 }}>Domínio Pro v2.0</p>
    </div>
  );
}
