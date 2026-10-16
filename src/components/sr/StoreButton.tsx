import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline";
  size?: "buy" | "md";
  href?: string;
  children: ReactNode;
};

/** §7 StoreButton: square (radius 0), store-ink fill, 52px for buy actions
 *  (price inside the label, e.g. "Add to cart · $64"), 48px otherwise.
 *  Secondary is a 1px black outline. */
export function StoreButton({
  variant = "primary",
  size = "buy",
  href,
  children,
  className,
  ...rest
}: Props) {
  const cls = ["store-btn", variant === "outline" ? "ol" : "", size === "md" ? "md" : "", className ?? ""]
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
