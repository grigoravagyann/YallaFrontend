import type { ReactNode } from 'react';

export interface PageHeaderProps {
  readonly title: ReactNode;
  /** One muted line under the title. */
  readonly sub?: ReactNode;
  /** Buttons on the right, beside the title; they wrap under it on a phone. */
  readonly actions?: ReactNode;
}

/** A console page's header: the serif title, a muted line, and its actions. */
export function PageHeader({ title, sub, actions }: PageHeaderProps) {
  return (
    <div className="yc-ph">
      <div>
        <h1 className="yc-h1">{title}</h1>
        {sub ? <p className="yc-sub">{sub}</p> : null}
      </div>
      {actions}
    </div>
  );
}
