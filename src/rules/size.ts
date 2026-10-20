import { displayPath, findTopLevel, README_NAMES } from '../core/files.js';
import type { Issue, LintContext } from '../core/types.js';

const MB = 1024 * 1024;

export interface SizeOptions {
  warnMb: number;
  strongMb: number;
}

export const DEFAULT_SIZE_OPTIONS: SizeOptions = { warnMb: 10, strongMb: 30 };

export function sizeRules(ctx: LintContext, options: SizeOptions): Issue[] {
  const issues: Issue[] = [];
  const totalBytes = ctx.files.reduce((sum, file) => sum + file.size, 0);
  const fileCount = ctx.files.length;

  // ---- SIZE-01 压缩包 500 MB（仅当能拿到 .har 实际大小时）----
  if (ctx.archiveBytes !== null && ctx.archiveBytes > 500 * MB) {
    issues.push({
      rule: 'OHPM-SIZE-01',
      severity: 'error',
      title: 'HAR 超过 500 MB',
      message: `当前 ${formatMb(ctx.archiveBytes)} MB，官方上限 500 MB`,
      hint: '裁剪资源/拆分多包；大资源建议放云端按需下载。',
      officialRef: '§4'
    });
  }

  // ---- SIZE-02 解压后 1500 MB ----
  if (totalBytes > 1500 * MB) {
    issues.push({
      rule: 'OHPM-SIZE-02',
      severity: 'error',
      title: '解压后体积超过 1500 MB',
      message: `当前 ${formatMb(totalBytes)} MB，官方上限 1500 MB`,
      hint: '移除构建中间产物与重复资源（见体积 TOP5）。',
      officialRef: '§4'
    });
  }

  // ---- SIZE-03 文件数 102400 ----
  if (fileCount > 102400) {
    issues.push({
      rule: 'OHPM-SIZE-03',
      severity: 'error',
      title: '文件数超过 102400',
      message: `当前 ${fileCount} 个文件，官方上限 102400`,
      hint: '检查是否误打包了依赖/构建目录。',
      officialRef: '§4'
    });
  }

  // ---- SIZE-04 README 10 MB ----
  const readme = findTopLevel(ctx.files, README_NAMES);
  if (readme !== undefined && readme.size > 10 * MB) {
    issues.push({
      rule: 'OHPM-SIZE-04',
      severity: 'error',
      title: 'README 超过 10 MB',
      message: `${readme.path} 当前 ${formatMb(readme.size)} MB，官方上限 10 MB`,
      hint: '图片压缩后外链，或把长文档拆到仓库 docs/。',
      officialRef: '§4',
      path: displayPath(ctx, readme.path)
    });
  }

  // ---- SIZE-05 质量预算 ----
  const budgetBytes = ctx.archiveBytes ?? totalBytes;
  if (budgetBytes > options.warnMb * MB) {
    const strong = budgetBytes > options.strongMb * MB;
    const top = [...ctx.files]
      .sort((a, b) => b.size - a.size)
      .slice(0, 5)
      .map((file) => `${file.path} (${formatKb(file.size)})`)
      .join(', ');

    issues.push({
      rule: 'OHPM-SIZE-05',
      severity: 'warn',
      title: strong ? '包体偏大（强烈建议优化）' : '包体偏大',
      message: `${ctx.archiveBytes === null ? '目录' : 'HAR'} 体积 ${formatMb(budgetBytes)} MB，超过质量预算 ${options.warnMb} MB${
        strong ? `（>${options.strongMb} MB）` : ''
      }；体积 TOP5：${top}`,
      hint: '压缩参考图/去掉未使用的 rawfile、开启 release 构建；体积直接影响安装与首屏。',
      officialRef: '质量建议'
    });
  }

  return issues;
}

function formatMb(bytes: number): string {
  return (bytes / MB).toFixed(1);
}

function formatKb(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
