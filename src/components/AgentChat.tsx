/**
 * AgentChat.tsx — Interface do Agente IA v2
 * Usa agentV2 (LLM-first com tool calling) em vez do orquestrador antigo.
 */
import { useState, useEffect, useRef, useCallback, type ReactElement } from "react";
import { useLocation } from "wouter";
import {
  MessageCircle, X, Send, Brain, Mic, ChevronDown,
  ThumbsUp, ThumbsDown, Trash2, Zap, Volume2, VolumeX,
  Paperclip, Globe, Loader2,
} from "lucide-react";
import { handleMessageV2, clearHistory, addFeedback } from "@/lib/agentV2";
import { loadRules, removeRule } from "@/lib/agentMemory";
import { describeImage, searchAndSummarize, transcribeAudio, speakWithOpenAI, stopSpeaking, fileToDataUrl } from "@/lib/agentMedia";

// ─── Tipos ─────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: number;
  userMessage?: string;   // para feedback
  feedback?: "good" | "bad";
}

// ─── Helpers ───────────────────────────────────────────────

function parseInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={i} className="px-1 py-0.5 rounded text-[11px] bg-white/10 font-mono">
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: ReactElement[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) {
      elements.push(<div key={i} className="h-1" />);
      i++; continue;
    }
    // Headers
    if (trimmed.startsWith("### ")) {
      elements.push(<p key={i} className="font-semibold mt-1.5">{parseInline(trimmed.slice(4))}</p>);
      i++; continue;
    }
    if (trimmed.startsWith("## ") || trimmed.startsWith("# ")) {
      const off = trimmed.startsWith("# ") ? 2 : 3;
      elements.push(<p key={i} className="font-bold mt-2">{parseInline(trimmed.slice(off))}</p>);
      i++; continue;
    }
    // Bullet list
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      elements.push(
        <div key={i} className="flex gap-1.5 items-start">
          <span className="mt-[3px] opacity-50 shrink-0 text-[10px]">●</span>
          <span>{parseInline(trimmed.slice(2))}</span>
        </div>,
      );
      i++; continue;
    }
    // Numbered list
    const numMatch = trimmed.match(/^(\d+)\.\s(.+)$/);
    if (numMatch) {
      elements.push(
        <div key={i} className="flex gap-1.5 items-start">
          <span className="opacity-50 shrink-0 min-w-[1.2em]">{numMatch[1]}.</span>
          <span>{parseInline(numMatch[2])}</span>
        </div>,
      );
      i++; continue;
    }
    // Normal line
    elements.push(<p key={i}>{parseInline(trimmed)}</p>);
    i++;
  }
  return <div className="space-y-0.5 leading-relaxed">{elements}</div>;
}

function getAccent(): string {
  try {
    const s = localStorage.getItem("salon_config");
    if (s) return JSON.parse(s).accentColor || "#ec4899";
  } catch {}
  return "#ec4899";
}

function getSalonName(): string {
  try {
    const s = localStorage.getItem("salon_config");
    if (s) return JSON.parse(s).salonName || "Domínio Pro";
  } catch {}
  return "Domínio Pro";
}

// ─── TTS (delegado para OpenAI via agentMedia) ─────────────

function speakText(text: string, onEnd?: () => void) {
  void speakWithOpenAI(text, "nova", onEnd);
}

const QUICK_ACTIONS = [
  { label: "Agenda hoje", query: "Quais agendamentos temos hoje?" },
  { label: "Agendar", query: "Quero fazer um agendamento" },
  { label: "Buscar cliente", query: "Preciso buscar um cliente" },
  { label: "Faturamento", query: "Qual o faturamento de hoje?" },
];

const MESSAGES_KEY = "agentv2_chat_messages";

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistMessages(msgs: ChatMessage[]) {
  try {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(msgs.slice(-50)));
  } catch {}
}

// ─── Componente Principal ──────────────────────────────────

export default function AgentChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [rules, setRules] = useState(() => loadRules());
  const [, setLocation] = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    try { return localStorage.getItem("agent_tts") !== "false"; } catch { return true; }
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const accent = getAccent();
  const salonName = getSalonName();

  // Carregar mensagens salvas
  useEffect(() => {
    const saved = loadMessages();
    if (saved.length > 0) {
      setMessages(saved);
    } else {
      const welcome: ChatMessage = {
        id: "welcome",
        role: "agent",
        content: `Olá! Sou o Agente IA do ${salonName}. Posso ajudar com agendamentos, clientes, serviços e muito mais. Como posso ajudar?`,
        timestamp: Date.now(),
      };
      setMessages([welcome]);
      persistMessages([welcome]);
    }
  }, []);

  // Scroll para o final
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [messages, isOpen]);

  // ── Anexos / modos extras ────────────────────────────────
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [webMode, setWebMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Enviar mensagem ──────────────────────────────────────
  const lastSentRef = useRef<number>(0);

  const sendMessage = useCallback(async (text: string, opts?: { imageDataUrl?: string | null; useWeb?: boolean }) => {
    const now = Date.now();
    const trimmed = text.trim();
    const imageDataUrl = opts?.imageDataUrl ?? attachedImage;
    const useWeb = opts?.useWeb ?? webMode;

    if (!trimmed && !imageDataUrl) return;
    if (isTyping) return;
    if (now - lastSentRef.current < 1500) return;
    lastSentRef.current = now;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      content: imageDataUrl
        ? `${trimmed || "[Analisar esta imagem]"}\n\n🖼️ [imagem anexada]`
        : useWeb
          ? `🌐 ${trimmed}`
          : trimmed,
      timestamp: Date.now(),
    };

    setMessages(prev => {
      const next = [...prev, userMsg];
      persistMessages(next);
      return next;
    });
    setInput("");
    setAttachedImage(null);
    setIsTyping(true);

    try {
      let responseText: string;
      let navigateTo: string | undefined;
      let messageId: string | undefined;

      if (imageDataUrl) {
        // Análise de imagem (vision)
        responseText = await describeImage(imageDataUrl, trimmed);
      } else if (useWeb) {
        // Pesquisa na internet
        responseText = await searchAndSummarize(trimmed);
      } else {
        // Fluxo normal do agente
        const response = await handleMessageV2(trimmed);
        responseText = response.text;
        navigateTo = response.navigateTo;
        messageId = response.messageId;
      }

      const agentMsg: ChatMessage = {
        id: messageId ?? `a_${Date.now()}`,
        role: "agent",
        content: responseText,
        timestamp: Date.now(),
        userMessage: trimmed,
      };

      setMessages(prev => {
        const next = [...prev, agentMsg];
        persistMessages(next);
        return next;
      });

      if (!isOpen) setHasNew(true);

      if (ttsEnabled) {
        setIsSpeaking(true);
        speakText(responseText, () => setIsSpeaking(false));
      }

      if (navigateTo) {
        setTimeout(() => setLocation(navigateTo!), 1000);
      }
    } catch (err) {
      console.error("[AgentChat] erro:", err);
      const errorMsg: ChatMessage = {
        id: `e_${Date.now()}`,
        role: "agent",
        content: `Não consegui processar agora. ${err instanceof Error ? err.message : ""}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  }, [isTyping, isOpen, setLocation, attachedImage, webMode, ttsEnabled]);

  const handleSend = useCallback(() => {
    sendMessage(input);
  }, [input, sendMessage]);

  // ── Feedback 👍/👎 ───────────────────────────────────────
  const handleFeedback = useCallback((msg: ChatMessage, rating: "good" | "bad") => {
    if (!msg.userMessage) return;
    addFeedback(msg.userMessage, msg.content, rating);
    setMessages(prev =>
      prev.map(m => m.id === msg.id ? { ...m, feedback: rating } : m)
    );
  }, []);

  // ── Remover regra ────────────────────────────────────────
  const handleRemoveRule = useCallback((id: string) => {
    removeRule(id);
    setRules(loadRules());
  }, []);

  // ── Limpar conversa ──────────────────────────────────────
  const handleClear = useCallback(() => {
    clearHistory();
    localStorage.removeItem(MESSAGES_KEY);
    const welcome: ChatMessage = {
      id: `welcome_${Date.now()}`,
      role: "agent",
      content: `Conversa reiniciada! Como posso ajudar?`,
      timestamp: Date.now(),
    };
    setMessages([welcome]);
    persistMessages([welcome]);
  }, []);

  // ── Voice Input (Web Speech API — sem backend) ───────────
  const toggleVoice = useCallback(async () => {
    if (isRecording) {
      try { (recognitionRef.current as any)?.stop?.(); } catch {}
      setIsRecording(false);
      return;
    }

    const SR: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert(
        "Reconhecimento de voz não suportado neste navegador. Use o ditado nativo do teclado do celular.",
      );
      return;
    }

    // Pede permissão antes (no Android isso evita o aborto silencioso)
    try {
      const s = await navigator.mediaDevices?.getUserMedia({ audio: true });
      s?.getTracks().forEach((t) => t.stop());
    } catch {
      alert("Não consegui acessar o microfone. Verifique as permissões.");
      return;
    }

    const rec = new SR();
    rec.lang = "pt-BR";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      const transcript = event?.results?.[0]?.[0]?.transcript;
      if (transcript && String(transcript).trim()) {
        void sendMessage(String(transcript).trim());
      }
    };
    rec.onerror = (event: any) => {
      setIsRecording(false);
      const err = event?.error;
      if (err === "not-allowed" || err === "service-not-allowed") {
        alert("Permissão de microfone negada. Libere nas configurações do navegador.");
      } else if (err && err !== "no-speech" && err !== "aborted") {
        console.warn("[mic] erro:", err);
      }
    };
    rec.onend = () => setIsRecording(false);

    recognitionRef.current = rec;
    try {
      rec.start();
      setIsRecording(true);
    } catch (err) {
      console.error("[mic] falha ao iniciar:", err);
      setIsRecording(false);
    }
  }, [isRecording, sendMessage]);

  // ── Anexar imagem ────────────────────────────────────────
  const handleAttachImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImageSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Por favor envie um arquivo de imagem.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert("Imagem muito grande (máx. 8 MB).");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setAttachedImage(dataUrl);
    } catch (err) {
      console.error("[Image] erro:", err);
    }
  }, []);

  const toggleTts = useCallback(() => {
    setTtsEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem("agent_tts", String(next)); } catch {}
      if (!next) { stopSpeaking(); setIsSpeaking(false); }
      return next;
    });
  }, []);

  const toggleChat = useCallback(() => {
    setIsOpen(p => !p);
    setHasNew(false);
    if (isSpeaking) { stopSpeaking(); setIsSpeaking(false); }
  }, [isSpeaking]);

  return (
    <>
      {/* Chat Panel */}
      {isOpen && (
        <div
          className="fixed z-[9999] flex flex-col overflow-hidden"
          style={{
            bottom: 88, right: 16,
            width: "min(400px, calc(100vw - 32px))",
            height: "min(560px, calc(100vh - 110px))",
            borderRadius: 20,
            background: "rgba(10, 10, 20, 0.97)",
            backdropFilter: "blur(40px)",
            border: `1px solid rgba(255,255,255,0.1)`,
            boxShadow: `0 25px 60px rgba(0,0,0,0.6), 0 0 40px ${accent}18`,
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 shrink-0 border-b border-white/10"
            style={{ background: `linear-gradient(135deg, ${accent}15, transparent)` }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${accent}25`, border: `1px solid ${accent}50` }}
            >
              <Brain className="w-4 h-4" style={{ color: accent }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white/90">Agente IA</p>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <p className="text-[10px] text-white/40">Online — {salonName}</p>
              </div>
            </div>
            <button
              onClick={toggleTts}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title={ttsEnabled ? "Desativar voz" : "Ativar voz"}
            >
              {ttsEnabled
                ? <Volume2 className="w-3.5 h-3.5" style={{ color: isSpeaking ? accent : "rgba(255,255,255,0.5)" }} />
                : <VolumeX className="w-3.5 h-3.5 text-white/20" />
              }
            </button>
            <button
              onClick={() => setShowRules(r => !r)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title="Regras aprendidas"
            >
              <Zap className="w-3.5 h-3.5" style={{ color: showRules ? accent : "rgba(255,255,255,0.3)" }} />
            </button>
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title="Limpar conversa"
            >
              <Trash2 className="w-3.5 h-3.5 text-white/30 hover:text-white/60" />
            </button>
            <button onClick={toggleChat} className="p-1.5 rounded-lg hover:bg-white/10">
              <ChevronDown className="w-4 h-4 text-white/40" />
            </button>
          </div>

          {/* Rules Panel */}
          {showRules && (
            <div className="mx-4 mt-3 mb-1 rounded-xl p-3 text-xs" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <p className="text-white/60 font-semibold mb-2 flex items-center gap-1">
                <Zap className="w-3 h-3" style={{ color: accent }} /> Regras aprendidas
              </p>
              {rules.length === 0
                ? <p className="text-white/30">Nenhuma regra ainda. Diga ao agente: "Lembra que..."</p>
                : rules.map(r => (
                    <div key={r.id} className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-white/70 flex-1">• {r.raw}</p>
                      <button onClick={() => handleRemoveRule(r.id)} className="text-white/20 hover:text-red-400 shrink-0">✕</button>
                    </div>
                  ))
              }
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className="max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm"
                  style={
                    msg.role === "user"
                      ? { background: accent, color: "white" }
                      : {
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.09)",
                          color: "rgba(255,255,255,0.88)",
                        }
                  }
                >
                  {renderMarkdown(msg.content)}
                </div>
                {/* Feedback buttons — apenas em mensagens do agente */}
                {msg.role === "agent" && msg.userMessage && (
                  <div className="flex gap-1 mt-1 ml-1">
                    <button
                      onClick={() => handleFeedback(msg, "good")}
                      className="p-1 rounded-md transition-colors"
                      style={{ background: msg.feedback === "good" ? "rgba(52,211,153,0.2)" : "transparent" }}
                      title="Boa resposta"
                    >
                      <ThumbsUp className="w-3 h-3" style={{ color: msg.feedback === "good" ? "#34d399" : "rgba(255,255,255,0.2)" }} />
                    </button>
                    <button
                      onClick={() => handleFeedback(msg, "bad")}
                      className="p-1 rounded-md transition-colors"
                      style={{ background: msg.feedback === "bad" ? "rgba(239,68,68,0.2)" : "transparent" }}
                      title="Resposta ruim"
                    >
                      <ThumbsDown className="w-3 h-3" style={{ color: msg.feedback === "bad" ? "#ef4444" : "rgba(255,255,255,0.2)" }} />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div
                  className="px-4 py-3 rounded-2xl"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
                >
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{ backgroundColor: accent, animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          <div className="px-4 py-2 flex gap-2 overflow-x-auto border-t border-white/5 shrink-0">
            {QUICK_ACTIONS.map(a => (
              <button
                key={a.label}
                onClick={() => sendMessage(a.query)}
                disabled={isTyping}
                className="px-3 py-1.5 rounded-full text-[11px] whitespace-nowrap shrink-0 transition-opacity disabled:opacity-40"
                style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}
              >
                {a.label}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 shrink-0 space-y-2">
            {/* Preview da imagem anexada */}
            {attachedImage && (
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-2 py-2">
                <img src={attachedImage} alt="anexo" className="w-12 h-12 rounded-lg object-cover" />
                <span className="text-[11px] text-white/60 flex-1">Imagem pronta para enviar</span>
                <button
                  onClick={() => setAttachedImage(null)}
                  className="p-1 rounded hover:bg-white/10"
                  title="Remover"
                >
                  <X className="w-3.5 h-3.5 text-white/40" />
                </button>
              </div>
            )}

            {/* Modo web ativo */}
            {webMode && !attachedImage && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl text-[11px]"
                style={{ background: `${accent}15`, border: `1px solid ${accent}40`, color: accent }}>
                <Globe className="w-3 h-3" />
                <span className="flex-1">Modo pesquisa na internet ativo</span>
                <button onClick={() => setWebMode(false)} className="p-0.5 hover:opacity-70">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageSelected}
              className="hidden"
            />

            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-2 py-2">
              <button
                onClick={toggleVoice}
                disabled={isTranscribing}
                className={`p-1.5 rounded-lg transition-colors ${isRecording ? "bg-red-500/20" : "hover:bg-white/5"} disabled:opacity-40`}
                title={isRecording ? "Parar gravação" : "Falar com o agente"}
              >
                {isTranscribing
                  ? <Loader2 className="w-4 h-4 text-white/50 animate-spin" />
                  : <Mic className={`w-4 h-4 ${isRecording ? "text-red-400 animate-pulse" : "text-white/40"}`} />
                }
              </button>
              <button
                onClick={handleAttachImage}
                disabled={!!attachedImage}
                className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-40"
                title="Enviar imagem"
              >
                <Paperclip className="w-4 h-4 text-white/40" />
              </button>
              <button
                onClick={() => setWebMode(m => !m)}
                className={`p-1.5 rounded-lg transition-colors ${webMode ? "" : "hover:bg-white/5"}`}
                style={webMode ? { background: `${accent}25`, color: accent } : undefined}
                title="Pesquisar na internet"
              >
                <Globe className="w-4 h-4" style={{ color: webMode ? accent : "rgba(255,255,255,0.4)" }} />
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder={
                  attachedImage ? "Pergunte algo sobre a imagem..."
                  : webMode ? "O que pesquisar na web?"
                  : "Pergunte algo..."
                }
                disabled={isTyping}
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/20 disabled:opacity-50 px-1"
              />
              <button
                onClick={handleSend}
                disabled={(!input.trim() && !attachedImage) || isTyping}
                className="p-1.5 rounded-lg transition-all disabled:opacity-20"
                style={{ background: ((input.trim() || attachedImage) && !isTyping) ? accent : "transparent" }}
              >
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={toggleChat}
        className="fixed z-[9999] flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        style={{
          bottom: 20, right: 16,
          width: 56, height: 56,
          borderRadius: 18,
          background: isOpen ? "rgba(255,255,255,0.1)" : accent,
          boxShadow: isOpen ? "none" : `0 8px 32px ${accent}50`,
        }}
      >
        {isOpen
          ? <X className="w-5 h-5 text-white/70" />
          : (
            <div className="relative">
              <Brain className="w-6 h-6 text-white" />
              {hasNew && (
                <div
                  className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-black"
                  style={{ background: "#ef4444" }}
                />
              )}
            </div>
          )
        }
      </button>
    </>
  );
}
