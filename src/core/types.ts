export type Severity = 'error' | 'warn' | 'info';

export interface Issue {
  /** Stable id, e.g. OHPM-FILE-03 */
  rule: string;
  severity: Severity;
  title: string;
  message: string;
  /** Path relative to the package root, e.g. package/CHANGELOG.md */
  path?: string;
  hint: string;
  /** Official rule reference, e.g. §7.1 */
  officialRef: string;
}

export interface FileInfo {
  /** Path relative to the package directory, POSIX separators */
  path: string;
  size: number;
}

export type TargetKind = 'har' | 'dir';

export interface LintContext {
  kind: TargetKind;
  targetPath: string;
  /** har: unpacked har root; dir: module root */
  root: string;
  /** har: <root>/package ; dir: <root> */
  packageDir: string;
  files: FileInfo[];
  manifest: Record<string, unknown> | null;
  manifestRaw: string | null;
  manifestError: string | null;
  /** Path shown in reports, e.g. package/oh-package.json5 */
  manifestPath: string;
  sourceType: 'open' | 'closed';
  /** Size of the .har on disk; null when the target is a directory */
  archiveBytes: number | null;
}
