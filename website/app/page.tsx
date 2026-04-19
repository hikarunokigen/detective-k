import { loadComments, loadPosts } from "./_lib/data";
import styles from "./page.module.scss";
import TableTabs from "./table-tabs";

export default async function Page() {
  const [posts, comments] = await Promise.all([loadPosts(), loadComments()]);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>detective_k</h1>
        <p className={styles.subtitle}>
          A fact-checking dossier on activity scraped from ygosu. (AI-analyzed
          summary goes here.)
        </p>
      </header>

      <TableTabs posts={posts} comments={comments} />
    </main>
  );
}
