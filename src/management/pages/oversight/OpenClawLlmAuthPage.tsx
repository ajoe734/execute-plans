import { OpenClawLlmAuthPanel } from "@/management/components/openclaw/OpenClawLlmAuthPanel";

export function OpenClawLlmAuthPage() {
  return (
    <section className="p-6 space-y-4" aria-label="LLM Provider Auth">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">LLM Provider Auth</h1>
        <p className="text-sm text-muted-foreground">
          Assistant provider auth, OpenClaw adapter status, quota, and reauth status.
        </p>
      </header>
      <OpenClawLlmAuthPanel mode="full" />
    </section>
  );
}
