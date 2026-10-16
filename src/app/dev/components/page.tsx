import { Suspense, type ReactNode } from "react";
import { AppBar } from "@/components/sr/AppBar";
import { AuditDayHeader, AuditEntryRow } from "@/components/sr/AuditEntryRow";
import { Button } from "@/components/sr/Button";
import { CodeTag } from "@/components/sr/CodeTag";
import { Countdown } from "@/components/sr/Countdown";
import { Cover } from "@/components/sr/Cover";
import { ExceptionRow } from "@/components/sr/ExceptionRow";
import { Field } from "@/components/sr/Field";
import { LedgerLine } from "@/components/sr/LedgerLine";
import { PermissionMatrix } from "@/components/sr/PermissionMatrix";
import { PhotoBlock } from "@/components/sr/PhotoBlock";
import { PipelineBar } from "@/components/sr/PipelineBar";
import { SettingsNav } from "@/components/sr/SettingsNav";
import { SkeletonRows } from "@/components/sr/SkeletonRows";
import { Stamp } from "@/components/sr/Stamp";
import { StatePanel } from "@/components/sr/StatePanel";
import { StockLevel } from "@/components/sr/StockLevel";
import { StoreButton } from "@/components/sr/StoreButton";
import { Swatch } from "@/components/sr/Swatch";
import { SystemBanner } from "@/components/sr/SystemBanner";
import { PausedBannerDemo } from "./demos";

/* §12 build-order proof: every §7 component, in its states, before any screen.
   Mirrors design-system/index.html (same component order). */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2
        className="cond"
        style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>{children}</div>;
}

export default function ComponentsPage() {
  return (
    <div style={{ background: "var(--ground)", color: "var(--ink)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 64px", display: "flex", flexDirection: "column", gap: 36 }}>
        <header>
          <h1 style={{ margin: 0, font: "800 30px/1 var(--font-sans)", fontStretch: "75%" }}>
            Stockroom components
          </h1>
          <p style={{ margin: "8px 0 0", color: "var(--slate)", fontSize: 13 }}>
            Every §7 component in its states. Built before the screens (§12).
          </p>
        </header>

        <Section title="AppBar">
          <div style={{ margin: "0 -24px" }}>
            {/* AppBar reads the ?q= param (SR-07 search state) — the
                specimen page renders it inside a Suspense boundary,
                as ConsoleShell does. */}
            <Suspense fallback={null}>
              <AppBar current="dashboard" />
            </Suspense>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
            Counts are live from the shop store: Orders shows held orders (tape), Inventory shows
            SKUs below reorder. Cut-off countdown: <Countdown />
          </p>
        </Section>

        <Section title="AuditEntry">
          {/* Hosted as on the audit screen: rows keep their natural width
              and scroll inside the panel on narrow viewports (§6). */}
          <div className="panel" style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 528 }}>
            <AuditDayHeader>Mon, Oct 5</AuditDayHeader>
            <AuditEntryRow time="16:40" who="Kofi Mensah" kindLabel="Stock" kindTone="slate" money="−$43.00" moneyOut>
              Wrote off 2 × <span className="mono">EC-WHT</span> · damaged in delivery
            </AuditEntryRow>
            <AuditEntryRow time="11:05" who="Sheku Koroma" kindLabel="Price" kindTone="ink">
              Price, Oak serving board · Large{" "}
              <span className="ch">
                <s>$180.00</s>→<span>$190.00</span>
              </span>
            </AuditEntryRow>
            <AuditEntryRow time="09:12" who="System" system kindLabel="Received" kindTone="paid" money="$0.00">
              Delivery received on <span className="mono">PO-0214</span> · 72 units from Ashby Pottery
            </AuditEntryRow>
            </div>
          </div>
        </Section>

        <Section title="Button">
          <Row>
            <Button variant="tape">Verify count</Button>
            <Button>Retry payment</Button>
            <Button>Print pick list</Button>
            <Button variant="destructive">Refund in full</Button>
          </Row>
          <Row>
            <Button size="lg">Task-screen size · 40px</Button>
            <Button size="sm">Small · 30px</Button>
            <Button disabled>Paused while offline</Button>
          </Row>
        </Section>

        <Section title="Cover">
          <div className="panel" style={{ overflow: "hidden" }}>
            <Cover />
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
            Design-system cover art, not a product component (its folder has no README).
          </p>
        </Section>

        <Section title="ExceptionRow">
          <div className="panel" style={{ overflowX: "auto" }}>
            <ExceptionRow
              id="ORD-1048"
              idHref="/admin/orders/ORD-1048"
              stampTone="tape"
              stampLabel="Stock hold"
              fact="Avery Lewis · 2 items · $128.00"
              reason="Canvas market tote: the system says 5, shelf B-14 was counted at 4. No stock was deducted — verify before the order is released."
              codes="LA-CHR ×1 · CT-NAT ×1 · paid 9:42 AM"
              fixLabel="Verify count"
              fixHref="/admin/orders/ORD-1048"
              openHref="/admin/orders/ORD-1048"
              highlighted
            />
            <ExceptionRow
              id="ORD-1046"
              stampTone="problem"
              stampLabel="Payment failed"
              fact="Jordan Bell · 1 item · $214.00"
              reason="Card declined at capture, 8:15 AM. Nothing was charged; the board is held for 48 hours."
              codes="OSB-LG ×1 · attempt 1 of 3"
              fixLabel="Retry payment"
              openHref="/admin/orders/ORD-1046"
            />
          </div>
        </Section>

        <Section title="Field">
          <div className="panel" style={{ overflowX: "auto" }}>
            <Field label="Store name" help="Shown on receipts." htmlFor="dev-name">
              <input id="dev-name" className="in" defaultValue="Larder & Loom" style={{ maxWidth: 300 }} />
            </Field>
            <Field label="Same-day cut-off" help="Orders paid before this ship today." htmlFor="dev-cut" unsavedFrom="2:00 PM">
              <input id="dev-cut" className="in mono" defaultValue="1:00 PM" style={{ width: 110 }} />
            </Field>
            <Field
              label="Workshop email"
              help="Receipts and payout notices go here."
              htmlFor="dev-email"
              error="That email doesn’t look complete."
              errorId="dev-email-err"
            >
              <input
                id="dev-email"
                className="in"
                defaultValue="shop@larderandloom"
                style={{ maxWidth: 300 }}
                aria-invalid="true"
                aria-describedby="dev-email-err"
              />
            </Field>
          </div>
        </Section>

        <Section title="LedgerLine">
          <div className="panel" style={{ padding: "6px 0" }}>
            <LedgerLine label="Held orders" value="7" tone="tape" />
            <LedgerLine label="Low-stock SKUs" value="18" />
            <LedgerLine label="Net revenue" caption="+8.4% on the 7 days before" value="$18,420" />
            <LedgerLine label="Refunds" value="$148.00" tone="problem" />
          </div>
          <div className="panel ink-panel">
            <div className="k">
              <span style={{ fontSize: 12, color: "var(--bar-text)" }}>Open orders · dark ink panel</span>
              <span className="v">25 · $3,184.50</span>
            </div>
          </div>
        </Section>

        <Section title="PermissionMatrix">
          <div className="panel" style={{ overflowX: "auto" }}>
            <PermissionMatrix
              roles={["Manager", "Fulfillment", "Cust. service", "Bookkeeper"]}
              rows={[
                { capability: "Pick, pack and ship", values: ["Yes", "Yes", "View", "View"] },
                { capability: "Refund orders", values: ["Yes", "No", "Up to $100", "No"] },
                { capability: "See revenue and costs", values: ["Yes", "No", "No", "Yes"] },
              ]}
            />
          </div>
        </Section>

        <Section title="Skeleton">
          <div className="panel" style={{ overflowX: "auto" }}>
            <SkeletonRows rows={2} />
          </div>
        </Section>

        <Section title="Stamp">
          <Row>
            <Stamp tone="paid">Paid</Stamp>
            <Stamp tone="paid">Shipped</Stamp>
            <Stamp tone="tape">Stock hold</Stamp>
            <Stamp tone="tape">Low</Stamp>
            <Stamp tone="problem">Payment failed</Stamp>
            <Stamp tone="problem">Out of stock</Stamp>
            <Stamp tone="ink">Label created</Stamp>
            <Stamp tone="ink">Owner</Stamp>
            <Stamp tone="slate">Packing</Stamp>
            <Stamp tone="slate">Stock</Stamp>
            <Stamp tone="muted">To pick</Stamp>
            <Stamp tone="muted">Draft</Stamp>
          </Row>
        </Section>

        <Section title="StatePanel">
          <StatePanel
            stampTone="slate"
            stampLabel="0 orders"
            title="Your first order starts the ledger."
            actions={
              <>
                <Button variant="tape">Open the storefront</Button>
                <Button>Place a test order</Button>
              </>
            }
          >
            <p style={{ margin: 0 }}>
              When someone checks out, it lands here with payment, address and stock already
              checked. Nothing is charged and no stock moves until then.
            </p>
          </StatePanel>
        </Section>

        <Section title="StockLevel">
          <div className="panel" style={{ padding: "6px 0" }}>
            <StockLevel name="Linen apron — Charcoal" sku="LA-CHR" available={3} reorder={12} stampTone="tape" stampLabel="Low" />
            <StockLevel name="Oak serving board — Large" sku="OSB-LG" available={34} reorder={8} stampTone="paid" stampLabel="Healthy" />
            <StockLevel name="Stoneware mug — Terracotta" sku="SM-TER" available={0} reorder={18} stampTone="problem" stampLabel="Out of stock" />
          </div>
        </Section>

        <Section title="StoreButton">
          <div style={{ background: "var(--store-ground)", padding: 20, display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 }}>
            <StoreButton>Add to cart · $64</StoreButton>
            <StoreButton variant="outline" size="md">
              Keep shopping
            </StoreButton>
          </div>
        </Section>

        <Section title="Swatch">
          <div style={{ background: "var(--store-ground)", padding: 20 }}>
            <Row>
              <Swatch name="Charcoal" color="#3a3530" selected />
              <Swatch name="Natural" color="#d9d0c1" />
              <Swatch name="Rust" color="#9a4e2e" soldOut />
            </Row>
            <p style={{ margin: "10px 0 0", fontSize: 13 }}>Colour: Charcoal</p>
          </div>
        </Section>

        <Section title="SystemBanner">
          <PausedBannerDemo />
          <SystemBanner kind="blocking">
            <span className="lead-in">That email and password don’t match.</span> After 5 tries we
            pause sign-in for 15 minutes.
          </SystemBanner>
        </Section>

        <Section title="SettingsNav · CodeTag · PipelineBar · PhotoBlock">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "flex-start" }}>
            <div style={{ flex: "0 1 220px" }}>
              <SettingsNav current="store" />
            </div>
            <div style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
              <Row>
                <CodeTag code="WELCOME15" />
                <CodeTag code="FREESHIP75" />
              </Row>
              <div className="panel" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                <PipelineBar shipped={23} ready={4} packing={5} toPick={9} />
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  41 orders today: 23 shipped, 4 ready to ship, 5 packing, 9 to pick.
                </span>
              </div>
              <PhotoBlock label="Linen apron, Charcoal, on the workshop peg" color="#3a3530" dark minHeight={180} />
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
