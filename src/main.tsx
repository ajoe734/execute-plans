import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { detectMode, setMockResolver, type MockHandlerResolver } from "@/lib/bff-v1/client";

export async function prepareMockEnvironment(): Promise<MockHandlerResolver | undefined> {
  if (detectMode() === "mock") {
    const [adapters, registry] = await Promise.all([
      import("@/lib/bff-v1/mocks/adapters"),
      import("@/lib/bff-v1/mocks/registry"),
    ]);
    if (typeof adapters.bootstrapMockAdapters === "function") {
      adapters.bootstrapMockAdapters();
    }
    const resolver = typeof registry.resolveMock === "function" ? registry.resolveMock : undefined;
    if (resolver) {
      setMockResolver(resolver);
    }
    return resolver;
  }
  return undefined;
}

export async function bootstrapApp(
  rootElement: HTMLElement | null = document.getElementById("root"),
): Promise<void> {
  await prepareMockEnvironment();
  if (rootElement) {
    createRoot(rootElement).render(<App />);
  }
}

if (typeof document !== "undefined" && document.getElementById("root")) {
  void bootstrapApp();
}


