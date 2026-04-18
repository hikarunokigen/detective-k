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
import type { Comment } from "./_lib/types";

const ROW_HEIGHT = 30;
const EXPAND_PADDING = 60;

const col = createColumnHelper<Comment>();

function postLink(c: Comment): string {
  return `https://ygosu.com/board/${c.post_id ? `_/${c.post_id}` : ""}${
    c.comment_id ? `/?comment_idx=${c.comment_id}` : ""
  }`;
}

const columns = [
  col.accessor("comment_datetime", { header: "when", size: 160 }),
  col.accessor("post_title", {
    header: "post",
    size: 380,
    cell: (c) => (
      <span className={styles.titleCell}>
        <a href={postLink(c.row.original)} target="_blank" rel="noreferrer">
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
  col.accessor("vote_good", { header: "+", size: 50, meta: { numeric: true } }),
  col.accessor("vote_bad", { header: "−", size: 50, meta: { numeric: true } }),
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

  const totalWidth = table.getTotalSize() + 24;

  return (
    <>
      <div className={styles.summary}>comments · {data.length} rows</div>
      <div className={styles.wrap} ref={parentRef}>
        <div className={styles.header} style={{ width: totalWidth }}>
          <div className={styles.expandBtn} aria-hidden />
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
                <div className={styles.rowInner}>
                  <button
                    className={styles.expandBtn}
                    onClick={() =>
                      setExpanded((p) => ({ ...p, [row.id]: !p[row.id] }))
                    }
                    aria-label={isOpen ? "collapse" : "expand"}
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
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
