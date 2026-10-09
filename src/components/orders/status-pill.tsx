import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Status pills (Flagship UI Designs §4/§5): solid, unmistakable hues — paid
 * green, needs-action amber, problem red, neutral slate, info blue — always
 * rendered as a pill on the 12% tint of the hue. Legible from across the room.
 */

const TONE_CLASSES = {
  success: "border-transparent bg-success-soft text-success",
  warning: "border-transparent bg-warning-soft text-warning",
  destructive: "border-transparent bg-destructive-soft text-destructive",
  info: "border-transparent bg-info-soft text-info",
  neutral: "border-transparent bg-neutral-soft text-neutral",
} as const;

type Tone = keyof typeof TONE_CLASSES;

const ORDER_STATUS_TONE: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  fulfilled: { label: "Fulfilled", tone: "success" },
  refunded: { label: "Refunded", tone: "neutral" },
  partially_refunded: { label: "Partial refund", tone: "warning" },
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
  return <Badge className={cn("font-medium", TONE_CLASSES[config.tone])}>{config.label}</Badge>;
}

export function PaymentStatusPill({ status }: { status: string }) {
  const config = PAYMENT_STATUS_TONE[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge className={cn("font-medium", TONE_CLASSES[config.tone])}>{config.label}</Badge>;
}

/** OK / Low / Out for inventory levels. Low = below threshold (matches the DB trigger). */
export function StockStatusPill({ quantity, threshold }: { quantity: number; threshold: number }) {
  const config =
    quantity <= 0
      ? { label: "Out of stock", tone: "destructive" as Tone }
      : quantity < threshold
        ? { label: "Low", tone: "warning" as Tone }
        : { label: "OK", tone: "success" as Tone };
  return <Badge className={cn("font-medium", TONE_CLASSES[config.tone])}>{config.label}</Badge>;
}
