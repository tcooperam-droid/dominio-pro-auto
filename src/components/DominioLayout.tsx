/**
 * DominioLayout — Layout principal do Domínio Pro.
 * Mobile: bottom navigation + topbar.
 * Desktop: sidebar elegante à esquerda.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { getSession, clearSession, MENU_VISIBILITY, isAccessControlEnabled } from "@/lib/access";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { trackAction } from "@/lib/agentTracker";
import {
  Calendar, Users, UserCheck, Scissors, DollarSign,
  BarChart2, Settings, Database, Menu, X,
  Sun, Moon, Plus, Wrench,
  LogOut, Receipt, Percent, TrendingUp
} from "lucide-react";

// ─── Navegação ────────────────────────────────────────────
const PRIMARY_NAV = [
  { path: "/dashboard", label: "Início",      icon: BarChart2  },
  { path: "/agenda",    label: "Agenda",      icon: Calendar   },
  { path: "/clientes",  label: "Clientes",    icon: Users      },
  { path: "/financeiro", label: "Financeiro", icon: TrendingUp },
];

const SECONDARY_NAV = [
  { path: "/despesas",              label: "Despesas",      icon: Receipt     },
  { path: "/comissoes",             label: "Comissões",     icon: Percent     },
  { path: "/funcionarios",          label: "Funcionários",  icon: UserCheck   },
  { path: "/servicos",              label: "Serviços",      icon: Scissors    },
  { path: "/ferramentas-clientes",  label: "Ferramentas",   icon: Wrench      },
  { path: "/relatorios",            label: "Relatórios",    icon: BarChart2   },
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

// ─── Paletas de tema ─────────────────────────────────────
export const THEME_PALETTES = [
  // ── Temas escuros ──────────────────────────────────────
  {
    id: "rosa-neon",
    name: "Rosa Neon",
    accent: "#ec4899",
    bg: "#0d0d14",
    surface: "rgba(15,15,28,0.95)",
    card: "rgba(20,20,35,0.9)",
    border: "rgba(255,255,255,0.07)",
    dark: true,
    textColor: "#ffffff",
    textMuted: "rgba(255,255,255,0.45)",
  },
  {
    id: "roxo-galaxy",
    name: "Roxo Galaxy",
    accent: "#8b5cf6",
    bg: "#0c0818",
    surface: "rgba(14,10,28,0.95)",
    card: "rgba(20,15,40,0.9)",
    border: "rgba(255,255,255,0.07)",
    dark: true,
    textColor: "#ffffff",
    textMuted: "rgba(255,255,255,0.45)",
  },
  {
    id: "esmeralda-dark",
    name: "Esmeralda Noturno",
    accent: "#10b981",
    bg: "#060f0c",
    surface: "rgba(8,18,14,0.95)",
    card: "rgba(10,24,18,0.9)",
    border: "rgba(255,255,255,0.07)",
    dark: true,
    textColor: "#ffffff",
    textMuted: "rgba(255,255,255,0.45)",
  },
  {
    id: "dourado",
    name: "Dourado Premium",
    accent: "#f59e0b",
    bg: "#0e0c08",
    surface: "rgba(18,14,8,0.95)",
    card: "rgba(24,18,10,0.9)",
    border: "rgba(255,255,255,0.07)",
    dark: true,
    textColor: "#ffffff",
    textMuted: "rgba(255,255,255,0.45)",
  },
  {
    id: "azul-oceano",
    name: "Azul Oceano",
    accent: "#0ea5e9",
    bg: "#060d18",
    surface: "rgba(8,16,30,0.95)",
    card: "rgba(10,22,40,0.9)",
    border: "rgba(255,255,255,0.07)",
    dark: true,
    textColor: "#ffffff",
    textMuted: "rgba(255,255,255,0.45)",
  },
  {
    id: "coral-dark",
    name: "Coral Sunset",
    accent: "#f97316",
    bg: "#0f0808",
    surface: "rgba(20,10,10,0.95)",
    card: "rgba(28,14,14,0.9)",
    border: "rgba(255,255,255,0.07)",
    dark: true,
    textColor: "#ffffff",
    textMuted: "rgba(255,255,255,0.45)",
  },
  // ── Temas claros ───────────────────────────────────────
  {
    id: "verde-pastel",
    name: "Verde Pastel",
    accent: "#3d6b47",
    bg: "#d6e8d0",
    surface: "rgba(210,232,204,0.97)",
    card: "rgba(224,240,218,0.97)",
    border: "rgba(61,107,71,0.15)",
    dark: false,
    textColor: "#1e3a22",
    textMuted: "rgba(30,58,34,0.5)",
  },
  {
    id: "azul-pastel",
    name: "Azul Céu",
    accent: "#2563a8",
    bg: "#cfe0f5",
    surface: "rgba(208,226,245,0.97)",
    card: "rgba(220,234,248,0.97)",
    border: "rgba(37,99,168,0.15)",
    dark: false,
    textColor: "#0f2a4a",
    textMuted: "rgba(15,42,74,0.5)",
  },
  {
    id: "lilas-pastel",
    name: "Lilás Suave",
    accent: "#6d3fa0",
    bg: "#e8d8f5",
    surface: "rgba(232,218,245,0.97)",
    card: "rgba(240,228,250,0.97)",
    border: "rgba(109,63,160,0.15)",
    dark: false,
    textColor: "#2e1250",
    textMuted: "rgba(46,18,80,0.5)",
  },
  {
    id: "rosa-pastel",
    name: "Rosa Suave",
    accent: "#b5376b",
    bg: "#f5d6e4",
    surface: "rgba(245,214,228,0.97)",
    card: "rgba(250,226,238,0.97)",
    border: "rgba(181,55,107,0.15)",
    dark: false,
    textColor: "#4a0f26",
    textMuted: "rgba(74,15,38,0.5)",
  },
  {
    id: "areia",
    name: "Areia & Caramelo",
    accent: "#92470a",
    bg: "#f0e0c8",
    surface: "rgba(240,224,200,0.97)",
    card: "rgba(248,234,214,0.97)",
    border: "rgba(146,71,10,0.15)",
    dark: false,
    textColor: "#3a1c06",
    textMuted: "rgba(58,28,6,0.5)",
  },
  {
    id: "branco-minimal",
    name: "Branco Minimal",
    accent: "#ec4899",
    bg: "#f4f4f8",
    surface: "rgba(255,255,255,0.97)",
    card: "rgba(255,255,255,0.97)",
    border: "rgba(0,0,0,0.08)",
    dark: false,
    textColor: "#111128",
    textMuted: "rgba(17,17,40,0.45)",
  },
];

function loadPalette() {
  try {
    const s = localStorage.getItem("salon_config");
    if (s) {
      const c = JSON.parse(s);
      if (c.themeId) return THEME_PALETTES.find(p => p.id === c.themeId) ?? THEME_PALETTES[0];
    }
  } catch { /* ignore */ }
  return THEME_PALETTES[0];
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
  const [palette, setPalette] = useState(loadPalette);

  // ── Acesso ─────────────────────────────────────────────
  const session = getSession();
  const role = session?.role ?? "owner";
  const menuVis = MENU_VISIBILITY[role];
  const accessEnabled = isAccessControlEnabled();

  // Navs filtrados por perfil
  const visiblePrimaryNav = PRIMARY_NAV.filter(n => {
    const key = n.path.replace("/", "") || "dashboard";
    return menuVis[key] !== false;
  });
  const visibleSecondaryNav = SECONDARY_NAV.filter(n => {
    const key = n.path.replace("/", "").split("/")[0];
    const keyMap: Record<string,string> = {
      "financeiro": "financeiro",
      "despesas": "despesas",
      "comissoes": "comissoes",
      "funcionarios": "funcionarios",
      "servicos": "servicos",
      "ferramentas-clientes": "ferramentas",
      "relatorios": "relatorios",
      "backup": "backup",
      "configuracoes": "configuracoes",
    };
    return menuVis[keyMap[key] ?? key] !== false;
  });

  const handleLogout = () => {
    clearSession();
    window.location.reload();
  };

  useEffect(() => {
    const onUpdate = () => {
      setBranding(loadBranding());
      setBgStyle(loadBackground());
      setAccent(getAccent());
      setPalette(loadPalette());
    };
    window.addEventListener("salon_config_updated", onUpdate);
    return () => window.removeEventListener("salon_config_updated", onUpdate);
  }, []);

  const navigate = (path: string) => {
    trackAction("navigate", path.replace(/^\/+/, "") || "dashboard", path);
    setLocation(path);
    setSidebarOpen(false);
  };

  const isActive = (path: string) =>
    location === path || location.startsWith(path + "/");

  return (
    <div className="flex h-screen overflow-hidden" style={Object.keys(bgStyle).length > 0 ? bgStyle : { background: palette.bg }}>
      {/* ── Sidebar — desktop ── */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-72 transition-all duration-300 md:relative md:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}
        style={{
          background: palette.surface,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
        }}>
        <div className="flex flex-col h-full">
          {/* Logo / Header */}
          <div className="p-6 flex items-center gap-4">
            <BrandLogo size={42} />
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-lg truncate" style={{ color: palette.textColor }}>
                {branding.name}
              </span>
              <span className="text-[10px] font-medium tracking-widest uppercase opacity-40" style={{ color: palette.textColor }}>
                Sistema de Gestão
              </span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden ml-auto p-2 text-white/40">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-8 scrollbar-hide">
            {/* Primário */}
            <div className="space-y-1">
              <span className="px-3 text-[10px] font-bold tracking-widest uppercase opacity-30 mb-2 block" style={{ color: palette.textColor }}>
                Principal
              </span>
              {visiblePrimaryNav.map(({ path, label, icon: Icon }) => {
                const active = isActive(path);
                return (
                  <button key={path} onClick={() => navigate(path)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                      active ? "shadow-lg" : "hover:bg-white/5"
                    )}
                    style={active ? {
                      background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
                      color: "#fff",
                      boxShadow: `0 4px 15px ${accent}40`,
                    } : { color: palette.textMuted }}>
                    <Icon className={cn("w-5 h-5", active ? "text-white" : "group-hover:text-white transition-colors")} />
                    <span className="font-medium text-sm">{label}</span>
                    {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80" />}
                  </button>
                );
              })}
            </div>

            {/* Secundário */}
            <div className="space-y-1">
              <span className="px-3 text-[10px] font-bold tracking-widest uppercase opacity-30 mb-2 block" style={{ color: palette.textColor }}>
                Gerenciamento
              </span>
              {visibleSecondaryNav.map(({ path, label, icon: Icon }) => {
                const active = isActive(path);
                return (
                  <button key={path} onClick={() => navigate(path)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 group",
                      active ? "shadow-md" : "hover:bg-white/5"
                    )}
                    style={active ? {
                      background: `${accent}15`,
                      color: accent,
                      border: `1px solid ${accent}30`,
                    } : { color: palette.textMuted }}>
                    <Icon className={cn("w-4.5 h-4.5", active ? "text-accent" : "group-hover:text-white transition-colors")} />
                    <span className="font-medium text-sm">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer / Profile */}
          <div className="p-4 mt-auto border-t border-white/5">
            <div className="flex items-center gap-3 p-2 rounded-2xl bg-white/5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                style={{ background: `linear-gradient(135deg, ${accent}30, ${accent}10)`, color: accent }}>
                {session?.profileName?.[0]?.toUpperCase() || "A"}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate" style={{ color: palette.textColor }}>
                  {session?.profileName || "Administrador"}
                </span>
                <span className="text-[10px] opacity-40 uppercase tracking-tighter" style={{ color: palette.textColor }}>
                  {role === "owner" ? "Proprietário" : role === "manager" ? "Gerente" : "Funcionário"}
                </span>
              </div>
              {accessEnabled && (
                <button onClick={handleLogout} className="ml-auto p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-red-400 transition-all">
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-transparent">
        {/* Topbar — mobile & desktop header info */}
        <header className="h-16 flex items-center px-4 md:px-8 gap-4 z-20">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 -ml-2 text-white/60">
            <Menu className="w-6 h-6" />
          </button>

          <div className="flex flex-col">
            <h1 className="text-lg md:text-xl font-bold tracking-tight" style={{ color: palette.textColor }}>
              {visiblePrimaryNav.find(n => isActive(n.path))?.label ||
               visibleSecondaryNav.find(n => isActive(n.path))?.label ||
               "Início"}
            </h1>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Botão novo agendamento — desktop */}
            {onNewAppt && (
              <button onClick={() => { trackAction("click", "new_appointment", "topbar desktop"); onNewAppt(); }}
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
            background: palette.surface,
            backdropFilter: "blur(32px)",
            WebkitBackdropFilter: "blur(32px)",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}>
          <div className="flex items-center justify-around px-2 py-2">
            {visiblePrimaryNav.map(({ path, label, icon: Icon }) => {
              const active = isActive(path);
              return (
                <button key={path} onClick={() => navigate(path)}
                  className="flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-all duration-200 min-w-0"
                  style={active ? {
                    background: `${accent}18`,
                    color: accent,
                  } : { color: palette.textMuted }}>
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
          <button onClick={() => { trackAction("click", "new_appointment", "FAB mobile"); onNewAppt(); }}
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
