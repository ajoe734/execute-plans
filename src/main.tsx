import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { detectMode, setMockResolver } from "@/lib/bff-v1/client";

if (detectMode() === "mock") {
  void import("@/lib/bff-v1/mocks/registry").then((mod) => {
    if (typeof mod.resolveMock === "function") {
      setMockResolver(mod.resolveMock);
    }
  }).catch(() => {});
}

createRoot(document.getElementById("root")!).render(<App />);

