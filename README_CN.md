# dsh-llm-agy

**把 Antigravity CLI（AGY）接入 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的插件。**

把 Google 出品的、由 Gemini 驱动的编程代理 Antigravity CLI 变成 dsh 里的一等模型提供方:对话与子代理推理、Google 深度搜索,以及让纯文本模型"看图"。**不需要改动 dsh 源码**。

[English README →](README.md)

---

## 它提供什么

| 能力 | 说明 |
| --- | --- |
| **`agy` 模型提供方** | Gemini 3.8 / 3.7 / 3.6 Flash、Gemini 3.1 Pro、Claude Sonnet 4.6、Claude Opus 4.6、GPT-OSS 120B 会以 **Antigravity CLI (Gemini)** 分组出现在模型选择器里 |
| **`subagent_agy_ui`** | 把前端/UI 实现任务交给由 AGY 驱动的子代理;默认后台运行,会话可继续追问 |
| **`list_agy_models`** | 查询 AGY 当前支持的模型 id |
| **`read_image_agy`** | 让纯文本主模型"看图"——AGY 读取图片并返回文字描述 |
| **AGY 网页搜索** | 经 AGY 走 Google 深度搜索;可接管全局 `web_search` 工具,也可保留为独立的 `agy_web_search` |
| **设置面板卡片** | *设置 → 插件 → AntiGravity*:安装/登录状态、实时连通性测试、**剩余配额/用量可视化查看与刷新**、代理配置、功能开关 |
| **`check_agy_quota`** | 账号剩余配额查询工具:直接在对话中查看 Gemini / Claude / GPT 模型组的 5 小时/每周剩余限额、重置倒计时及 AI 积分余额 |

> **用量显示跟随"当前对话"的模型。** 输入框底栏、模型选择器左侧的
> `⚡ 剩余%` 徽标只在**当前对话所用模型**的 provider 是
> **Antigravity CLI (Gemini)** 时出现;切到任何用其它 provider 的对话(或把当前
> 对话切回其它模型)都会立即隐藏,不刷新页面、不需要重启。判断依据是当前会话的
> 模型选择(`uiSession` + 会话模型目录),**不是**全局默认模型 —— 所以在不同
> provider 的历史对话之间来回切换也会正确跟随。设置面板里的配额卡片始终可手动查询
> (按钮「查询用量/配额」),点徽标则可弹出完整进度条详情。

---

## 环境与版本要求

| 组件 | 要求 | 原因 |
| --- | --- | --- |
| **dsh** | 宿主提供的 `@deepseek-ai/dsh-llm` 必须 **≥ `0.1.5-rc.2`** | 适配器要 import `ToolCallId`,旧构建(如 `0.1.0-rc.8`)里没有这个导出,插件会直接加载失败并报 `does not provide an export named 'ToolCallId'` —— 请升级 dsh |
| **Node.js** | ≥ 22.19,或 ≥ 24 | dsh 自身运行时要求;使用 dsh 自带运行时可满足 |
| **pnpm** | ≥ 11 | `dsh plugin` 会转发给 pnpm;dsh 自带的版本满足 |
| **Antigravity CLI** | 1.2.x,且已登录 | Windows 上通常位于 `%LOCALAPPDATA%\agy\bin\agy.exe` |
| **操作系统** | Windows / macOS / Linux | 代理自动探测支持 Windows 注册表与 macOS `scutil` |

---

## 安装

插件唯一新增的就是 `agy` 这个 provider,所以安装就是把一个包装进你的 dsh profile:

```bash
# <profile> 是你正在使用的 dsh profile,通常是 `web`。
# ~/.dsh/profiles/ 下的每个子目录就是一个 profile。

dsh plugin --profile <profile> add github:FairyBand/dsh-llm-agy
```

然后 **重启 dsh**。

> **从本地目录 link 安装(开发常用)必须先链接运行时依赖。**
> `link:` 装配下,插件的真实路径就是你的 clone 目录,Node 会从该目录向上找
> `node_modules`;而插件的服务端入口要 `import '@deepseek-ai/schemastery'` 等宿主包。
> 缺这几个包时,dsh 会在启动阶段直接中止:
>
> ```
> dsh: plugin(s) failed to load: llm-agy; Cordis startup failed
> Cannot find package '@deepseek-ai/schemastery' imported from .../lib/index.js
> ```
>
> 表现就是"装上插件 dsh 起不来,必须卸载才能启动"。用自带的装配脚本一步到位
> (它会先链接运行时依赖,再装进 profile;离线、幂等):

```bash
# 在插件目录内执行;--profile 默认 web
node scripts/link-profile.mjs --profile web
```

> 仓库路径**含空格**时,`dsh plugin add` 会把路径拆开、pnpm 也不接受 `file://` URL,
> 因此脚本会在所在盘符根下自动建立一个无空格的装配路径(如 `D:\dsh-llm-agy`)并
> 用它装配;该 junction 需要保留,不要删除。

<details>
<summary>其它安装来源</summary>

```bash
# 手动装配:先链接运行时依赖,再用无空格的装配路径
node scripts/link-runtime-deps.mjs
dsh plugin --profile <profile> add D:\dsh-llm-agy

# 已打包的 tarball
dsh plugin --profile <profile> add /path/to/dsh-llm-agy-0.1.2.tgz
```

从 GitHub 安装会拉取 **main** 分支,并直接使用仓库里已提交的编译产物 `lib/` —— 不需要构建,也不需要开发依赖。

</details>

---

## 首次配置

1. **安装并登录 Antigravity CLI**(`agy`)。先在终端跑一次 `agy -p "hi" --output-format text`,确认它能正常回答。
2. **重启 dsh**,让 profile 加载新插件。
3. 打开 **设置 → 插件 → AntiGravity**。
4. 把 **Command** 填成 CLI 的**绝对路径**,例如 `C:\Users\you\AppData\Local\agy\bin\agy.exe`。只有 dsh 进程继承到的 `PATH` 里确实包含 `agy` 时,直接填 `agy` 才有效 —— 在 dsh 启动之后才安装 AGY 的情况,基本都需要填绝对路径。
5. 点 **测试**。它会向 AGY 提一个真实问题并显示 AGY 的真实回复。
6. 在输入框下方的模型选择器里,选择 **Antigravity CLI (Gemini)** 分组下的任意模型。

---

## 代理配置

AGY 是 Go 程序,会读取 `HTTPS_PROXY` / `HTTP_PROXY`。正因如此,本插件可以在 **关闭 TUN 模式**的情况下连上 Antigravity:流量被交给本机代理(Clash、mihomo、v2rayN 等)出去,而不是依赖透明路由劫持。

设置面板里的 **Proxy** 字段接受三种写法:

| 取值 | 行为 |
| --- | --- |
| `auto` *(默认,留空同样生效)* | **探测系统代理**:先读环境变量(`HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY`),再读操作系统 Internet 设置(Windows 注册表 `ProxyEnable` + `ProxyServer`、macOS `scutil --proxy`)。**没有启用系统代理时不注入任何代理,直接连。** |
| `http://127.0.0.1:7897` *(也接受 `127.0.0.1:7897`、纯 `7897`)* | **手动指定**:原样使用。当代理没有注册为系统代理时,就该用它 —— 例如 Clash 以 TUN 模式运行时,系统代理通常是**关闭**的。 |
| `off` / `none` / `direct` | 强制直连,即使系统开着代理也不用。 |

代理解析**不猜端口、不做可达性预检**,全程异步并缓存 60 秒,因此不会卡住 host 事件循环。

> **Clash Verge 的常见配置:** 把该字段填成 `http://127.0.0.1:7897`(Clash 的混合端口)。若用 `auto` 且 TUN 开着,系统里并没有注册系统代理,`auto` 会回落到直连 —— 那只有在 TUN 正承载流量时才通。

---

## 用法

**用 Gemini 对话** —— 在输入框的模型选择器里选 **Antigravity CLI (Gemini)** 分组下的模型即可。

**委派 UI 任务** —— `subagent_agy_ui` 工具把一个自包含的前端/UI 任务交给 AGY 驱动的子代理。默认后台运行,子会话可继续追问。想要指定模型 id 时,先用 `list_agy_models` 查询。

**让纯文本模型看图** —— 开启"使用 AGY 读取图片"后,原生 `read_image` 会被拦截并引导模型改调 `read_image_agy`;AGY 读取文件并返回描述。

**搜索** —— 开启"用 AGY 搜索接管全局 web_search"后,全局 `web_search` 工具走 AGY 的 Google 深度搜索;关闭则只在 `agy_web_search` 里提供。

---

## 常见问题

**模型选择器里没有 "Antigravity CLI (Gemini)" 分组。**
插件没有加载。重启 dsh,并在 *设置 → 插件* 里确认它已列出。如果已加载但分组缺失,请确认宿主提供的 `@deepseek-ai/dsh-llm ≥ 0.1.5-rc.2`(见[环境与版本要求](#环境与版本要求))。

**装上插件后 dsh 启动不了,必须卸载才能启动。**
日志里通常是这样一行:

```
dsh: plugin(s) failed to load: llm-agy; Cordis startup failed because these plugin(s) could not be resolved
Cannot find package '@deepseek-ai/<pkg>' imported from <插件目录>/lib/index.js
```

原因是 dsh 以 `link:` 方式装配,插件的依赖从**插件自己的目录**向上解析,而插件入口
要 import 宿主 dsh 的包。补一次链接即可(离线、幂等):

```bash
node scripts/link-runtime-deps.mjs   # 在插件目录内执行
```

脚本会自动定位本机 dsh 安装(桌面版 / CLI / `DSH_HOME` 三种布局,也可用
`DSH_INSTALL_DIR` 显式指定),把 `@deepseek-ai/schemastery` 等运行时包链接进
`node_modules/@deepseek-ai/`,然后重启 dsh。注意不要在链接之后运行 `pnpm install`:
pnpm 会重建 `node_modules` 并清掉这些链接,重跑一次链接脚本即可。

**用量徽标不见了。**
这是预期行为:徽标(输入框底栏、模型选择器左侧那个 `⚡ xx%`)只在**当前对话**的模型
provider 为 **Antigravity CLI (Gemini)** 时显示。把当前对话的模型切到该分组下的模型即可;
切到其它 provider 的对话会自动隐藏。若确认当前对话已选 AGY 模型仍不显示,请检查
*设置 → 插件 → AntiGravity* 能否「查询用量/配额」成功(失败通常是代理或登录问题)。

**报 `does not provide an export named 'ToolCallId'`。**
宿主的 `@deepseek-ai/dsh-llm` 比 `0.1.5-rc.2` 旧,请升级 dsh。(本插件的 harness 依赖**刻意不写进 `dependencies`/`peerDependencies`** —— 一旦声明,pnpm 会去 registry 拉整套 `@deepseek-ai/*`,其中含未发布的包,`dsh plugin add` 必然失败;运行期依赖改由 `node scripts/link-runtime-deps.mjs` 链接宿主提供。若仍报此错,说明有旧副本被解析进来了。)

**设置面板里测试正常,但对话连不上(或反之)。**
0.1.2 起两条路径读的是同一份实时配置,理论上不会再出现。若出现,请复查 **Command** 路径与 **Proxy** 取值,然后重启 dsh。

**只有关掉 TUN 模式才连不上。**
把 **Proxy** 填成本机混合端口,例如 `http://127.0.0.1:7897`。`auto` 在没有*系统*代理时会直连,而 TUN 模式下系统代理通常就是关的。

**Google 返回 `User location is not supported for the API use`。**
这是你的代理出口节点被 Google 拒绝,与插件无关。换节点,或把 **Proxy** 设为 `off` 改走 TUN/本机网络。

**刚打开 dsh 时整体很慢。**
0.1.2 已修复。旧版本在 GUI 启动期间同步调用 `agy models`,会把 host 事件循环冻结约 6.5 秒(工作目录、历史会话、模型目录、输入框全都在等)。现在模型目录是非阻塞的。

---

## 致谢

- **原始插件** 由 [flg1217](https://github.com/flg1217) 编写 —— <https://github.com/flg1217/dsh-llm-agy>。provider 路由、AGY 适配器设计、搜索/看图通道与设置面板卡片均源自该项目。
- **维护与修复** 由 [FairyBand](https://github.com/FairyBand) 完成:非阻塞的模型目录、标准的系统代理解析(含直连回落)、清除 host 事件循环上所有同步 `spawnSync`、配置实时读取、打包与依赖解析修复。

## 许可证

[MIT](LICENSE) —— 沿用原项目的许可证。
