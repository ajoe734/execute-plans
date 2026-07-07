import { Fragment, ReactNode } from "react";
import { useLocation, Link } from "react-router-dom";
import { useT } from "@/platform/hooks";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { buildBreadcrumb, lookupRouteLabel } from "@/lib/v4/routeLabels";

interface PageHeaderProps {
  /** When omitted, falls back to the route registry (G08 single source). */
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Hide breadcrumb if route registry lookup is intentionally not desired. */
  hideBreadcrumb?: boolean;
}

export const PageHeader = ({ title, subtitle, actions, hideBreadcrumb }: PageHeaderProps) => {
  const t = useT();
  const { pathname } = useLocation();
  const route = lookupRouteLabel(pathname);
  const resolvedTitle = title ?? (route ? t(route.i18nKey) : "");
  const resolvedSubtitle = subtitle ?? (route?.subtitleKey ? t(route.subtitleKey) : undefined);

  return (
    <div className="scroll-mt-28 border-b border-border bg-card px-4 py-4 flex flex-col items-start justify-between gap-3 sm:px-6 sm:flex-row sm:gap-4 lg:scroll-mt-20">
      <div className="min-w-0">
        {!hideBreadcrumb && route && <PageBreadcrumb pathname={pathname} />}
        <h1 className="text-xl font-semibold tracking-tight">{resolvedTitle}</h1>
        {resolvedSubtitle && <p className="text-sm text-muted-foreground mt-0.5">{resolvedSubtitle}</p>}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
};

const PageBreadcrumb = ({ pathname }: { pathname: string }) => {
  const t = useT();
  const chain = buildBreadcrumb(pathname);
  if (chain.length < 2) return null;
  return (
    <Breadcrumb className="mb-1">
      <BreadcrumbList>
        {chain.map((node, i) => {
          const isLast = i === chain.length - 1;
          return (
            <Fragment key={node.path}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{t(node.i18nKey)}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={node.path}>{t(node.i18nKey)}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export const PageBody = ({ children }: { children: ReactNode }) => (
  <div className="min-w-0 space-y-6 overflow-x-hidden p-4 sm:p-6">{children}</div>
);
