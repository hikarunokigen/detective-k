import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./report.module.scss";

const REPORT_PATH = join(process.cwd(), "..", "analytics", "publish_v2.md");

export default async function Report() {
  const md = await readFile(REPORT_PATH, "utf8");

  // Split at H2 boundaries so the title + first section (개요) always show.
  // Sections 2+ fold behind a toggle.
  const sections = md.split(/(?=^## )/m);
  const preview = sections.slice(0, 2).join("");
  const rest = sections.slice(2).join("");

  return (
    <section className={styles.report}>
      <div className={styles.body}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview}</ReactMarkdown>
      </div>
      {rest && (
        <details className={styles.fold}>
          <summary className={styles.summary}>
            <span className={styles.summaryLabel} aria-hidden="true" />
          </summary>
          <div className={styles.body}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{rest}</ReactMarkdown>
          </div>
        </details>
      )}
    </section>
  );
}
