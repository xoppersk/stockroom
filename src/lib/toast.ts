/**
 * Lazy Sonner toasts. Importing `sonner` statically in a client component
 * pulls the toast runtime into that route's initial JS (bundle gate), so
 * every call here dynamic-imports it instead — the toast chunk loads on
 * first use, well before any user can trigger a second toast.
 *
 * API mirrors the `sonner` toast functions we use: success / error / info.
 */
function lazy(kind: "success" | "error" | "info", message: string): void {
  void import("sonner").then((m) => m.toast[kind](message));
}

export const toast = {
  success: (message: string) => lazy("success", message),
  error: (message: string) => lazy("error", message),
  info: (message: string) => lazy("info", message),
};
