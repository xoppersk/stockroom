"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateCustomerTags } from "@/lib/customers/actions";
import type { ActionState } from "@/lib/server-action";

/**
 * Tag editor for a customer: chip list with add/remove, saved as a
 * comma-separated field through the updateCustomerTags action.
 */
export function TagsEditor({
  customerId,
  initialTags,
}: {
  customerId: string;
  initialTags: string[];
}) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [draft, setDraft] = useState("");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateCustomerTags,
    { ok: false },
  );

  const dirty =
    tags.length !== initialTags.length ||
    tags.some((t) => !initialTags.includes(t));

  function addTag() {
    const value = draft.trim();
    if (!value) return;
    if (tags.some((t) => t.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    setTags([...tags, value]);
    setDraft("");
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={customerId} />
      <input type="hidden" name="tags" value={tags.join(", ")} />

      <div className="flex flex-wrap gap-2">
        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags yet.</p>
        ) : (
          tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 py-1 pl-2.5">
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => setTags(tags.filter((t) => t !== tag))}
                className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="Add a tag, e.g. vip"
          aria-label="New tag"
          className="max-w-56"
        />
        <Button type="button" variant="outline" onClick={addTag}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      {state.fieldErrors?.tags ? (
        <p className="text-sm text-destructive">{state.fieldErrors.tags[0]}</p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={pending || !dirty}>
        {pending ? "Saving…" : "Save tags"}
      </Button>
    </form>
  );
}
