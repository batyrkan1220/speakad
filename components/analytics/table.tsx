"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Empty } from "./charts";

export interface Col<T> { key: string; label: string; render?: (r: T) => ReactNode; value?: (r: T) => number | string; num?: boolean; width?: string }

/** Sortable table: click a header to sort, again to flip. Numbers right-aligned with tabular figures. */
export function SortTable<T extends { id?: string }>({ rows, cols, initial, onRow, max = 200, rowKey }: {
  rows: T[]; cols: Col<T>[]; initial?: { key: string; dir: 1 | -1 }; onRow?: (r: T) => void; max?: number; rowKey?: (r: T, i: number) => string;
}) {
  const [sort, setSort] = useState(initial || { key: "", dir: -1 as 1 | -1 });
  const sorted = useMemo(() => {
    const c = cols.find((x) => x.key === sort.key);
    if (!c) return rows;
    const v = c.value || ((r: T) => (r as any)[c.key]);
    return [...rows].sort((a, b) => {
      const x = v(a), y = v(b);
      if (x == null) return 1; if (y == null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [rows, cols, sort]);
  if (!rows.length) return <Empty />;
  return (
    <div className="an-table-wrap">
      <table className="an-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={c.num ? "num" : ""} style={{ width: c.width }} aria-sort={sort.key === c.key ? (sort.dir > 0 ? "ascending" : "descending") : "none"}
                onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (-s.dir as 1 | -1) : c.num ? -1 : 1 }))}>
                {c.label}<span className="an-sort">{sort.key === c.key ? (sort.dir > 0 ? "▲" : "▼") : ""}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, max).map((r, i) => (
            <tr key={rowKey ? rowKey(r, i) : r.id || i} onClick={onRow ? () => onRow(r) : undefined} className={onRow ? "click" : ""}>
              {cols.map((c) => <td key={c.key} className={c.num ? "num" : ""}>{c.render ? c.render(r) : String((r as any)[c.key] ?? "—")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
