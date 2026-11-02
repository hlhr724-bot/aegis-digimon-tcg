import type { ReactNode } from "react";
import "@/design/pageHeader.css";

export type PageTab<Value extends string> = {
  value: Value;
  label: string;
  badge?: ReactNode;
};

type PageHeaderParams<Value extends string> = {
  title: string;
  actions?: ReactNode;
  tabs?: readonly PageTab<Value>[];
  activeTab?: Value;
  onTabChange?: (value: Value) => void;
  tabsLabel?: string;
};

export function PageHeader<Value extends string>({
  title,
  actions,
  tabs,
  activeTab,
  onTabChange,
  tabsLabel,
}: PageHeaderParams<Value>) {
  return (
    <header className="aegis-page-header" data-tabs={tabs && tabs.length > 0 ? true : undefined}>
      <div className="aegis-page-header__title-row">
        <h1>{title}</h1>
        {actions ? <div className="aegis-page-header__actions">{actions}</div> : null}
      </div>
      {tabs && tabs.length > 0 ? (
        <div className="aegis-page-header__tabs" role="tablist" aria-label={tabsLabel ?? title}>
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={tab.value === activeTab}
              tabIndex={tab.value === activeTab ? 0 : -1}
              onClick={() => onTabChange?.(tab.value)}
            >
              {tab.label}
              {tab.badge !== undefined ? <span className="aegis-page-header__badge">{tab.badge}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </header>
  );
}
