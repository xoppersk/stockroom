import { TRUTH_ORDER } from "@/lib/truth-ledger";
import { cn } from "@/lib/utils";

/**
 * Packing slip for ORD-1048 (Flagship UI Designs, stockroomProto "Order
 * detail"). The design's truth ledger, rendered exactly as the artifact:
 * items, totals, ship-to + tracking, and the four-event fulfillment
 * timeline. All facts come from src/lib/truth-ledger.ts.
 */
export function PackingSlip() {
  const o = TRUTH_ORDER;

  return (
    <article className="mx-auto max-w-[860px] border border-[#cfc5b7] bg-[#fffdf8] p-[22px] text-[#29251f]">
      {/* Slip head */}
      <div className="grid grid-cols-1 items-start gap-5 border-b border-dashed border-[#9f9689] pb-[18px] sm:grid-cols-[1fr_auto]">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[0.13em] text-[#c05e19]">
            Packing slip / October 6, 2026
          </p>
          <h2 className="my-[7px] font-display text-[24px] font-semibold uppercase leading-none tracking-[-0.04em]">
            {o.customer}
          </h2>
          <p className="tnum text-[9px] text-[#756f65]">
            {o.paidAt} · {o.status} · {o.itemCount} items · {o.totalLabel}
          </p>
        </div>
        <div className="tnum w-max border-2 border-[#29251f] px-[11px] py-[9px] font-mono text-[12px] font-medium tracking-[0.06em]">
          {o.orderNumber}
        </div>
      </div>

      {/* Items */}
      <section className="border-b border-dashed border-[#9f9689] py-[17px]">
        <div className="mb-[10px] flex justify-between font-display text-[8px] font-semibold uppercase tracking-[0.13em] text-[#756f65]">
          <span>Items</span>
          <span>Qty / price</span>
        </div>
        {o.items.map((item, i) => (
          <div
            key={item.sku}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2 text-[9px]",
              i > 0 && "border-t border-[#3b3227]/10",
            )}
          >
            <span>
              <strong className="block">{item.name}</strong>
              <small className="tnum font-mono text-[#756f65]">
                {item.sku} · Qty {item.qty}
              </small>
              {item.sku === "CT-NAT" && (
                <>
                  <br />
                  <span className="font-display text-[8px] font-bold uppercase tracking-[0.08em] text-[#a95412]">
                    Held · verify stock count
                  </span>
                </>
              )}
            </span>
            <span className="tnum text-right font-mono text-[10px]">
              ${item.unitPrice.toFixed(2)}
            </span>
          </div>
        ))}
      </section>

      {/* Totals */}
      <section className="border-b border-dashed border-[#9f9689] py-[17px]">
        <div className="mb-[10px] flex justify-between font-display text-[8px] font-semibold uppercase tracking-[0.13em] text-[#756f65]">
          <span>Totals</span>
          <span>USD</span>
        </div>
        <div className="tnum ml-auto grid max-w-[310px] grid-cols-[1fr_auto] gap-x-[18px] gap-y-[9px] text-[9px]">
          <span>Subtotal</span>
          <span className="text-right font-mono">${o.subtotal.toFixed(2)}</span>
          <span>Shipping</span>
          <span className="text-right font-mono">${o.shipping.toFixed(2)}</span>
          <span>
            <strong>Total</strong>
          </span>
          <strong className="text-right font-mono text-[14px] font-medium">{o.totalLabel}</strong>
        </div>
      </section>

      {/* Fulfillment record */}
      <section className="pt-[17px]">
        <div className="mb-[10px] flex justify-between font-display text-[8px] font-semibold uppercase tracking-[0.13em] text-[#756f65]">
          <span>Fulfillment record</span>
          <span>Standard ground</span>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="text-[10px] leading-[1.65]">
            <strong>Ship to</strong>
            <br />
            {o.shipTo[0]}
            <br />
            {o.shipTo[1]}
            <br />
            {o.shipTo[2]}
            <br />
            <br />
            <strong>Tracking</strong>
            <br />
            <span className="tnum font-mono text-[10px] font-medium">{o.tracking}</span>
            <br />
            <span className="font-display text-[8px] font-bold uppercase tracking-[0.08em] text-[#a95412]">
              Release after held item is verified
            </span>
          </div>
          <div className="grid">
            {o.timeline.map((e) => (
              <div
                key={e.title}
                className="grid grid-cols-[92px_12px_1fr] gap-2.5 border-b border-dashed border-[#b7ac9d] py-2.5 text-[9px] last:border-0"
              >
                <time className="tnum font-mono text-[8px] leading-[1.45] text-[#756f65]">
                  {e.time.split(" · ")[0]}
                  <br />
                  {e.time.split(" · ")[1]}
                </time>
                <span
                  aria-hidden
                  className="mt-0.5 size-2 rounded-full border-2 border-[#c05e19]"
                />
                <span>
                  <b className="block">{e.title}</b>
                  <small className="tnum text-[#756f65]">{e.detail}</small>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </article>
  );
}
