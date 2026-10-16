"use client";
/* A-02 Settings form — all sections from Settings.html on one page.

   Dirty tracking: SettingsDirtyProvider (../settings-dirty) holds the
   saved fixture values vs the draft. The page loads in the drawn state:
   the same-day cut-off already edited 2:00 PM → 1:00 PM and the
   default box already changed (the fixture's two changed fields —
   together the header's "2 unsaved changes"). Every edited field gets
   the Field unsaved treatment, the sticky header count updates live,
   Discard restores the saved values, and Save clears the dirty state
   and persists the values into the client store (when it exposes a
   settings setter) so they stick across the session. */

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Field } from "@/components/sr/Field";
import { Stamp } from "@/components/sr/Stamp";
import { Button } from "@/components/sr/Button";
import { useShop } from "@/lib/store";
import {
  SettingsDirtyProvider,
  useSettingsDirty,
  type SettingsValues,
} from "../settings-dirty";
import {
  normalizeSettings,
  type AdminCarrier,
  type AdminSettings,
} from "./admin-data";

type LooseShop = {
  getState?: () => { settings?: unknown };
  updateSettings?: (values: SettingsValues) => void;
  saveSettings?: (values: SettingsValues) => void;
  setSettings?: (values: SettingsValues) => void;
};

const SECTION_IDS: Record<string, string> = {
  store: "store",
  fulfillment: "fulfillment",
  fulfill: "fulfillment",
  payments: "payments",
  pay: "payments",
  alerts: "alerts",
};

export default function SettingsForm({ settings }: { settings: AdminSettings }) {
  const shop = useShop() as unknown as LooseShop;

  /* Values saved earlier this session (via the store, if it grows a
     settings slice) win over the fixture values, so saved settings
     stick when you come back. The current store exposes no settings
     slice, so this is inert today and Save persists to the provider's
     saved state for the page session. */
  const storedRaw = shop?.getState?.()?.settings;
  const stored = useMemo(
    () => (storedRaw ? normalizeSettings(storedRaw) : null),
    [storedRaw],
  );
  const initialSaved = stored ? stored.fields : settings.fields;

  /* The drawn initial draft (cut-off 2:00 PM → 1:00 PM and the default
     box already changed — the header's "2 unsaved changes") comes from
     the fixture's changed flags via normalizeSettings. If the store
     already holds saved values from this session, the page opens
     clean against them instead. */
  const initialDraft = useMemo(
    () => (stored ? {} : settings.draft),
    [stored, settings.draft],
  );

  const persist = (values: SettingsValues) => {
    try {
      if (shop?.updateSettings) shop.updateSettings(values);
      else if (shop?.saveSettings) shop.saveSettings(values);
      else if (shop?.setSettings) shop.setSettings(values);
    } catch {
      /* Store persistence is best-effort; the provider's saved state
         already cleared the dirty flags for this page. */
    }
  };

  return (
    <SettingsDirtyProvider
      initialSaved={initialSaved}
      initialDraft={initialDraft}
      onSave={persist}
    >
      <SettingsFormInner settings={settings} />
    </SettingsDirtyProvider>
  );
}

function SettingsFormInner({ settings }: { settings: AdminSettings }) {
  const dirty = useSettingsDirty();
  const params = useSearchParams();
  const { values, setValue, isDirty, changedFrom } = dirty;

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

  const pickupDirty = isDirty("pickupDays") || isDirty("pickupOpen") || isDirty("pickupClose");
  const slipDirty = isDirty("slipNote");
  const carriersDirty = settings.carriers.some((c) => isDirty(c.id));

  const carrier = (c: AdminCarrier) => (
    <label className="chk" key={c.id}>
      <input
        type="checkbox"
        checked={values[c.id] === "on"}
        onChange={(e) => setValue(c.id, e.target.checked ? "on" : "off")}
      />{" "}
      {c.name}
      {c.note ? (
        <span
          className={c.noteMono ? "mono" : undefined}
          style={{ color: "var(--muted)", fontSize: 12 }}
        >
          {c.note}
        </span>
      ) : null}
    </label>
  );

  return (
    <form
      className="adm-settings-main"
      onSubmit={(e) => {
        e.preventDefault();
        dirty.save();
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
          <Button type="submit" variant="tape" disabled={dirty.dirtyCount === 0}>
            Save changes
          </Button>
        </div>
      </div>

      <section id="store" className="panel adm-section" aria-labelledby="h-store">
        <div className="ph">
          <h2 id="h-store">Store</h2>
        </div>
        <Field
          label="Store name"
          help="Shown on receipts and the storefront."
          htmlFor="s-name"
          unsavedFrom={changedFrom("storeName")}
        >
          <input
            id="s-name"
            className="in"
            style={{ maxWidth: 360 }}
            value={values.storeName ?? ""}
            onChange={(e) => setValue("storeName", e.target.value)}
          />
        </Field>
        <Field
          label="Workshop address"
          help="Return address and pickup point."
          htmlFor="s-addr"
          unsavedFrom={changedFrom("address")}
        >
          <input
            id="s-addr"
            className="in"
            style={{ maxWidth: 420 }}
            value={values.address ?? ""}
            onChange={(e) => setValue("address", e.target.value)}
          />
        </Field>
        <Field label="Pickup hours">
          <div className="adm-control-row">
            <label htmlFor="ph-d" className="sr-only">
              Pickup days
            </label>
            <select
              id="ph-d"
              className={`in${isDirty("pickupDays") ? " adm-input--unsaved" : ""}`}
              value={values.pickupDays ?? ""}
              onChange={(e) => setValue("pickupDays", e.target.value)}
            >
              <option>Tue – Sat</option>
              <option>Mon – Fri</option>
              <option>Every day</option>
            </select>
            <label htmlFor="ph-o" className="sr-only">
              Opens
            </label>
            <input
              id="ph-o"
              className={`in mono${isDirty("pickupOpen") ? " adm-input--unsaved" : ""}`}
              style={{ width: 100 }}
              value={values.pickupOpen ?? ""}
              onChange={(e) => setValue("pickupOpen", e.target.value)}
            />
            <span className="adm-control-to">to</span>
            <label htmlFor="ph-c" className="sr-only">
              Closes
            </label>
            <input
              id="ph-c"
              className={`in mono${isDirty("pickupClose") ? " adm-input--unsaved" : ""}`}
              style={{ width: 100 }}
              value={values.pickupClose ?? ""}
              onChange={(e) => setValue("pickupClose", e.target.value)}
            />
          </div>
          {pickupDirty ? <span className="field-note">Changed · not saved</span> : null}
        </Field>
        <Field
          label="Customer reply address"
          help="Receipts come from here."
          htmlFor="s-mail"
          unsavedFrom={changedFrom("replyEmail")}
        >
          <input
            id="s-mail"
            className="in mono"
            style={{ maxWidth: 300 }}
            value={values.replyEmail ?? ""}
            onChange={(e) => setValue("replyEmail", e.target.value)}
          />
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
          label="Same-day cut-off"
          help="Orders paid before this ship today."
          htmlFor="f-cut"
          unsavedFrom={changedFrom("cutoff")}
        >
          <input
            id="f-cut"
            className="in mono"
            style={{ width: 100 }}
            value={values.cutoff ?? ""}
            onChange={(e) => setValue("cutoff", e.target.value)}
          />
        </Field>
        <Field label="Carriers">
          <div>{settings.carriers.map(carrier)}</div>
          {carriersDirty ? <span className="field-note">Changed · not saved</span> : null}
        </Field>
        <Field
          label="Default box"
          help="Used for label rates until packed."
          htmlFor="f-box"
          unsavedFrom={changedFrom("defaultBox")}
        >
          <select
            id="f-box"
            className="in"
            style={{ maxWidth: 300 }}
            value={values.defaultBox ?? ""}
            onChange={(e) => setValue("defaultBox", e.target.value)}
          >
            {settings.boxOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </Field>
        <Field label="Packing slip note" htmlFor="f-slip">
          <textarea
            id="f-slip"
            className={`in adm-textarea${slipDirty ? " adm-input--unsaved" : ""}`}
            style={{ height: 64, maxWidth: 520 }}
            value={values.slipNote ?? ""}
            onChange={(e) => setValue("slipNote", e.target.value)}
          />
          {slipDirty ? <span className="field-note">Changed · not saved</span> : null}
        </Field>
      </section>

      <section id="payments" className="panel adm-section" aria-labelledby="h-pay">
        <div className="ph">
          <h2 id="h-pay">Payments and tax</h2>
        </div>
        <Field label="Card payments">
          <div className="adm-stripe-line">
            <Stamp tone="paid">Connected</Stamp>
            <span>
              Stripe · account ending{" "}
              <span className="mono">{settings.stripeAccountEnding}</span>
            </span>
            <a
              href="#"
              className="adm-stripe-link"
              onClick={(e) => e.preventDefault()}
            >
              Manage in Stripe
            </a>
          </div>
        </Field>
        <Field label="Payouts" help={settings.payoutSchedule}>
          <div className="adm-payout-stack">
            <span className="adm-payout-line">
              Next payout{" "}
              <b className="adm-payout-figure">{settings.nextPayout}</b> on{" "}
              {settings.nextPayoutDate}
            </span>
            <span className="adm-payout-to">
              To business checking ending {settings.payoutAccountEnding}
            </span>
          </div>
        </Field>
        <Field label="Sales tax">
          <div className="adm-tax-wrap">
            <div role="table" aria-label="Tax rates" className="adm-tax">
              <div role="row" className="adm-tax-row adm-tax-row--head">
                <span role="columnheader">Region</span>
                <span role="columnheader">Rate</span>
                <span role="columnheader">Collecting</span>
              </div>
              {settings.taxRows.map((row) => (
                <div role="row" className="adm-tax-row" key={row.region}>
                  <span role="cell">{row.region}</span>
                  <span role="cell" className="mono">
                    {row.rate}
                  </span>
                  <span role="cell" className={row.muted ? "adm-tax-muted" : undefined}>
                    {row.collecting}
                  </span>
                </div>
              ))}
            </div>
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
            nothing can be bought until you reopen.
          </span>
          <Button type="button" variant="destructive">
            Pause storefront
          </Button>
        </div>
      </section>
    </form>
  );
}
