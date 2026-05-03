// Mock realtime ticker — emits periodic job & alert events through realtime bus.
// Started once at PlatformShell mount.
import { useEffect } from "react";
import { realtime, type RealtimeJobEvent } from "./bff/realtime";

let started = false;

export function useMockRealtimeTicker() {
  useEffect(() => {
    if (started) return;
    started = true;

    const jobKinds = ["backtest", "evolution_step", "ingest", "rebalance_dryrun", "eval_suite"];
    const owners = ["alice", "bob", "carol", "scheduler"];
    const statuses: RealtimeJobEvent["status"][] = ["queued", "running", "success", "failed"];

    let i = 0;
    const interval = setInterval(() => {
      i++;
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const evt: RealtimeJobEvent = {
        jobId: `job-rt-${Date.now().toString(36)}`,
        status,
        ts: new Date().toISOString(),
      };
      realtime.emit("job", {
        ...evt,
        kind: jobKinds[i % jobKinds.length],
        owner: owners[i % owners.length],
      });

      // Occasionally emit a new alert
      if (i % 4 === 0) {
        const sev = (["low", "medium", "high"] as const)[Math.floor(Math.random() * 3)];
        realtime.emit("alert", {
          id: `alert-rt-${Date.now().toString(36)}`,
          severity: sev,
          title: `Live signal anomaly detected (${sev})`,
          source: "runtime/monitor",
          openedAt: new Date().toISOString(),
          acknowledged: false,
          description: "Auto-emitted by mock realtime ticker for QA demonstration.",
        });
      }
    }, 8000);

    return () => clearInterval(interval);
  }, []);
}
