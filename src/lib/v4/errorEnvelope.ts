// v4 / Pack C §C027 — BFF error envelope semantics.

export interface BffErrorPayload {
  code: string;
  i18nKey: string;
  message: string;
  retryable: boolean;
  userActionable: boolean;
  correlationId: string;
  cause?: string;
  details?: Record<string, unknown>;
}

export interface BffErrorEnvelope {
  error: BffErrorPayload;
}

export function makeError(p: Omit<BffErrorPayload, "retryable" | "userActionable"> & Partial<Pick<BffErrorPayload, "retryable" | "userActionable">>): BffErrorEnvelope {
  return {
    error: {
      retryable: false,
      userActionable: true,
      ...p,
    },
  };
}
