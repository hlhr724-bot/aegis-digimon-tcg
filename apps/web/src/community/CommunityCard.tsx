import type { ReactNode } from "react";

type CommunityCardParams = {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
  tools?: ReactNode;
  children: ReactNode;
};

export function CommunityCard({ title, description, className, tools, children }: CommunityCardParams) {
  return (
    <section className={`community-card${className ? ` ${className}` : ""}`}>
      <header className="community-card__header">
        <div className="community-card__heading">
          <h2 className="community-card__title">{title}</h2>
          {description ? <p className="community-card__description">{description}</p> : null}
        </div>
        {tools}
      </header>
      <div className="community-card__content">{children}</div>
    </section>
  );
}
