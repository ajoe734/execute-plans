import { useTranslation } from "react-i18next";

export function displayNumber(value: unknown, locale: string): string {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(value)
    : "—";
}

export function displayTime(value: unknown, locale: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(locale, {
    timeZone: "UTC", timeZoneName: "short", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

/** Present only business fields; IDs and provenance remain in the readback. */
export function PaperBookRow({ value, currency, fill = false, asOf }: {
  value: unknown; currency?: string; fill?: boolean; asOf?: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || "zh-TW";
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const side = typeof row.side === "string" ? row.side.toLowerCase() : typeof row.direction === "string" ? row.direction.toLowerCase() : "";
  const sideKey = ["buy", "sell", "long", "short", "flat"].includes(side) ? side : "unknown";
  const unit = currency && /^[A-Z]{3}$/.test(currency) ? currency : t("agora.tradingRoom.page.paperBook.currencyUnknown");
  const money = (v: unknown) => `${displayNumber(v, locale)} ${unit}`;
  const symbol = typeof row.symbol === "string" && /^[A-Za-z0-9.^=-]{1,32}$/.test(row.symbol) ? row.symbol : "—";
  return <>
    <div>{t(`agora.tradingRoom.page.paperBook.${fill ? "fillLine" : "positionLine"}`, {
      symbol, side: t(`agora.tradingRoom.page.paperBook.sides.${sideKey}`),
      qty: displayNumber(row.quantity ?? row.net_qty, locale),
      avgPrice: money(row.avg_entry_price ?? row.avg_price ?? row.average_price),
      markPrice: money(row.mark_price), price: money(row.price),
      filledAt: displayTime(row.filled_at, locale),
    })}</div>
    {!fill && <div>{t("agora.tradingRoom.page.paperBook.positionDetail", {
      pnl: money(row.unrealized_pnl),
      time: displayTime(row.updated_at ?? row.last_filled_at ?? asOf, locale),
    })}</div>}
    {!fill && (row.market_value !== undefined || row.value !== undefined) && <div>
      {t("agora.tradingRoom.page.paperBook.marketValue", { value: money(row.market_value ?? row.value) })}
    </div>}
  </>;
}
