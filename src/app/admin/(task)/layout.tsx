import { Suspense } from "react";
import "@/styles/console.css";

/* Task routes (adjust stock, product wizard, discount builder): the
   packaged screens draw a slim TaskBar instead of the full console
   AppBar, so this group renders the console wrapper only — no AppBar,
   no ConsoleShell. Each page renders its own <TaskBar /> first.
   The Suspense boundary mirrors ConsoleShell's: these pages read
   route/search params, and Next 16 prerendering needs the boundary
   (without it the discount builder fails the production build). */
export default function AdminTaskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="console" data-theme-area="console">
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}
