import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Status pills per the Design Brief: solid, unmistakable hues readable at a
 * glance — paid green, action-needed amber, problem red, neutral slate.
 */

const TONE_CLASSES = {
  success: "border-[#15803D]/25 bg-[#15803D]/10 text-[#15803D]",
  warning: "border-[#B45309]/25 bg-[#B45309]/10 text-[#B45309]",
  destructive: "border-[#DC2626]/25 bg-[#DC2626]/10 text-[#DC2626]",
  info: "border-[#1D4ED8]/25 bg-[#1D4ED8]/10 text-[#1D4ED8]",
  neutral: "border-slate-500/25 bg-slate-500/10 text-slate-600",
} as const;

type Tone = keyof typeof TONE_CLASSES;

const ORDER_STATUS_TONE: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  fulfilled: { label: "Fulfilled", tone: "info" },
  refunded: { label: "Refunded", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  failed: { label: "Failed", tone: "destructive" },
};

const PAYMENT_STATUS_TONE: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  refunded: { label: "Refunded", tone: "neutral" },
  partially_refunded: { label: "Partial refund", tone: "warning" },
  void: { label: "Void", tone: "neutral" },
  failed: { label: "Failed", tone: "destructive" },
};

export function OrderStatusPill({ status }: { status: string }) {
  const config = ORDER_STATUS_TONE[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge className={cn("border", TONE_CLASSES[config.tone])}>{config.label}</Badge>;
}

export function PaymentStatusPill({ status }: { status: string }) {
  const config = PAYMENT_STATUS_TONE[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge className={cn("border", TONE_CLASSES[config.tone])}>{config.label}</Badge>;
}

/** OK / Low / Out for inventory levels. Low = below threshold (matches the DB trigger). */
export function StockStatusPill({ quantity, threshold }: { quantity: number; threshold: number }) {
  const config =
    quantity <= 0
      ? { label: "Out of stock", tone: "destructive" as Tone }
      : quantity < threshold
        ? { label: "Low", tone: "warning" as Tone }
        : { label: "OK", tone: "success" as Tone };
  return <Badge className={cn("border", TONE_CLASSES[config.tone])}>{config.label}</Badge>;
}
