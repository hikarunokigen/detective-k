import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Comment, Post } from "./types";

const DATA_ROOT = join(process.cwd(), "..", "data");

async function loadDir<T>(subdir: string): Promise<T[]> {
  const full = join(DATA_ROOT, subdir);
  let files: string[];
  try {
    files = (await readdir(full)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const chunks = await Promise.all(
    files.map(async (f) => {
      const text = await readFile(join(full, f), "utf8");
      return JSON.parse(text) as T[];
    }),
  );
  return chunks.flat();
}

export async function loadPosts(): Promise<Post[]> {
  return loadDir<Post>("yg_post");
}

export async function loadComments(): Promise<Comment[]> {
  return loadDir<Comment>("yg_comment");
}
