"use client";

/**
 * Media manager (v1): image URLs, not uploads.
 *
 * Each row is a URL + alt text with a live thumbnail preview, reorder
 * controls, and removal. Storage upload to the `product-images` bucket is a
 * later step — rows persist `storage_path`, which already accepts either a
 * full https:// URL or a bucket-relative path (see resolveImageUrl).
 */
import { useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface MediaItemState {
  id: string;
  url: string;
  alt: string;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function MediaManager({
  initial = [],
  onChange,
}: {
  initial?: { url: string; alt: string }[];
  onChange: (items: { url: string; alt: string }[]) => void;
}) {
  const [items, setItems] = useState<MediaItemState[]>(() =>
    initial.map((i) => ({ id: newId(), url: i.url, alt: i.alt })),
  );
  const [broken, setBroken] = useState<Set<string>>(new Set());

  function emit(next: MediaItemState[]) {
    setItems(next);
    onChange(next.map((i) => ({ url: i.url.trim(), alt: i.alt.trim() })));
  }

  function addItem() {
    emit([...items, { id: newId(), url: "", alt: "" }]);
  }

  function updateItem(id: string, patch: Partial<MediaItemState>) {
    emit(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function removeItem(id: string) {
    emit(items.filter((i) => i.id !== id));
  }

  function move(id: string, direction: -1 | 1) {
    const index = items.findIndex((i) => i.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(target, 0, moved);
    emit(next);
  }

  function markBroken(id: string) {
    setBroken((prev) => new Set(prev).add(id));
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No images yet. Add image URLs below — the first image becomes the product thumbnail.
        </p>
      )}

      {items.map((item, index) => (
        <div key={item.id} className="flex gap-3 rounded-lg border p-3">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
            {item.url && !broken.has(item.id) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.url}
                alt=""
                className="size-full object-cover"
                onError={() => markBroken(item.id)}
              />
            ) : (
              <ImagePlus className="size-5 text-muted-foreground" />
            )}
          </div>

          <div className="grid flex-1 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`media-url-${item.id}`}>Image URL {index === 0 && "(thumbnail)"}</Label>
              <Input
                id={`media-url-${item.id}`}
                value={item.url}
                onChange={(e) => {
                  updateItem(item.id, { url: e.target.value });
                  setBroken((prev) => {
                    const next = new Set(prev);
                    next.delete(item.id);
                    return next;
                  });
                }}
                placeholder="https://…"
                inputMode="url"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`media-alt-${item.id}`}>Alt text</Label>
              <Input
                id={`media-alt-${item.id}`}
                value={item.alt}
                onChange={(e) => updateItem(item.id, { alt: e.target.value })}
                placeholder="Describe the image for screen readers"
              />
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => move(item.id, -1)}
              disabled={index === 0}
              aria-label="Move image up"
            >
              <ArrowUp className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => move(item.id, 1)}
              disabled={index === items.length - 1}
              aria-label="Move image down"
            >
              <ArrowDown className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeItem(item.id)}
              aria-label="Remove image"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={addItem} className="self-start">
        <ImagePlus className="size-4" />
        Add image
      </Button>
    </div>
  );
}
