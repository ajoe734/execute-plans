// Management AI chat panel — Pantheon BFF runtime ONLY.
//
// 2026-06-03 rewrite: stripped the Supabase Edge Function (`management-agent`)
// transport, the @ai-sdk/react `useChat` loop, tool-call/approval UI, and the
// chat_threads/chat_messages persistence. Runtime path is now strictly:
//   User → Lovable FE → POST /bff/management/nl/ask → Pantheon BFF
//                                                 → OpenClaw gateway / Codex
// The FE never generates an answer locally. If the provider runtime is
// degraded/disabled/error OR the BFF endpoint is unreachable, the UI surfaces
// a degraded banner — never a synthetic reply.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { AlertCircle, ExternalLink, RefreshCcw } from "lucide-react";
import { askManagementAi, fetchManagementAiConversation, type ManagementAiResult, type ProviderStatus } from "@/lib/bff-v1/managementAi";
import { useLocation } from "react-router-dom";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  providerStatus?: ProviderStatus | null;
  auditLogHref?: string | null;
  conversationHref?: string | null;
}

interface DegradedState {
  message: string;
  providerStatus: ProviderStatus | null;
}

function turnId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function ProviderStatusBar({ s }: { s: ProviderStatus }) {
  const tone = s.used && String(s.status).toLowerCase() === "completed"
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-amber-700 dark:text-amber-400";
  return (
    <div className={`text-[10px] font-mono ${tone} flex flex-wrap gap-x-2 gap-y-0.5`}>
      <span>provider={s.provider}</span>
      <span>runtime={s.runtime}</span>
      <span>status={String(s.status)}</span>
      <span>used={String(s.used)}</span>
      <span>fallback={s.fallback ?? "null"}</span>
    </div>
  );
}

export function AgentPanelBody() {
  const location = useLocation();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [degraded, setDegraded] = useState<DegradedState | null>(null);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const lastProviderStatus = useMemo<ProviderStatus | null>(() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const ps = turns[i].providerStatus;
      if (ps) return ps;
    }
    return null;
  }, [turns]);

  const lastLinks = useMemo(() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      if (t.auditLogHref || t.conversationHref) {
        return { audit: t.auditLogHref ?? null, conversation: t.conversationHref ?? null };
      }
    }
    return { audit: null as string | null, conversation: null as string | null };
  }, [turns]);

  const startNewConversation = useCallback(() => {
    setTurns([]);
    setSessionId(null);
    setTraceId(null);
    setDegraded(null);
    setText("");
    inputRef.current?.focus();
  }, []);

  const resync = useCallback(async () => {
    if (!sessionId) return;
    const res = await fetchManagementAiConversation(sessionId, traceId);
    if (!res.ok) {
      setDegraded({ message: `Resync failed: ${res.message}`, providerStatus: null });
      return;
    }
    setTurns(res.turns.map((t) => ({
      id: t.id,
      role: t.role === "assistant" ? "assistant" : "user",
      text: t.text,
      providerStatus: t.providerStatus ?? null,
    })));
  }, [sessionId, traceId]);

  const submit = useCallback(async (raw: string) => {
    const question = raw.trim();
    if (!question || pending) return;
    setPending(true);
    setDegraded(null);
    const userTurn: ChatTurn = { id: turnId("u"), role: "user", text: question };
    setTurns((prev) => [...prev, userTurn]);

    const result: ManagementAiResult = await askManagementAi({
      question,
      focus: "all",
      context: location.pathname,
      sessionId,
    });

    if (result.ok) {
      setSessionId(result.sessionId ?? sessionId);
      setTraceId(result.traceId);
      setTurns((prev) => [...prev, {
        id: turnId("a"),
        role: "assistant",
        text: result.answer,
        providerStatus: result.providerStatus,
        auditLogHref: result.auditLogHref,
        conversationHref: result.conversationHref,
      }]);
      setDegraded(null);
    } else if (result.kind === "provider_degraded") {
      setSessionId(result.sessionId ?? sessionId);
      setTraceId(result.traceId);
      setDegraded({ message: result.message, providerStatus: result.providerStatus });
    } else {
      setDegraded({
        message: result.status
          ? `Pantheon BFF returned ${result.status}: ${result.message}`
          : `BFF transport failure: ${result.message}`,
        providerStatus: null,
      });
    }
    setPending(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [location.pathname, pending, sessionId]);

  const onSubmit = (_msg: unknown, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const t = text;
    setText("");
    void submit(t);
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-background">
      <div className="border-b px-2 py-1 flex items-center gap-2 bg-muted/20">
        <span className="text-[11px] font-medium">Management AI</span>
        <span className="text-[10px] text-muted-foreground">
          {sessionId ? `session ${sessionId.slice(0, 10)}…` : "new session"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={startNewConversation}>
            新對話
          </Button>
          <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => void resync()} disabled={!sessionId}>
            <RefreshCcw className="h-3 w-3 mr-1" />Resync
          </Button>
        </div>
      </div>

      {lastProviderStatus && (
        <div className="border-b px-2 py-1 bg-muted/10">
          <ProviderStatusBar s={lastProviderStatus} />
          {(lastLinks.audit || lastLinks.conversation) && (
            <div className="text-[10px] mt-0.5 flex gap-2">
              {lastLinks.audit && (
                <a href={lastLinks.audit} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                  audit log <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
              {lastLinks.conversation && (
                <a href={lastLinks.conversation} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                  conversation <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
              {traceId && <span className="text-muted-foreground">trace={traceId.slice(0, 12)}…</span>}
            </div>
          )}
        </div>
      )}

      <Conversation className="flex-1 min-h-0">
        <ConversationContent>
          {turns.length === 0 && !pending && (
            <ConversationEmptyState
              title="Pantheon Management AI"
              description="透過 Pantheon BFF → OpenClaw gateway / Codex provider 回應。FE 不會自行生成答案。"
            />
          )}
          {turns.map((t) => (
            <Message key={t.id} from={t.role}>
              {t.role === "assistant"
                ? <MessageResponse>{t.text}</MessageResponse>
                : <MessageContent>{t.text}</MessageContent>}
            </Message>
          ))}
          {pending && (
            <div className="px-4 py-2"><Shimmer>透過 OpenClaw 等候 Codex 回應…</Shimmer></div>
          )}
          {degraded && (
            <div className="mx-4 my-2 rounded-md border border-amber-500/60 bg-amber-500/10 p-2 space-y-1 text-xs">
              <div className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Pantheon BFF / OpenClaw provider degraded — FE 不會自行回答。</span>
              </div>
              <div className="font-mono text-[10px] text-muted-foreground break-all">{degraded.message}</div>
              {degraded.providerStatus && <ProviderStatusBar s={degraded.providerStatus} />}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t p-2">
        <PromptInput onSubmit={onSubmit}>
          <PromptInputTextarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="跟 Management AI 說話…（經 Pantheon BFF / OpenClaw）"
            disabled={pending}
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit
              status={pending ? "submitted" : "ready"}
              disabled={!text.trim() || pending}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
