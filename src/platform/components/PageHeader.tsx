import { ReactNode } from "react";

export const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) => (
  <div className="border-b border-border bg-card px-6 py-4 flex items-start justify-between gap-4">
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
);

export const PageBody = ({ children }: { children: ReactNode }) => (
  <div className="p-6 space-y-6">{children}</div>
);
