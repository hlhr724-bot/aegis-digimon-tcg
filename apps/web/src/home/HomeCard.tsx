import type { ReactNode } from "react";
import { Icons } from "@/design/icons";

type HomeCardParams = {
  title: ReactNode;
  description?: string;
  className: string;
  action?: { label: string; onClick: () => void };
  tools?: ReactNode;
  children: ReactNode;
};

export function HomeCard({ title, description, className, action, tools, children }: HomeCardParams) {
  return (
    <section className={`home-card ${className}`}>
      <header className="home-card__header">
        <div className="home-card__heading">
          <h2 className="home-card__title">{title}</h2>
          {description ? <p className="home-card__description">{description}</p> : null}
        </div>
        {tools}
        {action ? (
          <button type="button" className="home-link" onClick={action.onClick}>
            {action.label}
            <Icons.ChevronRight size={14} aria-hidden="true" />
          </button>
        ) : null}
      </header>
      <div className="home-card__content">{children}</div>
    </section>
  );
}
