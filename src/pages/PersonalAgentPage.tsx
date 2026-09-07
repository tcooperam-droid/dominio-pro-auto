import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Brain,
  CalendarClock,
  Check,
  Lightbulb,
  Loader2,
  Send,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { usePersonalAgent } from "@/features/agente-pessoal/usePersonalAgent";
import type { PersonalMessage } from "@/features/agente-pessoal/types";

const SUGGESTIONS = [
  "Me ajude a organizar as prioridades desta semana",
  "Quero criar um plano para aumentar o faturamento",
  "Meu objetivo é estudar marketing todos os dias",
  "Quais agendamentos temos hoje?",
];

function MessageBubble({ message, onRate }: { message: PersonalMessage; onRate: (rating: "good" | "bad") => void }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[min(88%,760px)] rounded-2xl px-4 py-3 text-sm shadow-sm ${isUser ? "bg-primary text-primary-foreground" : "border bg-card text-card-foreground"}`}>
        <div className="whitespace-pre-wrap leading-6">{message.content}</div>
        {!isUser && (
          <div className="mt-3 flex items-center gap-1 border-t pt-2 text-muted-foreground">
            <span className="mr-1 text-[11px]">A resposta ajudou?</span>
            <button type="button" aria-label="Resposta útil" onClick={() => onRate("good")} className={`rounded p-1 hover:bg-muted ${message.feedback === "good" ? "text-emerald-600" : ""}`}><ThumbsUp className="size-3.5" /></button>
            <button type="button" aria-label="Resposta não ajudou" onClick={() => onRate("bad")} className={`rounded p-1 hover:bg-muted ${message.feedback === "bad" ? "text-red-600" : ""}`}><ThumbsDown className="size-3.5" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PersonalAgentPage() {
  const { messages, sending, error, send, rate, clear, memory } = usePersonalAgent();
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    await send(text);
  };

  const askSuggestion = (suggestion: string) => {
    setInput(suggestion);
  };

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 p-4 md:p-8 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden">
        <CardHeader className="border-b bg-gradient-to-r from-primary/10 via-background to-background">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl"><Sparkles className="size-5 text-primary" /> Agente pessoal</CardTitle>
              <CardDescription className="mt-2 max-w-2xl">Uma IA de propósito geral para pensar, planejar, aprender com você e conversar com o agente de agendamento quando necessário.</CardDescription>
            </div>
            <Badge variant="outline" className="hidden gap-1 sm:inline-flex"><Brain className="size-3" /> Memória ativa</Badge>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-4 p-0">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
            {messages.length === 0 && (
              <div className="mx-auto max-w-2xl space-y-6 py-10 text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="size-7" /></div>
                <div><h2 className="text-lg font-semibold">Como posso ajudar hoje?</h2><p className="mt-2 text-sm text-muted-foreground">Fale sobre qualquer assunto. Para ensinar algo, comece com “lembra que…”. Para objetivos, use “meu objetivo é…”.</p></div>
                <div className="grid gap-2 text-left sm:grid-cols-2">
                  {SUGGESTIONS.map((suggestion) => <button type="button" key={suggestion} onClick={() => askSuggestion(suggestion)} className="rounded-xl border bg-background p-3 text-left text-sm transition hover:border-primary/50 hover:bg-primary/5">{suggestion}</button>)}
                </div>
              </div>
            )}
            {messages.map((message) => <MessageBubble key={message.id} message={message} onRate={(rating) => rate(message.id, rating)} />)}
            {sending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Pensando…</div>}
            {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
            <div ref={endRef} />
          </div>

          <form onSubmit={submit} className="border-t bg-muted/20 p-3 md:p-4">
            <div className="flex items-end gap-2">
              <Textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(event); } }} placeholder="Converse com seu agente pessoal…" disabled={sending} className="min-h-12 resize-none" rows={2} />
              <Button type="submit" size="icon" disabled={sending || !input.trim()} aria-label="Enviar mensagem" className="size-12 shrink-0"><Send className="size-4" /></Button>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">Enter envia · Shift+Enter quebra linha · operações da agenda passam pelo agente transacional</p>
          </form>
        </CardContent>
      </Card>

      <aside className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="size-4 text-amber-500" /> O que ele aprende</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-500" /><span>Fatos e preferências que você confirma.</span></div>
            <div className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-500" /><span>Instruções com “lembra que…” ou “regra:”.</span></div>
            <div className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-500" /><span>Objetivos pessoais e feedback das respostas.</span></div>
            <div className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-500" /><span>Não treina os pesos do modelo sem um pipeline separado.</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Target className="size-4 text-primary" /> Contexto salvo</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-center text-sm">
            <div className="rounded-lg bg-muted/50 p-3"><strong className="block text-lg">{Object.keys(memory.facts).length}</strong><span className="text-muted-foreground">fatos</span></div>
            <div className="rounded-lg bg-muted/50 p-3"><strong className="block text-lg">{memory.instructions.length}</strong><span className="text-muted-foreground">instruções</span></div>
            <div className="rounded-lg bg-muted/50 p-3"><strong className="block text-lg">{memory.goals.filter((goal) => goal.status === "active").length}</strong><span className="text-muted-foreground">objetivos</span></div>
            <div className="rounded-lg bg-muted/50 p-3"><strong className="block text-lg">{memory.feedback.length}</strong><span className="text-muted-foreground">feedbacks</span></div>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="space-y-3 p-4 text-sm"><div className="flex items-center gap-2 font-medium"><CalendarClock className="size-4 text-primary" /> Ponte com a agenda</div><p className="text-muted-foreground">Pedidos como “agendar”, “cancelar” e “quais horários temos” são encaminhados ao agente de agendamento, que mantém suas confirmações e validações.</p></CardContent>
        </Card>

        <Button variant="outline" className="w-full gap-2" onClick={clear} disabled={messages.length === 0 && Object.keys(memory.facts).length === 0}><Trash2 className="size-4" /> Limpar memória e conversa</Button>
      </aside>
    </div>
  );
}
