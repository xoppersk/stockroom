"use client";
/* Settings shell (A-01…A-03): left SettingsNav + page content.
   Nav structure (HANDOVER §6 + Settings.html): Store / Fulfillment /
   Payments / Alerts are sections of the A-02 page — the shared
   SettingsNav links them to /admin/settings#<section>; Team and Audit
   history are their own routes. Current state: on /admin/settings the
   current item follows the URL hash (?section= is also honoured and
   normalised to the hash by the A-02 page); on the sub-routes it is
   "team" / "audit". The shared SettingsNav fills the current item
   with --ink. */

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SettingsNav, type SettingsKey } from "@/components/sr/SettingsNav";
import "@/styles/console-admin.css";

const SECTION_KEYS: SettingsKey[] = ["store", "fulfillment", "payments", "alerts"];

function currentFromLocation(
  pathname: string,
  sectionParam: string | null,
  hash: string,
): SettingsKey {
  if (pathname.startsWith("/admin/settings/team")) return "team";
  if (pathname.startsWith("/admin/settings/audit")) return "audit";
  const raw = (sectionParam || hash.replace(/^#/, "")).toLowerCase();
  /* Screen section ids were "fulfill" / "pay"; the nav links use the
     long names — accept both. */
  const alias: Record<string, SettingsKey> = {
    fulfill: "fulfillment",
    pay: "payments",
  };
  const key = alias[raw] ?? raw;
  return (SECTION_KEYS as string[]).includes(key)
    ? (key as SettingsKey)
    : "store";
}

function SettingsShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [hash, setHash] = useState("");

  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [pathname]);

  const current = currentFromLocation(
    pathname,
    params.get("section"),
    hash,
  );

  return (
    <div className="sr-page">
      <div className="adm-settings">
        <SettingsNav current={current} />
        {children}
      </div>
    </div>
  );
}

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SettingsShellInner>{children}</SettingsShellInner>
    </Suspense>
  );
}
