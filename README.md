# ohpm-lint

**Lint your OHPM package against the OpenHarmony Center-repo submission rules — before `ohpm publish`.**

> **非官方工具**：本项目与 OpenHarmony / 华为无隶属关系。规则依据官方公开文档（见 [SPEC.md](SPEC.md)），如有出入**以中心仓现网口径为准**。

> 状态：**alpha**。P0 + P1 + P2 已实现（四件套 / 元数据 / 命名 / 版本 / 结构 / 安全 / 体积 / README 质量），11 组 fixtures、27 个测试全绿。
> 一句话：把中心仓的审核口径，变成一条能在本地跑的检查命令。

## 为什么需要它

官方对「能不能上架」有成文要求，但本地工具不检查这些要求：

| 官方要求（缺了会怎样） | `ohpm prepublish` 是否拦 |
|---|---|
| 必须包含 `oh-package.json5`、`README.md`、`CHANGELOG.md`、`LICENSE`，**缺失即上架失败** | ❌ 不拦 |
| `README.md` 必须含 `ohpm install <包名>` 或 `ohpm i <包名>` | ❌ 不拦 |
| `CHANGELOG.md` 必须包含当前版本号 | ❌ 不拦 |
| `description` 6–512 字符、`author` 必须带 email 或 url、开源包必须有 `repository`/`license` | ❌ 不拦 |
| 包内必须有 `package/` 目录，`.so` 必须在 `package/libs/`，禁 `.exe` | ❌ 不拦 |
| SemVer 格式、`main` 字段、3 个 SDK 字段、源码泄漏 | ✅ 拦（仅此几项） |

结论：**`prepublish` 通过 ≠ 能过审**。而审核被拒是真实且常见的（官方驳回记录里就有「`name` 与安装命令不一致」「CHANGELOG 没有记录当前版本」）。

生态侧也不乐观：抽样 Top30 热门包，README 的八个必备要素齐全的只有 **7 个**；Top60 里 **12%** 没有 `repository`、**15%** 没有 CHANGELOG、**25%** 的 `license` 不是 SPDX 写法。

## 分工（不是替代品）

| | `ohpm prepublish` | `ohpm-lint` |
|---|---|---|
| 回答的问题 | 技术上能不能打包上传 | 会不会在中心仓审核被拒、质量够不够 |
| 时机 | 打包后、上传前 | 提交审核前（更早发现） |
| 覆盖 | SemVer / `main` / SDK 字段 / 源码泄漏 | 四件套、字段完整性、命名、README/CHANGELOG 内容、结构、体积、敏感文件 |

推荐顺序：`ohpm prepublish` → `ohpm-lint` → `ohpm publish`。

## 用法

```bash
# 未发布到 npm 前，用本地构建产物
node dist/cli.js ./path/to/library
node dist/cli.js ./build/default/outputs/default/library.har --json --strict

# 发布后
npx ohpm-lint ./path/to/library
```

| 参数 | 作用 |
|---|---|
| `--json` | 输出机器可读结果，供 CI 消费 |
| `--strict` | 把 warn 视为 error |
| `--ignore OHPM-FILE-04,OHPM-DOC-01` | 临时豁免指定规则（会在输出中回显） |
| `--config .ohpmlintrc.json5` | 规则开关 / 级别覆盖 / 体积阈值（未指定时自动查找目标目录与当前目录） |
| `--quiet` | 只输出汇总 |
| `--no-color` | 关闭颜色（CI 自动） |

配置示例：

```json5
// .ohpmlintrc.json5
{
  rules: {
    'OHPM-DOC-01': 'off',                        // 关掉 README 八要素
    'OHPM-SIZE-05': { warnMb: 5, strongMb: 15 }, // 收紧体积预算
  },
  severity: { 'OHPM-META-05': 'error' },         // 把建议项升级为阻断
}
```

退出码：`0` 通过 / `1` 存在 error / `2` 工具自身失败。

## 已实现的规则（v0.1 · P0 + P1）

| 规则 | 级别 | 检查 |
|---|---|---|
| `OHPM-FILE-01` | error | 四件套齐全：`oh-package.json5`、`README`、`CHANGELOG`、`LICENSE`（闭源包免 LICENSE） |
| `OHPM-FILE-02` | error | 四件套非空 |
| `OHPM-FILE-03` | error | `CHANGELOG` 必须包含当前版本号 |
| `OHPM-FILE-04` | error | `README` 必须含 `ohpm install <name>` 且与 `name` 一致（自动剥离 `@版本`） |
| `OHPM-STRUCT-01` | error | HAR 必须包含 `package/` 目录（`oh-package.json5` 在其下） |
| `OHPM-STRUCT-02` | error | `oh-package.json5` 必须能被 JSON5 解析 |
| `OHPM-META-01` | error | `description` 6–512 字符 |
| `OHPM-META-02` | error / warn | `author` 必须是对象，`email`/`url` 至少一个（字符串形态仅 warn：平台存量包普遍如此） |
| `OHPM-META-03` | error | 开源包 `license` 必填，1–256 字符 |
| `OHPM-META-04` | error | 开源包 `repository` 必填，协议限 https/http/ftp/rtsp/mms |
| `OHPM-META-05` | info/warn | `homepage` / `bugs` 建议项 |
| `OHPM-META-06` | error / info | `main` 必须指向包内真实存在的文件；字节码 HAR 只写 `types` 时降为 info |

| `OHPM-FILE-05` | error | 包内禁止 `.exe` |
| `OHPM-FILE-06` | error / warn | 私钥/证书/签名配置/`.env`（含私钥头扫描）；`src/` 下为 warn，包根为 error |
| `OHPM-FILE-07` | warn | 声明为混淆/字节码却仍带非 `.d.*` 源码（源码 HAR 不报） |
| `OHPM-STRUCT-03` | error | `.so` 必须位于 `package/libs/`（`src/` 下的构建输入除外） |
| `OHPM-PKG-01` | info | npm 风格包（无 `oh-package.json5`，有 `package.json`）：跳过 HAR 规范检查 |
| `OHPM-NAME-01` | error | scope 语法：`@`/`/` 数量、字符集、≤36 字符 |
| `OHPM-NAME-02` | error | name 总长 1–128 |
| `OHPM-NAME-03` | error | 包名主体字符集、首尾分隔符 |
| `OHPM-NAME-04` | error | 禁止 `.har` / `.tar` / `.tgz` / `.tar.gz` 后缀 |
| `OHPM-NAME-05` | error | group / 包名不得是 ArkTS 保留字 |
| `OHPM-VER-01` | error | SemVer 格式、长度 5–128、禁止 `v` 前缀 |
| `OHPM-VER-02` | error | 主/次/修订三段均 ≤ 2147483647 |
| `OHPM-META-07` | error | `artifactType` / `types` / `obfuscated` / `addonSdk` 类型与取值 |
| `OHPM-META-08` | error | 依赖字段：不得自依赖、包名 ≤214、版本 ≤128 |
| `OHPM-META-09` | error | `oh-exports`：相对路径、后缀、文件存在性（含 `.d.ts` 回退） |
| `OHPM-META-10` | error | `sourceType` 取值；闭源包禁止 `metadata.debug: true` |
| `OHPM-META-11` | warn/info | `compatibleSdkVersion` / `compatibleSdkType`（dir 模式降为 info） |
| `OHPM-META-12` | warn | `nativeComponents` 与 `package/libs/*.so` 一致性 |
| `OHPM-SIZE-01` | error | HAR ≤ 500 MB（仅 `.har` 文件输入时校验） |
| `OHPM-SIZE-02` | error | 解压后总大小 ≤ 1500 MB |
| `OHPM-SIZE-03` | error | 文件数 ≤ 102400 |
| `OHPM-SIZE-04` | error | README ≤ 10 MB |
| `OHPM-SIZE-05` | warn | 质量预算（默认 10 MB 提示 / 30 MB 强提示，可配置），并列出体积 TOP5 |
| `OHPM-DOC-01` | warn | README 八要素（安装/权限/接口/示例/约束/目录结构/贡献/许可），缺哪项报哪项 |

v0.1 已覆盖官方 21 条中除第 19 条（组织归属/首发包人/下架冷却，平台侧）外的全部可本地校验项。完整清单见 [SPEC.md](SPEC.md) §3。

## 开发

```bash
npm install
npm test          # 构建 + fixtures 测试
npm run build     # 只构建
node dist/cli.js fixtures/pass-minimal/package --strict
```

## 批量扫描已上架的包

```bash
npm run build
node scripts/scan-ohpm.mjs --out scan.json @ohos/lottie @ohos/axios @ohos/mpchart
```

脚本会从 OHPM registry 下载每个包的 latest `.har`，逐包跑 lint 并汇总（用于生态体检或回归对比）。

## 规则从哪来

每条规则都锚定官方条目，不做「社区口味」：

- [三方库发布的必要文件](https://ohpm.openharmony.cn/#/cn/help/publishrequirefile)
- [OHPM 发包规则汇总](https://ohpm.openharmony.cn/#/cn/help/publishrules)
- [三方库名称指南](https://ohpm.openharmony.cn/#/cn/help/guidename)

定级原则：官方写明「导致上架失败」的 → `error`；官方仅警告、或本就属质量建议的 → `warn`。工具不应当比审核更严。

## 组织版别名

npm 组织的命名空间是 `@quizzyjoy/*`，而无 scope 的 `ohpm-lint` 归发布者个人账号所有、不能转移给组织。因此额外提供了一个零逻辑别名：

```bash
npx @quizzyjoy/ohpm-lint ./path/to/library   # 与 npx ohpm-lint 完全等价
```

源码在 [`packages/scoped`](packages/scoped)，只有一行转发，版本跟随主包。

## 贡献

Issue / PR 都欢迎。新增规则请同时提供：规则依据（官方链接 + 原文摘录）、正反 fixture、以及「误报会伤到谁」的说明。

## 许可证

[Apache-2.0](LICENSE)
