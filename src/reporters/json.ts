import type { LintResult } from '../core/lint.js';

export function jsonReport(result: LintResult, version: string, ignored: string[]): string {
  const { context, issues, skipped } = result;

  const payload = {
    tool: 'ohpm-lint',
    version,
    target: { path: context.targetPath, kind: context.kind },
    package: {
      name: (context.manifest?.['name'] as string | undefined) ?? null,
      version: (context.manifest?.['version'] as string | undefined) ?? null,
      sourceType: context.sourceType
    },
    summary: {
      error: issues.filter((i) => i.severity === 'error').length,
      warn: issues.filter((i) => i.severity === 'warn').length,
      info: issues.filter((i) => i.severity === 'info').length
    },
    issues,
    skipped,
    ignored
  };

  return JSON.stringify(payload, null, 2);
}
