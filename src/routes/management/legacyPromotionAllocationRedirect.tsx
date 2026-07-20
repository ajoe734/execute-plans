import { Navigate, useLocation, useParams } from "react-router-dom";
import {
  buildPromotionAllocationHref,
  type PromotionAllocationWorkbenchTab,
} from "./promotionAllocationRedirectHref";

export function LegacyPromotionAllocationRedirect({
  tab,
  idParamName,
}: {
  tab: PromotionAllocationWorkbenchTab;
  idParamName?: string;
}) {
  const { id } = useParams<{ id?: string }>();
  const { search, hash } = useLocation();
  return (
    <Navigate
      to={buildPromotionAllocationHref({
        tab,
        search,
        hash,
        id,
        idParamName,
      })}
      replace
    />
  );
}
