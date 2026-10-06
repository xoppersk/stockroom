"use client";

import { useActionState, useState } from "react";
import { MessageSquareText } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { appendCustomerNote } from "@/lib/customers/actions";
import { parseCustomerNotes } from "@/lib/customers/notes";
import { formatDateTime } from "@/lib/format";
import type { ActionState } from "@/lib/server-action";

/**
 * Case-file notes timeline: entries render newest-first with actor + date,
 * and staff append notes through the appendCustomerNote action.
 */
export function NotesTimeline({
  customerId,
  rawNotes,
}: {
  customerId: string;
  rawNotes: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    appendCustomerNote,
    { ok: false },
  );

  const notes = parseCustomerNotes(rawNotes).slice().reverse();
  const visible = expanded ? notes : notes.slice(0, 5);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={customerId} />
        <Textarea
          name="body"
          rows={3}
          placeholder="Add a note — call outcome, preference, complaint context…"
          aria-label="New note"
        />
        {state.fieldErrors?.body ? (
          <p className="text-sm text-destructive">{state.fieldErrors.body[0]}</p>
        ) : null}
        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Add note"}
        </Button>
      </form>

      {notes.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="No notes yet"
          description="Notes added here build a case file on this customer — what they asked for, what went wrong, what to remember."
        />
      ) : (
        <div className="space-y-0">
          <ol className="relative space-y-5 border-l border-border pl-5">
            {visible.map((note) => (
              <li key={note.id} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[26px] top-1 size-2.5 rounded-full bg-primary ring-4 ring-background"
                />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-medium">
                    {note.actor ?? "Note"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {note.stamp ? formatDateTime(note.stamp) : "Earlier"}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{note.body}</p>
              </li>
            ))}
          </ol>
          {notes.length > 5 ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="mt-2 px-0"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show fewer" : `Show all ${notes.length} notes`}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
