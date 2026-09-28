# RESET / 开蹬！国际化

游戏使用 [i18next](https://www.i18next.com/) 与 [react-i18next](https://react.i18next.com/guides/quick-start)。这是单页客户端游戏，语言选择不需要 Next.js 路由；相较于面向多语言路由的 [next-intl App Router 方案](https://next-intl.dev/docs/getting-started/app-router)，这套方案只作用于 RESET。

## 文案与存档

- 新界面文案写在 `src/components/resetRush/messages.ts`，用语义化 key 和 `useTranslation()` 的 `t(key)` 调用。数字或变量使用 `{{name}}` 插值，不拼接已翻译的句子。
- 所有语言资源必须拥有相同的 key。`scripts/tests/reset-rush-i18n.test.mjs` 逐个检查语言目录、英文资源中的中文、组件中仍由兼容层处理的中文文本，并验证未知语言回退到英文。新增界面不要继续依赖中文原句自动匹配。
- `i18n.tsx` 中原有的中文原句表和动态规则只为旧界面、引擎生成的事件与存档日志提供显示兼容。规则计算和存档仍使用原值，不把译文写回存档。新增引擎文本时，需要在兼容层补英文并增加覆盖相应状态的测试。
- 首次打开按 `navigator.languages` 选择，未支持的语言用英文。手动切换存入 `reset-rush.locale`，只影响本游戏。翻译资源缺项也回退到英文，避免英文界面出现中文。

## 新增语言

1. 在 `messages.ts` 增加同结构资源，加入 `resetMessages` 和 `resetLanguageNames`。语言类型、浏览器匹配和选择菜单由这些资源派生。
2. 为旧界面与存档内容补充该语言的显示适配；在完成前，它们使用英文兼容译文。不要改动 `engine.ts` 的存档字段来翻译。
3. 扩展词条一致性测试和浏览器语言验收，覆盖规则、新局确认、账户、项目设置、收工、结算、履历和窄屏。

验证：`node --test scripts/tests/reset-rush-i18n.test.mjs`、`node scripts/verify-reset-rush-i18n.cjs`；提交前依次执行 `pnpm run check` 和 `pnpm run build`。
