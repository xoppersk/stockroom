import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import "@/styles/console.css";

/* Task routes (adjust stock, product wizard, discount builder): the
   packaged screens draw a slim TaskBar instead of the full console
   AppBar, so this group renders the console wrapper only — no AppBar,
   no ConsoleShell. Each page renders its own <TaskBar /> first.

   Gate (added in the production pass, mirroring (shell)/layout.tsx):
   middleware guarantees a session for /admin/*, but the role check
   lived only in the shell group — these task routes rendered for any
   signed-in account. AdminTaskGate re-checks the session server-side
   and the staff role via public.current_role() before anything renders.
   The Suspense boundary also mirrors ConsoleShell's: these pages read
   route/search params, and Next 16 prerendering needs the boundary
   (without it the discount builder fails the production build). */
export default function AdminTaskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="console" data-theme-area="console">
      <Suspense fallback={null}>
        <AdminTaskGate>{children}</AdminTaskGate>
      </Suspense>
    </div>
  );
}

async function AdminTaskGate({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: role } = await supabase.rpc("current_role");
  if (typeof role !== "string" || role.length === 0) {
    redirect("/admin/login?denied=1");
  }

  return <>{children}</>;
}
