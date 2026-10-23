import { Suspense } from "react";
import UpdatePasswordForm from "./UpdatePasswordForm";

/* The form reads the recovery code from the URL on the client — behind a
   Suspense boundary per Cache Components. */
export default function AccountUpdatePasswordPage() {
  return (
    <Suspense fallback={null}>
      <UpdatePasswordForm />
    </Suspense>
  );
}
