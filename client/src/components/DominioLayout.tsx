/**
 * DominioLayout — Layout principal do Domínio Pro.
 * Mobile: bottom navigation + topbar.
 * Desktop: sidebar elegante à esquerda.
 */
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import {
  Calendar, Users, UserCheck, Scissors, DollarSign,
  BarChart2, Settings, History, Database, Menu, X,
  Sun, Moon, Plus, Search, ChevronRight, Wrench,
  CalendarCheck, Bell,
} from "lucide-react";

// ─── Navegação ────────────────────────────────────────────
const PRIMARY_NAV = [
  { path: "/dashboard", label: "Início",      icon: BarChart2  },
  { path: "/agenda",    label: "Agenda",      icon: Calendar   },
  { path: "/clientes",  label: "Clientes",    icon: Users      },
  { path: "/caixa",     label: "Caixa",       icon: DollarSign },
];

const SECONDARY_NAV = [
  { path: "/funcionarios",          label: "Funcionários",  icon: UserCheck   },
  { path: "/servicos",              label: "Serviços",      icon: Scissors    },
  { path: "/ferramentas-clientes",  label: "Ferramentas",   icon: Wrench      },
  { path: "/caixa/dashboard",       label: "Dashboard $",   icon: BarChart2   },
  { path: "/relatorios",            label: "Relatórios",    icon: BarChart2   },
  { path: "/historico",             label: "Histórico",     icon: History     },
  { path: "/historico/agendamentos",label: "Agendamentos",  icon: CalendarCheck },
  { path: "/backup",                label: "Backup",        icon: Database    },
  { path: "/configuracoes",         label: "Configurações", icon: Settings    },
];

// ─── Helpers ──────────────────────────────────────────────
function loadBranding() {
  try {
    const s = localStorage.getItem("salon_config");
    if (s) {
      const p = JSON.parse(s);
      return { name: p.salonName || "Domínio Pro", logo: p.logoUrl || "" };
    }
  } catch { /* ignore */ }
  return { name: "Domínio Pro", logo: "" };
}

function loadBackground(): React.CSSProperties {
  try {
    const s = localStorage.getItem("salon_config");
    if (!s) return {};
    const c = JSON.parse(s);
    if (c.bgType === "solid" && c.bgColor)
      return { backgroundColor: c.bgColor };
    if (c.bgType === "gradient" && c.bgGradientFrom && c.bgGradientTo)
      return { background: `linear-gradient(${c.bgGradientDir || "135deg"}, ${c.bgGradientFrom}, ${c.bgGradientTo})` };
    if (c.bgType === "image" && c.bgImageUrl)
      return { backgroundImage: `url(${c.bgImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" };
  } catch { /* ignore */ }
  return {};
}

function getAccent(): string {
  try {
    const s = localStorage.getItem("salon_config");
    if (s) return JSON.parse(s).accentColor || "#ec4899";
  } catch { /* ignore */ }
  return "#ec4899";
}

// ─── Logo Component ───────────────────────────────────────
function BrandLogo({ size = 48 }: { size?: number }) {
  const branding = loadBranding();
  const accent = getAccent();
  if (branding.logo) {
    return (
      <img src={branding.logo} alt="logo"
        style={{ width: size, height: size, objectFit: "contain", borderRadius: size * 0.2 }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.22,
      background: `linear-gradient(135deg, ${accent}40, ${accent}15)`,
      border: `1.5px solid ${accent}50`,
      boxShadow: `0 4px 20px ${accent}30`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <Scissors style={{ width: size * 0.42, height: size * 0.42, color: accent }} />
    </div>
  );
}

// ─── Main Layout ──────────────────────────────────────────
export default function DominioLayout({ children, onNewAppt }: {
  children: React.ReactNode;
  onNewAppt?: () => void;
}) {
  const [location, setLocation] = useLocation();
  const { theme, toggleTheme, switchable } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [branding, setBranding] = useState(loadBranding);
  const [bgStyle, setBgStyle] = useState(loadBackground);
  const [accent, setAccent] = useState(getAccent);

  useEffect(() => {
    const onUpdate = () => {
      setBranding(loadBranding());
      setBgStyle(loadBackground());
      setAccent(getAccent());
    };
    window.addEventListener("salon_config_updated", onUpdate);
    return () => window.removeEventListener("salon_config_updated", onUpdate);
  }, []);

  const navigate = (path: string) => {
    setLocation(path);
    setSidebarOpen(false);
  };

  const isActive = (path: string) =>
    location === path || location.startsWith(path + "/");

  return (
    <div className="flex h-screen overflow-hidden" style={bgStyle}>

      {/* ── Overlay mobile ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar desktop / drawer mobile ── */}
      <aside className={cn(
        "fixed md:relative z-50 flex flex-col h-full",
        "transition-transform duration-300 ease-out",
        "w-64",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )} style={{
        background: "rgba(10,10,18,0.92)",
        backdropFilter: "blur(32px)",
        WebkitBackdropFilter: "blur(32px)",
        borderRight: "1px solid rgba(255,255,255,0.07)",
      }}>

        {/* Brand */}
        <div className="flex flex-col items-center pt-7 pb-5 px-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="relative mb-3">
            <BrandLogo size={72} />
          </div>
          <p style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700, fontSize: 16,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#ffffff",
            textShadow: `0 0 20px ${accent}80`,
            textAlign: "center",
            lineHeight: 1.2,
          }}>{branding.name}</p>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.25em", marginTop: 3 }}>
            PRO
          </p>

          {/* Fechar — só mobile */}
          <button className="md:hidden absolute top-4 right-4 text-white/30 hover:text-white/70 transition-colors"
            onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav principal */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: "0.2em", padding: "0 8px 8px" }}>
            PRINCIPAL
          </p>
          {PRIMARY_NAV.map(({ path, label, icon: Icon }) => {
            const active = isActive(path);
            return (
              <button key={path} onClick={() => navigate(path)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  active
                    ? "text-white"
                    : "text-white/40 hover:text-white/80 hover:bg-white/5"
                )}
                style={active ? {
                  background: `linear-gradient(135deg, ${accent}25, ${accent}10)`,
                  border: `1px solid ${accent}30`,
                  boxShadow: `0 2px 12px ${accent}20`,
                } : {}}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                  active ? "" : "bg-white/5"
                )} style={active ? {
                  background: `linear-gradient(135deg, ${accent}40, ${accent}20)`,
                } : {}}>
                  <Icon className="w-4 h-4" style={active ? { color: accent } : {}} />
                </div>
                <span className="flex-1 text-left">{label}</span>
                {active && <ChevronRight className="w-3.5 h-3.5 opacity-50" style={{ color: accent }} />}
              </button>
            );
          })}

          <div className="pt-4">
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: "0.2em", padding: "0 8px 8px" }}>
              GESTÃO
            </p>
            {SECONDARY_NAV.map(({ path, label, icon: Icon }) => {
              const active = isActive(path);
              return (
                <button key={path} onClick={() => navigate(path)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200",
                    active ? "text-white" : "text-white/35 hover:text-white/70 hover:bg-white/5"
                  )}
                  style={active ? {
                    background: `linear-gradient(135deg, ${accent}20, ${accent}08)`,
                    border: `1px solid ${accent}25`,
                  } : {}}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" style={active ? { color: accent } : {}} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Rodapé sidebar */}
        <div className="px-3 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {switchable && (
            <button onClick={toggleTheme}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-white/30 hover:text-white/60 hover:bg-white/5 transition-all">
              {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{theme === "dark" ? "Tema claro" : "Tema escuro"}</span>
            </button>
          )}
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", textAlign: "center", marginTop: 8 }}>
            Domínio Pro v2.0
          </p>
        </div>
      </aside>

      {/* ── Área principal ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
          style={{
            background: "rgba(10,10,18,0.7)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
          {/* Menu burger — mobile */}
          <button onClick={() => setSidebarOpen(true)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/8 transition-all">
            <Menu className="w-5 h-5" />
          </button>

          {/* Brand mobile */}
          <div className="md:hidden flex items-center gap-2.5 flex-1">
            <BrandLogo size={28} />
            <span style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700, fontSize: 13,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#ffffff",
              textShadow: `0 0 12px ${accent}80`,
            }}>{branding.name}</span>
          </div>

          {/* Título da página — desktop */}
          <div className="hidden md:flex items-center gap-2 flex-1">
            {(() => {
              const all = [...PRIMARY_NAV, ...SECONDARY_NAV];
              const cur = all.find(n => isActive(n.path));
              const Icon = cur?.icon;
              return cur ? (
                <div className="flex items-center gap-2">
                  {Icon && <Icon className="w-4 h-4" style={{ color: accent }} />}
                  <span className="text-sm font-semibold text-white/80">{cur.label}</span>
                </div>
              ) : null;
            })()}
          </div>

          {/* Ações direita */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Botão novo agendamento — desktop */}
            {onNewAppt && (
              <button onClick={onNewAppt}
                className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                style={{
                  background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
                  boxShadow: `0 4px 16px ${accent}40`,
                }}>
                <Plus className="w-4 h-4" />
                Novo Agendamento
              </button>
            )}
            {switchable && (
              <button onClick={toggleTheme}
                className="hidden md:flex w-9 h-9 items-center justify-center rounded-xl text-white/40 hover:text-white/80 hover:bg-white/8 transition-all">
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            )}
          </div>
        </header>

        {/* Conteúdo */}
        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          {children}
        </main>

        {/* ── Bottom Navigation — mobile only ── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 pb-safe"
          style={{
            background: "rgba(8,8,16,0.95)",
            backdropFilter: "blur(32px)",
            WebkitBackdropFilter: "blur(32px)",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}>
          <div className="flex items-center justify-around px-2 py-2">
            {PRIMARY_NAV.map(({ path, label, icon: Icon }) => {
              const active = isActive(path);
              return (
                <button key={path} onClick={() => navigate(path)}
                  className="flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-all duration-200 min-w-0"
                  style={active ? {
                    background: `${accent}18`,
                  } : {}}>
                  <div className="relative">
                    <Icon className="w-5 h-5 transition-all"
                      style={{ color: active ? accent : "rgba(255,255,255,0.35)" }} />
                    {active && (
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                        style={{ backgroundColor: accent }} />
                    )}
                  </div>
                  <span className="text-[10px] font-medium transition-all"
                    style={{ color: active ? accent : "rgba(255,255,255,0.35)" }}>
                    {label}
                  </span>
                </button>
              );
            })}
            {/* Menu — abre sidebar */}
            <button onClick={() => setSidebarOpen(true)}
              className="flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-all">
              <Menu className="w-5 h-5" style={{ color: "rgba(255,255,255,0.35)" }} />
              <span className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>Menu</span>
            </button>
          </div>
        </nav>

        {/* ── FAB novo agendamento — mobile ── */}
        {onNewAppt && (
          <button onClick={onNewAppt}
            className="md:hidden fixed bottom-20 right-5 z-30 w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all active:scale-90"
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
              boxShadow: `0 8px 32px ${accent}60`,
            }}>
            <Plus className="w-6 h-6 text-white" />
          </button>
        )}
      </div>
    </div>
  );
}
