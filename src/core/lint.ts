import path from 'node:path';
import { walkFiles } from '../core/files.js';
import { loadManifest } from '../core/manifest.js';
import { resolveTarget } from '../core/target.js';
import type { Issue, LintContext } from '../core/types.js';
import { docRules } from '../rules/doc.js';
import { fileRules } from '../rules/file.js';
import { metaRules } from '../rules/meta.js';
import { nameRules } from '../rules/name.js';
import { DEFAULT_SIZE_OPTIONS, sizeRules, type SizeOptions } from '../rules/size.js';
import { structRules } from '../rules/struct.js';
import { versionRules } from '../rules/version.js';

export interface SkippedRule {
  rule: string;
  reason: string;
}

export interface LintResult {
  context: LintContext;
  issues: Issue[];
  skipped: SkippedRule[];
}

export interface LintOptions {
  sizeOptions?: SizeOptions;
}

const NETWORK_SKIPPED: SkippedRule[] = [
  { rule: 'OHPM-NAME-07', reason: 'requires-network: 包名去分隔符唯一性只能在中心仓确认' },
  { rule: 'OHPM-VER-03', reason: 'requires-network: 版本是否已发布过只能在中心仓确认' }
];

/** 目录模式下列出的构建/依赖目录不算包内容 */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  'oh_modules',
  'build',
  'dist',
  'coverage',
  '.git',
  '.hvigor',
  '.idea',
  '.vscode'
]);

export function lint(input: string, options: LintOptions = {}): LintResult {
  const target = resolveTarget(input);

  try {
    const packageDir = target.kind === 'har' ? path.join(target.root, 'package') : target.root;
    const manifest = loadManifest(packageDir);

    const walked = walkFiles(packageDir);
    const files = target.kind === 'dir' ? walked.filter((file) => !isExcluded(file.path)) : walked;

    const sourceType: 'open' | 'closed' = manifest.parsed?.['sourceType'] === 'closed' ? 'closed' : 'open';

    const context: LintContext = {
      kind: target.kind,
      targetPath: target.inputPath,
      root: target.root,
      packageDir,
      files,
      manifest: manifest.parsed,
      manifestRaw: manifest.raw,
      manifestError: manifest.error,
      manifestPath: 'oh-package.json5',
      sourceType,
      archiveBytes: target.archiveBytes
    };

    const issues = [
      ...structRules(context),
      ...nameRules(context),
      ...versionRules(context),
      ...fileRules(context),
      ...metaRules(context),
      ...sizeRules(context, options.sizeOptions ?? DEFAULT_SIZE_OPTIONS),
      ...docRules(context)
    ].sort(compareIssues);

    const skipped = [...NETWORK_SKIPPED];
    if (context.archiveBytes === null) {
      skipped.push({
        rule: 'OHPM-SIZE-01',
        reason: 'compressed-size-unavailable: 仅 .har 文件输入时才能校验压缩包体积（目录输入按解压后体积估算）'
      });
    }

    return { context, issues, skipped };
  } finally {
    target.cleanup();
  }
}

function isExcluded(relative: string): boolean {
  const top = relative.split('/')[0]?.toLowerCase() ?? '';
  return EXCLUDED_DIRS.has(top);
}

const SEVERITY_ORDER: Record<Issue['severity'], number> = { error: 0, warn: 1, info: 2 };

export function compareIssues(a: Issue, b: Issue): number {
  const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (bySeverity !== 0) return bySeverity;
  return a.rule.localeCompare(b.rule);
}
