"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";

import styles from "./tables.module.scss";
import type { Comment } from "ygosu_types";

const ROW_HEIGHT = 30;
const EXPAND_PADDING = 60;

// "2026-04-19 00:34:58" → "26-04-19 00:34"
function formatWhen(v: string): string {
  const m = v.match(/^\d{2}(\d{2}-\d{2}-\d{2}) (\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : v;
}

const col = createColumnHelper<Comment>();

function postLink(c: Comment): string {
  if (!c.board_id || !c.post_id) return "";
  const base = `https://ygosu.com/board/${c.board_id}/${c.post_id}`;
  return c.comment_id ? `${base}/?comment_idx=${c.comment_id}` : base;
}

const columns = [
  col.accessor("comment_id", { header: "id", size: 90, meta: { numeric: true } }),
  col.accessor("post_title", {
    header: "post",
    size: 300,
    cell: (c) => (
      <span className={styles.titleCell}>
        <a
          href={postLink(c.row.original)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {c.getValue() || "(no title)"}
        </a>
      </span>
    ),
  }),
  col.accessor("comment_body", {
    header: "body",
    size: 480,
    cell: (c) => {
      const v = (c.getValue() as string) ?? "";
      const oneLine = v.replace(/\s+/g, " ").trim();
      return oneLine.length > 140 ? oneLine.slice(0, 140) + "…" : oneLine;
    },
  }),
  col.accessor("comment_datetime", {
    header: "when",
    size: 130,
    cell: (c) => formatWhen((c.getValue() as string) ?? ""),
  }),
  col.accessor((row) => row.vote_good - row.vote_bad, {
    id: "vote",
    header: "vote",
    size: 90,
    meta: { numeric: true },
    cell: (c) => `+${c.row.original.vote_good}/−${c.row.original.vote_bad}`,
  }),
];

export default function CommentsTable({ data }: { data: Comment[] }) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "comment_datetime", desc: true },
  ]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row, i) => row.comment_id || `${row.post_id}-${i}`,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const parentRef = useRef<HTMLDivElement>(null);

  const estimateSize = useMemo(
    () => (i: number) => {
      const row = rows[i];
      if (!row) return ROW_HEIGHT;
      if (!expanded[row.id]) return ROW_HEIGHT;
      const body = row.original.comment_body ?? "";
      const bodyLines = body.split("\n").length + Math.floor(body.length / 80);
      return ROW_HEIGHT + EXPAND_PADDING + bodyLines * 18;
    },
    [rows, expanded],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 6,
  });

  const totalWidth = table.getTotalSize();

  return (
    <>
      <div className={styles.summary}>comments · {data.length} rows</div>
      <div className={styles.wrap} ref={parentRef}>
        <div className={styles.header} style={{ width: totalWidth }}>
          {table.getHeaderGroups().map((hg) =>
            hg.headers.map((h) => (
              <div
                key={h.id}
                className={styles.headerCell}
                style={{ width: h.getSize() }}
                onClick={h.column.getToggleSortingHandler()}
              >
                {flexRender(h.column.columnDef.header, h.getContext())}
                <span className={styles.sortIndicator}>
                  {{ asc: " ↑", desc: " ↓" }[h.column.getIsSorted() as string] ?? ""}
                </span>
              </div>
            )),
          )}
        </div>

        <div
          className={styles.rowsLayer}
          style={{ height: virtualizer.getTotalSize(), width: totalWidth }}
        >
          {virtualizer.getVirtualItems().map((vr) => {
            const row = rows[vr.index]!;
            const isOpen = !!expanded[row.id];
            return (
              <div
                key={row.id}
                className={styles.row}
                style={{ transform: `translateY(${vr.start}px)` }}
                ref={virtualizer.measureElement}
                data-index={vr.index}
              >
                <div
                  className={styles.rowInner}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onClick={() =>
                    setExpanded((p) => ({ ...p, [row.id]: !p[row.id] }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpanded((p) => ({ ...p, [row.id]: !p[row.id] }));
                    }
                  }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const numeric = (cell.column.columnDef.meta as { numeric?: boolean } | undefined)
                      ?.numeric;
                    return (
                      <div
                        key={cell.id}
                        className={`${styles.cell} ${numeric ? styles.cellNum : ""}`}
                        style={{ width: cell.column.getSize() }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    );
                  })}
                </div>
                {isOpen ? (
                  <div className={styles.body}>
                    {row.original.comment_body || "(empty body)"}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
