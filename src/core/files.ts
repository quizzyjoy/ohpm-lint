import fs from 'node:fs';
import path from 'node:path';
import type { FileInfo, LintContext } from './types.js';

/** Walk a directory into a flat list of files (POSIX-relative paths). */
export function walkFiles(dir: string): FileInfo[] {
  const out: FileInfo[] = [];

  const walk = (abs: string, rel: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const childAbs = path.join(abs, entry.name);
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(childAbs, childRel);
      } else if (entry.isFile()) {
        let size = 0;
        try {
          size = fs.statSync(childAbs).size;
        } catch {
          size = 0;
        }
        out.push({ path: childRel, size });
      }
    }
  };

  walk(dir, '');
  return out;
}

/** Find a top-level file by case-insensitive name candidates. */
export function findTopLevel(files: FileInfo[], candidates: string[]): FileInfo | undefined {
  const wanted = new Set(candidates.map((c) => c.toLowerCase()));
  return files.find((f) => !f.path.includes('/') && wanted.has(f.path.toLowerCase()));
}

/** Read a file from the package dir as UTF-8 (empty string on failure). */
export function readText(packageDir: string, relative: string): string {
  try {
    return fs.readFileSync(path.join(packageDir, relative), 'utf8');
  } catch {
    return '';
  }
}

/** Path shown in reports: har targets are prefixed with `package/`. */
export function displayPath(ctx: LintContext, relative: string): string {
  return ctx.kind === 'har' ? `package/${relative}` : relative;
}

export function isBlank(text: string): boolean {
  return text.trim() === '';
}

/** Character count (not UTF-16 code units). */
export function charLength(value: string): number {
  return Array.from(value).length;
}

export const README_NAMES = [
  'readme.md',
  'readme-cn.md',
  'readme_cn.md',
  'readme-zh.md',
  'readme_zh.md',
  'readme-en.md',
  'readme_en.md'
];

export const CHANGELOG_NAMES = [
  'changelog.md',
  'changelog-cn.md',
  'changelog_cn.md',
  'changelog-zh.md',
  'changelog_zh.md',
  'changelog-en.md',
  'changelog_en.md'
];

export const LICENSE_NAMES = ['license', 'license.md', 'license.txt'];
