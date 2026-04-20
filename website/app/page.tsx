import { loadComments, loadPosts } from "./_lib/data";
import styles from "./page.module.scss";
import Report from "./report";
import TableTabs from "./table-tabs";

export default async function Page() {
  const [posts, comments] = await Promise.all([loadPosts(), loadComments()]);

  return (
    <main className={styles.main}>
      <Report />

      <div className={styles.tablesWrap}>
        <div className={styles.userBadge}>YGosu User id: 684134 | 늑애</div>
        <TableTabs posts={posts} comments={comments} />
      </div>
    </main>
  );
}
