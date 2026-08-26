import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { rehydrate } from "./lib/bff/persistence";
import { mutations } from "./lib/bff/mutations";
import { isLiveBffModeConfigured } from "./lib/bff-v1/seedTaxonomy";

// Phase 15 — restore persisted seed before any component reads it.
rehydrate();

// Phase 17 — periodic SLA sweep for approval stages (every 60s, also on load).
// This is a mock-only in-process mutation. A strict-live build must not touch
// the fixture graph during bootstrap; its approval SLA state belongs to the
// BFF and is read through the live transport instead.
if (!isLiveBffModeConfigured()) {
  void mutations.tickApprovalSla();
  setInterval(() => { void mutations.tickApprovalSla(); }, 60_000);
}

createRoot(document.getElementById("root")!).render(<App />);
