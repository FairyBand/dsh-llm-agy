# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

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
