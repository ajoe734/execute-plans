// 2026-05-20 revamp §7 — Readiness page composers.
// Each composer returns a ReadinessPageModel built from a tiny static input
// (mock seed). Real implementations later swap the items source via BFF.

import {
  composeReadinessHeader,
  type ReadinessChecklistItem,
  type ReadinessBlocker,
  type ReadinessPacket,
  type ReadinessPageModel,
} from "@/lib/v5/management/readiness";

interface BuildArgs {
  title: string;
  environment: string;
  checklist: ReadinessChecklistItem[];
  packets: ReadinessPacket[];
  blockers: ReadinessBlocker[];
  lastUpdated?: string;
}

export function buildReadinessPage(args: BuildArgs): ReadinessPageModel {
  const lastUpdated = args.lastUpdated ?? new Date().toISOString();
  return {
    header: composeReadinessHeader(args.title, args.environment, args.checklist, args.blockers, lastUpdated),
    checklist: args.checklist,
    packets: args.packets,
    blockers: args.blockers,
  };
}

// --- helper for compact static items ----------------------------------

export function passItem(id: string, label: string, owner: string, evidence = true): ReadinessChecklistItem {
  return {
    id, label, status: "pass", ownerRole: owner,
    evidenceRequired: evidence, evidenceAttached: evidence, blocking: true,
  };
}

export function pendingItem(id: string, label: string, owner: string): ReadinessChecklistItem {
  return {
    id, label, status: "pending", ownerRole: owner,
    evidenceRequired: true, evidenceAttached: false, blocking: true,
  };
}

export function failItem(id: string, label: string, owner: string): ReadinessChecklistItem {
  return {
    id, label, status: "fail", ownerRole: owner,
    evidenceRequired: true, evidenceAttached: false, blocking: true,
  };
}
