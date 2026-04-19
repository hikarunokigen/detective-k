"use client";

import { useId, useState } from "react";

import CommentsTable from "./comments-table";
import styles from "./page.module.scss";
import PostsTable from "./posts-table";
import type { Comment, Post } from "ygosu_types";

type TabId = "posts" | "comments";

export default function TableTabs({
  posts,
  comments,
}: {
  posts: Post[];
  comments: Comment[];
}) {
  const [active, setActive] = useState<TabId>("posts");
  const baseId = useId();
  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "posts", label: "posts", count: posts.length },
    { id: "comments", label: "comments", count: comments.length },
  ];

  return (
    <div>
      <div role="tablist" aria-label="dataset" className={styles.tabs}>
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              id={`${baseId}-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`${baseId}-panel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
              onClick={() => setActive(t.id)}
            >
              {t.label}
              <span className={styles.tabCount}>{t.count}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-${active}`}
        aria-labelledby={`${baseId}-tab-${active}`}
      >
        {active === "posts" ? (
          <PostsTable data={posts} />
        ) : (
          <CommentsTable data={comments} />
        )}
      </div>
    </div>
  );
}
