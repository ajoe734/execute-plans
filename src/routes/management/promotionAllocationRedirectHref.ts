export type PromotionAllocationWorkbenchTab =
  | "paper-candidates"
  | "real-ranking"
  | "quarterly-capital"
  | "emergency-actions"
  | "formula-policy";

export interface PromotionAllocationRedirectInput {
  tab: PromotionAllocationWorkbenchTab;
  search?: string;
  hash?: string;
  id?: string;
  idParamName?: string;
}

export function buildPromotionAllocationHref({
  tab,
  search = "",
  hash = "",
  id,
  idParamName,
}: PromotionAllocationRedirectInput): string {
  const params = new URLSearchParams(search);
  params.set("tab", tab);
  if (id && idParamName) params.set(idParamName, id);
  const query = params.toString();
  return `/management/promotion-allocation${query ? `?${query}` : ""}${hash}`;
}
