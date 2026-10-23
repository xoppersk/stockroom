import { Suspense } from "react";
import { getConsoleStoreSettings } from "@/lib/shop/admin";
import { buildSettingsView } from "./admin-data";
import SettingsForm from "./SettingsForm";

/* A-02 · /admin/settings — Store / Fulfillment / Payments / Alerts
   sections on one page (Settings.html), with the shared sticky
   unsaved-changes header. The only editable-real fields are the
   store_settings rows (ruling 11), read via getConsoleStoreSettings();
   store identity renders read-only from config.ts constants. */
export default async function SettingsPage() {
  const raw = await getConsoleStoreSettings();
  const settings = buildSettingsView(raw);
  return (
    <Suspense fallback={null}>
      <SettingsForm settings={settings} />
    </Suspense>
  );
}
