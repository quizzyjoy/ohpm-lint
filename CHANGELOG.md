# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/).

## [0.1.0] - 2026-10-21

首个可用版本（P0），规则全部锚定官方条目，不做"社区口味"。

### Added

- CLI `ohpm-lint <dir|har>`，支持 `--json` / `--strict` / `--ignore` / `--quiet` / `--no-color`，退出码 0/1/2。
- 输入模型：`.har`（gzip+tar，零依赖自解析）与库模块目录两种形态；`har` 模式校验 `package/` 目录结构。
- 规则：
  - `OHPM-FILE-01` 四件套齐全（`oh-package.json5` / `README` / `CHANGELOG` / `LICENSE`，闭源包免 LICENSE）
  - `OHPM-FILE-02` 四件套非空
  - `OHPM-FILE-03` `CHANGELOG` 必须包含当前版本号
  - `OHPM-FILE-04` `README` 必须含 `ohpm install <name>` 且与 `name` 一致
  - `OHPM-STRUCT-01` HAR 必须包含 `package/` 目录
  - `OHPM-STRUCT-02` `oh-package.json5` 必须可被 JSON5 解析
  - `OHPM-META-01` `description` 6–512 字符
  - `OHPM-META-02` `author` 必须是对象，且 `email`/`url` 至少一个
  - `OHPM-META-03` 开源包 `license` 必填且 1–256 字符
  - `OHPM-META-04` 开源包 `repository` 必填且协议合法
  - `OHPM-META-05` `homepage` / `bugs` 建议项（info/warn）
  - `OHPM-META-06` `main` 必须指向包内真实存在的文件
- fixtures（10 组）与 16 个测试，覆盖"阻断类必中、合规包零误报"。
- `SPEC.md`：规则目录、CLI/JSON 契约、官方 21 条覆盖矩阵、实施批次。

### Added（P1）

- 命名规则：`NAME-01` scope 语法/长度 · `NAME-02` 总长 · `NAME-03` 主体字符集与首尾 · `NAME-04` 禁止归档后缀 · `NAME-05` ArkTS 保留字。
- 版本规则：`VER-01` SemVer/长度/禁 `v` 前缀 · `VER-02` 三段 ≤ 2147483647。
- 包卫生：`FILE-05` 禁 `.exe` · `FILE-06` 敏感文件（私钥/证书/签名配置/`.env` + 私钥头内容扫描） · `FILE-07` `src/**` 源码泄漏（仅 har）。
- 结构：`STRUCT-03` `.so` 必须在 `package/libs/`。
- 元数据：`META-07` artifactType/types/obfuscated/addonSdk · `META-08` 依赖字段 · `META-09` oh-exports · `META-10` sourceType/metadata.debug · `META-11` 兼容 SDK 字段（dir 模式降为 info） · `META-12` nativeComponents 与 `.so` 一致性。
- 聚合型问题（多文件命中）合并成一条报告，最多列 5 个路径。

### Added（P2）

- 体积规则：`SIZE-01` HAR ≤ 500 MB · `SIZE-02` 解压 ≤ 1500 MB · `SIZE-03` 文件数 ≤ 102400 · `SIZE-04` README ≤ 10 MB · `SIZE-05` 质量预算（默认 10/30 MB，可配置，输出体积 TOP5）。
- 文档质量：`DOC-01` README 八要素逐项检查（安装/权限/接口/示例/约束/目录结构/贡献/许可），全部为 warn。
- 配置：`--config <file>` 与自动发现 `.ohpmlintrc.json5`（目标目录 → 当前目录），支持规则 `off`、级别覆盖、`SIZE-05` 阈值。
- 目录模式下跳过 `node_modules` / `oh_modules` / `build` / `.git` 等目录，`SIZE-01` 标记为 `skipped`。
- 测试增至 27 个（新增体积规则单测、README 质量、配置行为）。

### Known gaps（见 SPEC §9）

- 不联网：名称唯一性 `OHPM-NAME-07`、版本重复 `OHPM-VER-03` 输出为 `skipped`。
- 平台侧权限（组织归属 / 首发包人 / 下架冷却）无法本地校验。
