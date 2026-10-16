import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "tape" | "outline" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  href?: string;
  children: ReactNode;
};

/** §7 Button. Tape = moves goods (one per view), outline = everything else,
 *  destructive = problem outline, never a red fill. 34px console / 40px task. */
export function Button({
  variant = "outline",
  size = "md",
  href,
  children,
  className,
  ...rest
}: Props) {
  const cls = ["btn", variant === "tape" ? "tape" : "", variant === "destructive" ? "destructive" : "", size !== "md" ? size : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}
