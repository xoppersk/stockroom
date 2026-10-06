"use client";

/**
 * Variant matrix builder — the hero interaction of the product wizard.
 *
 * Options in (Size, Color, …), variant rows out: each combination becomes an
 * editable row with title, SKU (auto-suggested, editable), price, compare-at
 * price, and — when `showStockFields` is on (the new-product wizard) — opening
 * stock + low-stock threshold. Edits to a row survive option changes as long
 * as the combination key still exists; deleted rows stay deleted.
 *
 * In the product editor the same builder is reused with `showStockFields`
 * off: stock is read-only there (the inventory team owns adjustments) and
 * existing rows carry their database ids so `upsertVariants` can sync.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StockPill } from "@/components/products/stock-pill";
import { cartesianOptions, suggestSku } from "@/lib/products/utils";
import { cn } from "@/lib/utils";

export interface OptionDef {
  name: string;
  values: string[];
}

export interface VariantRowState {
  key: string;
  id?: string;
  optionValues: Record<string, string>;
  title: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  quantity: string;
  threshold: string;
}

interface VariantMatrixBuilderProps {
  /** Uppercase prefix used when suggesting SKUs, e.g. "JTP". */
  skuPrefix: string;
  initialOptions?: OptionDef[];
  initialRows?: VariantRowState[];
  /** Wizard mode: opening stock + threshold are editable. */
  showStockFields?: boolean;
  /** Editor mode: read-only stock display, keyed by row key. */
  stockByKey?: Record<string, { quantity: number; threshold: number }>;
  onChange: (rows: VariantRowState[]) => void;
}

const DEFAULT_ROW = (key: string, skuPrefix: string): VariantRowState => ({
  key,
  optionValues: {},
  title: "Default",
  sku: `${skuPrefix}-001`,
  price: "",
  compareAtPrice: "",
  quantity: "0",
  threshold: "10",
});

function buildRows(
  options: OptionDef[],
  prevRows: VariantRowState[],
  skuPrefix: string,
  removedKeys: Set<string>,
): VariantRowState[] {
  const prev = new Map(prevRows.map((r) => [r.key, r]));
  const combos = cartesianOptions(options);

  if (combos.length === 0) {
    if (removedKeys.has("__default__")) return [];
    const existing = prev.get("__default__");
    return [existing ?? DEFAULT_ROW("__default__", skuPrefix)];
  }

  return combos
    .filter((c) => !removedKeys.has(c.key))
    .map((c) => {
      const existing = prev.get(c.key);
      if (existing) return { ...existing, key: c.key, optionValues: c.optionValues };
      return {
        key: c.key,
        optionValues: c.optionValues,
        title: c.title,
        sku: suggestSku(skuPrefix, c.optionValues),
        price: "",
        compareAtPrice: "",
        quantity: "0",
        threshold: "10",
      };
    });
}

/** Rebuild option definitions from existing variant rows (editor mode). */
function deriveOptions(rows: VariantRowState[]): OptionDef[] {
  const names: string[] = [];
  for (const row of rows) {
    for (const name of Object.keys(row.optionValues)) {
      if (!names.includes(name)) names.push(name);
    }
  }
  return names.map((name) => ({
    name,
    values: [...new Set(rows.map((r) => r.optionValues[name]).filter((v): v is string => !!v))],
  }));
}

export function VariantMatrixBuilder({
  skuPrefix,
  initialOptions,
  initialRows,
  showStockFields = false,
  stockByKey,
  onChange,
}: VariantMatrixBuilderProps) {
  const [options, setOptions] = useState<OptionDef[]>(() =>
    initialOptions && initialOptions.length > 0
      ? initialOptions
      : deriveOptions(initialRows ?? []),
  );
  const [rows, setRows] = useState<VariantRowState[]>(() =>
    buildRows(
      initialOptions && initialOptions.length > 0
        ? initialOptions
        : deriveOptions(initialRows ?? []),
      initialRows ?? [],
      skuPrefix,
      new Set(),
    ),
  );
  const [newOptionName, setNewOptionName] = useState("");
  const removedKeysRef = useRef<Set<string>>(new Set());
  const skuPrefixRef = useRef(skuPrefix);
  // Keep the ref fresh for the event handlers below without writing it
  // during render.
  useEffect(() => {
    skuPrefixRef.current = skuPrefix;
  }, [skuPrefix]);

  useEffect(() => {
    onChange(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const duplicateSkus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = row.sku.trim().toLowerCase();
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(
      rows.filter((r) => (counts.get(r.sku.trim().toLowerCase()) ?? 0) > 1).map((r) => r.key),
    );
  }, [rows]);

  function applyOptions(next: OptionDef[]) {
    setOptions(next);
    setRows((prev) => buildRows(next, prev, skuPrefixRef.current, removedKeysRef.current));
  }

  function updateRow(key: string, patch: Partial<VariantRowState>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    removedKeysRef.current.add(key);
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function addOption() {
    const name = newOptionName.trim();
    if (!name || options.length >= 3) return;
    if (options.some((o) => o.name.toLowerCase() === name.toLowerCase())) return;
    setNewOptionName("");
    applyOptions([...options, { name, values: [] }]);
  }

  function updateOption(index: number, patch: Partial<OptionDef>) {
    const next = options.map((o, i) => (i === index ? { ...o, ...patch } : o));
    applyOptions(next);
  }

  function removeOption(index: number) {
    applyOptions(options.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Option builder */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Options
          </Label>
          <span className="text-xs text-muted-foreground">Up to 3 (e.g. Size, Color)</span>
        </div>

        {options.map((option, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end sm:gap-3">
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor={`option-name-${i}`}>Option name</Label>
              <Input
                id={`option-name-${i}`}
                value={option.name}
                onChange={(e) => updateOption(i, { name: e.target.value })}
                placeholder="Size"
              />
            </div>
            <div className="grid flex-[2] gap-1.5">
              <Label htmlFor={`option-values-${i}`}>Values (comma-separated)</Label>
              <Input
                id={`option-values-${i}`}
                value={option.values.join(", ")}
                onChange={(e) =>
                  updateOption(i, {
                    values: e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="S, M, L"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeOption(i)}
              aria-label={`Remove option ${option.name || i + 1}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}

        {options.length < 3 && (
          <div className="flex gap-2">
            <Input
              value={newOptionName}
              onChange={(e) => setNewOptionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOption();
                }
              }}
              placeholder="New option name, e.g. Material"
              aria-label="New option name"
            />
            <Button type="button" variant="outline" onClick={addOption} disabled={!newOptionName.trim()}>
              <Plus className="size-4" />
              Add option
            </Button>
          </div>
        )}
        {options.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No options — the product sells as a single variant below.
          </p>
        )}
      </div>

      {/* Matrix */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Variants · {rows.length}
          </Label>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No variants. Add an option with values above to generate the matrix.
          </p>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <Table className="min-w-[880px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 min-w-[220px] bg-card">Variant</TableHead>
                  <TableHead className="min-w-[150px]">SKU</TableHead>
                  <TableHead className="w-[110px] text-right">Price</TableHead>
                  <TableHead className="w-[110px] text-right">Compare at</TableHead>
                  {showStockFields ? (
                    <>
                      <TableHead className="w-[90px] text-right">Stock</TableHead>
                      <TableHead className="w-[90px] text-right">Threshold</TableHead>
                    </>
                  ) : (
                    <TableHead className="min-w-[130px]">Stock</TableHead>
                  )}
                  <TableHead className="w-[52px]">
                    <span className="sr-only">Remove</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const stock = stockByKey?.[row.key];
                  const skuDup = duplicateSkus.has(row.key);
                  return (
                    <TableRow key={row.key}>
                      <TableCell className="sticky left-0 bg-card">
                        <Input
                          value={row.title}
                          onChange={(e) => updateRow(row.key, { title: e.target.value })}
                          aria-label="Variant title"
                          className="font-medium"
                        />
                        {Object.keys(row.optionValues).length > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {Object.entries(row.optionValues)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(" · ")}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.sku}
                          onChange={(e) => updateRow(row.key, { sku: e.target.value })}
                          aria-label="Variant SKU"
                          className={cn("font-mono text-[13px]", skuDup && "border-destructive")}
                        />
                        {skuDup && (
                          <p className="mt-1 text-xs text-destructive">Duplicate SKU</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.price}
                          onChange={(e) => updateRow(row.key, { price: e.target.value })}
                          inputMode="decimal"
                          placeholder="0.00"
                          aria-label={`Price for ${row.title}`}
                          className="text-right tabular-nums"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.compareAtPrice}
                          onChange={(e) => updateRow(row.key, { compareAtPrice: e.target.value })}
                          inputMode="decimal"
                          placeholder="—"
                          aria-label={`Compare-at price for ${row.title}`}
                          className="text-right tabular-nums"
                        />
                      </TableCell>
                      {showStockFields ? (
                        <>
                          <TableCell>
                            <Input
                              value={row.quantity}
                              onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                              inputMode="numeric"
                              aria-label={`Opening stock for ${row.title}`}
                              className="text-right tabular-nums"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={row.threshold}
                              onChange={(e) => updateRow(row.key, { threshold: e.target.value })}
                              inputMode="numeric"
                              aria-label={`Low-stock threshold for ${row.title}`}
                              className="text-right tabular-nums"
                            />
                          </TableCell>
                        </>
                      ) : (
                        <TableCell>
                          {stock ? (
                            <StockPill quantity={stock.quantity} threshold={stock.threshold} />
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRow(row.key)}
                          aria-label={`Remove variant ${row.title}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
