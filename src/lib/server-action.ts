/**
 * Shared plumbing for Server Actions (FormData + useActionState).
 *
 * Kept in a plain module (no "use server") so both server-action modules
 * and client components can import the types safely.
 */

export interface ActionState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export const ACTION_FAILURE: ActionState = { ok: false };

interface Flattenable {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}

/** Convert a ZodError into the fieldErrors shape useActionState forms expect. */
export function zodFieldErrors(error: Flattenable): ActionState {
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(error.flatten().fieldErrors)) {
    if (value) fieldErrors[key] = value;
  }
  return { ...ACTION_FAILURE, fieldErrors };
}
