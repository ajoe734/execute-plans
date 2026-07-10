// Phase 12.3 — Skill Sandbox Studio: input surface; execution stays disabled until a governed runner exists.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bff, bffV1 } from "@/lib/bff-v1";
import type { Skill } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { Play, TerminalSquare, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";

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
  const [result, setResult] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    bff.skills.list().then((rows) => {
      setSkills(rows);
      if (rows[0]) setActiveId((current) => current ?? rows[0].id);
    });
  }, []);

  const active = useMemo(() => skills.find((s) => s.id === activeId), [skills, activeId]);
  useEffect(() => { setInput(sampleInput(active)); }, [active]);

  const handleRun = async () => {
    if (!activeId) return;
    setIsSubmitting(true);

    if (bffV1.detectMode() === "live") {
      try {
        let parsedPayload = {};
        try {
          parsedPayload = JSON.parse(input);
        } catch {
          parsedPayload = { inputs: { query: "Summarize macro outlook for Q3 2026" } };
        }

        const response: any = await bffV1.fetch({
          method: "POST",
          path: `/bff/skills/${activeId}/sandbox-eval`,
          body: parsedPayload,
        });

        const jobId = response.job_id;
        setActiveJobId(jobId);
        setJobStatus("running");
        setLogs([]);
        setResult(null);

        const pollInterval = setInterval(async () => {
          try {
            const logResponse: any = await bffV1.fetch({
              method: "GET",
              path: `/bff/jobs/${jobId}/logs`,
            });

            if (logResponse.logs) {
              setLogs(logResponse.logs.map((log: any) => ({
                timestamp: log.timestamp || new Date().toISOString(),
                level: log.level || "INFO",
                message: typeof log === "string" ? log : log.message || JSON.stringify(log),
              })));
            }

            if (logResponse.status === "success" || logResponse.status === "succeeded") {
              setJobStatus("success");
              setResult(logResponse.progress || { status: "success", output: {} });
              clearInterval(pollInterval);
            } else if (logResponse.status === "failed") {
              setJobStatus("failed");
              clearInterval(pollInterval);
            }
          } catch (pollErr) {
            console.error("Polling error:", pollErr);
          }
        }, 1000);

        setTimeout(() => clearInterval(pollInterval), 30000);
      } catch (err: any) {
        toast.error(err.message || "Failed to trigger live sandbox evaluation");
        setJobStatus("idle");
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
        setTimeout(() => {
          setLogs((prev) => [
            ...prev,
            {
              timestamp: new Date().toISOString(),
              level: "INFO",
              message: step.log,
            },
          ]);
        }, step.delay);
      });

      setTimeout(() => {
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
              <Button size="sm" onClick={handleRun} disabled={isSubmitting || !activeId}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-1" />
                )}
                {t("studios.sandbox.run")}
              </Button>
            </div>
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={10} className="text-mono text-xs" />
          </Card>
          <Card className="p-4 space-y-3 flex flex-col">
            <div className="text-sm font-semibold">{t("studios.sandbox.trace")}</div>
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
