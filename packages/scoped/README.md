# @quizzyjoy/ohpm-lint

**组织作用域别名包**：内容只有一行转发，真正的实现在 [`ohpm-lint`](https://www.npmjs.com/package/ohpm-lint)。

> 这个包存在的原因：npm 组织的命名空间是 `@quizzyjoy/*`，而无 scope 的 `ohpm-lint` 属于发布者个人账号、不能转移给组织。
> 为了让「组织名下也有一个可锚定的包」，这里提供一个零逻辑别名，版本跟随主包。

## 用法

推荐直接用主包（更短）：

```bash
npx ohpm-lint ./path/to/library
```

组织内需要以 scope 形式引用时（例如内部规范要求所有工具都走组织命名空间）：

```bash
npx @quizzyjoy/ohpm-lint ./path/to/library
```

两者行为完全一致：同一个 CLI、同一套规则、同样的退出码。

> ⚠️ **别在本目录里验证**：在 `packages/scoped/` 内执行 `npx @quizzyjoy/ohpm-lint` 时，npm 会优先解析本地 `package.json`（同名包），而该目录没有安装依赖，会报 `'ohpm-lint' 不是内部或外部命令`。
> 请在任意**其他目录**验证，或先在本目录 `npm install` 再跑 `node bin/ohpm-lint.js --version`。

## 规则依据

- [三方库发布的必要文件](https://ohpm.openharmony.cn/#/cn/help/publishrequirefile)
- [OHPM 发包规则汇总](https://ohpm.openharmony.cn/#/cn/help/publishrules)
- [三方库名称指南](https://ohpm.openharmony.cn/#/cn/help/guidename)

完整规则清单与设计见主仓 [SPEC.md](https://github.com/quizzyjoy/ohpm-lint/blob/main/SPEC.md)。

## 许可

Apache-2.0
