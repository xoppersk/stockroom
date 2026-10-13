import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { currentRole } from "@/lib/auth/roles";

import { SignOutButton } from "./sign-out-button";

/**
 * The page reads the per-request session/role, so it is dynamic — the same
 * opt-out the `(app)` layout declares for its segment (Next 16 validates
 * instant navigations by default; instant = false allows blocking on the
 * session read instead of prerendering).
 */
export const instant = false;

/**
 * Unauthorized (Flagship UI Designs §2.20 / F8): role-gated areas land here
 * instead of silently bouncing. Two states share the page:
 *
 *   * Wrong role — the signed-in account has a role, just not for the area
 *     it asked for: "You don't have access to this area" + back-to-dashboard.
 *   * No role yet — the account is signed in but has no `user_roles` row
 *     (invite not completed): an admin must grant access via Settings →
 *     Invite first, so the copy says so and offers sign-out instead of a
 *     dashboard link that would only bounce back here.
 *
 * This route deliberately lives OUTSIDE the `(app)` group: the group layout
 * redirects role-less users here, and it cannot gate its own landing page.
 * The attempt is logged server-side by requireRole's callers via the audit
 * log where it matters.
 */
export default async function UnauthorizedPage() {
  const role = await currentRole();

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-warning-soft">
        <ShieldAlert className="size-8 text-warning" aria-hidden />
      </span>
      {role ? (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            You don&apos;t have access to this area
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Your role doesn&apos;t include this section. If you need it for your work, ask an admin
            to update your access.
          </p>
          <Button asChild className="mt-2">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Your account doesn&apos;t have access yet
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            You&apos;re signed in, but no role has been granted to this account yet. An admin can
            grant you access from Settings → Invite staff — once they have, sign in again and
            you&apos;ll land straight in the app.
          </p>
          <SignOutButton />
        </>
      )}
    </div>
  );
}
