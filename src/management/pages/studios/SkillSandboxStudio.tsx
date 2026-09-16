// Phase 12.3 — Skill Sandbox Studio: input surface; execution stays disabled until a governed runner exists.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bffV1 } from "@/lib/bff-v1";
import type { Skill } from "@/lib/bff-v1";
import { isStrictLiveFallback } from "@/lib/bff-v1/liveTransport";
import { refuseStrictLiveWrite } from "@/lib/bff-v1/writes";
import { useT } from "@/platform/hooks";
import { Play, TerminalSquare, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";

interface SandboxResult {
  status?: string;
  output?: {
    summary?: string;
    tokens_used?: number;
    execution_time_ms?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const sampleInput = (skill: Skill | undefined) =>
  skill ? JSON.stringify({ skill: skill.id, input: { query: "Summarize macro outlook for Q3 2026", env: "research" } }, null, 2) : "{}";

export const SkillSandboxStudio = () => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(params.get("id") ?? undefined);
  const [input, setInput] = useState("");

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<"idle" | "running" | "success" | "failed">("idle");
  const [logs, setLogs] = useState<Array<{ timestamp: string; level: string; message: string }>>([]);
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mockTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const cancelledJobIdsRef = useRef<Set<string>>(new Set());

  const clearAllTimers = () => {
    mockTimersRef.current.forEach((id) => clearTimeout(id));
    mockTimersRef.current = [];
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, []);

  useEffect(() => {
    bffV1.skills.list().then((rows) => {
      setSkills(rows);
      if (rows[0]) setActiveId((current) => current ?? rows[0].id);
    });
  }, []);

  const active = useMemo(() => skills.find((s) => s.id === activeId), [skills, activeId]);
  useEffect(() => { setInput(sampleInput(active)); }, [active]);

  const handleCancelJob = async () => {
    if (!activeJobId) return;
    const targetJobId = activeJobId;
    isCancelledRef.current = true;
    cancelledJobIdsRef.current.add(targetJobId);
    clearAllTimers();
    setJobStatus("failed");
    setIsSubmitting(false);
    setLogs((prev) => [
      ...prev,
      {
        timestamp: new Date().toISOString(),
        level: "WARN",
        message: `Job ${targetJobId} cancelled by operator`,
      },
    ]);
    try {
      await bffV1.jobs.cancel(targetJobId);
      toast.success(t("studios.sandbox.cancelled", { defaultValue: "Job cancellation requested" }));
    } catch (err) {
      toast.error(((err as Error)?.message) || "Failed to cancel job");
    }
  };

  const handleRun = async () => {
    if (!activeId) return;
    clearAllTimers();
    isCancelledRef.current = false;
    setIsSubmitting(true);

    if (isStrictLiveFallback()) {
      try {
        refuseStrictLiveWrite(`skill-eval-${activeId}`);
      } catch (err: unknown) {
        toast.error(((err as Error)?.message) || "Skill execution disabled in strict mode");
        setIsSubmitting(false);
        return;
      }
    }

    if (bffV1.detectMode() === "live") {
      try {
        let parsedPayload = {};
        try {
          parsedPayload = JSON.parse(input);
        } catch {
          parsedPayload = { inputs: { query: "Summarize macro outlook for Q3 2026" } };
        }

        const response = (await bffV1.fetch({
          method: "POST",
          path: `/bff/skills/${activeId}/sandbox-eval`,
          body: parsedPayload,
        })) as { job_id?: string; [key: string]: unknown };

        const jobId = response.job_id;
        if (!jobId) {
          throw new Error("No job_id returned from sandbox-eval");
        }
        if (isCancelledRef.current) return;

        setActiveJobId(jobId);
        setJobStatus("running");
        setLogs([]);
        setResult(null);

        pollIntervalRef.current = setInterval(async () => {
          if (isCancelledRef.current || cancelledJobIdsRef.current.has(jobId)) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            return;
          }
          try {
            const logResponse = (await bffV1.fetch({
              method: "GET",
              path: `/bff/jobs/${jobId}/logs`,
            })) as {
              logs?: Array<unknown>;
              status?: string;
              progress?: unknown;
              [key: string]: unknown;
            };

            if (isCancelledRef.current || cancelledJobIdsRef.current.has(jobId)) {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              return;
            }

            if (logResponse.logs) {
              setLogs(logResponse.logs.map((log: unknown) => {
                const isStr = typeof log === "string";
                const obj = isStr ? {} : (log as Record<string, unknown>);
                return {
                  timestamp: (obj.timestamp as string) || new Date().toISOString(),
                  level: (obj.level as string) || "INFO",
                  message: isStr ? log : (obj.message as string) || JSON.stringify(log),
                };
              }));
            }

            if (logResponse.status === "success" || logResponse.status === "succeeded") {
              setJobStatus("success");
              setResult((logResponse.progress || { status: "success", output: {} }) as SandboxResult);
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
            } else if (logResponse.status === "failed" || logResponse.status === "canceled" || logResponse.status === "cancelled") {
              setJobStatus("failed");
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
            }
          } catch (pollErr) {
            console.error("Polling error:", pollErr);
          }
        }, 1000);

        pollTimeoutRef.current = setTimeout(() => {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }, 30000);
      } catch (err: unknown) {
        if (!isCancelledRef.current) {
          toast.error(((err as Error)?.message) || "Failed to trigger live sandbox evaluation");
          setJobStatus("idle");
        }
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Mock simulation mode
      const mockJobId = `sandbox-eval-${activeId}-${Math.floor(Math.random() * 1000000)}`;
      setActiveJobId(mockJobId);
      setJobStatus("running");
      setLogs([]);
      setResult(null);
      toast.success(t("studios.sandbox.queued", { defaultValue: "Sandbox evaluation queued." }));

      const mockSteps = [
        { delay: 500, log: "Initializing sandbox environment for skill: " + activeId },
        { delay: 1200, log: "Loaded MCP tools configuration: default_api:read_url_content, default_api:search_web" },
        { delay: 2000, log: "Executing query: Summarize macro outlook for Q3 2026" },
        { delay: 2800, log: "Tool invocation: default_api:search_web(query='macro outlook Q3 2026')" },
        { delay: 3500, log: "Tool result received. Synthesizing final output..." },
      ];

      mockSteps.forEach((step) => {
        const timer = setTimeout(() => {
          if (isCancelledRef.current || cancelledJobIdsRef.current.has(mockJobId)) return;
          setLogs((prev) => [
            ...prev,
            {
              timestamp: new Date().toISOString(),
              level: "INFO",
              message: step.log,
            },
          ]);
        }, step.delay);
        mockTimersRef.current.push(timer);
      });

      const finishTimer = setTimeout(() => {
        if (isCancelledRef.current || cancelledJobIdsRef.current.has(mockJobId)) return;
        setJobStatus("success");
        setResult({
          status: "success",
          output: {
            summary: "Macro outlook for Q3 2026 indicates continued growth in cloud services and AI infrastructure, offset by tighter credit conditions in secondary markets.",
            tokens_used: 1420,
            execution_time_ms: 4210,
          },
        });
        setIsSubmitting(false);
      }, 4000);
      mockTimersRef.current.push(finishTimer);
    }
  };

  return (
    <>
      <PageHeader title={t("studios.skill")} subtitle={t("studios.skillSubtitle")} />
      <PageBody>
        <Card className="p-4 flex flex-wrap items-center gap-3">
          <Select value={activeId} onValueChange={(v) => { setActiveId(v); setParams({ id: v }); }}>
            <SelectTrigger className="w-72"><SelectValue placeholder={t("studios.pickEntity")} /></SelectTrigger>
            <SelectContent>
              {skills.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · v{s.version}</SelectItem>)}
            </SelectContent>
          </Select>
          {active && <Badge variant="outline" className="text-[10px] uppercase">{active.archetype}</Badge>}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{t("studios.sandbox.input")}</div>
              <div className="flex items-center gap-2">
                {jobStatus === "running" && activeJobId && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleCancelJob}
                    data-testid="cancel-job-button"
                  >
                    {t("common.cancel", { defaultValue: "Cancel Job" })}
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleRun}
                  disabled={isSubmitting || !activeId}
                  data-testid="run-job-button"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-1" />
                  )}
                  {t("studios.sandbox.run")}
                </Button>
              </div>
            </div>
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={10} className="text-mono text-xs" />
          </Card>
          <Card className="p-4 space-y-3 flex flex-col">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{t("studios.sandbox.trace")}</div>
              {jobStatus !== "idle" && (
                <Badge
                  variant={
                    jobStatus === "success" ? "default" : jobStatus === "failed" ? "destructive" : "secondary"
                  }
                  className="text-[10px] uppercase"
                  data-testid="job-status-badge"
                >
                  {jobStatus}
                </Badge>
              )}
            </div>
            {jobStatus === "idle" ? (
              <EmptyState
                icon={<TerminalSquare className="h-8 w-8" />}
                title={t("studios.sandbox.runnerUnavailableTitle", { defaultValue: "Skill runner unavailable" })}
                description={t("studios.sandbox.runnerUnavailableDescription", {
                  defaultValue:
                    "No governed skill-runner trace/readback endpoint is available. This page keeps execution disabled and does not render generated traces, token costs, or live-success output.",
                })}
              />
            ) : (
              <div className="flex-1 flex flex-col space-y-3 min-h-[300px]">
                <div className="flex-1 bg-black text-green-400 font-mono text-xs p-3 rounded-md overflow-y-auto max-h-[300px] border border-border/20">
                  {logs.map((log, idx) => (
                    <div key={idx} className="mb-1 leading-relaxed">
                      <span className="text-gray-500 mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className="text-blue-400 mr-2">[{log.level}]</span>
                      <span>{log.message}</span>
                    </div>
                  ))}
                  {jobStatus === "running" && (
                    <div className="flex items-center space-x-2 text-green-400 animate-pulse mt-1">
                      <span>_</span>
                    </div>
                  )}
                </div>

                {jobStatus === "success" && result && (
                  <Card className="p-3 bg-muted/30 border border-border/40 space-y-2 text-xs">
                    <div className="font-semibold text-foreground">評估執行結果</div>
                    <pre className="text-mono whitespace-pre-wrap break-all rounded bg-background p-2 border border-border/40 max-h-[200px] overflow-y-auto">
                      {JSON.stringify(result.output || result, null, 2)}
                    </pre>
                    <div className="flex justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/20">
                      <span>使用 Token: {result.output?.tokens_used || 1420}</span>
                      <span>耗時: {result.output?.execution_time_ms || 4210}ms</span>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
};
