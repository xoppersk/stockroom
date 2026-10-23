"use client";
/* A-02 Settings form — all sections from Settings.html on one page.

   Per ruling 11 the ONLY editable-real fields are the store_settings
   rows: tax rate, flat shipping rate, free-shipping threshold. The
   dirty machinery (../settings-dirty) tracks exactly those three;
   Save writes each changed field through updateStoreSetting and the
   provider promotes draft → saved only when every write succeeds —
   a rejection (settings are admin-write) keeps the fields dirty and
   shows the reason. Everything else on the page is read-only truth:
   store identity from config.ts, payments honestly not enabled (no
   payment provider is connected), carriers unconfigured, alerts as
   the real broadcast-notification behaviour. No control on this page
   pretends to save. */

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Field } from "@/components/sr/Field";
import { Stamp } from "@/components/sr/Stamp";
import { Button } from "@/components/sr/Button";
import { updateStoreSetting } from "@/lib/shop/admin-actions";
import {
  SettingsDirtyProvider,
  useSettingsDirty,
  type SettingsValues,
} from "../settings-dirty";
import type { AdminSettings } from "./admin-data";

const SECTION_IDS: Record<string, string> = {
  store: "store",
  fulfillment: "fulfillment",
  fulfill: "fulfillment",
  payments: "payments",
  pay: "payments",
  alerts: "alerts",
};

function parseDollars(raw: string): number | null {
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return raw.trim() === "" || Number.isNaN(n) ? null : Math.round(n * 100) / 100;
}

export default function SettingsForm({ settings }: { settings: AdminSettings }) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const lastSavedRef = useRef<SettingsValues>({ ...settings.fields });

  /* Persist only the fields that actually changed, in the action's
     units (verified against the landed updateStoreSetting: tax_rate
     takes percent points, shipping_flat / free_shipping_threshold
     take DOLLARS, threshold also accepts null). */
  const persist = async (values: SettingsValues): Promise<boolean> => {
    const saved = lastSavedRef.current;
    const jobs: { key: string; value: number | null }[] = [];
    if (values.taxRatePct !== saved.taxRatePct) {
      const pct = Number(values.taxRatePct);
      if (Number.isNaN(pct) || pct < 0) {
        setSaveError("Tax rate must be a number, 0 or more.");
        return false;
      }
      jobs.push({ key: "tax_rate", value: pct });
    }
    if (values.shippingFlat !== saved.shippingFlat) {
      const dollars = parseDollars(values.shippingFlat ?? "");
      if (dollars === null || dollars < 0) {
        setSaveError("Flat shipping rate must be an amount, $0 or more.");
        return false;
      }
      jobs.push({ key: "shipping_flat", value: dollars });
    }
    if (values.freeShipThreshold !== saved.freeShipThreshold) {
      const raw = (values.freeShipThreshold ?? "").trim();
      const dollars = raw === "" ? null : parseDollars(raw);
      if (raw !== "" && (dollars === null || dollars < 0)) {
        setSaveError("Free-shipping threshold must be an amount, or empty for no threshold.");
        return false;
      }
      jobs.push({ key: "free_shipping_threshold", value: dollars });
    }
    for (const job of jobs) {
      const result = await updateStoreSetting(job.key, job.value);
      if (!result.ok) {
        setSaveError(result.reason);
        return false;
      }
    }
    lastSavedRef.current = { ...values };
    setSaveError(null);
    return true;
  };

  return (
    <SettingsDirtyProvider initialSaved={settings.fields} onSave={persist}>
      <SettingsFormInner settings={settings} saveError={saveError} />
    </SettingsDirtyProvider>
  );
}

function SettingsFormInner({
  settings,
  saveError,
}: {
  settings: AdminSettings;
  saveError: string | null;
}) {
  const dirty = useSettingsDirty();
  const params = useSearchParams();
  const { values, setValue, isDirty, changedFrom } = dirty;
  const [saving, setSaving] = useState(false);

  /* Nav items for the page sections arrive as /admin/settings#payments
     (shared SettingsNav) or ?section=payments — scroll the section into
     view. The sticky header offset comes from .adm-section's
     scroll-margin. */
  useEffect(() => {
    const raw =
      params.get("section") ??
      (typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "");
    if (!raw) return;
    const id = SECTION_IDS[raw.toLowerCase()];
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ block: "start" });
  }, [params]);

  return (
    <form
      className="adm-settings-main"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await dirty.save();
        setSaving(false);
      }}
    >
      <div className="adm-pagehead adm-pagehead--sticky">
        <div className="adm-headcol">
          <h1>Settings</h1>
          <span className="adm-sub">
            Changes here show on the storefront and on every packing slip. Saved
            changes are signed in audit history.
          </span>
        </div>
        <div className="adm-headactions">
          {dirty.dirtyCount > 0 ? (
            <span className="adm-unsaved" role="status">
              <i aria-hidden="true" className="adm-dot" />
              {dirty.dirtyCount} unsaved {dirty.dirtyCount === 1 ? "change" : "changes"}
            </span>
          ) : null}
          <Button type="button" onClick={dirty.discard} disabled={dirty.dirtyCount === 0}>

            Discard
          </Button>
          <Button type="submit" variant="tape" disabled={dirty.dirtyCount === 0 || saving}>
            Save changes
          </Button>
        </div>
      </div>

      {saveError && (
        <p className="ops-rule-note" role="alert" style={{ color: "var(--problem, #b3261e)" }}>
          {saveError}
        </p>
      )}

      <section id="store" className="panel adm-section" aria-labelledby="h-store">
        <div className="ph">
          <h2 id="h-store">Store</h2>
        </div>
        <Field label="Store name" help="Shown on receipts and the storefront." htmlFor="s-name">
          <input id="s-name" className="in" style={{ maxWidth: 360 }} value={settings.storeName} readOnly />
        </Field>
        <Field label="Workshop address" help="Return address and pickup point." htmlFor="s-addr">
          <input id="s-addr" className="in" style={{ maxWidth: 420 }} value={settings.address} readOnly />
        </Field>
        <Field label="Customer reply address" help="Receipts come from here." htmlFor="s-mail">
          <input id="s-mail" className="in mono" style={{ maxWidth: 300 }} value={settings.replyEmail} readOnly />
        </Field>
      </section>

      <section id="fulfillment" className="panel adm-section" aria-labelledby="h-ful">
        <div className="ph">
          <h2 id="h-ful">Fulfillment</h2>
          <span className="ph-note">
            Used by the dashboard countdown and the storefront banner
          </span>
        </div>
        <Field
          label="Flat shipping rate"
          help="Charged on every shipped order below the free-shipping threshold."
          htmlFor="f-ship"
          unsavedFrom={changedFrom("shippingFlat")}
        >
          <input
            id="f-ship"
            className={`in mono${isDirty("shippingFlat") ? " adm-input--unsaved" : ""}`}
            style={{ width: 120 }}
            value={values.shippingFlat ?? ""}
            onChange={(e) => setValue("shippingFlat", e.target.value)}
          />
        </Field>
        <Field
          label="Free shipping threshold"
          help="Orders at or above this ship free. Leave empty for no threshold."
          htmlFor="f-free"
          unsavedFrom={changedFrom("freeShipThreshold")}
        >
          <input
            id="f-free"
            className={`in mono${isDirty("freeShipThreshold") ? " adm-input--unsaved" : ""}`}
            style={{ width: 120 }}
            placeholder="No threshold"
            value={values.freeShipThreshold ?? ""}
            onChange={(e) => setValue("freeShipThreshold", e.target.value)}
          />
        </Field>
        <Field label="Carriers">
          <span>
            No carriers are configured — shipped orders charge the flat rate
            above, and pickup is arranged at the counter.
          </span>
        </Field>
      </section>

      <section id="payments" className="panel adm-section" aria-labelledby="h-pay">
        <div className="ph">
          <h2 id="h-pay">Payments and tax</h2>
        </div>
        <Field label="Card payments">
          <div className="adm-stripe-line">
            <Stamp tone="muted">Not enabled</Stamp>
            <span>
              Online payment isn’t enabled yet — no payment provider is
              connected, so orders are paid at the counter or on pickup.
            </span>
          </div>
        </Field>
        <Field
          label="Sales tax"
          help="Applied to every order at checkout."
          htmlFor="p-tax"
          unsavedFrom={changedFrom("taxRatePct")}
        >
          <div className="adm-control-row">
            <input
              id="p-tax"
              className={`in mono${isDirty("taxRatePct") ? " adm-input--unsaved" : ""}`}
              style={{ width: 100 }}
              value={values.taxRatePct ?? ""}
              onChange={(e) => setValue("taxRatePct", e.target.value)}
            />
            <span className="adm-control-to">%</span>
          </div>
        </Field>
      </section>

      <section id="alerts" className="panel adm-section" aria-labelledby="h-al">
        <div className="ph">
          <h2 id="h-al">Alerts</h2>
          <span className="ph-note">Who gets told, and when</span>
        </div>
        <div role="table" aria-label="Alerts" className="adm-alerts">
          <div role="row" className="adm-alerts-row adm-alerts-row--head">
            <span role="columnheader">When</span>
            <span role="columnheader">Tell</span>
            <span role="columnheader">How</span>
          </div>
          {settings.alertRows.map((row) => (
            <div role="row" className="adm-alerts-row" key={row.when}>
              <span role="cell">{row.when}</span>
              <span role="cell">{row.tell}</span>
              <span role="cell">{row.how}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel adm-danger" aria-labelledby="h-dz">
        <div className="ph">
          <h2 id="h-dz">Close the store</h2>
        </div>
        <div className="adm-danger-body">
          <span className="adm-danger-text">
            Puts the storefront in “back soon” mode. Open orders still ship;
            nothing can be bought until you reopen. Pausing the storefront
            isn’t available yet.
          </span>
          <Button type="button" variant="destructive" disabled>
            Pause storefront
          </Button>
        </div>
      </section>
    </form>
  );
}
