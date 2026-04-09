import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  className?: string;
  variant?: "default" | "stream" | "nest";
};

export const SectionCard = ({ title, children, className, variant = "default" }: Props) => (
  <section
    className={["section-card", variant !== "default" ? `section-card--${variant}` : "", className ?? ""]
      .filter(Boolean)
      .join(" ")}
  >
    <header className="section-card__head">{title}</header>
    <div className="section-card__body">{children}</div>
  </section>
);
