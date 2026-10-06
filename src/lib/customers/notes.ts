/**
 * Customer notes timeline storage.
 *
 * `customers.notes` is a single text column, but the UI treats it as an
 * append-only timeline (DESIGN-BRIEF.md §4: "reads like a case file").
 * Each appended entry is separated by a distinctive marker; the first chunk
 * (seed data or legacy free text) renders as one untimestamped entry.
 */

export const NOTE_MARKER = "@@NOTE@@";

export interface CustomerNote {
  id: string;
  /** ISO timestamp, or null for legacy/pre-timeline text. */
  stamp: string | null;
  actor: string | null;
  body: string;
}

/** Build the text appended to `customers.notes` for one new entry. */
export function buildNoteEntry(actorName: string, body: string): string {
  const stamp = new Date().toISOString();
  const safeActor = actorName.replace(/\n/g, " ").slice(0, 80);
  return `\n\n${NOTE_MARKER}\n${stamp} · ${safeActor}\n${body.trim()}`;
}

/** Split the raw notes column into timeline entries, newest last. */
export function parseCustomerNotes(raw: string): CustomerNote[] {
  const chunks = raw.split(NOTE_MARKER);
  const notes: CustomerNote[] = [];

  const preamble = (chunks[0] ?? "").trim();
  if (preamble.length > 0) {
    notes.push({ id: "legacy-0", stamp: null, actor: null, body: preamble });
  }

  chunks.slice(1).forEach((chunk, i) => {
    const lines = chunk.trim().split("\n");
    const header = lines[0] ?? "";
    const separator = header.indexOf(" · ");
    const stamp = separator > 0 ? header.slice(0, separator).trim() : null;
    const actor = separator > 0 ? header.slice(separator + 3).trim() : null;
    const body = (separator > 0 ? lines.slice(1) : lines).join("\n").trim();
    if (body.length === 0 && stamp === null) return;
    notes.push({
      id: `note-${i}`,
      stamp: stamp && !Number.isNaN(Date.parse(stamp)) ? stamp : null,
      actor: actor && actor.length > 0 ? actor : null,
      body,
    });
  });

  return notes;
}
