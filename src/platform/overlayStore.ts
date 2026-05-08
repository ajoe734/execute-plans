// Planner Response §C4 / §D04 (2026-05-07) — overlay store for shell-mounted drawers.
// Lets any feature open BulkResultDrawer / RollbackSagaStepper without prop-drilling.

import { create } from "zustand";
import type { BulkActionResponse } from "@/lib/bff-v1/dto";
import type { RollbackSagaDTO } from "@/lib/v4/rollbackSaga";

interface OverlayState {
  bulkResult: BulkActionResponse<unknown> | null;
  bulkResultTitle?: string;
  openBulkResult: <T>(response: BulkActionResponse<T>, title?: string) => void;
  closeBulkResult: () => void;

  rollbackSaga: RollbackSagaDTO | null;
  openRollbackSaga: (saga: RollbackSagaDTO) => void;
  closeRollbackSaga: () => void;
}

export const useOverlay = create<OverlayState>((set) => ({
  bulkResult: null,
  bulkResultTitle: undefined,
  openBulkResult: (response, title) =>
    set({ bulkResult: response as BulkActionResponse<unknown>, bulkResultTitle: title }),
  closeBulkResult: () => set({ bulkResult: null, bulkResultTitle: undefined }),

  rollbackSaga: null,
  openRollbackSaga: (saga) => set({ rollbackSaga: saga }),
  closeRollbackSaga: () => set({ rollbackSaga: null }),
}));
