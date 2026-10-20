# SPEC v0.1 · `ohpm-lint`

> **目的**：把中心仓的成文发包要求，变成一条能在本地跑的检查命令，让"提交审核"这一步不再靠人肉读文档。
> **规则来源**：官方帮助中心（抓取于 **2026-10-21**）
> - 三方库发布的必要文件 <https://ohpm.openharmony.cn/#/cn/help/publishrequirefile>
> - OHPM 发包规则汇总 <https://ohpm.openharmony.cn/#/cn/help/publishrules>
> - 三方库名称指南 <https://ohpm.openharmony.cn/#/cn/help/guidename>
> - 创建及发布三方库 <https://ohpm.openharmony.cn/#/cn/help/createandpublish>
>
> **定级原则**：官方写明「会导致上架失败」→ `error`；官方仅打印警告 → `warn`；官方用「建议」措辞或属质量建议 → `warn`/`info`。**工具不比审核更严。**
> **本文件是实现的唯一依据**：代码里每条规则必须带 `officialRef`（形如 `§7.1`），review 时逐条比对。

---

## 0. 范围

**做**：校验一个 HAR 包或库模块目录，能否满足中心仓的上架要求 + 几条质量建议。

**不做（v0.1 明确排除）**：
- ❌ ArkTS 代码风格/缺陷（交给 DevEco **CodeLinter**）
- ❌ 替代 `ohpm prepublish`（两者互补，见 README）
- ❌ 自动修复（`--fix` 留到 v0.3，且只做安全修改：补字段、改大小写）
- ❌ 任何联网校验（包名唯一性、版本重复、组织权限 → 见 §9）

---

## 1. 输入模型

| 模式 | 触发 | 期望结构 | 说明 |
|---|---|---|---|
| `dir` | 传入目录且不含 `package/` | 模块根：`oh-package.json5` + 四件套 + `Index.ets` | 开发期用；`STRUCT-*` 除 JSON5 外跳过 |
| `har` | 传入 `.har` / `.tgz`，或目录下含 `package/` | 压缩包根下有 `package/` | 发布前用；全部规则生效 |

解包：`.har` 视为 gzip tar；解到临时目录（`os.tmpdir()`），进程结束清理；**不写入被测目录**。

> 注意：`*.har` 已在 `.gitignore` 中 → **fixtures 不提交二进制**，测试时由 `fixtures/_build.mjs` 现场打包（§6）。

---

## 2. CLI 契约

```bash
ohpm-lint <path>                    # 目录或 .har
  --json                            # 机器可读
  --strict                          # warn → error（退出码随之变 1）
  --ignore OHPM-NAME-04,OHPM-DOC-01 # 豁免（同时写进输出，不静默）
  --config .ohpmlintrc.json5        # 规则开关/阈值
  --no-color
  --quiet                           # 只输出 summary
```

**退出码**：`0` 无 error；`1` 存在 error（`--strict` 时含 warn）；`2` 工具自身失败（解包失败、JSON5 无法解析等——**解析失败本身也是一条 error，但同时以 2 退出**）。

**JSON 输出**（`--json`，稳定字段，供 CI 消费）：

```json
{
  "tool": "ohpm-lint",
  "version": "0.1.0",
  "target": { "path": "lib.har", "kind": "har" },
  "package": { "name": "@quizzyjoy/shaderport", "version": "0.1.0", "sourceType": "open" },
  "summary": { "error": 2, "warn": 5, "info": 0 },
  "issues": [
    {
      "rule": "OHPM-FILE-03",
      "severity": "error",
      "title": "CHANGELOG 未包含当前版本号",
      "message": "CHANGELOG.md 中找不到 \"0.1.0\"",
      "path": "package/CHANGELOG.md",
      "hint": "在版本标题中补上 0.1.0，例如 \"## [0.1.0] - 2026-10-21\"",
      "officialRef": "§7.1"
    }
  ],
  "skipped": [{ "rule": "OHPM-NAME-07", "reason": "requires-network" }],
  "ignored": ["OHPM-DOC-01"]
}
```

**配置**（`--config <file>`，或自动发现目标目录 / 当前目录下的 `.ohpmlintrc.json5`）：

```json5
{
  "rules": { "OHPM-DOC-01": "off", "OHPM-SIZE-05": { "warnMb": 10, "strongMb": 30 } },
  "severity": { "OHPM-META-05": "error" }
}
```

- `rules[<id>]`：`"off"` / `"error"` / `"warn"` / `"info"` / 选项对象（目前仅 `OHPM-SIZE-05` 支持 `warnMb`、`strongMb`）。
- `severity[<id>]`：只改级别，不关闭规则。
- 被 `off` 的规则会出现在输出的 `ignored` 里，不静默。

---

## 3. 规则清单

### 3.1 名称 `NAME`

| ID | 级别 | 适用 | 检查 | 官方依据 |
|---|---|---|---|---|
| `OHPM-NAME-01` | error | both | 至多一个 `@`、至多一个 `/`；scope 以小写字母开头、仅 `a-z0-9-_`、不以 `-_` 结尾、≤36 字符 | §2.2 |
| `OHPM-NAME-02` | error | both | 总长 1–128 | §2.1 |
| `OHPM-NAME-03` | error | both | 包名主体（`/` 后）小写字母/数字/`-`/`_`/`.`；首尾不得为 `-_.`；主体不得含大写 | §2.1 |
| `OHPM-NAME-04` | error | both | 不得以 `.har` / `.tar` / `.tgz` / `.tar.gz` 结尾 | §2.1 |
| `OHPM-NAME-05` | error | both | group / packagename 不得是 ArkTS 保留字（内置词表，见 `src/rules/arkts-keywords.ts`） | §2.2 |
| `OHPM-NAME-07` | error | both | 去 `-_.` 后与已存在包重名 | §2.1 — **联网，v0.1 skip** |

### 3.2 版本 `VER`

| ID | 级别 | 适用 | 检查 | 官方依据 |
|---|---|---|---|---|
| `OHPM-VER-01` | error | both | 合法 SemVer（允许预发布/构建元数据）；长度 5–128；**禁止 `v` 前缀** | §3 |
| `OHPM-VER-02` | error | both | 主/次/修订三段均 ≤ `2147483647` | §3 |
| `OHPM-VER-03` | error | both | 版本未在中心仓发布过 | §3 — **联网，v0.1 skip** |

### 3.3 元数据 `META`

| ID | 级别 | 适用 | 检查 | 官方依据 |
|---|---|---|---|---|
| `OHPM-META-01` | error | both | `description` 为字符串，长度 6–512 | §5.1 |
| `OHPM-META-02` | error | both | `author` 必须是**对象**；`name` 1–128；`email`（≤64，含 `@`）与 `url`（≤1024）**至少一个** | §5.4 |
| `OHPM-META-03` | error | both | 开源包 `license` 必填且 1–256 字符（闭源可缺） | §5.1 |
| `OHPM-META-04` | error | both | 开源包 `repository` 必填；URL ≤1024；协议 ∈ {https,http,ftp,rtsp,mms} | §5.5 |
| `OHPM-META-05` | warn | both | `homepage` / `bugs` 建议填写且为合法 URL | 建议项 |
| `OHPM-META-06` | error | both | `main` 必填，且指向的文件**在包内真实存在** | §5.1 |
| `OHPM-META-07` | error | both | `artifactType` ∈ {original, obfuscation, bytecode}；后两者要求 `types` 存在且以 `.d.ts`/`.d.ets` 结尾；`obfuscated` 必须是布尔（字符串 `"true"` **不算**已混淆）；`addonSdk` 必须是布尔 | §5.3 |
| `OHPM-META-08` | error | both | `dependencies` / `devDependencies` / `dynamicDependencies` 不得依赖自身；键 ≤214、值 ≤128 | §5.2 |
| `OHPM-META-09` | error | both | `oh-exports` 为相对路径数组、不含 `..`；后缀 `.ts`/`.ets`/`.js`；路径必须存在（`.ts`/`.ets` 可回退 `.d.ts`/`.d.ets`） | §5.2 / §7.1 |
| `OHPM-META-10` | error | both | `sourceType` ∈ {open, closed}（缺省 open）；**闭源包** `metadata.debug === true` 违规（字符串 `"true"` 不算） | §5.7 |
| `OHPM-META-11` | warn（dir 模式降为 info） | both | `compatibleSdkVersion` / `compatibleSdkType` 建议填写（`prepublish` 也会警告；hvigor 打包时通常自动写入） | §5.3 |
| `OHPM-META-12` | warn | har | `nativeComponents` 与 `package/libs/*.so` 一致：有 `.so` 未声明 / `name` 为空 / `name` 指向不存在的 `.so` | §5.6 |
| `OHPM-META-13` | warn | both | `license` 使用 SPDX 标识（`Apache-2.0` 而非 `Apache License 2.0`） | 质量建议 |

### 3.4 文件 `FILE`

| ID | 级别 | 适用 | 检查 | 官方依据 |
|---|---|---|---|---|
| `OHPM-FILE-01` | error | both | 四件套齐全：`oh-package.json5`、`README*.md`、`CHANGELOG*.md`、`LICENSE*`（开源包）；文件名大小写不敏感，变体见 §3.5 | §1 / §7.1 |
| `OHPM-FILE-02` | error | both | 上述文件**非空**（去空白后长度 > 0） | §1 |
| `OHPM-FILE-03` | error | both | `CHANGELOG` 正文包含当前 `version` 字符串（边界匹配） | §7.1 |
| `OHPM-FILE-04` | error | both | `README` 含 `ohpm install <name>` 或 `ohpm i <name>`，且 `<name>` **等于** `oh-package.json5` 的 `name` | §7.1 |
| `OHPM-FILE-05` | error | har | 包内不得含 `.exe` | §7.1 |
| `OHPM-FILE-06` | error | both | 敏感文件：`*.p7b` `*.cer` `*.p12` `*.pfx` `*.pem` `*.key` `*.jks` `.env*` `signingConfigs*`，以及文件内容命中私钥头（`BEGIN ... PRIVATE KEY`） | §8-5 |
| `OHPM-FILE-07` | warn | har | 源码泄漏：包内出现 `src/**/*.ets` / `*.ts` 源文件（`prepublish` 同类警告）。dir 模式下 `src/` 属正常开发源码，不报 | 质量建议 |

### 3.5 结构 `STRUCT`（仅 `har`）

| ID | 级别 | 检查 | 官方依据 |
|---|---|---|---|
| `OHPM-STRUCT-01` | error | 存在 `package/` 目录，且 `package/oh-package.json5` 存在非空 | §7.1 |
| `OHPM-STRUCT-02` | error | `oh-package.json5` 能被 JSON5 正确解析（任何输入模式都查） | §7.1 |
| `OHPM-STRUCT-03` | error | 所有 `.so` 必须位于 `package/libs/` 下 | §7.1 |

### 3.6 体积 `SIZE`

| ID | 级别 | 检查 | 官方依据 |
|---|---|---|---|
| `OHPM-SIZE-01` | error | `.har` ≤ **500 MB**（仅 `.har` 文件输入时可得压缩体积；目录输入输出 `skipped`） | §4 |
| `OHPM-SIZE-02` | error | 解压后总大小 ≤ **1500 MB** | §4 |
| `OHPM-SIZE-03` | error | 解压后文件数 ≤ **102400** | §4 |
| `OHPM-SIZE-04` | error | README ≤ **10 MB** | §4 |
| `OHPM-SIZE-05` | warn | 质量预算：默认 >10 MB 提示、>30 MB 强提示（可用 `warnMb`/`strongMb` 覆盖），并列出体积 TOP5 文件 | 质量建议 |

### 3.7 文档质量 `DOC`（全是 warn，不冒充官方）

| ID | 级别 | 检查 |
|---|---|---|
| `OHPM-DOC-01` | warn | README 含 8 个章节语义：安装 / 所需权限 / 接口 / 示例 / 约束与限制 / 目录结构 / 贡献 / 许可（缺哪项报哪项，可逐项 `--ignore`） |

### 3.8 官方 21 条速查表 → 规则覆盖

| 官方条目 | 规则 |
|---|---|
| 1 四件套 | `FILE-01` `FILE-02` |
| 2 LICENSE 例外（闭源） | `META-03` `FILE-01` |
| 3 README 安装命令 | `FILE-04` |
| 4 CHANGELOG 当前版本 | `FILE-03` |
| 5 `package/` 目录 | `STRUCT-01` |
| 6 JSON5 可解析 | `STRUCT-02` |
| 7 name 规则 | `NAME-01`…`NAME-05`、`NAME-07`(联网) |
| 8 version 规则 | `VER-01` `VER-02` `VER-03`(联网) |
| 9 description | `META-01` |
| 10 author | `META-02` |
| 11 main | `META-06` |
| 12 types | `META-07` |
| 13 license | `META-03` |
| 14 repository | `META-04` |
| 15 体积 | `SIZE-01`…`SIZE-04` |
| 16 `.so` 位置 | `STRUCT-03` |
| 17 禁 `.exe` | `FILE-05` |
| 18 oh-exports | `META-09` |
| 19 权限（组织归属/首发包/冷却） | **不覆盖**（平台侧，无本地信息） |
| 20 nativeComponents 警告 | `META-12` |
| 21 闭源 debug | `META-10` |

---

## 4. 规则 ID 约定

`OHPM-<AREA>-<NN>`，`AREA ∈ {NAME, VER, META, FILE, STRUCT, SIZE, DOC}`。**一经发布不得重编号**（`--ignore` 依赖稳定性）；废弃规则保留 ID 并在输出里标 `deprecated`。

---

## 5. 输出与提示质量

- 每条 issue 必须给 **`officialRef`**（`§x.y`）与 **可执行的 `hint`**（给出改法，而不是复述规则）。
- `path` 用包内相对路径（`package/...`），便于 CI 点击跳转。
- 同一条规则对同一文件只报一次（聚合到该文件）。
- 汇总行示例：`2 error, 5 warn — CHANGELOG 缺版本号（阻断）/ README 缺安装命令（阻断）`。

---

## 6. Fixtures（不提交二进制）

```
fixtures/
├── _build.mjs                     # 把 <case>/package/ 打成 $TMP/<case>.har
├── pass-minimal/                  # 全部通过
├── fail-四件套缺三件/
├── fail-changelog-无版本号/
├── fail-readme-安装命令与name不一致/
├── fail-name-大写与非法后缀/
├── fail-version-v前缀与超限/
├── fail-author-字符串/
├── fail-struct-无package目录/
├── fail-size-超预算（用稀疏文件模拟，不真造 500MB）
├── fail-敏感文件-私钥/
└── warn-doc-缺权限与约束章节/
```

每个 case 目录含 `package/`（或 `dir/`）+ `expected.json`：

```json
{ "kind": "har", "expect": [{ "rule": "OHPM-FILE-03", "severity": "error" }] }
```

**原则**：先保证"真问题的包一定报"和"合规包零误报"，再扩规则。

---

## 7. 目录结构

```
ohpm-lint/
├── src/
│   ├── cli.ts
│   ├── core/{target.ts, unpack.ts, manifest.ts, walk.ts, report.ts}
│   ├── rules/{name,ver,meta,file,struct,size,doc}.ts
│   ├── rules/arkts-keywords.ts
│   └── reporters/{pretty.ts, json.ts}
├── fixtures/
├── tests/
├── docs/official-rules.md      # 可选：官方规则快照（抓取日期 + 原文摘录）
├── SPEC.md                     # 本文件
├── README.md  CHANGELOG.md  LICENSE
└── .github/workflows/ci.yml
```

---

## 8. 实施顺序（对齐 `docs/09` 的 D1–D14）

| 批次 | 内容 | 完成判据 | 状态 |
|---|---|---|---|
| P0 | `target` / `unpack` / `manifest` / `STRUCT-02` + `FILE-01..04` + `META-01..06` | 10 个 fixture 里"阻断类"全中 | ✅ 2026-10-21 |
| P1 | `NAME-01..05`、`VER-01..02`、`META-07..12`、`FILE-05..07`、`STRUCT-01/03` | 覆盖 §3.8 里除第 19 条外全部官方项 | ✅ 2026-10-21 |
| P2 | `SIZE-01..05`、`DOC-01`、`--config` | CI 可消费；`@quizzyjoy/shaderport` 在 `--strict` 下全绿 | ✅ 2026-10-21 |

> 已实现的 CLI 选项：`--json` / `--strict` / `--ignore` / `--config` / `--quiet` / `--no-color`。

---

## 9. v0.1 明确不做的联网校验

| 项 | 为什么不做 | 替代 |
|---|---|---|
| 名称去分隔符唯一性（`NAME-07`） | 需查中心仓，且无公开稳定 API | 提示用户看中心仓搜索 |
| 版本是否已发布（`VER-03`） | 同上 | 输出 `skipped` 原因 |
| 组织归属 / 首发包人 / 下架冷却（官方第 19 条） | 平台侧权限信息，本地不可知 | README 说明"这类问题只能靠发布时报错" |

---

## 10. 规则同步流程

1. 官方规则页更新 → 重抓，记录日期（例：`2026-11-xx：description 上限调整`）。
2. 任何规则的新增/降级必须：① 引用官方原文；② 补正反 fixture；③ 在 CHANGELOG 写 `rule:` 前缀条目。
3. 规则版本随包版本走；`SPEC.md` 与实现不一致时，以 SPEC 为准、先改 SPEC 再改代码。

---

## 11. 与工作区 `docs/09` 的关系

`docs/09-ohpm-lint调研.md` §4 的 12 条规则是**早期草稿**（基于论坛口径 + 推测），已由官方规则存档 `reference/ohpm-publish-rules.md` 取代。**以本文件为准**，差异要点：

| 早期草稿 | 现在的口径 |
|---|---|
| 只查 README/CHANGELOG/LICENSE 三件套 | **四件套**，且 `oh-package.json5` 必须在 `package/` 下 |
| 体积 >10MB 提示、>30MB 警告 | 官方硬限 **500MB / 1500MB / 102400 文件 / README 10MB**（error）；10/30MB 仅作质量 warn |
| README 九要素（自拟） | 官方只要求**含安装命令**（error）；八要素完整度降为 warn |
| `repository` 建议填 | **开源包必填**（error） |
| license 建议 SPDX | 长度 1–256 是硬限（error）；SPDX 写法是建议（warn） |
