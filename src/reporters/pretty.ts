import type { LintResult } from '../core/lint.js';
import type { Issue } from '../core/types.js';

export interface PrettyOptions {
  color: boolean;
  quiet: boolean;
  ignored: string[];
  version: string;
}

const ANSI = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  gray: '\u001b[90m',
  green: '\u001b[32m'
};

export function prettyReport(result: LintResult, options: PrettyOptions): string {
  const out: string[] = [];
  const paint = makePainter(options.color);
  const { context, issues } = result;

  const name = typeof context.manifest?.['name'] === 'string' ? (context.manifest['name'] as string) : '(unknown)';
  const version = typeof context.manifest?.['version'] === 'string' ? (context.manifest['version'] as string) : '(unknown)';

  out.push(
    `${paint.bold(`ohpm-lint ${options.version}`)} ${paint.gray('·')} ${context.targetPath} ${paint.gray(`(${context.kind})`)}`
  );

  if (!options.quiet) {
    out.push(`${paint.gray(`${name}@${version}`)} ${paint.gray('·')} ${context.sourceType}`);
    out.push('');
  }

  for (const item of issues) {
    out.push(renderIssue(item, paint));
  }

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warns = issues.filter((i) => i.severity === 'warn').length;
  const infos = issues.filter((i) => i.severity === 'info').length;

  out.push('');
  if (issues.length === 0) {
    out.push(`${paint.green('✓')} 未发现问题`);
  } else {
    const summary = [
      errors > 0 ? paint.red(`${errors} error`) : `${errors} error`,
      warns > 0 ? paint.yellow(`${warns} warn`) : `${warns} warn`,
      `${infos} info`
    ].join(' · ');
    out.push(`${summary}${errors > 0 ? paint.gray('  — 阻断项需先修复再 publish') : ''}`);
  }

  if (options.ignored.length > 0) {
    out.push(paint.gray(`已忽略：${options.ignored.join(', ')}`));
  }

  if (result.skipped.length > 0 && !options.quiet) {
    out.push(paint.gray(`未覆盖（需联网/平台侧）：${result.skipped.map((s) => s.rule).join(', ')}`));
  }

  return out.join('\n');
}

function renderIssue(item: Issue, paint: ReturnType<typeof makePainter>): string {
  const tag =
    item.severity === 'error' ? paint.red('ERROR') : item.severity === 'warn' ? paint.yellow('WARN ') : paint.blue('INFO ');

  const lines: string[] = [];
  lines.push(`${tag} ${paint.bold(item.rule)}  ${item.title}`);
  if (item.path !== undefined) lines.push(`      ${paint.gray(item.path)}`);
  lines.push(`      ${item.message}`);
  lines.push(`      ${paint.green('→')} ${item.hint} ${paint.gray(`(${item.officialRef})`)}`);
  return lines.join('\n');
}

function makePainter(enabled: boolean): Record<keyof typeof ANSI, (text: string) => string> {
  const keys = Object.keys(ANSI) as Array<keyof typeof ANSI>;
  const painter = {} as Record<keyof typeof ANSI, (text: string) => string>;
  for (const key of keys) {
    painter[key] = enabled ? (text: string) => `${ANSI[key]}${text}${ANSI.reset}` : (text: string) => text;
  }
  return painter;
}
