import { useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useT } from "@/platform/hooks";
import { toast } from "sonner";
import { useHandoff } from "@/lib/handoff";

interface Note { id: string; title: string; body: string; ts: string; }

export const Notebook = () => {
  const t = useT();
  const openHandoff = useHandoff((s) => s.openHandoff);
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const add = () => {
    if (!title.trim()) return;
    setNotes((n) => [{ id: Math.random().toString(36).slice(2), title, body, ts: new Date().toISOString() }, ...n]);
    setTitle(""); setBody("");
    toast.success("research_note saved");
  };

  const handoff = (type: "strategy_idea" | "research_task") => {
    if (!title.trim()) { toast.error("Add a title first"); return; }
    openHandoff({
      type,
      source: { kind: "ResearchNote", id: `rn_${Date.now().toString(36)}`, label: title },
      summary: title,
      notes: body,
      priority: "normal",
    });
  };

  return (
    <>
      <PageHeader title={t("nav.notebook")} />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 space-y-3">
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea placeholder="Capture observations, hypothesis, links…" className="min-h-[200px]" value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handoff("strategy_idea")}>→ Strategy Idea</Button>
              <Button variant="outline" onClick={() => handoff("research_task")}>→ Research Task</Button>
              <Button onClick={add}>{t("actions.save")}</Button>
            </div>
          </Card>

          <div className="space-y-3">
            {notes.length === 0 && <Card className="p-8 text-center text-muted-foreground text-sm">{t("agora.notebook.empty")}</Card>}
            {notes.map((n) => (
              <Card key={n.id} className="p-4">
                <div className="font-semibold">{n.title}</div>
                <div className="text-xs text-muted-foreground text-mono mt-0.5">{new Date(n.ts).toLocaleString()}</div>
                <p className="text-sm mt-2 whitespace-pre-wrap">{n.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </PageBody>
    </>
  );
};
