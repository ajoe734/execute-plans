import { useEffect, useState } from "react";
import { bff } from "@/lib/bff/client";
import type { ObjectVersion } from "@/lib/bff/types";
import { VersionDiffViewer } from "./VersionDiffViewer";
import { useT } from "@/platform/hooks";

export const PersonaVersionHistoryTab = ({ personaId }: { personaId: string }) => {
  const t = useT();
  const [versions, setVersions] = useState<ObjectVersion[]>([]);
  useEffect(() => {
    bff.objectVersions.forSubject("Persona", personaId).then(setVersions);
  }, [personaId]);
  if (versions.length === 0) {
    return <div className="text-sm text-muted-foreground p-4">{t("phase13.persona.versions.empty")}</div>;
  }
  return <VersionDiffViewer versions={versions.map((v) => ({ id: v.id, version: v.version, author: v.author, createdAt: v.createdAt, note: v.note, spec: v.spec }))} />;
};
