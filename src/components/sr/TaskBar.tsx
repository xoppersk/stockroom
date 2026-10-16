import Link from "next/link";
import { SHOP_NAME, SHOP_SHORT } from "@/lib/config";

type Props = {
  title: string;
  closeLabel: string;
  closeHref: string;
};

/** Slim task header drawn by the packaged task screens (StockAdjustment,
 *  ProductWizard, DiscountBuilder): black bar with the L&L tile, wordmark
 *  and task name on the left, and a single close link on the right. Used
 *  instead of the full console AppBar on task routes under
 *  src/app/admin/(task)/. Server-safe — no hooks. Styles: .taskbar-* in
 *  src/styles/console.css. */
export function TaskBar({ title, closeLabel, closeHref }: Props) {
  return (
    <header className="taskbar">
      <div className="taskbar-left">
        <span className="taskbar-tile" aria-hidden="true">
          {SHOP_SHORT}
        </span>
        <span className="taskbar-wordmark">{SHOP_NAME}</span>
        <span className="taskbar-title">{title}</span>
      </div>
      <Link className="taskbar-close" href={closeHref}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="m2 2 8 8M10 2l-8 8" />
        </svg>
        {closeLabel}
      </Link>
    </header>
  );
}
