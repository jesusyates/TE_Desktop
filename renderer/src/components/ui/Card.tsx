import type { PropsWithChildren } from "react";

export type CardProps = PropsWithChildren<{
  title?: string;
  className?: string;
}>;

export function Card({ title, className = "", children }: CardProps) {
  return (
    <div className={["ui-card", className].filter(Boolean).join(" ")}>
      {title ? <div className="ui-card__title">{title}</div> : null}
      <div className="ui-card__body">{children}</div>
    </div>
  );
}
