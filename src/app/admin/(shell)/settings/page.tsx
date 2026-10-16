import { Suspense } from "react";
import { getSettings } from "@/lib/api";
import { normalizeSettings } from "./admin-data";
import SettingsForm from "./SettingsForm";

/* A-02 · /admin/settings — Store / Fulfillment / Payments / Alerts
   sections on one page (Settings.html), with the shared sticky
   unsaved-changes header. Data: @/lib/api getSettings(). */
export default async function SettingsPage() {
  let raw: unknown = null;
  try {
    raw = await getSettings();
  } catch {
    raw = null;
  }
  const settings = normalizeSettings(raw);
  return (
    <Suspense fallback={null}>
      <SettingsForm settings={settings} />
    </Suspense>
  );
}
