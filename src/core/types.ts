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

/**
 * ohpm: 含 oh-package.json5 的规范 HAR
 * npm : 无 oh-package.json5、但有 package.json 的 npm 风格包（中心仓允许直发）
 */
export type Distribution = 'ohpm' | 'npm';

export interface LintContext {
  kind: TargetKind;
  distribution: Distribution;
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
