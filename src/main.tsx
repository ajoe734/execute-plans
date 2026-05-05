import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { rehydrate } from "./lib/bff/persistence";
import { mutations } from "./lib/bff/mutations";

// Phase 15 — restore persisted seed before any component reads it.
rehydrate();

// Phase 17 — periodic SLA sweep for approval stages (every 60s, also on load).
mutations.tickApprovalSla();
setInterval(() => { mutations.tickApprovalSla(); }, 60_000);

createRoot(document.getElementById("root")!).render(<App />);
