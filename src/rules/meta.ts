import fs from 'node:fs';
import path from 'node:path';
import { charLength, displayPath } from '../core/files.js';
import type { Issue, LintContext } from '../core/types.js';

const REPOSITORY_PROTOCOLS = new Set(['https:', 'http:', 'ftp:', 'rtsp:', 'mms:']);

export function metaRules(ctx: LintContext): Issue[] {
  const manifest = ctx.manifest;
  if (manifest === null) return [];

  const issues: Issue[] = [];
  const manifestPath = 'oh-package.json5';

  // ---- META-01 description 6–512 ----
  const description = asString(manifest['description']);
  if (description === undefined) {
    issues.push(issue(ctx, 'OHPM-META-01', 'error', 'description 缺失或类型错误', 'oh-package.json5 的 description 必须是字符串', '补一句 6–512 字符的包描述，写清用途。', '§5.1', manifestPath));
  } else {
    const len = charLength(description);
    if (len < 6 || len > 512) {
      issues.push(issue(ctx, 'OHPM-META-01', 'error', 'description 长度不合规', `当前 ${len} 字符，官方要求 6–512 字符`, '补足或精简描述到 6–512 字符之间。', '§5.1', manifestPath));
    }
  }

  // ---- META-02 author ----
  const author = manifest['author'];
  if (author === undefined) {
    issues.push(issue(ctx, 'OHPM-META-02', 'error', 'author 缺失', 'oh-package.json5 必须包含 author 对象', '补 {"name": "...", "email": "..."}（email 与 url 至少一个）。', '§5.4', manifestPath));
  } else if (typeof author === 'string') {
    // 官方文档要求对象，但实测中心仓存量包普遍写字符串（14 个热门包中 8 个），平台并未拦截
    issues.push(
      issue(
        ctx,
        'OHPM-META-02',
        'warn',
        'author 写成了字符串',
        `当前 "${author}"；官方文档要求 author 为对象`,
        '建议改为 {"name": "…", "email": "…"}，便于中心仓展示与联系（平台目前接受字符串）。',
        '§5.4',
        manifestPath
      )
    );
  } else if (typeof author !== 'object' || author === null || Array.isArray(author)) {
    issues.push(issue(ctx, 'OHPM-META-02', 'error', 'author 类型错误', 'author 必须是 JSON 对象，不能是字符串', '改为 {"name":"...","email":"..."} 形式。', '§5.4', manifestPath));
  } else {
    const obj = author as Record<string, unknown>;
    const name = asString(obj['name']);
    if (name === undefined || name.trim() === '' || charLength(name) > 128) {
      issues.push(issue(ctx, 'OHPM-META-02', 'error', 'author.name 不合规', 'author.name 必填，长度 1–128', '填写作者或组织名称。', '§5.4', manifestPath));
    }

    const email = asString(obj['email']);
    const url = asString(obj['url']);

    if (email === undefined && url === undefined) {
      issues.push(issue(ctx, 'OHPM-META-02', 'error', 'author 缺少联系方式', 'author.email 与 author.url 至少填写一个', '补 email 或 url。', '§5.4', manifestPath));
    }
    if (email !== undefined) {
      if (charLength(email) > 64 || !email.includes('@')) {
        issues.push(issue(ctx, 'OHPM-META-02', 'error', 'author.email 不合规', `当前 "${email}"，要求邮箱格式且不超过 64 字符`, '改成合法邮箱地址。', '§5.4', manifestPath));
      }
    }
    if (url !== undefined && (!isValidUrl(url) || charLength(url) > 1024)) {
      issues.push(issue(ctx, 'OHPM-META-02', 'error', 'author.url 不合规', `当前 "${url}"，要求 URL 格式且不超过 1024 字符`, '改成以 https:// 开头的地址。', '§5.4', manifestPath));
    }
  }

  // ---- META-03 license ----
  const license = asString(manifest['license']);
  if (ctx.sourceType === 'open') {
    if (license === undefined || license.trim() === '') {
      issues.push(issue(ctx, 'OHPM-META-03', 'error', 'license 缺失', '开源包必须填写 license 字段', '填写 SPDX 标识，例如 "Apache-2.0"，并提供对应 LICENSE 文件。', '§5.1', manifestPath));
    } else if (charLength(license) > 256) {
      issues.push(issue(ctx, 'OHPM-META-03', 'error', 'license 过长', `当前 ${charLength(license)} 字符，上限 256`, '使用 SPDX 短标识，例如 "Apache-2.0"。', '§5.1', manifestPath));
    }
  } else if (license !== undefined && (license.trim() === '' || charLength(license) > 256)) {
    issues.push(issue(ctx, 'OHPM-META-03', 'error', 'license 不合规', 'license 不能为空，且不超过 256 字符', '删除该字段或填写合法标识。', '§5.1', manifestPath));
  }

  // ---- META-04 repository（开源包必填）----
  if (ctx.sourceType === 'open') {
    const repository = asString(manifest['repository']);
    if (repository === undefined || repository.trim() === '') {
      issues.push(issue(ctx, 'OHPM-META-04', 'error', 'repository 缺失', '开源包必须填写 repository（中心仓详情页会展示跳转）', '填写源码仓库地址，例如 https://github.com/<org>/<repo>。', '§5.5', manifestPath));
    } else if (charLength(repository) > 1024) {
      issues.push(issue(ctx, 'OHPM-META-04', 'error', 'repository 过长', `当前 ${charLength(repository)} 字符，上限 1024`, '使用仓库主页 URL。', '§5.5', manifestPath));
    } else {
      const parsed = parseUrl(repository);
      if (parsed === null) {
        issues.push(issue(ctx, 'OHPM-META-04', 'error', 'repository 不是合法 URL', `当前 "${repository}"`, '改成 https:// 开头的仓库地址。', '§5.5', manifestPath));
      } else if (!REPOSITORY_PROTOCOLS.has(parsed.protocol)) {
        issues.push(issue(ctx, 'OHPM-META-04', 'error', 'repository 协议不被允许', `当前协议 ${parsed.protocol}，允许 https/http/ftp/rtsp/mms`, '改为 https://。', '§5.5', manifestPath));
      }
    }
  }

  // ---- META-05 homepage / bugs（建议项）----
  const homepage = asString(manifest['homepage']);
  const bugs = asString(manifest['bugs']);
  if (homepage === undefined && bugs === undefined) {
    issues.push(issue(ctx, 'OHPM-META-05', 'info', '未填写 homepage / bugs', '这两个字段不是官方硬性要求，但会提升详情页可用性', '建议补 homepage 与 bugs（指向同一仓库）。', '建议项', manifestPath));
  } else {
    for (const [field, value] of [['homepage', homepage], ['bugs', bugs]] as const) {
      if (value !== undefined && !isValidUrl(value)) {
        issues.push(issue(ctx, 'OHPM-META-05', 'warn', `${field} 不是合法 URL`, `当前 "${value}"`, '改成以 https:// 开头的地址。', '建议项', manifestPath));
      }
    }
  }

  // ---- META-06 main 存在性 ----
  const main = asString(manifest['main']);
  if (main === undefined || main.trim() === '') {
    issues.push(issue(ctx, 'OHPM-META-06', 'error', 'main 缺失', 'oh-package.json5 必须填写 main（入口文件）', '填写相对模块根的入口文件，例如 "Index.ets"。', '§5.1', manifestPath));
  } else {
    const normalized = main.replace(/^\.\//, '');
    const abs = path.resolve(ctx.packageDir, normalized);
    const inside = abs === ctx.packageDir || abs.startsWith(ctx.packageDir + path.sep);

    if (!inside) {
      issues.push(issue(ctx, 'OHPM-META-06', 'error', 'main 指向包外路径', `"${main}" 解析后不在包目录内`, '改为包内相对路径。', '§5.1', manifestPath));
    } else if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      issues.push(issue(ctx, 'OHPM-META-06', 'error', 'main 指向的文件不存在', `"${main}" 在包内找不到`, `创建该入口文件，或把 main 改成实际存在的文件（如 Index.ets）。`, '§5.1', manifestPath));
    }
  }

  // ---- META-07 artifactType / types / obfuscated / addonSdk ----
  const artifactType = asString(manifest['artifactType']);
  const artifactTypes = new Set(['original', 'obfuscation', 'bytecode']);

  if (artifactType !== undefined && !artifactTypes.has(artifactType)) {
    issues.push(issue(ctx, 'OHPM-META-07', 'error', 'artifactType 取值非法', `当前 "${artifactType}"，可选 original / obfuscation / bytecode`, '改为合法枚举值。', '§5.3', manifestPath));
  }

  const requiresTypes = artifactType === 'obfuscation' || artifactType === 'bytecode';
  const types = asString(manifest['types']);
  if (requiresTypes) {
    if (types === undefined || types.trim() === '') {
      issues.push(issue(ctx, 'OHPM-META-07', 'error', '混淆/字节码包缺少 types', `artifactType 为 "${artifactType}" 时必须提供 types`, '填写 .d.ts 或 .d.ets 声明文件路径。', '§5.3', manifestPath));
    } else if (!/\.d\.(ts|ets)$/.test(types)) {
      issues.push(issue(ctx, 'OHPM-META-07', 'error', 'types 后缀不合规', `当前 "${types}"，必须以 .d.ts 或 .d.ets 结尾`, '把 types 指向声明文件。', '§5.3', manifestPath));
    }
  }

  if ('obfuscated' in manifest && typeof manifest['obfuscated'] !== 'boolean') {
    issues.push(issue(ctx, 'OHPM-META-07', 'error', 'obfuscated 类型错误', 'obfuscated 必须是布尔值（字符串 "true" 不视为已混淆）', '改为 true / false，不要加引号。', '§5.3', manifestPath));
  }
  if ('addonSdk' in manifest && typeof manifest['addonSdk'] !== 'boolean') {
    issues.push(issue(ctx, 'OHPM-META-07', 'error', 'addonSdk 类型错误', 'addonSdk 必须是布尔值', '改为 true / false。', '§5.3', manifestPath));
  }

  // ---- META-08 依赖字段 ----
  const packageName = asString(manifest['name']);
  for (const field of ['dependencies', 'devDependencies', 'dynamicDependencies']) {
    if (!(field in manifest)) continue;
    const value = manifest[field];
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      issues.push(issue(ctx, 'OHPM-META-08', 'error', `${field} 类型错误`, `${field} 必须是对象（{ 包名: 版本号 }）`, '改成键值对形式。', '§5.2', manifestPath));
      continue;
    }

    for (const [depName, depVersion] of Object.entries(value as Record<string, unknown>)) {
      if (packageName !== undefined && depName === packageName) {
        issues.push(issue(ctx, 'OHPM-META-08', 'error', '依赖了自身', `${field} 中出现包名自身 "${depName}"`, '删除该依赖。', '§5.2', manifestPath));
        continue;
      }
      if (charLength(depName) > 214) {
        issues.push(issue(ctx, 'OHPM-META-08', 'error', '依赖包名过长', `${field} 中的 "${depName.slice(0, 40)}…" 超过 214 字符`, '检查是否写错了包名。', '§5.2', manifestPath));
      }
      if (typeof depVersion !== 'string' || charLength(depVersion) > 128) {
        issues.push(issue(ctx, 'OHPM-META-08', 'error', '依赖版本不合法', `${field} 中 "${depName}" 的版本必须是 ≤128 字符的字符串`, '填写版本范围，如 ^1.0.0。', '§5.2', manifestPath));
      }
    }
  }

  // ---- META-09 oh-exports ----
  if ('oh-exports' in manifest) {
    const exportsField = manifest['oh-exports'];
    if (!Array.isArray(exportsField)) {
      issues.push(issue(ctx, 'OHPM-META-09', 'error', 'oh-exports 类型错误', 'oh-exports 必须是字符串数组', '改为 ["src/Foo.ets"] 形式。', '§5.2', manifestPath));
    } else {
      for (const entry of exportsField) {
        if (typeof entry !== 'string') {
          issues.push(issue(ctx, 'OHPM-META-09', 'error', 'oh-exports 条目类型错误', 'oh-exports 的每一项都必须是字符串', '删除非字符串项。', '§5.2', manifestPath));
          continue;
        }
        if (entry.startsWith('/') || /^[A-Za-z]:[\\/]/.test(entry)) {
          issues.push(issue(ctx, 'OHPM-META-09', 'error', 'oh-exports 使用了绝对路径', `"${entry}"`, '改成包内相对路径。', '§5.2', manifestPath));
          continue;
        }
        if (entry.split(/[/\\]/).includes('..')) {
          issues.push(issue(ctx, 'OHPM-META-09', 'error', 'oh-exports 路径越界', `"${entry}" 含 ..`, '去掉 ..，使用包内相对路径。', '§5.2', manifestPath));
          continue;
        }
        if (!/\.(ts|ets|js)$/.test(entry)) {
          issues.push(issue(ctx, 'OHPM-META-09', 'error', 'oh-exports 后缀不合规', `"${entry}" 必须以 .ts / .ets / .js 结尾`, '指向源码入口文件。', '§5.2', manifestPath));
          continue;
        }
        if (!exportTargetExists(ctx, entry)) {
          issues.push(issue(ctx, 'OHPM-META-09', 'error', 'oh-exports 声明的文件不存在', `"${entry}" 在包内找不到`, '创建该文件，或修正路径。', '§7.1', manifestPath));
        }
      }
    }
  }

  // ---- META-10 sourceType / metadata.debug ----
  const sourceTypeRaw = manifest['sourceType'];
  if (sourceTypeRaw !== undefined && sourceTypeRaw !== 'open' && sourceTypeRaw !== 'closed') {
    issues.push(issue(ctx, 'OHPM-META-10', 'error', 'sourceType 取值非法', `当前 ${JSON.stringify(sourceTypeRaw)}，可选 "open" / "closed"`, '改为合法枚举值。', '§5.7', manifestPath));
  }

  const metadata = manifest['metadata'];
  if (metadata !== undefined && (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata))) {
    issues.push(issue(ctx, 'OHPM-META-10', 'error', 'metadata 类型错误', 'metadata 必须是对象', '改为 { "debug": false } 形式。', '§5.7', manifestPath));
  } else if (ctx.sourceType === 'closed' && metadata !== null && typeof metadata === 'object') {
    const debug = (metadata as Record<string, unknown>)['debug'];
    if (debug === true) {
      issues.push(issue(ctx, 'OHPM-META-10', 'error', '闭源包禁止 debug 模式', '闭源包（sourceType: "closed"）不允许 metadata.debug === true', '改为 false 或删除该字段后重新打包。', '§5.7', manifestPath));
    }
  }

  // ---- META-11 兼容 SDK 字段 ----
  // hvigor 打包时会自动写入；实测既有字符串（"12"）也有数字（12）两种形态，均视为已填写。
  // dir 模式下缺失属正常，降为 info 避免开发期噪音。
  const sdkFieldSeverity: Issue['severity'] = ctx.kind === 'har' ? 'warn' : 'info';
  for (const field of ['compatibleSdkVersion', 'compatibleSdkType']) {
    const raw = manifest[field];
    const value = typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : undefined;
    if (value === undefined || value.trim() === '') {
      issues.push(issue(ctx, 'OHPM-META-11', sdkFieldSeverity, `${field} 未填写`, '建议声明最低兼容的 SDK 版本/类型（hvigor 通常会自动写入）', '补 compatibleSdkVersion 与 compatibleSdkType。', '§5.3', manifestPath));
    } else if (charLength(value) > 64) {
      issues.push(issue(ctx, 'OHPM-META-11', 'warn', `${field} 过长`, `当前 ${charLength(value)} 字符，建议 ≤64`, '填写简短的版本号，如 "12"。', '§5.3', manifestPath));
    }
  }

  // ---- META-12 nativeComponents 与 libs/**.so 一致性（仅 har）----
  // .so 通常按 ABI 分子目录存放（libs/arm64-v8a/libx.so），而声明里只写文件名，因此按 basename 比对。
  if (ctx.kind === 'har') {
    const soBasenames = new Map<string, string>();
    for (const file of ctx.files) {
      if (!/^libs\/.*\.so$/i.test(file.path)) continue;
      const base = (file.path.split('/').pop() ?? file.path).toLowerCase();
      soBasenames.set(base, file.path);
    }

    const declared = manifest['nativeComponents'];

    if (declared !== undefined && !Array.isArray(declared)) {
      issues.push(issue(ctx, 'OHPM-META-12', 'warn', 'nativeComponents 类型错误', 'nativeComponents 应为数组', '改为 [{ "name": "libxxx.so" }]。', '§5.6', manifestPath));
    } else {
      const list = Array.isArray(declared) ? declared : [];
      const declaredNames = new Set<string>();

      for (const item of list) {
        const entry = item !== null && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const name = asString(entry['name']);
        if (name === undefined || name.trim() === '') {
          issues.push(issue(ctx, 'OHPM-META-12', 'warn', 'nativeComponents 条目缺少 name', '声明项没有 name 字段', '填写 .so 文件名。', '§5.6', manifestPath));
          continue;
        }
        const base = (name.split('/').pop() ?? name).toLowerCase();
        declaredNames.add(base);
        if (!soBasenames.has(base)) {
          issues.push(issue(ctx, 'OHPM-META-12', 'warn', 'nativeComponents 声明的 .so 不存在', `声明的 "${name}" 在 package/libs/ 下找不到同名文件`, '修正文件名或删除该声明。', '§5.6', manifestPath));
        }
      }

      const undeclared = [...soBasenames.keys()].filter((base) => !declaredNames.has(base));
      if (undeclared.length > 0) {
        issues.push(
          issue(ctx, 'OHPM-META-12', 'warn', '存在未声明的 .so', `package/libs/ 下的 ${undeclared.slice(0, 5).join(', ')} 未在 nativeComponents 中声明`, '补 nativeComponents 声明。', '§5.6', manifestPath)
        );
      }
    }
  }

  return issues;
}

function exportTargetExists(ctx: LintContext, entry: string): boolean {
  const normalize = (p: string): string => p.replace(/^\.\//, '');
  const candidates = [normalize(entry)];

  if (entry.endsWith('.ets')) candidates.push(`${normalize(entry).slice(0, -4)}.d.ets`);
  if (entry.endsWith('.ts')) candidates.push(`${normalize(entry).slice(0, -3)}.d.ts`);

  return candidates.some((candidate) => {
    const abs = path.resolve(ctx.packageDir, candidate);
    const inside = abs === ctx.packageDir || abs.startsWith(ctx.packageDir + path.sep);
    return inside && fs.existsSync(abs) && fs.statSync(abs).isFile();
  });
}

function issue(
  ctx: LintContext,
  rule: string,
  severity: Issue['severity'],
  title: string,
  message: string,
  hint: string,
  officialRef: string,
  relPath: string
): Issue {
  return { rule, severity, title, message, hint, officialRef, path: displayPath(ctx, relPath) };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isValidUrl(value: string): boolean {
  return parseUrl(value) !== null;
}
