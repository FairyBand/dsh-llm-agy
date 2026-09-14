# dsh-llm-agy

**Antigravity CLI (AGY) integration for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh).**

Use Google's Antigravity CLI — the Gemini-driven coding agent — as a first-class model provider inside dsh: chat and subagent inference, Google deep search, and image reading for text-only models. No dsh source changes required.

[中文说明 →](README_CN.md)

---

## What you get

| Capability | What it does |
| --- | --- |
| **`agy` model provider** | Gemini 3.8 / 3.7 / 3.6 Flash, Gemini 3.1 Pro, Claude Sonnet 4.6, Claude Opus 4.6, GPT-OSS 120B show up in the model picker as **Antigravity CLI (Gemini)** |
| **`subagent_agy_ui`** | Delegate frontend/UI implementation to a subagent driven by AGY; runs in the background and stays resumable |
| **`list_agy_models`** | Ask AGY which model ids it currently supports |
| **`read_image_agy`** | Let a text-only main model read an image — AGY returns a text description |
| **AGY web search** | Google deep search through AGY; can take over the global `web_search` tool, or stay available as `agy_web_search` |
| **Settings card** | *Settings → Plugins → AntiGravity*: install/login status, live connectivity test, proxy configuration, feature toggles |

---

## Requirements

| Component | Requirement | Why |
| --- | --- | --- |
| **dsh** | Host must provide `@deepseek-ai/dsh-llm` **≥ `0.1.5-rc.2`** | the adapter imports `ToolCallId`, which does not exist in older builds (e.g. `0.1.0-rc.8`). If yours is older, the plugin fails to load with `does not provide an export named 'ToolCallId'` — update dsh. |
| **Node.js** | ≥ 22.19, or ≥ 24 | required by dsh's own runtime; the bundled runtime satisfies this |
| **pnpm** | ≥ 11 | `dsh plugin` forwards to pnpm; dsh ships a compatible build |
| **Antigravity CLI** | 1.2.x, signed in | on Windows it is usually `%LOCALAPPDATA%\agy\bin\agy.exe` |
| **OS** | Windows / macOS / Linux | proxy auto-detection reads Windows registry settings and macOS `scutil` |

---

## Install

The `agy` provider is what this plugin adds, so the install is a single package install into your dsh profile:

```bash
# <profile> is the dsh profile you are running — commonly `web`.
# Each directory under ~/.dsh/profiles/ is a profile.

dsh plugin --profile <profile> add github:FairyBand/dsh-llm-agy
```

Then **restart dsh**.

<details>
<summary>Other install sources</summary>

```bash
# a local checkout
dsh plugin --profile <profile> add /path/to/dsh-llm-agy

# a packed tarball
dsh plugin --profile <profile> add /path/to/dsh-llm-agy-0.1.2.tgz
```

A GitHub install pulls the **main** branch and uses the compiled `lib/` that is committed to the repository — no build step, no dev dependencies.

</details>

---

## First-run setup

1. **Install and sign in to the Antigravity CLI** (`agy`). Run `agy -p "hi" --output-format text` in a terminal once to confirm it answers.
2. **Restart dsh** so the profile picks up the new plugin.
3. Open **Settings → Plugins → AntiGravity**.
4. Set **Command** to the **absolute path** of the CLI, e.g. `C:\Users\you\AppData\Local\agy\bin\agy.exe`. A bare `agy` only works if the dsh process inherited a `PATH` that contains it — setups that installed AGY after dsh started usually need the absolute path.
5. Press **Test**. It asks AGY a real question and shows AGY's actual reply.
6. In the composer, open the model picker and choose a model under **Antigravity CLI (Gemini)**.

---

## Proxy configuration

AGY is a Go program: it honours `HTTPS_PROXY` / `HTTP_PROXY`. That is what lets this plugin reach Antigravity **with TUN mode turned off** — the traffic is handed to your local proxy (Clash, mihomo, v2rayN, …) instead of relying on transparent routing.

The **Proxy** field in the settings card accepts three forms:

| Value | Behaviour |
| --- | --- |
| `auto` *(default, also used when empty)* | **Detects the system proxy**: environment variables (`HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY`) first, then the OS Internet settings (Windows registry `ProxyEnable` + `ProxyServer`, macOS `scutil --proxy`). If **no** system proxy is enabled it injects nothing and connects directly. |
| `http://127.0.0.1:7897` *(or `127.0.0.1:7897`, or a bare `7897`)* | **Manual**: used exactly as given. This is what you want when the proxy is not registered as the system proxy — e.g. launching Clash in TUN mode, where the system proxy is normally **off**. |
| `off` / `none` / `direct` | Force a direct connection, even when a system proxy is enabled. |

The resolver never guesses ports and never probes reachability — it is asynchronous and cached for 60 s, so it cannot stall the host event loop.

> **Typical Clash Verge setup:** set the field to `http://127.0.0.1:7897` (Clash's mixed port). With `auto` and TUN mode on, no system proxy is registered, so `auto` would fall back to a direct connection — which works only while TUN is carrying the traffic.

---

## Usage

**Chat with Gemini** — pick any model in the **Antigravity CLI (Gemini)** group from the composer's model picker.

**Delegate UI work** — the `subagent_agy_ui` tool hands a self-contained frontend/UI task to an AGY-driven subagent. It runs in the background by default and the child conversation stays resumable. Use `list_agy_models` first if you want a specific model id.

**Read images with a text-only model** — with *使用 AGY 读取图片* enabled, the native `read_image` tool is redirected and the model should call `read_image_agy` instead; AGY reads the file and returns a description.

**Search** — with *用 AGY 搜索接管全局 web_search* enabled, the global `web_search` tool routes through AGY's Google deep search. Turn it off to keep AGY search available only as `agy_web_search`.

---

## Troubleshooting

**The model picker has no "Antigravity CLI (Gemini)" group.**
The plugin is not loaded. Restart dsh and check the plugin is listed in *Settings → Plugins*. If it loads but the group is missing, confirm the host provides `@deepseek-ai/dsh-llm ≥ 0.1.5-rc.2` (see [Requirements](#requirements)).

**`does not provide an export named 'ToolCallId'`.**
Your host `@deepseek-ai/dsh-llm` is older than `0.1.5-rc.2`. Update dsh. (This plugin declares its harness dependencies as *optional* peers precisely so pnpm never installs a second, older copy of `dsh-llm` into your profile — if you see this error, an old copy is being resolved anyway.)

**The Test button works but chatting fails, or vice versa.**
Both paths read the same live configuration, so this should not happen on 0.1.2+. If it does, re-check the **Command** path and the **Proxy** value, then restart dsh.

**Connection fails only when TUN mode is off.**
Set **Proxy** to your local mixed port, e.g. `http://127.0.0.1:7897`. `auto` connects directly when no *system* proxy is enabled, which is the normal state under TUN.

**Google returns `User location is not supported for the API use`.**
That is your proxy exit node being rejected by Google, not a plugin problem. Switch nodes, or set **Proxy** to `off` to use TUN/your local network instead.

**Everything felt slow right after opening dsh.**
Fixed in 0.1.2. Older builds called `agy models` synchronously while the GUI was starting, which froze the host event loop for ~6.5 s (workspace list, session history, model catalog and the composer all waited). The model catalog is now non-blocking.

---

## Credits

- **Original plugin** by [flg1217](https://github.com/flg1217) — <https://github.com/flg1217/dsh-llm-agy>. The provider route, AGY adapter design, search/read-image channels and the settings card all come from that work.
- **Maintenance and fixes** by [FairyBand](https://github.com/FairyBand): a non-blocking model catalog, standard system-proxy resolution (with direct-connection fallback), removal of every synchronous `spawnSync` from the host event loop, live configuration reads, packaging and dependency-resolution fixes.

## License

[MIT](LICENSE) — continuing the licence of the original project.
