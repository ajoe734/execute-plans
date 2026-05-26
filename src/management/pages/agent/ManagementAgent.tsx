// TEST MODE: no auth. Anonymous session id stored in localStorage.
// Re-enable auth (useAuth, accessToken, ProtectedRoute) before production.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { PlusCircle, Trash2, MessageSquare, Brain, Check, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const FUNCTION_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.functions.supabase.co/management-agent`;

const ANON_KEY = "pantheon.anonId";
function getAnonId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = `anon-${crypto.randomUUID()}`;
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return `anon-${Math.random().toString(36).slice(2)}`;
  }
}

interface Thread { id: string; title: string; updated_at: string; }

export default function ManagementAgent() {
  const { threadId: routeThreadId } = useParams();
  const nav = useNavigate();
  const anonId = useMemo(() => getAnonId(), []);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);

  const reloadThreads = async () => {
    const { data } = await supabase
      .from("chat_threads")
      .select("id,title,updated_at")
      .eq("user_id", anonId)
      .order("updated_at", { ascending: false });
    setThreads(data ?? []);
  };
  useEffect(() => { reloadThreads(); }, [anonId]);

  // Bootstrap: if no :threadId, create/select.
  useEffect(() => {
    if (routeThreadId && routeThreadId !== "new") return;
    (async () => {
      if (routeThreadId === "new" || threads.length === 0) {
        const { data, error } = await supabase
          .from("chat_threads")
          .insert({ user_id: anonId, title: "New conversation" })
          .select("id").single();
        if (error) { toast.error(error.message); return; }
        await reloadThreads();
        nav(`/management/agent/${data.id}`, { replace: true });
      } else {
        nav(`/management/agent/${threads[0].id}`, { replace: true });
      }
    })();
  }, [routeThreadId, anonId, threads.length]);

  useEffect(() => {
    if (!routeThreadId || routeThreadId === "new") return;
    setLoadingMsgs(true);
    supabase.from("chat_messages")
      .select("id,role,parts,message_id,created_at")
      .eq("thread_id", routeThreadId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const msgs: UIMessage[] = (data ?? []).map((r) => ({
          id: r.message_id || r.id,
          role: r.role as "user" | "assistant",
          parts: r.parts as UIMessage["parts"],
        }));
        setInitialMessages(msgs);
        setLoadingMsgs(false);
      });
  }, [routeThreadId]);

  const newThread = async () => {
    const { data, error } = await supabase.from("chat_threads")
      .insert({ user_id: anonId, title: "New conversation" }).select("id").single();
    if (error) { toast.error(error.message); return; }
    await reloadThreads();
    nav(`/management/agent/${data.id}`);
  };

  const deleteThread = async (id: string) => {
    await supabase.from("chat_threads").delete().eq("id", id).eq("user_id", anonId);
    await reloadThreads();
    if (id === routeThreadId) nav("/management/agent");
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-1.5 flex items-center gap-2 text-xs text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>測試版：未啟用登入，所有對話為公開可讀。Anon · {anonId.slice(-6)}</span>
        <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-xs" onClick={() => nav("/management/cockpit")}>← 回 Cockpit</Button>
      </div>
      <div className="flex flex-1 min-h-0">
        <aside className="w-64 border-r flex flex-col">
          <div className="p-3 border-b flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Brain className="h-4 w-4" /> Management AI
            </div>
            <Button size="icon" variant="ghost" onClick={newThread} title="New conversation" className="h-8 w-8">
              <PlusCircle className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <ul className="p-2 space-y-1">
              {threads.map((t) => (
                <li
                  key={t.id}
                  className={`group flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer hover:bg-accent ${t.id === routeThreadId ? "bg-accent" : ""}`}
                  onClick={() => nav(`/management/agent/${t.id}`)}
                >
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{t.title}</span>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); deleteThread(t.id); }}
                    aria-label="Delete thread"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
          <div className="p-3 border-t text-xs text-muted-foreground">
            Test mode · {anonId.slice(-6)}
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0">
          {routeThreadId && routeThreadId !== "new" && !loadingMsgs ? (
            <ChatWindow
              key={routeThreadId}
              threadId={routeThreadId}
              anonId={anonId}
              initialMessages={initialMessages}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading…</div>
          )}
        </main>
      </div>
    </div>
  );
}

function ChatWindow({ threadId, anonId, initialMessages }: {
  threadId: string; anonId: string; initialMessages: UIMessage[];
}) {
  const nav = useNavigate();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: FUNCTION_URL,
      body: { threadId, anonId },
    }),
    [threadId, anonId],
  );

  const { messages, sendMessage, status, addToolResult, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onError: (e) => {
      const m = (e as Error).message;
      if (m.includes("429")) toast.error("AI 使用量已達上限，請稍後再試");
      else if (m.includes("402")) toast.error("AI 點數已用罄，請至工作區設定加值");
      else toast.error(m);
    },
    sendAutomaticallyWhen: () => true,
  });

  useEffect(() => {
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const part of m.parts ?? []) {
        if (part.type === "tool-navigate" && part.state === "input-available") {
          const href = (part.input as { href?: string })?.href;
          if (href) {
            try { nav(href); } catch { /* ignore */ }
            addToolResult({
              tool: "navigate",
              toolCallId: part.toolCallId,
              output: { ok: true, href },
            });
          }
        }
      }
    }
  }, [messages, addToolResult, nav]);

  useEffect(() => { inputRef.current?.focus(); }, [threadId, status]);

  const onSubmit = async (_msg: unknown, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!text.trim() || status === "submitted" || status === "streaming") return;
    const t = text.trim();
    setText("");
    await sendMessage({ text: t });
  };

  return (
    <>
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 && (
            <ConversationEmptyState
              title="Pantheon Management AI"
              description="詢問 cockpit 數據、導航到任何頁面，或請我代為提交審批／介入。"
            />
          )}
          {messages.map((m) => (
            <div key={m.id}>
              {m.parts?.map((part, idx) => {
                if (part.type === "text") {
                  return (
                    <Message key={idx} from={m.role}>
                      {m.role === "assistant" ? (
                        <MessageResponse>{part.text}</MessageResponse>
                      ) : (
                        <MessageContent>{part.text}</MessageContent>
                      )}
                    </Message>
                  );
                }
                if (part.type?.startsWith("tool-") || part.type === "dynamic-tool") {
                  return <ToolBlock key={idx} part={part} addToolResult={addToolResult} />;
                }
                return null;
              })}
            </div>
          ))}
          {status === "submitted" && (
            <div className="px-4 py-2"><Shimmer>Thinking…</Shimmer></div>
          )}
          {error && (
            <div className="px-4 py-2 text-sm text-destructive">{error.message}</div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t p-3">
        <PromptInput onSubmit={onSubmit}>
          <PromptInputTextarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="跟 Management AI 說話… (例如：cockpit 現在有什麼風險？)"
            disabled={status === "streaming"}
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} disabled={!text.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  );
}

function ToolBlock({ part, addToolResult }: {
  part: any;
  addToolResult: ReturnType<typeof useChat>["addToolResult"];
}) {
  const toolName: string = part.type === "dynamic-tool"
    ? (part.toolName as string)
    : (part.type as string).slice("tool-".length);

  const needsApproval = part.state === "input-available" && [
    "decide_inbox_item", "create_ask", "create_intervention", "trigger_readiness",
  ].includes(toolName);

  return (
    <div className="px-4 py-2">
      <Tool defaultOpen={false}>
        <ToolHeader type={`tool-${toolName}` as any} state={part.state} />
        <ToolContent>
          <ToolInput input={part.input} />
          <ToolOutput output={part.output} errorText={part.errorText} />
        </ToolContent>
      </Tool>
      {needsApproval && (
        <div className="mt-2 ml-4 flex items-center gap-2 text-sm bg-muted/40 border rounded-md p-2">
          <span className="flex-1">
            ⚠ 高風險動作：<span className="font-medium">{toolName}</span> — 需要你的批准。
          </span>
          <Button size="sm" variant="outline" onClick={() =>
            addToolResult({ tool: toolName as never, toolCallId: part.toolCallId, output: { approved: false, reason: "user_denied" } })
          }>
            <X className="h-3.5 w-3.5 mr-1" /> 拒絕
          </Button>
          <Button size="sm" onClick={() =>
            addToolResult({ tool: toolName as never, toolCallId: part.toolCallId, output: { approved: true } })
          }>
            <Check className="h-3.5 w-3.5 mr-1" /> 批准
          </Button>
        </div>
      )}
    </div>
  );
}
