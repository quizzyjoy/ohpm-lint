import {
  CHANGELOG_NAMES,
  LICENSE_NAMES,
  README_NAMES,
  displayPath,
  findTopLevel,
  isBlank,
  readText
} from '../core/files.js';
import type { FileInfo, Issue, LintContext } from '../core/types.js';

export function fileRules(ctx: LintContext): Issue[] {
  const issues: Issue[] = [];
  const { packageDir, kind, sourceType } = ctx;
  const where = kind === 'har' ? 'package/' : '包根目录';

  const manifestFile = findTopLevel(ctx.files, ['oh-package.json5']);
  const readme = findTopLevel(ctx.files, README_NAMES);
  const changelog = findTopLevel(ctx.files, CHANGELOG_NAMES);
  const license = findTopLevel(ctx.files, LICENSE_NAMES);

  // ---- FILE-01 四件套 ----
  if (manifestFile === undefined) {
    issues.push({
      rule: 'OHPM-FILE-01',
      severity: 'error',
      title: '缺少 oh-package.json5',
      message: `${where} 下找不到 oh-package.json5`,
      path: displayPath(ctx, 'oh-package.json5'),
      hint: '在库模块根目录保留构建生成的 oh-package.json5，并补全 name/version/description/author/main/license。',
      officialRef: '§1'
    });
  }

  if (readme === undefined) {
    issues.push({
      rule: 'OHPM-FILE-01',
      severity: 'error',
      title: '缺少 README',
      message: `${where} 下找不到 README（readme.md / readme-cn.md / readme-en.md …）`,
      path: displayPath(ctx, 'README.md'),
      hint: '在库模块根目录新建 README.md，写明安装、权限、接口、示例、约束与限制。',
      officialRef: '§1'
    });
  }

  if (changelog === undefined) {
    issues.push({
      rule: 'OHPM-FILE-01',
      severity: 'error',
      title: '缺少 CHANGELOG',
      message: `${where} 下找不到 CHANGELOG（changelog.md / changelog-cn.md …）`,
      path: displayPath(ctx, 'CHANGELOG.md'),
      hint: '新建 CHANGELOG.md，并在其中记录当前版本号。',
      officialRef: '§1'
    });
  }

  if (sourceType === 'open' && license === undefined) {
    issues.push({
      rule: 'OHPM-FILE-01',
      severity: 'error',
      title: '缺少 LICENSE（开源包）',
      message: `${where} 下找不到 LICENSE 文件；开源包必须提供，闭源包（sourceType: "closed"）可省略`,
      path: displayPath(ctx, 'LICENSE'),
      hint: '放置与 oh-package.json5 中 license 字段一致的许可证全文（如 Apache-2.0）。',
      officialRef: '§1'
    });
  }

  // ---- FILE-02 非空 ----
  const nonEmptyTargets: Array<{ file: FileInfo | undefined; label: string; rel: string }> = [
    { file: manifestFile, label: 'oh-package.json5', rel: 'oh-package.json5' },
    { file: readme, label: 'README', rel: 'README.md' },
    { file: changelog, label: 'CHANGELOG', rel: 'CHANGELOG.md' },
    ...(sourceType === 'open' ? [{ file: license, label: 'LICENSE', rel: 'LICENSE' }] : [])
  ];

  for (const target of nonEmptyTargets) {
    if (target.file === undefined) continue;
    if (!isBlank(readText(packageDir, target.file.path))) continue;
    issues.push({
      rule: 'OHPM-FILE-02',
      severity: 'error',
      title: `${target.label} 内容为空`,
      message: `${target.file.path} 是空文件（或只有空白字符）`,
      path: displayPath(ctx, target.file.path),
      hint: '补齐内容；空文件同样会导致上架失败。',
      officialRef: '§1'
    });
  }

  // ---- FILE-03 CHANGELOG 必须包含当前版本号 ----
  const version = typeof ctx.manifest?.['version'] === 'string' ? (ctx.manifest['version'] as string) : null;
  if (changelog !== undefined && version !== null) {
    const text = readText(packageDir, changelog.path);
    if (!isBlank(text) && !containsVersionToken(text, version)) {
      issues.push({
        rule: 'OHPM-FILE-03',
        severity: 'error',
        title: 'CHANGELOG 未记录当前版本号',
        message: `在 ${changelog.path} 中找不到当前版本号 "${version}"`,
        path: displayPath(ctx, changelog.path),
        hint: `新增一条版本记录，例如 "## [${version}] - YYYY-MM-DD"。`,
        officialRef: '§7.1'
      });
    }
  }

  // ---- FILE-04 README 必须含与 name 一致的安装命令 ----
  const name = typeof ctx.manifest?.['name'] === 'string' ? (ctx.manifest['name'] as string) : null;
  if (readme !== undefined && name !== null) {
    const text = readText(packageDir, readme.path);
    if (isBlank(text)) return issues; // 空 README 已由 FILE-02 报出，不重复
    const commands = extractInstallTargets(text);
    if (commands.length === 0) {
      issues.push({
        rule: 'OHPM-FILE-04',
        severity: 'error',
        title: 'README 缺少安装命令',
        message: `${readme.path} 中没有 "ohpm install" / "ohpm i" 命令`,
        path: displayPath(ctx, readme.path),
        hint: `补一行安装命令：ohpm install ${name}`,
        officialRef: '§7.1'
      });
    } else if (!commands.includes(name)) {
      issues.push({
        rule: 'OHPM-FILE-04',
        severity: 'error',
        title: 'README 安装命令与包名不一致',
        message: `README 中的安装目标是 ${commands.map((c) => `"${c}"`).join(', ')}，而 oh-package.json5 的 name 是 "${name}"`,
        path: displayPath(ctx, readme.path),
        hint: `把安装命令改为：ohpm install ${name}`,
        officialRef: '§7.1'
      });
    }
  }

  // ---- FILE-05 禁止 .exe ----
  const exeFiles = ctx.files.filter((file) => /\.exe$/i.test(file.path));
  if (exeFiles.length > 0) {
    issues.push(
      issue(ctx, 'OHPM-FILE-05', 'error', '包内含 .exe 文件', `发现 ${exeFiles.length} 个：${listFew(exeFiles.map((f) => f.path))}`, '把可执行文件移出包，中心仓禁止分发 .exe。', '§7.1')
    );
  }

  // ---- FILE-06 敏感文件 ----
  const sensitive = ctx.files.filter((file) => isSensitivePath(file.path) || containsPrivateKey(packageDir, file));
  if (sensitive.length > 0) {
    issues.push(
      issue(
        ctx,
        'OHPM-FILE-06',
        'error',
        '包内含敏感文件',
        `发现 ${sensitive.length} 个：${listFew(sensitive.map((f) => f.path))}`,
        '发布前删除私钥/证书/签名配置（官方要求检查私钥、密码、个人信息），并从 .gitignore 源头上排除。',
        '§8'
      )
    );
  }

  // ---- FILE-07 源码泄漏（警告，仅 har：dir 模式下 src/ 是正常的开发源码）----
  if (ctx.kind === 'har') {
    const leaked = ctx.files.filter((file) => /^src\//i.test(file.path) && /\.(ets|ts)$/i.test(file.path));
    if (leaked.length > 0) {
      issues.push(
        issue(
          ctx,
          'OHPM-FILE-07',
          'warn',
          '包内含 src 源码',
          `发现 ${leaked.length} 个源文件：${listFew(leaked.map((f) => f.path))}`,
          '用 release 构建（开启混淆/字节码）再打包，避免源码泄漏（ohpm prepublish 也会给出同样警告）。',
          '建议项'
        )
      );
    }
  }

  return issues;
}

const SENSITIVE_EXT = /\.(p7b|cer|p12|pfx|pem|key|jks|keystore)$/i;
const TEXT_EXT = /\.(txt|md|json|json5|pem|key|ets|ts|cfg|conf|properties)$/i;
const PRIVATE_KEY_HEADER = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const MAX_SCAN_BYTES = 512 * 1024;

function isSensitivePath(relative: string): boolean {
  const base = relative.split('/').pop() ?? relative;
  const lower = base.toLowerCase();
  if (SENSITIVE_EXT.test(base)) return true;
  if (lower === '.env' || lower.startsWith('.env.')) return true;
  if (lower.includes('signingconfigs')) return true;
  return false;
}

function containsPrivateKey(packageDir: string, file: FileInfo): boolean {
  if (file.size === 0 || file.size > MAX_SCAN_BYTES) return false;
  const base = file.path.split('/').pop() ?? file.path;
  const hasTextExt = TEXT_EXT.test(base) || !base.includes('.');
  if (!hasTextExt) return false;
  return PRIVATE_KEY_HEADER.test(readText(packageDir, file.path));
}

function listFew(paths: string[]): string {
  const head = paths.slice(0, 5).join(', ');
  return paths.length > 5 ? `${head} 等` : head;
}

function issue(
  ctx: LintContext,
  rule: string,
  severity: Issue['severity'],
  title: string,
  message: string,
  hint: string,
  officialRef: string
): Issue {
  return { rule, severity, title, message, hint, officialRef };
}

/** Version token match with digit/dot boundaries, so 0.1.0 does not match 0.1.01. */
function containsVersionToken(text: string, version: string): boolean {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`).test(text);
}

/** Extract package names from `ohpm install <name>` / `ohpm i <name>`. */
export function extractInstallTargets(text: string): string[] {
  const out: string[] = [];
  const re = /ohpm\s+(?:install|i)\s+([^\s"'`<>()[\],;]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = (match[1] ?? '').replace(/[.,;:]+$/, '');
    if (raw !== '' && !raw.startsWith('-')) out.push(raw);
  }
  return out;
}
