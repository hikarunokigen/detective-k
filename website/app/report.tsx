import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./report.module.scss";

const REPORT_PATH = join(process.cwd(), "..", "analytics", "publish_v2.md");

export default async function Report() {
  const md = await readFile(REPORT_PATH, "utf8");
  const match = md.match(/^#\s+(.+?)\n([\s\S]*)$/);
  const title = match?.[1]?.trim() ?? "분석 보고서";
  const body = match?.[2] ?? md;

  return (
    <details className={styles.report}>
      <summary className={styles.summary}>
        <span className={styles.summaryTitle}>{title}</span>
        <span className={styles.summaryHint} aria-hidden="true" />
      </summary>
      <div className={styles.body}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </div>
    </details>
  );
}
