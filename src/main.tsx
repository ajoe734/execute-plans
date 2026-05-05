import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { rehydrate } from "./lib/bff/persistence";

// Phase 15 — restore persisted seed before any component reads it.
rehydrate();

createRoot(document.getElementById("root")!).render(<App />);
