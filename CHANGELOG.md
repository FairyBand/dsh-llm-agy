# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.1.3] - 2026-09-19

### 新增

- **剩余用量实时可视化**:输入框底栏、模型选择器左侧的 `⚡ 剩余%` 紧凑徽标,以及点击后弹出的配额详情浮层(各模型组 5 小时/每周进度条、恢复时间、AI 积分、手动刷新)
- **`check_agy_quota` 工具**:对话中直接查询 Gemini / Claude / GPT 各模型组剩余限额与积分
- **`scripts/link-runtime-deps.mjs`**:自动定位本机 dsh 安装并把宿主运行时包链接进本包 `node_modules`
- **`scripts/link-profile.mjs` 一步完成装配**:先链接运行时依赖,再装进 profile;仓库路径含空格时(实测 `dsh plugin add` 会把路径拆成 `D:\DSH` + `Working` + `Dirs\...`,pnpm 也不接受 `file://` URL)自动在盘符根下建立无空格 junction 并改用该路径装配

### 修复

- **插件装上后 dsh 无法启动(必须卸载才能启动)**:dsh 以 `link:` 装配时按插件真实路径解析依赖,而仓库里没有 `node_modules/@deepseek-ai/*`,`lib/index.js` 的 `import '@deepseek-ai/schemastery'` 直接 `ERR_MODULE_NOT_FOUND`;dsh 的 `assertEntriesLoaded` 因此中止整个启动。现在由 `link-runtime-deps.mjs` 在构建/装配前建立链接,`verify:portable` 也会把缺失依赖作为失败项报出
- **`package.json` 依赖声明导致 `pnpm install` 必然失败**:原先声明的 `@deepseek-ai/*` 版本范围与实际发布版本不匹配(如 `@deepseek-ai/dsh-util-values` 无 `^0.1.0-rc.6` 可用版本),pnpm 还会连带拉取未发布的 `@deepseek-ai/dsh-type-meta` 而 404。这些 harness 依赖已从 `dependencies`/`peerDependencies` 移除,改由链接脚本提供;`auto-install-peers=false` 固定写入 `.npmrc`
- **`lib/index.js` 引用未导入的 `runAgyQuota`**:该符号只出现在 `export { ... } from` 中,HTTP 配额路由一旦被请求就抛 `ReferenceError`。该路由本属冗余(客户端已走 discovery RPC 与设置通道),已整体移除

### 变更

- **用量显示跟随"当前对话"的模型**:徽标读 dsh 的 `modelSelection` 投影(与模型选择器同一份实时状态),经 session 作用域注入的官方 `useProjection` 取得,按 **`next` → `lastUsed` → 全局默认** 解析 —— 顺序很关键:投影形状是 `{ lastUsed, next }`,`next` 是**最近一次选择**(会话内换模型后立刻是它),`lastUsed` 才是该会话实际发过请求的模型。早期版本读不存在的 `current` 字段、或把 `lastUsed` 排在前面,都会表现为"历史对话里换模型徽标不更新"
- **徽标按模型组区分额度**:AGY 的 Gemini 与 Claude/GPT 额度分账,现在按当前模型 id 选组(`gemini*` → Gemini 组;`claude*`/`gpt*` → Claude/GPT 组),徽标显示该组的 **5 小时剩余百分比**,悬停给出该组 5h/每周明细;认不出模型时回退第一个组
- **收敛用量入口**:移除输入框下方的常驻药丸与会话顶栏右上角按钮,只保留模型选择器左侧的徽标(点击仍可打开完整配额详情),界面更干净
- `build.mjs` 在编译前先执行运行时依赖链接,优先使用本地 `tsc`

## [0.1.2] - 2026-09-14

### 修复

- **模型目录不再阻塞 host**:`listModels()` 原先用 `spawnSync` 调 `agy models`(实测 6.5 秒),而它位于 GUI 启动必经路径上,会把 host 事件循环冻住 —— 表现为"进入主界面后要等很久才加载出工作目录/历史会话/模型列表"。现在目录来自内置表 + 后台异步刷新,零 IO、毫秒级返回;`agy` 分组也因此稳定出现在模型选择器里
- **代理语义标准化**:`auto`(默认)= 探测系统代理(环境变量 → Windows 注册表 / macOS `scutil`),探测不到就**直连**;也可手动填写 `http://127.0.0.1:7897`;`off` 强制直连。移除了"扫描本机常见端口"这类猜测行为。代理解析全程异步并缓存 60 秒
- **设置面板改动即时生效**:命令/模型/代理以 getter 传入适配器,不再取注册时的快照 —— 修掉"面板里测试正常、对话里连不上"的错配
- **清除 host 事件循环上的全部同步调用**:`settings.js` 的安装探测与模型列表、`search.js` 的 `available()`、`models.js` 的工具查询全部改为异步

### 变更

- harness 依赖改为 **optional peer**(`peerDependenciesMeta`),避免 pnpm 往 profile 里安装第二份、更旧的 `@deepseek-ai/dsh-llm`(旧副本不含 `ToolCallId`,会导致插件加载失败)
- `devDependencies` 中指向作者本机 `link:D:/Projects/...` 的路径改为正常版本范围

## [0.1.0] - 2026-08-16

### 新增

- **LLM 适配器**(provider 路由 `agy`):子代理 `agentOptions.provider: 'agy'` 时由 AGY/Gemini 完成推理,支持 `subagent_agy_ui`(continuable 长线会话)/ `subagent_agy_vision`(one-shot)自定义子代理
- **Web 搜索 provider**(`agy`):`web_search` 工具经 AGY 的 `search_web`(Google)完成深度检索,返回完整综合回答与来源引用
- **设置面板卡片**:设置 → 插件 → AntiGravity,复用官方组件与样式——检测安装/登录、连通性测试(展示 AGY 真实回复)、多系统安装命令一键复制、工具说明
- **模型探测通道**:`api.llm.discoverModels({ settingsNs: 'agy', provider: 'status' | 'test' })`,服务端直接 spawn AGY,不写会话
- **`/agy` 命令**:`/agy status`、`/agy test`、`/agy`(帮助)
- **可移植性验证**:`pnpm run verify:portable` 无依赖验证包可直接装配
