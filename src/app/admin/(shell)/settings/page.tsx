/* A-02 · /admin/settings.
 * Async server component: real store_settings rows via
 * getConsoleStoreSettings(), mapped to the page shape with
 * buildSettingsView (./admin-data), rendered by SettingsForm. */

import { Suspense } from "react";
import { getConsoleStoreSettings } from "@/lib/shop/admin";
import { buildSettingsView } from "./admin-data";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage() {
  const rows = await getConsoleStoreSettings();
  const settings = buildSettingsView(rows);
  return (
    <Suspense fallback={null}>
      <SettingsForm settings={settings} />
    </Suspense>
  );
}
