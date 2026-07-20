import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  tradeJournal,
  interaction,
  lists,
  type TradeEpisodeProjection,
  type PersonaTradeReflection,
  type TradePattern,
} from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import { toast } from "sonner";
import { safeDateTime } from "@/lib/utils";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Activity,
  FileText,
  Database,
  Inbox,
  AlertTriangle,
  RotateCcw,
  Search,
  AlertCircle,
  ChevronRight
} from "lucide-react";
import { bffV1 } from "@/lib/bff-v1/client";
import { useAgoraWriteAccess } from "@/agora/useAgoraWriteAccess";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

// Status color mappings
const statusBadgeStyles: Record<string, string> = {
  proposed: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  approved: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  submitted: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  partially_filled: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  open: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  reducing: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  closed: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  reflection_pending: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  reflected: "bg-teal-500/10 text-teal-500 border-teal-500/20",
  force_closed: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  reflection_failed: "bg-red-500/10 text-red-500 border-red-500/20",
  aborted: "bg-gray-500/10 text-gray-500 border-gray-500/20"
};

const ago = (hours: number): string => {
  const d = new Date(Date.now() - hours * 3600 * 1000);
  return d.toISOString();
};

interface ChallengeCandidate {
  persona_id: string;
  display_name: string;
  reasons: string[];
}

interface PersonaSummary {
  persona_id: string;
  display_name?: string;
  name?: string;
}

export const PersonaTradeJournalTab = ({ personaId }: { personaId: string }) => {
  const t = useT();
  const navigate = useNavigate();
  const writeAccess = useAgoraWriteAccess();
  const [activeTab, setActiveTab] = useState<string>("journal");
  const [episodes, setEpisodes] = useState<TradeEpisodeProjection[]>([]);
  const [reflections, setReflections] = useState<PersonaTradeReflection[]>([]);
  const [patterns, setPatterns] = useState<TradePattern[]>([]);

  // Filters
  const [envFilter, setEnvFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [cursor, setCursor] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [degradedState, setDegradedState] = useState<string>("complete");
  const [bffMode, setBffMode] = useState<string>("mock");

  // Selected details
  const [selectedEpisode, setSelectedEpisode] = useState<TradeEpisodeProjection | null>(null);

  // Commands state
  const [retryDialogOpen, setRetryDialogOpen] = useState<boolean>(false);
  const [retryReason, setRetryReason] = useState<string>("");
  const [decideDialogOpen, setDecideDialogOpen] = useState<boolean>(false);
  const [decideDecision, setDecideDecision] = useState<"endorsed" | "rejected" | "quarantined">("endorsed");
  const [decideReason, setDecideReason] = useState<string>("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [submittingCommand, setSubmittingCommand] = useState<boolean>(false);

  // PINT-008 — "Reflect with Personas" contextual workshop handoff.
  const [allPersonas, setAllPersonas] = useState<PersonaSummary[]>([]);
  const [selectedAltPersona, setSelectedAltPersona] = useState<string>("");
  const [varianceAttribution, setVarianceAttribution] = useState<string>("");
  const [resolvedWorkshopId, setResolvedWorkshopId] = useState<string | null>(null);
  const [challengeEligiblePersona, setChallengeEligiblePersona] = useState<ChallengeCandidate | null>(null);
  const [checkingChallengeEligibility, setCheckingChallengeEligibility] = useState<boolean>(false);
  const [challengeUnavailableReason, setChallengeUnavailableReason] = useState<string>("");

  useEffect(() => {
    setBffMode(bffV1.detectMode());
    lists.personas()
      .then((res: unknown) => {
        const items = Array.isArray(res) ? res : (res as { items?: unknown[] })?.items ?? [];
        setAllPersonas(items as PersonaSummary[]);
      })
      .catch(() => undefined);
  }, []);

  // Resolve canonical challenge eligibility for the selected episode. The
  // contract does not expose adversarial/style metadata, so selection follows
  // the backend's included order and never infers a role from an id or name.
  useEffect(() => {
    if (!selectedEpisode || !writeAccess.interactionAllowed) {
      setResolvedWorkshopId(null);
      setChallengeEligiblePersona(null);
      setChallengeUnavailableReason(selectedEpisode ? (writeAccess.interactionDisabledReason ?? "Interaction is not permitted") : "");
      return;
    }

    let cancelled = false;
    const checkEligibility = async () => {
      setCheckingChallengeEligibility(true);
      setChallengeUnavailableReason("");
      try {
        const environment = selectedEpisode.environment || "paper";
        const resolveRes = await interaction.resolveContext({
          context_refs: [{ type: "journal_entry", id: selectedEpisode.trade_episode_id }],
          environment: environment as "research" | "shadow" | "paper" | "canary" | "live",
        });

        if (cancelled) return;
        const workshopId = resolveRes.data.workshop_id;
        setResolvedWorkshopId(workshopId);

        const eligibleRes = await interaction.participants({
          workshop_id: workshopId,
          mode: "challenge",
          environment: environment as "research" | "shadow" | "paper" | "canary" | "live",
        });

        if (cancelled) return;
        const challengePersona = eligibleRes.data.included[0];
        setChallengeEligiblePersona(challengePersona ?? null);

        if (!challengePersona) {
          const exclusionReasons = Array.from(new Set(
            eligibleRes.data.excluded.flatMap((persona) => persona.reasons),
          ));
          setChallengeUnavailableReason(exclusionReasons.join(", ") || "No canonical eligible challenge Persona");
        }
      } catch (err: unknown) {
        setChallengeUnavailableReason(errorMessage(err, "Failed to fetch participants"));
      } finally {
        if (!cancelled) setCheckingChallengeEligibility(false);
      }
    };

    checkEligibility();
    return () => {
      cancelled = true;
    };
  }, [selectedEpisode, writeAccess.interactionAllowed, writeAccess.interactionDisabledReason]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === "journal") {
        const res = await tradeJournal.list(personaId, {
          environment: envFilter || undefined,
          status: statusFilter || undefined,
          limit: 10,
          cursor: cursor
        });
        setEpisodes(res.data);
        setHasMore(res.page_info.has_more || false);
        setDegradedState(res.meta.coverage_state);
      } else if (activeTab === "reflections") {
        const res = await tradeJournal.reflections(personaId);
        setReflections(res.data);
      } else if (activeTab === "patterns") {
        const res = await tradeJournal.patterns(personaId);
        setPatterns(res.data);
      }
    } catch (err: unknown) {
      setError(errorMessage(err, "Failed to load data"));
      toast.error("BFF Trade Journal Read Failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [personaId, activeTab, envFilter, statusFilter, cursor]);

  const handleRetryReflection = async () => {
    if (!selectedEpisode) return;
    if (!retryReason.trim()) {
      toast.error("Reason is required");
      return;
    }
    setSubmittingCommand(true);
    try {
      const res = await tradeJournal.retry(personaId, selectedEpisode.trade_episode_id, retryReason);
      toast.success("Reflection retry command accepted", {
        description: `Command ID: ${res.data.commandId}`
      });
      setRetryDialogOpen(false);
      setRetryReason("");
      // Reload detail
      const updatedDetail = await tradeJournal.get(personaId, selectedEpisode.trade_episode_id);
      setSelectedEpisode(updatedDetail.data);
      loadData();
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to submit retry command"));
    } finally {
      setSubmittingCommand(false);
    }
  };

  const handleDecideLesson = async () => {
    if (!selectedCandidateId) return;
    if (!decideReason.trim()) {
      toast.error("Reason is required");
      return;
    }
    setSubmittingCommand(true);
    try {
      const res = await tradeJournal.decideLesson(
        personaId,
        selectedCandidateId,
        decideReason,
        decideDecision,
        varianceAttribution || undefined,
      );
      toast.success(`Lesson candidate was ${decideDecision}`, {
        description: `Command ID: ${res.data.commandId}`
      });
      setDecideDialogOpen(false);
      setDecideReason("");
      setVarianceAttribution("");
      // Reload episode if details open
      if (selectedEpisode) {
        const updatedDetail = await tradeJournal.get(personaId, selectedEpisode.trade_episode_id);
        setSelectedEpisode(updatedDetail.data);
      }
      loadData();
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to submit decision command"));
    } finally {
      setSubmittingCommand(false);
    }
  };

  // PINT-008 — hand a trade episode off to the Strategy Workshop for persona
  // review (original persona, an alternate persona, or a canonical challenge).
  const handleReflect = async (type: "original" | "alternate" | "challenge", targetPersonaId: string) => {
    if (!selectedEpisode) return;
    if (!writeAccess.interactionAllowed) {
      toast.error(writeAccess.interactionDisabledReason ?? "Persona interaction is not permitted");
      return;
    }
    if (!targetPersonaId) {
      toast.error("Please select a persona to review");
      return;
    }

    setSubmittingCommand(true);
    try {
      const mode = type === "challenge" ? "challenge" : "reflect";
      const environment = selectedEpisode.environment || "paper";

      const workshopId =
        resolvedWorkshopId ||
        (
          await interaction.resolveContext({
            context_refs: [{ type: "journal_entry", id: selectedEpisode.trade_episode_id }],
            environment: environment as "research" | "shadow" | "paper" | "canary" | "live",
          })
        ).data.workshop_id;

      // Submit the interaction to initialize the opinion/debate thread.
      await interaction.submit({
        workshop_id: workshopId,
        mode,
        environment: environment as "research" | "shadow" | "paper" | "canary" | "live",
        topic: `Reflection and review for episode ${selectedEpisode.trade_episode_id} by Persona ${targetPersonaId}`,
        participant_persona_ids: [targetPersonaId],
        context_refs: [
          { type: "journal_entry", id: selectedEpisode.trade_episode_id },
          { type: "persona", id: targetPersonaId },
        ],
      });

      toast.success("Workshop resolved successfully, redirecting...");
      setSelectedEpisode(null); // Close the sheet
      navigate(`/agora/strategy-workshop/${workshopId}`);
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to resolve workshop context"));
    } finally {
      setSubmittingCommand(false);
    }
  };

  const filteredEpisodes = episodes.filter(ep =>
    !searchQuery ||
    ep.instrument_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ep.trade_episode_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Top Environment Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card text-card-foreground">
        <div className="flex items-center gap-2">
          {bffMode === "live" ? (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive"></span>
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-destructive">
                Live BFF Mode
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500"></span>
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-500">
                Mock Mode (Sandbox)
              </span>
            </div>
          )}
          <span className="text-xs text-muted-foreground">|</span>
          <span className="text-xs text-muted-foreground">
            {degradedState === "complete" ? "All joins verified" : "Partial metadata coverage"}
          </span>
        </div>

        {/* Deep links */}
        <div className="flex flex-wrap gap-3">
          <Link to="/management/performance-attribution" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
            <Activity className="h-3 w-3" /> Attribution
          </Link>
          <Link to="/management/evidence" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
            <FileText className="h-3 w-3" /> Evidence
          </Link>
          <Link to="/management/lineage" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
            <Database className="h-3 w-3" /> Lineage
          </Link>
          <Link to="/management/governance/memory" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
            <Inbox className="h-3 w-3" /> Memory
          </Link>
          <Link to="/management/human-inbox" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
            <AlertTriangle className="h-3 w-3" /> Human Gate
          </Link>
        </div>
      </div>

      {degradedState !== "complete" && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-md text-xs flex gap-2 items-start">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Some trade metadata references are missing in lineage:</div>
            <div className="mt-1 opacity-90">
              The Trade Journal is running in degraded state. Speculative logic or LLM assumptions will not be shown.
            </div>
          </div>
        </div>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setCursor(0); }} className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-[400px]">
          <TabsTrigger value="journal">Episodes</TabsTrigger>
          <TabsTrigger value="reflections">Reflections</TabsTrigger>
          <TabsTrigger value="patterns">Patterns</TabsTrigger>
        </TabsList>

        {/* Tab 1: Episodes list */}
        <TabsContent value="journal" className="space-y-4 pt-2">
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search instrument or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={envFilter}
                onChange={(e) => { setEnvFilter(e.target.value); setCursor(0); }}
                className="px-3 py-1.5 text-xs rounded-md border border-input bg-background"
              >
                <option value="">All Environments</option>
                <option value="paper">Paper Trading</option>
                <option value="live">Live Trading</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCursor(0); }}
                className="px-3 py-1.5 text-xs rounded-md border border-input bg-background"
              >
                <option value="">All Statuses</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="force_closed">Force Closed</option>
                <option value="reflected">Reflected</option>
                <option value="reflection_pending">Reflection Pending</option>
                <option value="reflection_failed">Reflection Failed</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-12"><Spinner className="h-6 w-6 text-muted-foreground" /></div>
          ) : error ? (
            <div className="p-8 text-center text-rose-500 border rounded-md border-rose-500/20 bg-rose-500/5 text-sm">{error}</div>
          ) : filteredEpisodes.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm border border-dashed rounded-md">No trade episodes found.</div>
          ) : (
            <div className="space-y-3">
              {/* Episodes Grid/Table */}
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border">
                      <th className="p-3 font-semibold text-muted-foreground">ID</th>
                      <th className="p-3 font-semibold text-muted-foreground">Instrument</th>
                      <th className="p-3 font-semibold text-muted-foreground">Side</th>
                      <th className="p-3 font-semibold text-muted-foreground">Status</th>
                      <th className="p-3 font-semibold text-muted-foreground">Qty</th>
                      <th className="p-3 font-semibold text-muted-foreground">VWAP</th>
                      <th className="p-3 font-semibold text-muted-foreground">Realized P&L</th>
                      <th className="p-3 font-semibold text-muted-foreground">Opened At</th>
                      <th className="p-3 font-semibold text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEpisodes.map((ep) => (
                      <tr
                        key={ep.trade_episode_id}
                        className="border-b border-border hover:bg-muted/20 cursor-pointer"
                        onClick={() => setSelectedEpisode(ep)}
                      >
                        <td className="p-3 font-mono text-[10px]">{ep.trade_episode_id}</td>
                        <td className="p-3 font-semibold">{ep.instrument_id}</td>
                        <td className="p-3">
                          <Badge variant="outline" className={ep.side === "long" ? "text-emerald-500 border-emerald-500/20" : "text-rose-500 border-rose-500/20"}>
                            {ep.side.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={statusBadgeStyles[ep.status]}>
                            {ep.status.replace("_", " ")}
                          </Badge>
                        </td>
                        <td className="p-3">{ep.filled_qty} / {ep.requested_qty}</td>
                        <td className="p-3 font-mono">{ep.vwap != null ? `$${ep.vwap.toFixed(1)}` : "—"}</td>
                        <td className={`p-3 font-mono font-semibold ${ep.realized_pnl > 0 ? "text-emerald-500" : ep.realized_pnl < 0 ? "text-rose-500" : "text-muted-foreground"}`}>
                          {ep.realized_pnl > 0 ? `+$${ep.realized_pnl.toLocaleString()}` : ep.realized_pnl < 0 ? `-$${Math.abs(ep.realized_pnl).toLocaleString()}` : "$0"}
                        </td>
                        <td className="p-3 text-muted-foreground">{safeDateTime(ep.opened_at)}</td>
                        <td className="p-3">
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {hasMore && (
                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCursor(prev => prev + 10)}
                  >
                    Load More
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Reflections List */}
        <TabsContent value="reflections" className="space-y-4 pt-2">
          {loading ? (
            <div className="flex items-center justify-center p-12"><Spinner className="h-6 w-6 text-muted-foreground" /></div>
          ) : reflections.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm border border-dashed rounded-md">No reflections generated yet.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {reflections.map((ref) => (
                <Card key={ref.reflection_id} className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs text-muted-foreground font-mono">Reflection ID: {ref.reflection_id}</div>
                      <div className="text-sm font-semibold mt-1">Episode: {ref.trade_episode_id}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{ref.trigger.replace("_", " ")}</Badge>
                      <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-400">{ref.model}</Badge>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded border">
                    <span className="font-semibold block mb-1">Attribution Analysis:</span>
                    {ref.attribution}
                  </div>

                  {ref.expected_vs_actual && (
                    <div className="text-xs space-y-1">
                      <span className="font-semibold text-muted-foreground">Expected vs Actual:</span>
                      <div className="pl-2 border-l border-border space-y-1 mt-1">
                        {ref.expected_vs_actual.thesis && <div><strong>Thesis:</strong> {ref.expected_vs_actual.thesis}</div>}
                        {ref.expected_vs_actual.sizing && <div><strong>Sizing:</strong> {ref.expected_vs_actual.sizing}</div>}
                        {ref.expected_vs_actual.risk_adherence && <div><strong>Risk:</strong> {ref.expected_vs_actual.risk_adherence}</div>}
                      </div>
                    </div>
                  )}

                  {ref.mistakes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-xs text-muted-foreground mr-1">Mistakes identified:</span>
                      {ref.mistakes.map((m, idx) => (
                        <Badge key={idx} variant="outline" className="text-[10px] bg-rose-500/10 text-rose-500 border-rose-500/20">{m}</Badge>
                      ))}
                    </div>
                  )}

                  {ref.lesson_candidates && ref.lesson_candidates.length > 0 && (
                    <div className="space-y-2 mt-2 pt-2 border-t border-border">
                      <span className="text-xs font-semibold text-muted-foreground block">Proposed Lesson Candidates:</span>
                      {ref.lesson_candidates.map((c) => (
                        <div key={c.id} className="p-2.5 rounded bg-muted/60 border text-xs flex justify-between items-start gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[9px] uppercase">{c.scope}</Badge>
                              <span className="font-mono text-[9px] text-muted-foreground">{c.id}</span>
                            </div>
                            <div className="text-sm font-medium">{c.proposed_change}</div>
                            <div className="text-[10px] text-muted-foreground">Confidence: {(c.confidence * 100).toFixed(0)}%</div>
                          </div>
                          {ref.review_state === "proposed" && (
                            <div className="flex gap-1 shrink-0">
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-6 text-[10px] px-2"
                                onClick={() => { setSelectedCandidateId(c.id); setDecideDecision("rejected"); setDecideDialogOpen(true); }}
                              >
                                Reject
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] px-2"
                                onClick={() => { setSelectedCandidateId(c.id); setDecideDecision("quarantined"); setDecideDialogOpen(true); }}
                              >
                                Quarantine
                              </Button>
                              <Button
                                size="sm"
                                className="h-6 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-500 text-white border-none"
                                onClick={() => { setSelectedCandidateId(c.id); setDecideDecision("endorsed"); setDecideDialogOpen(true); }}
                              >
                                Endorse
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Patterns List */}
        <TabsContent value="patterns" className="space-y-4 pt-2">
          {loading ? (
            <div className="flex items-center justify-center p-12"><Spinner className="h-6 w-6 text-muted-foreground" /></div>
          ) : patterns.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm border border-dashed rounded-md">No mistake patterns identified.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {patterns.map((pat) => (
                <Card key={pat.pattern_id} className="p-4 space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground font-mono">{pat.pattern_id}</div>
                    <div className="text-base font-semibold mt-0.5">{pat.name}</div>
                  </div>

                  <p className="text-xs text-muted-foreground">{pat.description}</p>

                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded bg-muted/40 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Taxonomy</span>
                      <span className="font-semibold capitalize">{pat.mistake_taxonomy.replace("_", " ")}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Confidence</span>
                      <span className="font-semibold">{(pat.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="mt-1.5">
                      <span className="text-muted-foreground block text-[10px]">Sample Size</span>
                      <span className="font-semibold">{pat.sample_size} episodes</span>
                    </div>
                  </div>

                  <div className="text-xs bg-amber-500/5 p-2 rounded border border-amber-500/10 text-amber-500">
                    <span className="font-semibold block text-[10px] uppercase tracking-wider mb-0.5">Recommendation:</span>
                    {pat.recommendation}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Episode Detail Drawer (Sheet) */}
      <Sheet open={selectedEpisode !== null} onOpenChange={(open) => !open && setSelectedEpisode(null)}>
        <SheetContent className="w-full sm:max-w-[600px] overflow-y-auto bg-card text-card-foreground border-l border-border">
          {selectedEpisode && (
            <div className="space-y-6">
              <SheetHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={selectedEpisode.side === "long" ? "text-emerald-500 border-emerald-500/20" : "text-rose-500 border-rose-500/20"}>
                    {selectedEpisode.side.toUpperCase()}
                  </Badge>
                  <Badge variant="outline" className={statusBadgeStyles[selectedEpisode.status]}>
                    {selectedEpisode.status.replace("_", " ")}
                  </Badge>
                </div>
                <SheetTitle className="text-xl font-bold flex items-center justify-between mt-1">
                  <span>{selectedEpisode.instrument_id} Detail</span>
                  <span className="font-mono text-xs text-muted-foreground">{selectedEpisode.trade_episode_id}</span>
                </SheetTitle>
                <SheetDescription>
                  Persona trade episode lifecycle and reflection telemetry
                </SheetDescription>
              </SheetHeader>

              {/* Rationale Section */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b pb-1">Thesis & Rationale</h3>
                {selectedEpisode.thesis ? (
                  <div className="space-y-2 text-xs">
                    <p className="text-sm italic">{selectedEpisode.thesis}</p>
                    <div className="grid grid-cols-2 gap-2 mt-1 bg-muted/40 p-2.5 rounded">
                      <div>
                        <strong>Catalyst:</strong> {selectedEpisode.expected_catalyst || "—"}
                      </div>
                      <div>
                        <strong>Invalidation:</strong> {selectedEpisode.invalidation_conditions || "—"}
                      </div>
                      <div>
                        <strong>Horizon:</strong> {selectedEpisode.time_horizon || "—"}
                      </div>
                      <div>
                        <strong>Confidence:</strong> {selectedEpisode.confidence ? `${(selectedEpisode.confidence * 100).toFixed(0)}%` : "—"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">Thesis rationale details unavailable in lineage.</div>
                )}
              </div>

              {/* Execution Summary */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b pb-1">Execution Metrics</h3>
                <div className="grid grid-cols-3 gap-2.5 text-xs">
                  <div className="p-2.5 border rounded">
                    <span className="text-muted-foreground text-[10px] block">VWAP Price</span>
                    <span className="font-mono font-semibold">{selectedEpisode.vwap != null ? `$${selectedEpisode.vwap.toFixed(1)}` : "—"}</span>
                  </div>
                  <div className="p-2.5 border rounded">
                    <span className="text-muted-foreground text-[10px] block">Filled Qty</span>
                    <span className="font-semibold">{selectedEpisode.filled_qty}</span>
                  </div>
                  <div className="p-2.5 border rounded">
                    <span className="text-muted-foreground text-[10px] block">Rejects</span>
                    <span className={`font-semibold ${selectedEpisode.rejects > 0 ? "text-rose-500" : ""}`}>{selectedEpisode.rejects}</span>
                  </div>
                  <div className="p-2.5 border rounded">
                    <span className="text-muted-foreground text-[10px] block">Fees</span>
                    <span className="font-mono">{selectedEpisode.fees != null ? `$${selectedEpisode.fees.toFixed(1)}` : "—"}</span>
                  </div>
                  <div className="p-2.5 border rounded">
                    <span className="text-muted-foreground text-[10px] block">Slippage</span>
                    <span className="font-mono">{selectedEpisode.slippage != null ? `$${selectedEpisode.slippage.toFixed(1)}` : "—"}</span>
                  </div>
                  <div className="p-2.5 border rounded">
                    <span className="text-muted-foreground text-[10px] block">Holding Duration</span>
                    <span className="font-semibold">{selectedEpisode.holding_duration ? `${(selectedEpisode.holding_duration / 3600).toFixed(1)} hours` : "—"}</span>
                  </div>
                </div>
              </div>

              {/* Outcomes Section */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b pb-1">Valuation & P&L</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 border rounded flex flex-col justify-center">
                    <span className="text-muted-foreground text-[10px]">Realized P&L</span>
                    <span className={`text-lg font-bold font-mono ${selectedEpisode.realized_pnl > 0 ? "text-emerald-500" : selectedEpisode.realized_pnl < 0 ? "text-rose-500" : "text-muted-foreground"}`}>
                      {selectedEpisode.realized_pnl > 0 ? `+$${selectedEpisode.realized_pnl.toLocaleString()}` : selectedEpisode.realized_pnl < 0 ? `-$${Math.abs(selectedEpisode.realized_pnl).toLocaleString()}` : "$0"}
                    </span>
                  </div>
                  <div className="p-3 border rounded flex flex-col justify-center">
                    <span className="text-muted-foreground text-[10px]">MFE / MAE</span>
                    <span className="text-lg font-bold font-mono text-muted-foreground">
                      <span className="text-emerald-500">+{selectedEpisode.mfe}%</span> / <span className="text-rose-500">{selectedEpisode.mae}%</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Timeline Indicator */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b pb-1">Lifecycle Timeline</h3>
                {selectedEpisode.timeline && selectedEpisode.timeline.length > 0 ? (
                  <div className="space-y-3.5 pl-3 border-l border-border text-xs relative">
                    {selectedEpisode.timeline.map((evt, idx) => (
                      <div key={evt.event_id || idx} className="relative">
                        <div className="absolute -left-[16.5px] top-1 h-2 w-2 rounded-full bg-blue-500 border border-card"></div>
                        <div className="font-semibold flex items-center justify-between">
                          <span className="capitalize">{evt.event_type.replace("_", " ")}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{safeDateTime(evt.occurred_at)}</span>
                        </div>
                        {evt.actor && (
                          <div className="text-[10px] text-muted-foreground">Actor: {evt.actor}</div>
                        )}
                        {evt.details && Object.keys(evt.details).length > 0 && (
                          <div className="mt-1 text-[10px] text-muted-foreground bg-muted/40 p-1.5 rounded font-mono overflow-x-auto">
                            {JSON.stringify(evt.details, null, 2)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">Timeline log empty.</div>
                )}
              </div>

              {/* Reflection telemetry */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b pb-1">Persona Reflection Telemetry</h3>

                {selectedEpisode.status === "reflection_pending" && (
                  <div className="p-3 bg-orange-500/10 border border-orange-500/20 text-orange-500 rounded-md text-xs flex gap-2 items-center justify-between">
                    <span>Reflection pipeline pending execution. Waiting for final watermarks.</span>
                  </div>
                )}

                {selectedEpisode.status === "reflection_failed" && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-md text-xs flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
                    <span>Reflection generation failed due to timeout or missing joins.</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRetryDialogOpen(true)}
                      className="border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-semibold"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" /> Retry Reflection
                    </Button>
                  </div>
                )}

                {selectedEpisode.status === "reflected" && selectedEpisode.reflection_summary && (
                  <div className="p-3 bg-teal-500/10 border border-teal-500/20 text-teal-500 rounded-md text-xs space-y-1">
                    <span className="font-semibold block uppercase text-[10px]">Summary:</span>
                    <p>{selectedEpisode.reflection_summary}</p>
                  </div>
                )}
              </div>

              {/* Contextual Workshop Reflection & Review Actions (PINT-008) */}
              <div className="space-y-3 pt-3 border-t">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b pb-1">Reflect with Personas (Strategy Workshop)</h3>
                <div className="flex flex-col gap-3.5 bg-slate-50/50 p-3 rounded-lg border">

                  {/* Original & canonical Challenge review row */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs font-semibold"
                      onClick={() => handleReflect("original", selectedEpisode.persona_id)}
                      disabled={submittingCommand || !writeAccess.interactionAllowed}
                      title={writeAccess.interactionDisabledReason ?? undefined}
                    >
                      Original Persona Review
                    </Button>

                    <div className="flex flex-col gap-1 w-full">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs font-semibold border-rose-500/30 hover:bg-rose-500/10 text-rose-600 hover:text-rose-700 w-full"
                        onClick={() => handleReflect("challenge", challengeEligiblePersona?.persona_id ?? "")}
                        disabled={submittingCommand || checkingChallengeEligibility || !challengeEligiblePersona || !writeAccess.interactionAllowed}
                        title={writeAccess.interactionDisabledReason ?? undefined}
                      >
                        {checkingChallengeEligibility ? "Checking..." : challengeEligiblePersona ? "Challenge Persona Review" : "Challenge Persona (Unavailable)"}
                      </Button>
                      {!checkingChallengeEligibility && !challengeEligiblePersona && (
                        <span className="text-[10px] text-rose-500 text-center block mt-0.5" data-testid="challenge-persona-unavailable">
                          {challengeUnavailableReason ? `Unavailable: ${challengeUnavailableReason}` : "Unavailable in this environment"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Alternate Persona Review Row */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground shrink-0">Alternate Reviewer:</span>
                    <select
                      value={selectedAltPersona}
                      onChange={(e) => setSelectedAltPersona(e.target.value)}
                      className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-input bg-background"
                      disabled={submittingCommand || !writeAccess.interactionAllowed}
                    >
                      <option value="">Select Persona...</option>
                      {allPersonas
                        .filter((p) => p.persona_id !== selectedEpisode.persona_id)
                        .map((p) => (
                          <option key={p.persona_id} value={p.persona_id}>
                            {p.display_name || p.name || p.persona_id}
                          </option>
                        ))}
                    </select>
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white"
                      onClick={() => handleReflect("alternate", selectedAltPersona)}
                      disabled={!selectedAltPersona || submittingCommand || !writeAccess.interactionAllowed}
                      title={writeAccess.interactionDisabledReason ?? undefined}
                    >
                      Review
                    </Button>
                  </div>
                  {writeAccess.interactionDisabledReason ? (
                    <p className="text-[11px] font-semibold text-amber-700" data-testid="trade-journal-interaction-disabled-reason">
                      {writeAccess.interactionDisabledReason}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Retry Reflection Dialog */}
      <Dialog open={retryDialogOpen} onOpenChange={setRetryDialogOpen}>
        <DialogContent className="bg-card text-card-foreground border border-border">
          <DialogHeader>
            <DialogTitle>Retry Reflection Pipeline</DialogTitle>
            <DialogDescription>
              Submit a manual retry command to trigger the reflection worker using the facts snapshot.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-xs font-medium text-muted-foreground">Reason for retry request:</label>
            <Textarea
              placeholder="Provide a justification for retrying the reflection (e.g., joins have settled, database restated)..."
              value={retryReason}
              onChange={(e) => setRetryReason(e.target.value)}
              className="text-xs"
            />
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setRetryDialogOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleRetryReflection}
              disabled={submittingCommand}
              className="bg-indigo-600 hover:bg-indigo-500 text-white border-none"
            >
              Submit Command
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lesson Decide Dialog */}
      <Dialog open={decideDialogOpen} onOpenChange={setDecideDialogOpen}>
        <DialogContent className="bg-card text-card-foreground border border-border">
          <DialogHeader>
            <DialogTitle className="capitalize">Submit Lesson Decision: {decideDecision}</DialogTitle>
            <DialogDescription>
              Submit a governed command to transition the proposed candidate lesson.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-xs p-2 bg-muted rounded border font-mono">
              Lesson ID: {selectedCandidateId}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Variance Attribution Category:</label>
              <select
                value={varianceAttribution}
                onChange={(e) => setVarianceAttribution(e.target.value)}
                className="w-full p-2 text-xs rounded border border-input bg-card text-card-foreground"
              >
                <option value="">Select Category...</option>
                <option value="market_noise">Market Noise</option>
                <option value="thesis">Thesis</option>
                <option value="signal_data">Signal/Data</option>
                <option value="timing">Timing</option>
                <option value="sizing">Sizing</option>
                <option value="execution">Execution</option>
                <option value="risk_policy">Risk Policy</option>
                <option value="persona_reasoning">Persona Reasoning</option>
                <option value="human_override">Human Override</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Auditable Reason:</label>
              <Textarea
                placeholder="State why this decision is made (e.g. sample size sufficient, regime mismatch)..."
                value={decideReason}
                onChange={(e) => setDecideReason(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setDecideDialogOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleDecideLesson}
              disabled={submittingCommand}
              className={decideDecision === "rejected" ? "bg-rose-600 hover:bg-rose-500 text-white border-none" : decideDecision === "quarantined" ? "bg-amber-600 hover:bg-amber-500 text-white border-none" : "bg-emerald-600 hover:bg-emerald-500 text-white border-none"}
            >
              Submit Command
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
