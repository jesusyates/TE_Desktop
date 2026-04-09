import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  const classes = ["ui-btn", `ui-btn--${variant}`, className].filter(Boolean).join(" ");
  return <button type={type} className={classes} {...props} />;
}
