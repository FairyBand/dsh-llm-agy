/**
 * AGY 代理解析:手动指定 / 探测系统代理 / 强制直连。
 *
 * `proxy` 配置项支持三种写法:
 *
 * - `auto`(默认)或留空:**探测系统代理**,探测不到就**直连**。
 *   ① 环境变量 `HTTPS_PROXY` / `https_proxy` / `HTTP_PROXY` / `http_proxy` /
 *      `ALL_PROXY` / `all_proxy`(取第一个非空的);
 *   ② 操作系统的 Internet 设置:Windows 注册表 Internet Settings 的
 *      `ProxyEnable` + `ProxyServer`;macOS 的 `scutil --proxy`。
 *   两者都没有 → **不注入任何代理**,直接交给本机网络(含 TUN)。
 * - `http://127.0.0.1:7897`(也接受 `127.0.0.1:7897`、`7897`):**手动指定**,
 *   原样注入,不做探测、不做改写。
 * - `off` / `none` / `direct`:**强制直连**,即使系统开着代理也不用。
 *
 * 明确**不做**的事:扫描本机常见代理端口(7897/7890/…)。那是猜测用户意图的
 * 隐式魔法 —— 猜中会掩盖"代理根本没配好"这个真实问题,猜错则静默走错出口。
 * 系统代理是标准信号:读到就用,读不到就是没有。没有代理时直接连,让 agy 自己
 * 去连(能连上说明本机网络/TUN 本来就通,连不上也该报网络错,而不是被一个来路
 * 不明的端口接管)。
 *
 * 为什么必须注入代理才能"不开 TUN 也连上 antigravity":agy 是 Go 程序,尊重
 * HTTPS_PROXY/HTTP_PROXY,注入后流量经代理(Clash 之类)按规则出门,不再依赖 TUN
 * 的透明劫持。实测(agy 1.2.2):HTTPS_PROXY 指向黑洞端口 127.0.0.1:1 时,`agy -p ...`
 * 立刻报 eligibility check 的 `proxyconnect ... refused`;指向 7897 时正常返回 `pong`。
 * 所以代理要么给对、要么不给 —— 绝不猜。
 *
 * 还有一条硬约束:**绝不阻塞事件循环**。插件跑在 dsh host 进程里,任何 spawnSync /
 * 同步等待都会冻结整个 GUI(工作目录、历史会话、模型目录、输入框全部排队)。
 * 因此读取注册表/`scutil` 一律用 `spawn`(异步 + 超时)。
 * @module llm-agy/proxy
 */

import { spawn } from 'node:child_process'

/** 一次代理解析的结果。 */
export interface AgyProxyResolution {
  /** 实际使用的代理地址;undefined 表示直连。 */
  url?: string
  /** 来源:手动指定 / 环境变量 / 操作系统设置 / 直连。 */
  source: 'configured' | 'system-env' | 'system-os' | 'direct'
  /** 说明(配置值不可解析等;归因用)。 */
  note?: string
}

/** 解析出的代理目标。 */
export interface AgyProxyTarget {
  host: string
  port: number
  url: string
}

/** 表示系统代理的环境变量(大小写都查;Go 只认前两个,ALL_PROXY 兼顾其它客户端)。 */
const SYSTEM_PROXY_ENV_KEYS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']

/** 读取系统代理(reg / scutil)的超时(毫秒)。 */
const SYSTEM_QUERY_TIMEOUT_MS = 3_000

/** 解析结果缓存时长(毫秒):避免每次调用都重读一次系统设置。 */
const CACHE_TTL_MS = 60_000

/** 这些配置值表示"强制直连",不注入任何代理。 */
const DIRECT_WORDS = new Set(['off', 'none', 'direct', 'no', 'false', '-'])

/** 这些配置值表示"探测系统代理"。 */
const AUTO_WORDS = new Set(['auto', 'detect', 'system', 'default'])

/**
 * 解析代理地址,返回 host/port 与规范化 URL。
 * @param value 形如 `http://127.0.0.1:7897` / `127.0.0.1:7897` / `7897` 的配置值。
 * @returns 解析结果;无法解析时为 undefined。
 */
export function parseProxyTarget(value: string | undefined): AgyProxyTarget | undefined {
  const raw = (value ?? '').trim()
  if (raw === '') return undefined
  // 纯端口:`7897`
  if (/^\d+$/.test(raw)) {
    const port = Number(raw)
    if (port > 0 && port < 65536) return { host: '127.0.0.1', port, url: `http://127.0.0.1:${port}` }
    return undefined
  }
  // 带协议的完整 URL(socks5:// 也照收:Go 的 HTTPS_PROXY 支持 socks5)。
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw)
      const host = parsed.hostname === '' ? '127.0.0.1' : parsed.hostname
      const port = parsed.port !== ''
        ? Number(parsed.port)
        : (parsed.protocol === 'https:' ? 443 : 80)
      if (!Number.isFinite(port) || port <= 0 || port >= 65536) return undefined
      return { host, port, url: `${parsed.protocol}//${host}:${port}` }
    } catch {
      return undefined
    }
  }
  // 裸 host:port。
  const bare = /^([^\s:]+):(\d+)$/.exec(raw)
  if (bare !== null) {
    const host = bare[1]
    const port = Number(bare[2])
    if (port > 0 && port < 65536) return { host, port, url: `http://${host}:${port}` }
  }
  return undefined
}

/**
 * 读取环境变量里的系统代理。
 * @returns 原始代理串;未设置时 undefined。
 */
function proxyFromEnv(): string | undefined {
  for (const key of SYSTEM_PROXY_ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined && value.trim() !== '') return value.trim()
  }
  return undefined
}

/**
 * 规范化 Windows `ProxyServer` 的值。
 * 可能是裸 `127.0.0.1:7897`,也可能是按协议分列的
 * `http=127.0.0.1:7897;https=127.0.0.1:7897;socks=127.0.0.1:1080`。
 * @param value 注册表里的原始串。
 * @returns 解析出的代理目标;无法使用时 undefined。
 */
function normalizeProxyServer(value: string | undefined): AgyProxyTarget | undefined {
  const raw = (value ?? '').trim()
  if (raw === '') return undefined
  const byScheme = new Map<string, string>()
  for (const part of raw.split(';').map((s) => s.trim()).filter((s) => s !== '')) {
    const eq = part.indexOf('=')
    if (eq === -1) {
      if (!byScheme.has('')) byScheme.set('', part)
      continue
    }
    byScheme.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim())
  }
  // HTTPS 优先(agy 全部走 TLS),其次通用项。
  for (const scheme of ['https', 'http', '']) {
    const entry = byScheme.get(scheme)
    if (entry === undefined || entry === '') continue
    if (/^socks/i.test(entry)) continue // 纯 socks 条目跳过,避免误当 HTTP 代理
    return parseProxyTarget(/^[a-z][a-z0-9+.-]*:\/\//i.test(entry) ? entry : `http://${entry}`)
  }
  return undefined
}

/**
 * 在超时内跑一个只读命令并收集 stdout(异步,绝不阻塞)。
 * @param command 可执行文件。
 * @param args 参数。
 * @returns stdout(失败/超时为空串)。
 */
function queryOutput(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    let proc: ReturnType<typeof spawn>
    try {
      proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
    } catch {
      resolve('')
      return
    }
    let out = ''
    let settled = false
    const finish = (text: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(text)
    }
    const timer = setTimeout(() => {
      try { proc.kill() } catch { /* 已退出 */ }
      finish('')
    }, SYSTEM_QUERY_TIMEOUT_MS)
    if (typeof timer.unref === 'function') timer.unref()
    proc.stdout?.setEncoding('utf8')
    proc.stdout?.on('data', (chunk: string) => { out += chunk })
    proc.on('error', () => finish(''))
    proc.on('close', () => finish(out))
  })
}

/**
 * 读取操作系统的 Internet 代理设置(Windows 注册表 / macOS scutil)。
 * 只认"已启用"的代理:`ProxyEnable` 为 0 一律视为没有系统代理。
 * @returns 解析出的代理目标;未启用或读不到时 undefined。
 */
async function readOsSystemProxy(): Promise<AgyProxyTarget | undefined> {
  if (process.platform === 'win32') {
    const out = await queryOutput('reg', [
      'query',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
    ])
    let enabled = false
    let server: string | undefined
    for (const line of out.split('\n')) {
      const m = /^\s*(\S+)\s+REG_\w+\s+(.*)$/.exec(line.replace(/\r$/, ''))
      if (m === null) continue
      if (m[1] === 'ProxyEnable') enabled = Number(m[2].trim()) !== 0
      if (m[1] === 'ProxyServer') server = m[2].trim()
    }
    // ProxyEnable 为 0 时,ProxyServer 只是历史残留值,不能当系统代理用。
    if (!enabled || server === undefined) return undefined
    return normalizeProxyServer(server)
  }
  if (process.platform === 'darwin') {
    const out = await queryOutput('scutil', ['--proxy'])
    const fields = new Map<string, string>()
    for (const line of out.split('\n')) {
      const m = /^\s*([A-Za-z]+)\s*:\s*(.+?)\s*$/.exec(line.replace(/\r$/, ''))
      if (m !== null) fields.set(m[1], m[2])
    }
    for (const scheme of ['HTTPS', 'HTTP']) {
      if (fields.get(`${scheme}Enable`) !== '1') continue
      const host = fields.get(`${scheme}Proxy`)
      const port = fields.get(`${scheme}Port`)
      if (host === undefined || port === undefined) continue
      const target = parseProxyTarget(`http://${host}:${port}`)
      if (target !== undefined) return target
    }
    return undefined
  }
  return undefined
}

/**
 * 探测系统代理:环境变量优先,其次操作系统 Internet 设置。
 * 不做端口可达性预检 —— 与 Go/curl 的 `ProxyFromEnvironment` 语义一致:
 * 读到了就用,连不上是网络/代理自身的问题,应当明确暴露而不是被静默改写。
 * @returns 解析结果;没有启用的系统代理时 undefined。
 */
async function detectSystemProxy(): Promise<AgyProxyResolution | undefined> {
  const fromEnv = proxyFromEnv()
  if (fromEnv !== undefined) {
    const target = parseProxyTarget(fromEnv)
    if (target !== undefined) return { url: target.url, source: 'system-env' }
  }
  const fromOs = await readOsSystemProxy()
  if (fromOs !== undefined) return { url: fromOs.url, source: 'system-os' }
  return undefined
}

/** 缓存:配置值 → 解析结果。 */
const cache = new Map<string, { at: number; value: AgyProxyResolution }>()
/** 进行中的探测:配置值 → Promise(并发去重)。 */
const inflight = new Map<string, Promise<AgyProxyResolution>>()

/** 真正执行一次解析。 */
async function detect(spec: string): Promise<AgyProxyResolution> {
  const lower = spec.toLowerCase()
  if (DIRECT_WORDS.has(lower)) {
    return { url: undefined, source: 'direct', note: 'proxy disabled by configuration' }
  }
  if (spec !== '' && !AUTO_WORDS.has(lower)) {
    // 手动指定:原样使用,不探测、不改写。
    const target = parseProxyTarget(spec)
    if (target !== undefined) return { url: target.url, source: 'configured' }
    // 值无法解析:按"没有可用代理"处理并说明,而不是猜一个端口出来。
    const system = await detectSystemProxy()
    return system ?? {
      url: undefined,
      source: 'direct',
      note: `configured proxy "${spec}" is not a usable URL or host:port`,
    }
  }
  // auto / 留空:探测系统代理,探测不到就直连。
  const system = await detectSystemProxy()
  return system ?? { url: undefined, source: 'direct' }
}

/**
 * 解析本次 AGY 调用应当使用的代理(带缓存与并发去重)。
 * @param spec 设置面板/插件配置里的代理值;
 *   空或 `auto` = 探测系统代理(探测不到则直连),
 *   `off`/`none`/`direct` = 强制直连,
 *   其余按 URL 或 host:port 手动指定。
 * @returns `{ url, source, note }`;`url` 为 undefined 表示直连。
 */
export async function resolveAgyProxy(spec: string | undefined): Promise<AgyProxyResolution> {
  const key = (spec ?? '').trim()
  const hit = cache.get(key)
  if (hit !== undefined && Date.now() - hit.at < CACHE_TTL_MS) return hit.value
  const running = inflight.get(key)
  if (running !== undefined) return running
  const task = detect(key)
    .then((value) => {
      cache.set(key, { at: Date.now(), value })
      return value
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, task)
  return task
}

/**
 * 构造注入给 agy 子进程的代理环境变量。
 * agy 是 Go 程序,只认 HTTP_PROXY/HTTPS_PROXY/NO_PROXY(大小写均可),
 * ALL_PROXY 一并给出以覆盖将来可能换成别的 HTTP 客户端的版本。
 * @param url 代理地址;空表示直连。
 * @returns 需要合并进 env 的键值;直连时为 undefined。
 */
export function agyProxyEnv(url: string | undefined): Record<string, string> | undefined {
  if (url === undefined || url === '') return undefined
  const noProxy = 'localhost,127.0.0.1,::1'
  return {
    HTTPS_PROXY: url,
    HTTP_PROXY: url,
    ALL_PROXY: url,
    https_proxy: url,
    http_proxy: url,
    all_proxy: url,
    NO_PROXY: noProxy,
    no_proxy: noProxy,
  }
}
