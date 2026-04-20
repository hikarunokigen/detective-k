import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./report.module.scss";

const REPORT_PATH = join(process.cwd(), "..", "analytics", "publish_v1.md");

export default async function Report() {
  const md = await readFile(REPORT_PATH, "utf8");
  return (
    <article className={styles.report}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
    </article>
  );
}
