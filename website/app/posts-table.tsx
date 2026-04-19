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
import type { Post, PostComment } from "ygosu_types";

const ROW_HEIGHT = 30;
const EXPAND_PADDING = 80;

// "2026-04-14 21:49:21" → "26-04-14 21:49"
function formatWhen(v: string): string {
  const m = v.match(/^\d{2}(\d{2}-\d{2}-\d{2}) (\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : v;
}

const col = createColumnHelper<Post>();

const columns = [
  col.accessor("post_id", { header: "id", size: 90, meta: { numeric: true } }),
  col.accessor("title", {
    header: "title",
    size: 480,
    cell: (c) => (
      <span className={styles.titleCell}>
        <a
          href={c.row.original.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {c.getValue()}
        </a>
      </span>
    ),
  }),
  col.accessor("nickname", { header: "nickname", size: 120 }),
  col.accessor("listing_datetime", {
    header: "when",
    size: 130,
    cell: (c) => formatWhen((c.getValue() as string) ?? ""),
  }),
  col.accessor("category", { header: "board", size: 120 }),
  col.accessor("views", { header: "views", size: 70, meta: { numeric: true } }),
  col.accessor("good_vote", { header: "+", size: 50, meta: { numeric: true } }),
  col.accessor("bad_vote", { header: "−", size: 50, meta: { numeric: true } }),
  col.accessor("comment_count", { header: "c", size: 50, meta: { numeric: true } }),
];

export default function PostsTable({ data }: { data: Post[] }) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "listing_datetime", desc: true },
  ]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => row.post_id,
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
      const body = row.original.post_body ?? "";
      const commentLines = row.original.comments?.length ?? 0;
      const bodyLines = body.split("\n").length + Math.floor(body.length / 80);
      return ROW_HEIGHT + EXPAND_PADDING + bodyLines * 18 + commentLines * 26;
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
      <div className={styles.summary}>posts · {data.length} rows</div>
      <div className={styles.wrap} ref={parentRef}>
        <div className={styles.header} style={{ minWidth: totalWidth }}>
          {table.getHeaderGroups().map((hg) =>
            hg.headers.map((h) => {
              const elastic = h.column.id === "title";
              return (
                <div
                  key={h.id}
                  className={styles.headerCell}
                  style={
                    elastic
                      ? { flex: 1, minWidth: h.getSize() }
                      : { width: h.getSize() }
                  }
                  onClick={h.column.getToggleSortingHandler()}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  <span className={styles.sortIndicator}>
                    {{ asc: " ↑", desc: " ↓" }[h.column.getIsSorted() as string] ?? ""}
                  </span>
                </div>
              );
            }),
          )}
        </div>

        <div
          className={styles.rowsLayer}
          style={{ height: virtualizer.getTotalSize(), minWidth: totalWidth }}
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
                    const elastic = cell.column.id === "title";
                    return (
                      <div
                        key={cell.id}
                        className={`${styles.cell} ${numeric ? styles.cellNum : ""}`}
                        style={
                          elastic
                            ? { flex: 1, minWidth: cell.column.getSize() }
                            : { width: cell.column.getSize() }
                        }
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    );
                  })}
                </div>
                {isOpen ? <ExpandedRow post={row.original} /> : null}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function ExpandedRow({ post }: { post: Post }) {
  return (
    <>
      <div className={styles.body}>{post.post_body || "(empty body)"}</div>
      {post.comments.length > 0 ? (
        <div className={styles.subTable}>
          {post.comments.map((c: PostComment, i: number) => (
            <div key={`${post.post_id}-${i}`} className={styles.subRow}>
              <span className={styles.subMeta}>
                {c.nickname || "(no nick)"} · +{c.vote_good}/−{c.vote_bad}
              </span>
              {c.comment_body}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
