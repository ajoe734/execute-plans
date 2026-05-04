import { useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useT } from "@/platform/hooks";
import { toast } from "sonner";
import { useHandoff } from "@/lib/handoff";
import { bff } from "@/lib/bff/client";

interface Note { id: string; title: string; body: string; tags: string[]; artifactId?: string; ts: string; }

export const Notebook = () => {
  const t = useT();
  const openHandoff = useHandoff((s) => s.openHandoff);
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [artifactId, setArtifactId] = useState("");

  const add = () => {
    if (!title.trim()) return;
    setNotes((n) => [{ id: `rn_${Date.now().toString(36)}`, title, body, tags: parseTags(tags), artifactId: artifactId.trim() || undefined, ts: new Date().toISOString() }, ...n]);
    setTitle(""); setBody(""); setTags(""); setArtifactId("");
    toast.success("research_note saved");
  };

  const parseTags = (value: string) => value.split(",").map((x) => x.trim()).filter(Boolean);

  const convertToResearchTask = async (note: Note) => {
    const result = await bff.mutations.createResearchTaskFromNote(note.id, `Notebook note: ${note.title}`);
    openHandoff({
      type: "research_task",
      source: { kind: "ResearchNote", id: note.id, label: note.title },
      summary: note.title,
      evidence: [note.artifactId, ...note.tags.map((tag) => `tag:${tag}`)].filter(Boolean) as string[],
      notes: note.body,
      priority: "normal",
      targetRoute: "/management/experiments",
    });
    toast.success(t("agora.notebook.queued", { id: result.job.id }));
  };

  const handoff = (type: "strategy_idea" | "research_task") => {
    if (!title.trim()) { toast.error(t("common.addTitleFirst")); return; }
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
            <Input placeholder={t("agora.notebook.titlePh")} value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea placeholder={t("agora.notebook.bodyPh")} className="min-h-[200px]" value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input placeholder={t("agora.notebook.tagsPh")} value={tags} onChange={(e) => setTags(e.target.value)} />
              <Input placeholder={t("agora.notebook.artifactPh")} value={artifactId} onChange={(e) => setArtifactId(e.target.value)} />
            </div>
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
                <div className="flex flex-wrap gap-1 mt-2">
                  {n.tags.map((tag) => <span key={tag} className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">#{tag}</span>)}
                  {n.artifactId && <span className="rounded border border-accent/30 px-1.5 py-0.5 text-[10px] text-accent">{n.artifactId}</span>}
                </div>
                <p className="text-sm mt-2 whitespace-pre-wrap">{n.body}</p>
                <div className="flex justify-end mt-3">
                  <Button size="sm" variant="outline" onClick={() => convertToResearchTask(n)}>{t("agora.notebook.convertResearch")}</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </PageBody>
    </>
  );
};
