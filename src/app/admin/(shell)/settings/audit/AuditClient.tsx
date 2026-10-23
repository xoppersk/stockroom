"use client";
/* A-03 Audit history — filters live in the URL query (search / kind /
   who / range), the "{total} entries · {shown} shown" count is
   derived from the filtered list, entries are grouped under day
   headers, and Export CSV downloads the filtered entries as a real
   CSV. Entries come from audit_log via the server page (admin-read
   RLS); a non-admin actor gets the empty set and the restricted
   state below. Ranges compute from the REAL today (ruling 8).
   Entries can't be edited or deleted. */

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/sr/Button";
import { AuditDayHeader, AuditEntryRow } from "@/components/sr/AuditEntryRow";
import type { AuditEntry, AuditSegment } from "../admin-data";

const KIND_OPTIONS = ["All kinds", "Stock", "Money", "Prices and cost", "Access"];
const RANGE_OPTIONS = ["Last 7 days", "Last 30 days", "This quarter"];

/* Range lower bounds against the real today. */
function rangeFrom(range: string): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "Last 30 days") d.setDate(d.getDate() - 29);
  else if (range === "This quarter")
    d.setTime(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).getTime());
  else d.setDate(d.getDate() - 6);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function renderSegment(segment: AuditSegment, index: number) {
  switch (segment.t) {
    case "mono":
      return (
        <span className="mono" key={index}>
          {segment.text}
        </span>
      );
    case "link":
      return (
        <a className="mono" href={segment.href} key={index}>
          {segment.text}
        </a>
      );
    case "change":
      return (
        <span className="ch" key={index}>
          <s>{segment.from}</s>→{segment.to}
        </span>
      );
    case "italic":
      return <i key={index}>{segment.text}</i>;
    default:
      return <span key={index}>{segment.text}</span>;
  }
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export default function AuditClient({
  entries,
  total,
  shown,
  actorIsAdmin,
}: {
  entries: AuditEntry[];
  total: number;
  /** Page size from listConsoleAudit(); "Load 20 more" raises it. */
  shown: number;
  actorIsAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const whoOptions = useMemo(
    () => ["Anyone", ...Array.from(new Set(entries.map((e) => e.who)))],
    [entries],
  );

  const qParam = params.get("q") ?? "";
  const kind = params.get("kind") ?? "All kinds";
  const who = params.get("who") ?? "Anyone";
  const range = params.get("range") ?? "Last 7 days";

  const [q, setQ] = useState(qParam);
  useEffect(() => {
    setQ(qParam);
  }, [qParam]);

  const setParam = (key: string, value: string, defaultValue: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === defaultValue) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const filtered = useMemo(() => {
    const needle = qParam.trim().toLowerCase();
    const from = rangeFrom(range);
    return entries.filter((entry) => {
      if (needle && !`${entry.who} ${entry.plain}`.toLowerCase().includes(needle)) {
        return false;
      }
      if (kind !== "All kinds" && entry.filterKind !== kind) return false;
      if (who !== "Anyone" && entry.who !== who) return false;
      if (entry.dateISO < from) return false;
      return true;
    });
  }, [entries, qParam, kind, who, range]);

  /* Visible window: `shown` by default; "Load 20 more" widens it.
     Changing any filter resets the window. */
  const [limit, setLimit] = useState(shown);
  useEffect(() => {
    setLimit(shown);
  }, [shown, qParam, kind, who, range]);

  const visible = useMemo(
    () => filtered.slice(0, limit),
    [filtered, limit],
  );

  const groups = useMemo(() => {
    const out: { dayLabel: string; entries: AuditEntry[] }[] = [];
    for (const entry of visible) {
      const group = out.find((g) => g.dayLabel === entry.dayLabel);
      if (group) group.entries.push(entry);
      else out.push({ dayLabel: entry.dayLabel, entries: [entry] });
    }
    return out;
  }, [visible]);

  const exportCsv = () => {
    const lines = [
      ["Day", "Time", "Who", "What changed", "Kind", "Money"].map(csvCell).join(","),
      ...filtered.map((entry) =>
        [
          entry.dayLabel,
          entry.time,
          entry.who,
          entry.plain,
          entry.kindLabel,
          entry.money ?? "",
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-history.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const restricted = entries.length === 0 && !actorIsAdmin;

  return (
    <div className="adm-settings-main adm-settings-main--tight">
      <div className="adm-pagehead">
        <div className="adm-headcol">
          <h1>Audit history</h1>
          <span className="adm-sub">
            Every change to money, stock, prices and access, signed by who made
            it. Entries can’t be edited or deleted.
          </span>
        </div>
        <Button type="button" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      <div role="search" className="adm-filters">
        <label htmlFor="audit-q" className="sr-only">
          Search history
        </label>
        <input
          id="audit-q"
          className="in"
          placeholder="Order, SKU or person"
          style={{ width: 240 }}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setParam("q", e.target.value, "");
          }}
        />
        <label htmlFor="audit-kind" className="sr-only">
          Kind
        </label>
        <select
          id="audit-kind"
          className="in"
          value={kind}
          onChange={(e) => setParam("kind", e.target.value, "All kinds")}
        >
          {KIND_OPTIONS.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <label htmlFor="audit-who" className="sr-only">
          Who
        </label>
        <select
          id="audit-who"
          className="in"
          value={who}
          onChange={(e) => setParam("who", e.target.value, "Anyone")}
        >
          {whoOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <label htmlFor="audit-range" className="sr-only">
          Range
        </label>
        <select
          id="audit-range"
          className="in"
          value={range}
          onChange={(e) => setParam("range", e.target.value, "Last 7 days")}
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <span className="adm-filters-count" role="status">
          {total} entries · {visible.length} shown
        </span>
      </div>

      <section className="panel" aria-label="Entries">
        <div className="adm-table-scroll adm-ev-scroll">
          <div role="table" aria-label="Audit entries" style={{ minWidth: 760 }}>
            <div role="row" className="ev adm-ev-head">
              <span role="columnheader">Time</span>
              <span role="columnheader">Who</span>
              <span role="columnheader">What changed</span>
              <span role="columnheader">Kind</span>
              <span role="columnheader" style={{ textAlign: "right" }}>
                Money
              </span>
            </div>
            {groups.map((group) => (
              <div role="rowgroup" key={group.dayLabel}>
                <AuditDayHeader>{group.dayLabel}</AuditDayHeader>
                {group.entries.map((entry) => (
                  <AuditEntryRow
                    key={entry.id}
                    time={entry.time}
                    who={entry.who}
                    system={entry.system}
                    kindLabel={entry.kindLabel}
                    kindTone={entry.kindTone}
                    money={entry.money}
                    moneyOut={entry.moneyKind === "out"}
                  >
                    {entry.segments.map(renderSegment)}
                  </AuditEntryRow>
                ))}
              </div>
            ))}
            {visible.length === 0 ? (
              <div className="adm-empty-note">
                {restricted
                  ? "Audit history is only visible to the Owner — your role can work in the console, but these entries are restricted."
                  : entries.length === 0
                    ? "No audit entries yet."
                    : "No entries match those filters."}
              </div>
            ) : null}
          </div>
        </div>
        <div className="pf">
          <div className="adm-pf-row">
            <span>Older entries are kept for 7 years.</span>
            {visible.length < filtered.length ? (
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setLimit((n) => n + 20);
                }}
              >
                Load 20 more
              </a>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
