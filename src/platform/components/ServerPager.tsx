// Shared server-side pager (page_size + page_token). Extracted from the strategy
// list so Strategies, Jobs and Incidents page identically. The component is
// presentational over a cursor; `useServerPageCursor` owns the cursor state and
// resets it whenever `resetKey` (e.g. an active filter) changes.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/platform/hooks";

export interface ServerPageCursor {
  key: string;
  currentToken: string | undefined;
  prevTokens: Array<string | undefined>;
  pageIndex: number;
}

export function freshServerPageCursor(key: string): ServerPageCursor {
  return { key, currentToken: undefined, prevTokens: [], pageIndex: 0 };
}

export function useServerPageCursor(resetKey: string): [ServerPageCursor, (next: ServerPageCursor) => void] {
  const [state, setState] = useState<ServerPageCursor>(() => freshServerPageCursor(resetKey));
  const effective = state.key === resetKey ? state : freshServerPageCursor(resetKey);
  return [effective, setState];
}

export interface ServerPagerProps {
  cursor: ServerPageCursor;
  setCursor: (next: ServerPageCursor) => void;
  pageSize: number;
  /** Server-reported total (page_info.total); falls back to visibleCount. */
  total?: number;
  visibleCount: number;
  /** Next page token from the server; absent means last page. */
  nextToken?: string;
  loading?: boolean;
  /** Prefix for test ids, e.g. "strategy" -> strategy-list-pagination, strategy-page-next. */
  testIdPrefix: string;
  ariaLabel: string;
  /** Jump-to-last assumes numeric offset tokens; only enable where that holds. */
  enableJumpToLast?: boolean;
}

export const ServerPager = ({
  cursor,
  setCursor,
  pageSize,
  total: totalProp,
  visibleCount,
  nextToken: nextTokenProp,
  loading = false,
  testIdPrefix,
  ariaLabel,
  enableJumpToLast = true,
}: ServerPagerProps) => {
  const t = useT();
  const total =
    typeof totalProp === "number" && Number.isFinite(totalProp) ? totalProp : visibleCount;
  const parsedTokenOffset =
    cursor.currentToken && /^\d+$/.test(cursor.currentToken)
      ? Number(cursor.currentToken)
      : cursor.pageIndex * pageSize;
  const rangeStart = visibleCount > 0 ? parsedTokenOffset + 1 : 0;
  const rangeEnd = visibleCount > 0 ? parsedTokenOffset + visibleCount : 0;
  const currentPage = Math.floor(parsedTokenOffset / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrevPage = cursor.prevTokens.length > 0 || parsedTokenOffset > 0;
  const nextToken = nextTokenProp?.trim() || undefined;
  const hasNextPage = Boolean(nextToken);
  const lastPageOffset = total > pageSize ? Math.floor((total - 1) / pageSize) * pageSize : 0;
  const canJumpToLastPage = enableJumpToLast && hasNextPage && lastPageOffset > parsedTokenOffset;

  const goToFirstPage = () => setCursor(freshServerPageCursor(cursor.key));
  const goToPrevPage = () => {
    if (cursor.prevTokens.length > 0) {
      setCursor({
        key: cursor.key,
        currentToken: cursor.prevTokens[cursor.prevTokens.length - 1],
        prevTokens: cursor.prevTokens.slice(0, -1),
        pageIndex: Math.max(0, cursor.pageIndex - 1),
      });
      return;
    }
    if (parsedTokenOffset > 0) {
      const prevOffset = Math.max(0, parsedTokenOffset - pageSize);
      setCursor({
        key: cursor.key,
        currentToken: prevOffset > 0 ? String(prevOffset) : undefined,
        prevTokens: [],
        pageIndex: Math.floor(prevOffset / pageSize),
      });
    }
  };
  const goToNextPage = () => {
    if (!nextToken) return;
    setCursor({
      key: cursor.key,
      currentToken: nextToken,
      prevTokens: [...cursor.prevTokens, cursor.currentToken],
      pageIndex: cursor.pageIndex + 1,
    });
  };
  const goToLastPage = () => {
    if (!canJumpToLastPage) return;
    setCursor({
      key: cursor.key,
      currentToken: String(lastPageOffset),
      prevTokens: [...cursor.prevTokens, cursor.currentToken],
      pageIndex: Math.floor(lastPageOffset / pageSize),
    });
  };

  return (
    <nav
      aria-label={ariaLabel}
      data-testid={`${testIdPrefix}-list-pagination`}
      data-total={total}
      data-page-size={pageSize}
      data-page-token={cursor.currentToken ?? ""}
      className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground"
    >
      <div data-testid={`${testIdPrefix}-list-total`}>
        {visibleCount > 0
          ? t("strategy.list.pagination.showingRange", { start: rangeStart, end: rangeEnd, total })
          : t("strategy.list.pagination.totalCount", { total })}
      </div>
      <div className="flex items-center gap-2">
        <span data-testid={`${testIdPrefix}-list-page-indicator`}>
          {t("strategy.list.pagination.pageOf", { page: currentPage, totalPages })}
        </span>
        {hasPrevPage && parsedTokenOffset >= pageSize * 2 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid={`${testIdPrefix}-page-first`}
            disabled={loading}
            onClick={goToFirstPage}
          >
            {t("strategy.list.pagination.first")}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid={`${testIdPrefix}-page-prev`}
          disabled={!hasPrevPage || loading}
          onClick={goToPrevPage}
        >
          {t("ui.pagination.prev")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid={`${testIdPrefix}-page-next`}
          disabled={!hasNextPage || loading}
          onClick={goToNextPage}
        >
          {t("ui.pagination.next")}
        </Button>
        {canJumpToLastPage && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid={`${testIdPrefix}-page-last`}
            disabled={loading}
            onClick={goToLastPage}
          >
            {t("strategy.list.pagination.last")}
          </Button>
        )}
      </div>
    </nav>
  );
};
