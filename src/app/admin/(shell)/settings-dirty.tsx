"use client";
/* Shared dirty-tracking for the settings area (HANDOVER §7 Field / §10
   "Unsaved changes: track dirty fields. Warn before leaving the page.
   The header count updates live.").

   One provider holds the SAVED fixture values and the current DRAFT
   values for every field on the A-02 Settings page. A field is dirty
   when draft !== saved. The page header derives its "N unsaved changes"
   count from this context, Discard restores the saved values, and Save
   promotes draft → saved (and hands the values to an optional onSave
   callback so the caller can persist them into the client store).

   The provider also accepts an initial DRAFT that differs from the
   saved values — A-02 uses this for the state drawn in Settings.html:
   the same-day cut-off loads as 1:00 PM against a saved 2:00 PM. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

export type SettingsValues = Record<string, string>;

type SettingsDirtyContextValue = {
  /** Current (possibly edited) values. */
  values: SettingsValues;
  /** Last saved values — what Discard restores. */
  savedValues: SettingsValues;
  setValue: (id: string, value: string) => void;
  isDirty: (id: string) => boolean;
  /** The saved value a dirty field changed from (for "Changed from X"). */
  changedFrom: (id: string) => string | undefined;
  dirtyIds: string[];
  dirtyCount: number;
  discard: () => void;
  save: () => void;
};

const SettingsDirtyContext =
  createContext<SettingsDirtyContextValue | null>(null);

export function SettingsDirtyProvider({
  initialSaved,
  initialDraft,
  onSave,
  children,
}: {
  /** Fixture / store values as last saved. */
  initialSaved: SettingsValues;
  /** Optional starting draft (defaults to the saved values). */
  initialDraft?: SettingsValues;
  /** Called with the saved values when the user saves. */
  onSave?: (values: SettingsValues) => void;
  children: ReactNode;
}) {
  const [savedValues, setSavedValues] = useState<SettingsValues>(initialSaved);
  const [values, setValues] = useState<SettingsValues>({
    ...initialSaved,
    ...(initialDraft ?? {}),
  });
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const setValue = useCallback((id: string, value: string) => {
    setValues((prev) => (prev[id] === value ? prev : { ...prev, [id]: value }));
  }, []);

  const dirtyIds = useMemo(
    () =>
      Object.keys({ ...savedValues, ...values }).filter(
        (id) => (values[id] ?? "") !== (savedValues[id] ?? ""),
      ),
    [values, savedValues],
  );
  const dirtyCount = dirtyIds.length;

  const isDirty = useCallback(
    (id: string) => (values[id] ?? "") !== (savedValues[id] ?? ""),
    [values, savedValues],
  );

  const changedFrom = useCallback(
    (id: string) =>
      (values[id] ?? "") !== (savedValues[id] ?? "")
        ? (savedValues[id] ?? "")
        : undefined,
    [values, savedValues],
  );

  const discard = useCallback(() => {
    setValues(savedValues);
  }, [savedValues]);

  const save = useCallback(() => {
    setSavedValues(values);
    onSaveRef.current?.(values);
  }, [values]);

  /* Warn before leaving the page while changes are unsaved (§10).
     SR-10: in-app navigation is intercepted and answered with the
     drawn X-06-pattern alertdialog (below) — the native beforeunload
     prompt remains ONLY for browser-chrome exits (tab close, refresh,
     address-bar), where no custom dialog can render. */
  useEffect(() => {
    if (dirtyCount === 0) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyCount]);

  /* ---- leave guard (X-06 pattern) ---- */
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (dirtyCount === 0) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      /* Same-page moves (section/hash links inside Settings) are not
         leaving — the draft stays mounted either way. */
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      lastFocusRef.current = document.activeElement as HTMLElement | null;
      setPendingHref(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirtyCount]);

  useEffect(() => {
    if (pendingHref) dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [pendingHref]);

  const closeGuard = useCallback(() => {
    setPendingHref(null);
    lastFocusRef.current?.focus?.();
  }, []);

  const ctx = useMemo<SettingsDirtyContextValue>(
    () => ({
      values,
      savedValues,
      setValue,
      isDirty,
      changedFrom,
      dirtyIds,
      dirtyCount,
      discard,
      save,
    }),
    [values, savedValues, setValue, isDirty, changedFrom, dirtyIds, dirtyCount, discard, save],
  );

  return (
    <SettingsDirtyContext.Provider value={ctx}>
      {children}
      {pendingHref ? (
        <div className="adm-scrim">
          <section
            className="adm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="leave-title"
            aria-describedby="leave-desc"
            ref={dialogRef}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeGuard();
            }}
          >
            <div className="adm-dialog-tapebar" />
            <div className="adm-dialog-body">
              <h2 id="leave-title" className="adm-dialog-title">
                You haven’t saved these changes.
              </h2>
              <p id="leave-desc" className="adm-dialog-lead">
                This page has <b>{dirtyCount} unsaved {dirtyCount === 1 ? "change" : "changes"}</b>.
                Save them before you go, leave and lose them, or keep editing — nothing
                is sent until you save.
              </p>
              <div className="adm-dialog-actions">
                <button
                  type="button"
                  className="btn tape"
                  onClick={() => {
                    const href = pendingHref;
                    save();
                    setPendingHref(null);
                    router.push(href);
                  }}
                >
                  Save changes
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const href = pendingHref;
                    setPendingHref(null);
                    router.push(href);
                  }}
                >
                  Leave without saving
                </button>
                <button type="button" className="btn" onClick={closeGuard}>
                  Keep editing
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </SettingsDirtyContext.Provider>
  );
}

export function useSettingsDirty(): SettingsDirtyContextValue {
  const ctx = useContext(SettingsDirtyContext);
  if (!ctx) {
    throw new Error(
      "useSettingsDirty must be used inside <SettingsDirtyProvider>",
    );
  }
  return ctx;
}

/** Convenience hook for one field: value, setter, dirty flag, origin. */
export function useDirtyField(id: string) {
  const { values, setValue, isDirty, changedFrom } = useSettingsDirty();
  return {
    value: values[id] ?? "",
    setValue: (value: string) => setValue(id, value),
    dirty: isDirty(id),
    changedFrom: changedFrom(id),
  };
}
