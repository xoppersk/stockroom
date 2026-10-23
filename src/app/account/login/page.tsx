import { Suspense } from "react";

import { safeNextPath } from "@/lib/supabase/next-path";
import LoginForm from "./LoginForm";

/* searchParams is runtime data under Cache Components — the read happens
   in an async child behind a Suspense boundary. */
export default function AccountLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; note?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <LoginWithParams searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginWithParams({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; note?: string }>;
}) {
  const params = await searchParams;
  return (
    <LoginForm
      next={safeNextPath(params.next, "/account")}
      passwordUpdated={params.note === "password-updated"}
    />
  );
}
