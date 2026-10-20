import fs from 'node:fs';
import path from 'node:path';
import { walkFiles } from '../core/files.js';
import { loadManifest, type ManifestLoad } from '../core/manifest.js';
import { resolveTarget } from '../core/target.js';
import type { Distribution, Issue, LintContext } from '../core/types.js';
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
    const distribution = detectDistribution(target.kind === 'har' ? target.root : packageDir, packageDir, manifest);

    const walked = walkFiles(packageDir);
    const files = target.kind === 'dir' ? walked.filter((file) => !isExcluded(file.path)) : walked;

    const sourceType: 'open' | 'closed' = manifest.parsed?.['sourceType'] === 'closed' ? 'closed' : 'open';

    const context: LintContext = {
      kind: target.kind,
      distribution,
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

    if (distribution === 'npm') {
      return {
        context,
        issues: [npmStyleIssue(context)],
        skipped: [...NETWORK_SKIPPED, { rule: 'OHPM-*', reason: 'npm-style-package: 无 oh-package.json5，OHPM HAR 规范不适用' }]
      };
    }

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

/** npm 风格包：没有 oh-package.json5，但存在 package.json（中心仓允许这类包直发）。 */
function detectDistribution(root: string, packageDir: string, manifest: ManifestLoad): Distribution {
  if (manifest.exists) return 'ohpm';
  if (fs.existsSync(path.join(packageDir, 'package.json'))) return 'npm';

  // 少数 npm 包的 tarball 根目录不是 package/，而是一个同名目录
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'package.json'))) return 'npm';
    }
  } catch {
    /* ignore */
  }

  return 'ohpm';
}

function npmStyleIssue(ctx: LintContext): Issue {
  return {
    rule: 'OHPM-PKG-01',
    severity: 'info',
    title: 'npm 风格包（未使用 oh-package.json5）',
    message: '包内没有 oh-package.json5，但存在 package.json；OHPM 中心仓允许这类包直接发布，因此跳过 HAR 规范检查',
    hint: '若要享受 OHPM 规范（四件套、README 安装命令、体积与 native 校验），请用 hvigor 打成 HAR 再发布。',
    officialRef: '说明'
  };
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
