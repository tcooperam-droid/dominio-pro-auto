import { useCallback, useMemo, useState } from "react";
import {
  clearPersonalData,
  loadMemory,
  loadConversation,
} from "./memory";
import {
  getPersonalAgentScope,
  ratePersonalResponse,
  sendPersonalMessage,
} from "./service";
import type { PersonalAgentResponse, PersonalMessage } from "./types";

export function usePersonalAgent() {
  const scope = useMemo(() => getPersonalAgentScope(), []);
  const [messages, setMessages] = useState<PersonalMessage[]>(() => loadConversation(scope));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (text: string): Promise<PersonalAgentResponse | null> => {
    if (!text.trim() || sending) return null;
    setSending(true);
    setError(null);
    try {
      const response = await sendPersonalMessage(text);
      setMessages(loadConversation(scope));
      return response;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Não foi possível consultar o agente pessoal.";
      setError(message);
      return null;
    } finally {
      setSending(false);
    }
  }, [scope, sending]);

  const rate = useCallback((messageId: string, rating: "good" | "bad") => {
    const assistant = messages.find((message) => message.id === messageId && message.role === "assistant");
    if (!assistant) return;
    const index = messages.findIndex((message) => message.id === messageId);
    const user = index > 0 ? messages[index - 1] : undefined;
    if (!user || user.role !== "user") return;
    ratePersonalResponse(user.content, assistant.content, rating);
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, feedback: rating } : message));
  }, [messages]);

  const clear = useCallback(() => {
    clearPersonalData(scope);
    setMessages([]);
    setError(null);
  }, [scope]);

  return {
    messages,
    sending,
    error,
    send,
    rate,
    clear,
    memory: loadMemory(scope),
  };
}
