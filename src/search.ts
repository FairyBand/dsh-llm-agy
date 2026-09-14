/**
 * AGY 搜索 provider:`search_web_agy` 工具的执行后端。
 *
 * - available() 只做本地可用性检查(不联网,且**不阻塞事件循环**);
 * - search() 经公共执行器跑一次 AGY 深度调研,解析 result.response 提取 sources。
 *
 * 限制(实测):
 * - AGY 的 search_web 不通过 stream-json 暴露结构化结果(tool_info.output 为空),
 *   只有 result.response 里是模型总结后的文本,需正则提取 URL/标题;
 * - 返回的 URL 是 Google Vertex AI grounding 重定向链接(可点击,非原始 URL);
 * - 每次搜索 = 一次完整 AGY 调用(约 34K input tokens / 5-10 秒)。
 * @module llm-agy/search
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import { runAgyText } from './agy-run.js'

/** AGY 搜索结果响应里提取 URL(标题行常见 `**标题**: thepaper.cn` / `**URL**: https://...`)。 */
const URL_RE = /https?:\/\/[^\s\)\]\}<>"']+/g

/** 提取一段响应文本中的标题。尝试从 `标题[：:]\s*(\S+)` 取。 */
function titleOf(line: string, url: string): string | undefined {
  const m = line.match(/[标题|title][：:]\s*([^\n|]+)/i)
  if (m) {
    const t = m[1].trim()
    if (t.length > 0 && t !== url) return t
  }
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

/** AGY 搜索 provider 配置(复用 llm-agy 的 AGY 参数)。 */
export interface AgySearchOptions {
  command: string
  model: string
  effort: string
  proxy?: string
  /**
   * 超时预算(可选)。生产用执行器默认(动态空闲阈值/无总时长上限);
   * 测试注入小值以便压缩时间。
   */
  timeouts?: { firstMs?: number; idleMinMs?: number; idleMaxMs?: number; idleFactor?: number }
}

/**
 * 一个 AGY 搜索 provider。
 * search() 通过 spawn `agy -p "搜索 <query>"` 执行,解析 result.response 为 sources。
 */
export class AgySearchProvider implements WebSearchProvider {
  readonly id = 'agy'

  /** 命令可用性缓存(undefined = 尚未后台校验)。 */
  private availableCache: boolean | undefined
  /** 是否已有一次后台校验在跑。 */
  private verifying = false

  constructor(private readonly options: AgySearchOptions) {}

  /**
   * 本地可用性(**同步接口,绝不能阻塞**)。
   *
   * 原先这里 `spawnSync(command, ['--version'])` 会同步起一个 agy 进程,而
   * `ctx.web` 在每次搜索/提供商解析时都要调 `available()` —— 等于把 host 事件
   * 循环反复冻住。现在:绝对路径直接查文件存在(微秒级);否则乐观返回 true,
   * 由后台异步校验并缓存结果。
   */
  available(): boolean {
    const command = this.options.command
    if (typeof command === 'string' && isAbsolute(command)) {
      const exists = existsSync(command)
      this.availableCache = exists
      return exists
    }
    if (this.availableCache === undefined) {
      this.verifyAvailable()
      // 校验还没回来:别让 web 搜索因为一次探测就被判成不可用。
      return true
    }
    return this.availableCache
  }

  /** 后台异步校验命令可执行性(不阻塞事件循环)。 */
  private verifyAvailable(): void {
    if (this.verifying) return
    this.verifying = true
    try {
      const proc = spawn(this.options.command, ['--version'], { stdio: 'ignore', windowsHide: true })
      const timer = setTimeout(() => { try { proc.kill() } catch { /* 已退出 */ } }, 15_000)
      if (typeof timer.unref === 'function') timer.unref()
      proc.on('error', () => {
        clearTimeout(timer)
        this.availableCache = false
        this.verifying = false
      })
      proc.on('close', (code) => {
        clearTimeout(timer)
        this.availableCache = code === 0
        this.verifying = false
      })
    } catch {
      this.availableCache = false
      this.verifying = false
    }
  }

  /** 执行一次 AGY 搜索。 */
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const query = request.query
    // AGY 是完整 agent:给它正常任务,它会自己调用 search_web 搜索、打开
    // 来源阅读全文,并综合提取总结。语言跟随用户提问,不固定。
    const prompt = `搜索:"${query}",综合所有相关来源,给出完整、准确、详尽的回答,并在回答中引用来源。`

    const resultText = await runAgyText({
      command: this.options.command,
      prompt,
      proxy: this.options.proxy,
      model: this.options.model,
      effort: this.options.effort,
      signal,
      timeouts: this.options.timeouts,
    })

    // 从回答中提取引用的来源 URL 作为 sources(回答全文为 content)。
    const sources: WebSearchSource[] = []
    const seen = new Set<string>()
    for (const line of resultText.split(/\r?\n/)) {
      const urls = line.match(URL_RE) ?? []
      for (const url of urls) {
        if (seen.has(url)) continue
        seen.add(url)
        const title = titleOf(line, url)
        sources.push({ url, ...(title !== undefined ? { title } : {}) })
      }
    }

    return {
      sources,
      truncated: false,
      content: resultText,
    }
  }
}
