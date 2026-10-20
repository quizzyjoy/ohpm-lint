import { charLength, displayPath } from '../core/files.js';
import type { Issue, LintContext } from '../core/types.js';

/** https://semver.org — full SemVer 2.0.0 grammar. */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const MAX_SEGMENT = 2147483647;

export function versionRules(ctx: LintContext): Issue[] {
  const manifest = ctx.manifest;
  if (manifest === null) return [];

  const path = displayPath(ctx, 'oh-package.json5');
  const version = typeof manifest['version'] === 'string' ? manifest['version'] : '';

  if (version.trim() === '') {
    return [make('OHPM-VER-01', 'version 缺失', 'oh-package.json5 必须包含 version 字段', '填写 SemVer 版本号，例如 0.1.0。', path)];
  }

  if (/^v/i.test(version)) {
    return [
      make('OHPM-VER-01', 'version 不允许 v 前缀', `当前 "${version}"`, '去掉 v 前缀：写成 1.0.0，而不是 v1.0.0。', path)
    ];
  }

  const length = charLength(version);
  if (length < 5 || length > 128) {
    return [
      make('OHPM-VER-01', 'version 长度不合规', `当前 ${length} 字符，官方要求 5–128`, '使用 主.次.修订 三段式版本号。', path)
    ];
  }

  const match = SEMVER.exec(version);
  if (match === null) {
    return [
      make(
        'OHPM-VER-01',
        'version 不是合法 SemVer',
        `当前 "${version}"，应形如 1.0.0 / 1.0.0-beta.1 / 1.2.3+build.1`,
        '按 SemVer 补齐主/次/修订三段，不要有多余段（如 1.0.0.0）。',
        path
      )
    ];
  }

  const issues: Issue[] = [];
  const segments: Array<[string, string]> = [
    ['major', match[1] ?? ''],
    ['minor', match[2] ?? ''],
    ['patch', match[3] ?? '']
  ];

  for (const [label, value] of segments) {
    if (Number(value) > MAX_SEGMENT) {
      issues.push(
        make(
          'OHPM-VER-02',
          `version 的 ${label} 段超限`,
          `"${value}" 超过上限 ${MAX_SEGMENT}`,
          '不要把时间戳/长流水号放进主三段；可用预发布标签，如 1.0.0-20261021。',
          path
        )
      );
    }
  }

  return issues;
}

function make(rule: string, title: string, message: string, hint: string, path: string): Issue {
  return { rule, severity: 'error', title, message, hint, officialRef: '§3', path };
}
