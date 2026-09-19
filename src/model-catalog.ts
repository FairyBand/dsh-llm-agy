/**
 * AGY 模型目录:给 dsh 的模型选择器/提供商列表提供 `agy` provider 的模型清单。
 *
 * 背景:`LlmAdapter.listModels()` 基类默认返回空数组,插件原先没覆盖它,于是
 * `agy` 在模型目录里永远是"零个模型"。而 `buildModelCatalog()`
 * (dsh-api-session-controller)会**把空分组整个过滤掉**,所以模型选择器里
 * 连 agy 分组都不出现 —— 这就是"工作区里选不到 agy 的 Gemini 模型"的直接原因。
 *
 * 核心约束:**list() 必须零 IO、立即返回**。
 * 目录构建位于 GUI 启动的必经路径上,`listModels()` 里任何 `spawnSync` 都会
 * 冻结整个 host 事件循环 —— 实测 `agy models` 要 6.5 秒(需联网拉
 * fetchAvailableModels),那 6.5 秒里工作目录、历史会话、模型列表、输入框
 * 全部排队,表现就是"进主界面后要等很久才加载出来"。因此这里:
 *
 * - `list()`:只用内存里的内置表 + 上一次刷新结果,立即返回;
 * - `scheduleRefresh()`:`spawn`(异步)跑一次 `agy models`,延迟启动、结果缓存,
 *   绝不阻塞调用方。
 *
 * 内置表来自实测 `agy models`(agy 1.2.2)输出,保证首次打开 GUI 就有模型可选;
 * 后台刷新补上服务端新增/下线的模型。
 * @module llm-agy/model-catalog
 */

import { spawn } from 'node:child_process'
import { resolveAgyProxy, agyProxyEnv } from './proxy.js'

/** 一个配置项:字面值,或返回当前值的 getter(设置面板改动即时生效)。 */
export type AgyOptionValue<T> = T | (() => T)

/** 目录条目的展示元数据(与 dsh-llm 的目录条目结构对齐)。 */
export interface AgyCatalogModel {
  provider: string
  id: string
  name: string
  inputModalities: string[]
}

/** 目录构造参数。 */
export interface AgyCatalogOptions {
  /** agy 可执行文件。 */
  command?: AgyOptionValue<string>
  /** 当前配置的默认模型(会排在目录首位)。 */
  model?: AgyOptionValue<string>
  /** 代理配置值(空/auto = 探测系统代理)。 */
  proxy?: AgyOptionValue<string>
}

/** 内置模型表(实测 `agy models` 输出,agy 1.2.7;是否再传 --effort 见 effort.ts)。 */
export const BUILTIN_AGY_MODELS: ReadonlyArray<readonly [string, string]> = [
  ['gemini-3.8-flash-high', 'Gemini 3.8 Flash (High)'],
  ['gemini-3.8-flash-medium', 'Gemini 3.8 Flash (Medium)'],
  ['gemini-3.8-flash-low', 'Gemini 3.8 Flash (Low)'],
  ['gemini-3.7-flash-high', 'Gemini 3.7 Flash (High)'],
  ['gemini-3.7-flash-medium', 'Gemini 3.7 Flash (Medium)'],
  ['gemini-3.7-flash-low', 'Gemini 3.7 Flash (Low)'],
  ['gemini-3.6-flash-high', 'Gemini 3.6 Flash (High)'],
  ['gemini-3.6-flash-medium', 'Gemini 3.6 Flash (Medium)'],
  ['gemini-3.6-flash-low', 'Gemini 3.6 Flash (Low)'],
  ['gemini-3.1-pro-high', 'Gemini 3.1 Pro (High)'],
  ['gemini-3.1-pro-low', 'Gemini 3.1 Pro (Low)'],
  ['claude-sonnet-4-6', 'Claude Sonnet 4.6 (Thinking)'],
  ['claude-opus-4-6-thinking', 'Claude Opus 4.6 (Thinking)'],
  ['gpt-oss-120b-medium', 'GPT-OSS 120B (Medium)'],
]

/** 内置表的 id → 显示名映射。 */
const BUILTIN_NAME_BY_ID = new Map<string, string>(BUILTIN_AGY_MODELS)

/** 刷新结果的新鲜期:期内不重复跑 agy。 */
const REFRESH_TTL_MS = 10 * 60_000

/** 首次刷新的延迟:让 GUI 启动路径先跑完,别和启动抢 IO。 */
const FIRST_REFRESH_DELAY_MS = 3_000

/** 单次 `agy models` 的硬上限(毫秒);到点静默放弃,保留现有目录。 */
const REFRESH_TIMEOUT_MS = 30_000

/**
 * 取配置值:支持 getter 函数,这样设置面板里改模型/代理能即时生效(不必重启)。
 * @param value 配置值,或返回配置值的函数。
 * @returns 当前值。
 */
export function readOption<T>(value: AgyOptionValue<T> | undefined): T | undefined {
  return typeof value === 'function' ? (value as () => T)() : value
}

/**
 * 解析 `agy models` 输出为 id/name 列表。
 * 输出形如两列 `id\t显示名`;"Fetching available models..." 走 stderr,一并容忍。
 * @param out 合并后的 stdout 文本。
 * @returns 解析出的模型;无有效行时为空数组。
 */
export function parseAgyModelsOutput(out: unknown): { id: string; name: string }[] {
  const seen = new Set<string>()
  const models: { id: string; name: string }[] = []
  for (const raw of String(out ?? '').split('\n')) {
    const line = raw.replace(/\r$/, '').trim()
    if (line === '' || line.startsWith('Fetching')) continue
    const tab = line.indexOf('\t')
    const id = (tab === -1 ? line : line.slice(0, tab)).trim()
    const name = (tab === -1 ? line : line.slice(tab + 1)).trim()
    // id 不含空白,借此过滤日志/提示噪音。
    if (id === '' || /\s/.test(id) || seen.has(id)) continue
    seen.add(id)
    models.push({ id, name: name === '' ? id : name })
  }
  return models
}

/**
 * 跑一次 `agy models` 并解析结果(**全程异步,绝不阻塞事件循环**)。
 * 同时把代理解析结果注入子进程,保证关掉 TUN 后也能联网取到列表。
 * @param command agy 可执行文件(或返回它的函数)。
 * @param proxy 代理配置值(或返回它的函数)。
 * @returns 模型列表;失败/超时/无输出时为空数组。
 */
export async function runAgyModels(
  command: AgyOptionValue<string> | undefined,
  proxy: AgyOptionValue<string> | undefined,
): Promise<{ id: string; name: string }[]> {
  const bin = readOption(command) ?? 'agy'
  let env: NodeJS.ProcessEnv = { ...process.env }
  try {
    const extra = agyProxyEnv((await resolveAgyProxy(readOption(proxy))).url)
    if (extra !== undefined) env = { ...env, ...extra }
  } catch { /* 代理解析失败就按当前环境跑 */ }
  return await new Promise((resolve) => {
    let proc: ReturnType<typeof spawn>
    try {
      proc = spawn(bin, ['models'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, env })
    } catch {
      resolve([])
      return
    }
    let out = ''
    let settled = false
    const finish = (models: { id: string; name: string }[]): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(models)
    }
    const timer = setTimeout(() => {
      try { proc.kill() } catch { /* 已退出 */ }
      finish([])
    }, REFRESH_TIMEOUT_MS)
    if (typeof timer.unref === 'function') timer.unref()
    proc.stdout?.setEncoding('utf8')
    proc.stdout?.on('data', (chunk: string) => {
      out += chunk
      if (out.length > 200_000) out = out.slice(-200_000)
    })
    proc.on('error', () => finish([]))
    proc.on('close', () => finish(parseAgyModelsOutput(out)))
  })
}

/**
 * 一次 AGY 模型目录。实例由适配器持有。
 *
 * 生命周期:`list()` 永不触发 IO;`scheduleRefresh()` 最多同时跑一个后台刷新。
 */
export class AgyModelCatalog {
  /** 后台刷新得到的模型(undefined = 还没成功跑过)。 */
  private discovered: { id: string; name: string }[] | undefined
  /** 上一次刷新尝试的完成时间(失败也记,避免反复重排)。 */
  private refreshedAt = 0
  /** 进行中的刷新 Promise(并发去重)。 */
  private refreshing: Promise<void> | undefined
  /** 是否已经排过一次延迟刷新。 */
  private scheduled = false

  constructor(private readonly options: AgyCatalogOptions) {}

  /** 当前配置的默认模型 id。 */
  get configuredModel(): string {
    return readOption(this.options.model) ?? ''
  }

  /**
   * 列出模型(零 IO,立即返回)。
   * 顺序:当前配置的模型 → 内置表 → 后台刷新发现的新模型。
   * @param provider provider 路由名(必须是 `agy`)。
   * @returns 目录中的模型元数据。
   */
  list(provider: string): AgyCatalogModel[] {
    const ordered = new Map<string, AgyCatalogModel>()
    const configured = this.configuredModel
    if (configured !== '') {
      ordered.set(configured, {
        provider,
        id: configured,
        name: BUILTIN_NAME_BY_ID.get(configured) ?? configured,
        inputModalities: ['text', 'image'],
      })
    }
    for (const [id, name] of BUILTIN_AGY_MODELS) {
      if (ordered.has(id)) continue
      ordered.set(id, { provider, id, name, inputModalities: ['text', 'image'] })
    }
    for (const model of this.discovered ?? []) {
      if (ordered.has(model.id)) continue
      ordered.set(model.id, { provider, id: model.id, name: model.name, inputModalities: ['text', 'image'] })
    }
    return [...ordered.values()]
  }

  /**
   * 取某个模型的显示名(供 resolveModel 用;零 IO)。
   * @param id 模型 id。
   * @returns 显示名;未知 id 时回退为 id 本身。
   */
  displayName(id: string): string {
    const builtin = BUILTIN_NAME_BY_ID.get(id)
    if (builtin !== undefined) return builtin
    const discovered = (this.discovered ?? []).find((model) => model.id === id)
    return discovered !== undefined ? discovered.name : id
  }

  /**
   * 排一次后台刷新(异步,不阻塞)。
   * 首次延迟 FIRST_REFRESH_DELAY_MS 启动;REFRESH_TTL_MS 内不重复跑。
   */
  scheduleRefresh(): void {
    if (this.refreshing !== undefined) return
    if (this.refreshedAt !== 0 && Date.now() - this.refreshedAt < REFRESH_TTL_MS) return
    if (this.scheduled) return
    this.scheduled = true
    const timer = setTimeout(() => {
      this.scheduled = false
      void this.refresh()
    }, FIRST_REFRESH_DELAY_MS)
    // 后台任务不该拖住进程退出。
    if (typeof timer.unref === 'function') timer.unref()
  }

  /**
   * 立即跑一次刷新(异步;失败静默,保留现有目录)。
   * @returns 刷新完成即 resolve。
   */
  async refresh(): Promise<void> {
    if (this.refreshing !== undefined) return this.refreshing
    this.refreshing = this.runRefresh().finally(() => {
      this.refreshing = undefined
    })
    return this.refreshing
  }

  /** 真正执行 `agy models` 并写入发现结果。 */
  private async runRefresh(): Promise<void> {
    const models = await runAgyModels(this.options.command, this.options.proxy)
    if (models.length > 0) this.discovered = models
    // 失败也记时间:避免每次 list() 都重排刷新,把 agy 反复拖起来。
    this.refreshedAt = Date.now()
  }
}
