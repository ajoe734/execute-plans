// MGMT-GAP-008 — Tools/MCP/Skills detail pages used to show a permanent
// "loading" placeholder for a seed/mock id that doesn't exist in the live
// registry (indistinguishable from a slow network call). This renders the
// same honest "live registry empty" signal the list pages already use
// (`capabilityEmptyState` in CapabilitiesLists.tsx) once the fetch has
// resolved with no record.
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useT } from "@/platform/hooks";

interface Props {
  kind: string;
  id?: string;
}

export const CapabilityDetailEmptyState = ({ kind, id }: Props) => {
  const t = useT();
  return (
    <div className="p-6">
      <EmptyState
        icon={<Inbox className="h-8 w-8" />}
        title={t("capabilities.detail.notFoundTitle", {
          kind,
          defaultValue: "Live {{kind}} registry has no record for this id",
        })}
        description={t("capabilities.detail.notFoundDescription", {
          id: id ?? "",
          defaultValue:
            "\"{{id}}\" was not found in the live registry. It may be a demo/seed id that doesn't exist in production, or the capability service hasn't been populated yet.",
        })}
      />
    </div>
  );
};
