# ohpm-lint

**Lint your OHPM package against the OpenHarmony Center-repo submission rules — before `ohpm publish`.**

> 状态：**pre-alpha**。本仓库先占名并固化规格，规则引擎在写。
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

## 计划用法（尚未发布到 npm）

```bash
npx ohpm-lint ./entry/build/default/outputs/default/entry-default.har
npx ohpm-lint ./path/to/library --json --strict
```

| 参数 | 作用 |
|---|---|
| `--json` | 输出机器可读结果，供 CI 消费 |
| `--strict` | 把 warn 视为 error |
| `--config .ohpmlintrc.json5` | 规则开关与阈值 |
| `--ignore R9,R12` | 临时豁免指定规则 |

退出码：`0` 通过 / `1` 存在 error / `2` 工具自身失败。

## 规则从哪来

每条规则都锚定官方条目，不做「社区口味」：

- [三方库发布的必要文件](https://ohpm.openharmony.cn/#/cn/help/publishrequirefile)
- [OHPM 发包规则汇总](https://ohpm.openharmony.cn/#/cn/help/publishrules)
- [三方库名称指南](https://ohpm.openharmony.cn/#/cn/help/guidename)

定级原则：官方写明「导致上架失败」的 → `error`；官方仅警告、或本就属质量建议的 → `warn`。工具不应当比审核更严。

## 贡献

Issue / PR 都欢迎。新增规则请同时提供：规则依据（官方链接 + 原文摘录）、正反 fixture、以及「误报会伤到谁」的说明。

## 许可证

[Apache-2.0](LICENSE)
