import { loadComments, loadPosts } from "./_lib/data";
import CommentsTable from "./comments-table";
import styles from "./page.module.scss";
import PostsTable from "./posts-table";

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

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>posts</h2>
        <PostsTable data={posts} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>comments</h2>
        <CommentsTable data={comments} />
      </section>
    </main>
  );
}
