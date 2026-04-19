import { loadComments, loadPosts } from "./_lib/data";
import styles from "./page.module.scss";
import TableTabs from "./table-tabs";

export default async function Page() {
  const [posts, comments] = await Promise.all([loadPosts(), loadComments()]);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>detective_k</h1>
          <span className={styles.userBadge}>
            <span className={styles.userBadgeLabel}>user</span>
            <span className={styles.userBadgeId}>684134</span>
            <span className={styles.userBadgeSep}>·</span>
            <span className={styles.userBadgeNick}>늑애</span>
          </span>
        </div>
        <p className={styles.subtitle}>
          A fact-checking dossier on activity scraped from ygosu. (AI-analyzed
          summary goes here.)
        </p>
      </header>

      <div className={styles.tablesWrap}>
        <TableTabs posts={posts} comments={comments} />
      </div>
    </main>
  );
}
