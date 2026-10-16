"use client";
/* A-03 Audit history — filters live in the URL query (search / kind /
   who / range), the "{total} entries · {shown} shown" count is
   derived from the filtered list, entries are grouped under day
   headers, and Export CSV downloads the filtered entries as a real
   CSV. Live entries recorded in the client store's audit slice are
   prepended under Today. Entries can't be edited or deleted. */

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/sr/Button";
import { AuditDayHeader, AuditEntryRow } from "@/components/sr/AuditEntryRow";
import { useShopState } from "@/lib/store";
import {
  normalizeLiveAuditEntry,
  type AuditEntry,
  type AuditSegment,
} from "../admin-data";

const WHO_OPTIONS = [
  "Anyone",
  "Sheku Koroma",
  "Kofi Mensah",
  "Rosa Delgado",
  "Ben Hart",
  "System",
];
const KIND_OPTIONS = ["All kinds", "Stock", "Money", "Prices and cost", "Access"];
const RANGE_OPTIONS = ["Last 7 days", "Last 30 days", "This quarter"];

/* Range lower bounds against the shop's today (Tue, Oct 6, 2026). */
const RANGE_FROM: Record<string, string> = {
  "Last 7 days": "2026-09-30",
  "Last 30 days": "2026-09-06",
  "This quarter": "2026-10-01",
};

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
}: {
  entries: AuditEntry[];
  total: number;
  /** Page size from listAudit() — 9 as drawn; "Load 20 more" raises it. */
  shown: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const shop = useShopState() as unknown as {
    audit?: unknown[];
    auditLog?: unknown[];
  };

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

  const liveEntries = useMemo(() => {
    /* The store's audit slice starts as a copy of listAudit() and gains
       AU-LOCAL entries as the session records changes — anything whose
       id is not in the fixture list is live and gets prepended. */
    const log = Array.isArray(shop?.audit)
      ? shop.audit
      : Array.isArray(shop?.auditLog)
        ? shop.auditLog
        : [];
    const fixtureIds = new Set(entries.map((e) => e.id));
    return log
      .map((entry, i) => normalizeLiveAuditEntry(entry, i))
      .filter((entry) => !fixtureIds.has(entry.id));
  }, [shop?.audit, shop?.auditLog, entries]);

  const allEntries = useMemo(
    () => [...liveEntries, ...entries],
    [liveEntries, entries],
  );
  const totalCount = total + liveEntries.length;

  const filtered = useMemo(() => {
    const needle = qParam.trim().toLowerCase();
    const from = RANGE_FROM[range] ?? "2026-09-30";
    return allEntries.filter((entry) => {
      if (needle && !`${entry.who} ${entry.plain}`.toLowerCase().includes(needle)) {
        return false;
      }
      if (kind !== "All kinds" && entry.filterKind !== kind) return false;
      if (who !== "Anyone" && entry.who !== who) return false;
      if (entry.dateISO < from) return false;
      return true;
    });
  }, [allEntries, qParam, kind, who, range]);

  /* Visible window: the drawn 9 by default (the screen's entries, in
     screen order, per normalizeAudit); "Load 20 more" widens it.
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
          {WHO_OPTIONS.map((option) => (
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
          {totalCount} entries · {visible.length} shown
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
              <div className="adm-empty-note">No entries match those filters.</div>
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
