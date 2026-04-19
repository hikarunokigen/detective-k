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

const col = createColumnHelper<Post>();

const columns = [
  col.accessor("listing_datetime", { header: "when", size: 160 }),
  col.accessor("category", { header: "board", size: 120 }),
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
