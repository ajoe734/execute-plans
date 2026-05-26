// Legacy /management/agent route redirects to cockpit and opens the floating panel.
import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { agentPanel } from "@/management/components/agent/useAgentPanel";

export function ManagementAgentRedirect() {
  useEffect(() => { agentPanel.open(); }, []);
  return <Navigate to="/management/cockpit" replace />;
}
