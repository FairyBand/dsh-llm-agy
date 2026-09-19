/**
 * AGY 设置区:
 * - installSettingsSection 注册 `agy` namespace,设置面板自动出现 AntiGravity 配置表单。
 * - 模型探测通道:客户端面板按钮走 api.llm.discoverModels(状态/测试)。
 * @module llm-agy/settings
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { existsSync, readdirSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { spawn } from 'node:child_process'
import { runAgyModels } from './model-catalog.js'
import { resolveAgyProxy, agyProxyEnv } from './proxy.js'
import { runAgyQuota } from './quota.js'

export const AGY_SETTINGS_NAMESPACE = 'agy'

/** AGY 设置表单 schema(schemastery Schema;settings.register 会把 schema 当函数调用)。 */
export const AgySettingsConfig = z.object({
  command: z.string().default('agy').description('agy 可执行文件命令(默认 agy)'),
  model: z.string().default('gemini-3.7-flash-high').description('传给 --model 的 AGY 模型'),
  effort: z.string().default('high').description('推理强度 low/medium/high'),
  proxy: z.string().default('').description('AGY 流量代理。auto(默认)= 探测系统代理(环境变量 / Windows Internet 设置),探测不到则直连;也可手动填写,例如 http://127.0.0.1:7897;off = 强制直连'),
  /** 全局注入"子代理委派"系统提示(subagent_agy_ui 用途与委派规则)。 */
  delegationGuide: z.boolean().default(true).description('注入子代理委派提示词'),
  /** 是否注册 AGY 看图工具与图片粘贴中继(默认开启)。 */
  readImageAgy: z.boolean().default(true).description('使用 AGY 读取粘贴的图片'),
  /** 是否用 AGY 搜索接管全局 web_search 工具(默认开启);关闭时仅注册独立的 agy_web_search 工具。 */
  searchOverride: z.boolean().default(true).description('用 AGY 搜索接管全局 web_search 工具'),
})

/** 读取 readImageAgy 开关(默认开启)。 */
export function readImageAgyEnabled(ctx: Context): boolean {
  const settings = ctx.get('settings') as { get?: (ns: string) => { readImageAgy?: boolean } | undefined } | undefined
  return settings?.get?.('agy')?.readImageAgy ?? true
}

/** 读取 searchOverride 开关(默认开启):开 = 注册进全局 web 搜索缝,关 = 仅独立 agy_web_search 工具。 */
export function searchOverrideEnabled(ctx: Context): boolean {
  const settings = ctx.get('settings') as { get?: (ns: string) => { searchOverride?: boolean } | undefined } | undefined
  return settings?.get?.('agy')?.searchOverride ?? true
}

/** 后台校验得到的安装状态缓存。 */
const installedCache = new Map<string, boolean>()

/**
 * 检测 AGY 是否已安装(命令存在)。
 *
 * 同步接口但**不做同步 spawn**:绝对路径查文件存在即可(微秒级);否则乐观返回
 * true,交由 {@link agyInstalledAsync} 后台校验。原先的 spawnSync 会在 host 事件
 * 循环上起一个 agy 进程,是"打开设置/插件页卡住"的来源之一。
 */
export function agyInstalled(command: string): boolean {
  if (typeof command === 'string' && command.length > 0 && isAbsolute(command)) return existsSync(command)
  return installedCache.get(command) ?? true
}

/**
 * 异步校验命令可执行性(不阻塞事件循环)。
 * @param command agy 可执行文件。
 * @returns 校验结果;结果进缓存。
 */
export function agyInstalledAsync(command: string): Promise<boolean> {
  const cached = installedCache.get(command)
  if (cached !== undefined) return Promise.resolve(cached)
  return new Promise((resolve) => {
    let proc: ReturnType<typeof spawn>
    try {
      proc = spawn(command, ['--version'], { stdio: 'ignore', windowsHide: true })
    } catch {
      installedCache.set(command, false)
      resolve(false)
      return
    }
    const timer = setTimeout(() => { try { proc.kill() } catch { /* 已退出 */ } }, 15_000)
    if (typeof timer.unref === 'function') timer.unref()
    proc.on('error', () => { clearTimeout(timer); installedCache.set(command, false); resolve(false) })
    proc.on('close', (code) => {
      clearTimeout(timer)
      const ok = code === 0
      installedCache.set(command, ok)
      resolve(ok)
    })
  })
}

/**
 * 检测 AGY 登录状态。
 * 注意:`agy auth status` 不是有效命令(会挂起),不能用于检测。
 * 可靠依据:AGY 数据目录存在 + 已有会话记录(说明完成过登录与使用)。
 */
export function agyLoggedIn(): boolean {
  const base = join(process.env.USERPROFILE ?? '', '.gemini', 'antigravity-cli')
  if (!existsSync(base)) return false
  // 有会话记录 = 已登录使用过;cli.log 有成功活动也可佐证。
  const conversations = join(base, 'conversations')
  if (existsSync(conversations)) {
    try {
      return readdirSync(conversations).length > 0
    } catch { /* 目录读失败按未登录 */ }
  }
  return false
}

/**
 * 发起真实测试:让 AGY 回答一个真实问题,返回实际回复内容。
 *
 * 代理解析同样是异步的 —— 面板里的测试与实际对话走同一套代理注入逻辑,
 * 这样"面板测试通过但对话连不上"的错配不会再出现。
 */
export function agyTest(command: string, proxy: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    void (async () => {
      const proxyEnv = agyProxyEnv((await resolveAgyProxy(proxy)).url)
      const proc = spawn(command, [
        '-p', '请用一句简短的话回答:你好,请介绍一下你自己是谁?',
        '--output-format', 'text',
        '--print-timeout', '60m',
        '--dangerously-skip-permissions',
      ], {
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
        env: { ...process.env, ...proxyEnv ?? {} },
      })
      let out = ''
      proc.stdout?.setEncoding('utf8')
      proc.stdout?.on('data', (d: string) => { out += d })
      const killer = setTimeout(() => proc.kill(), 60_000)
      proc.on('close', (code: number | null) => {
        clearTimeout(killer)
        const text = out.trim()
        resolve({ ok: code === 0 && text.length > 0, output: text || `exit ${code}` })
      })
      proc.on('error', (err: Error) => {
        clearTimeout(killer)
        resolve({ ok: false, output: String(err) })
      })
    })()
  })
}

/** 注册设置区与模型探测通道(客户端面板按钮走 api.llm.discoverModels,不落会话)。 */
export function registerAgySettings(ctx: Context): () => Record<string, string> {
  let current: () => Record<string, unknown> = () => ({})
  // 官方 0.1.2:设置区经 ctx.settings.installSection 注册(NS 为普通字符串)。
  ctx.inject(['settings'], (settingsCtx) => {
    const settings = settingsCtx.get('settings') as {
      installSection?: (
        owner: Context,
        ns: string,
        schema: unknown,
        entry: unknown,
        hooks: { setSource?: (source: () => Record<string, unknown> | undefined) => void; onChange?: () => void },
      ) => void
    } | undefined
    settings?.installSection?.(ctx, AGY_SETTINGS_NAMESPACE, AgySettingsConfig, {}, {
      setSource: (source) => {
        current = (() => source() ?? {}) as () => Record<string, unknown>
      },
      onChange: () => {},
    })
  })
  const sectionOf = () => current() as Record<string, string>

  // 模型探测通道:客户端 api.llm.discoverModels({settingsNs:'agy', provider:'status'|'test'})
  // → 服务端直接 spawn agy CLI,返回结果(机制通用,语义伪装成 model 列表)。
  // 全程不落会话、不动源码。
  const llm = ctx.get('llm')
  if (llm !== undefined && typeof (llm as { registerModelDiscovery?: unknown }).registerModelDiscovery === 'function') {
    try {
    (llm as { registerModelDiscovery: (ns: string, fn: (request: { provider?: string }) => Promise<readonly { id: string; name?: string }[]>) => void })
      .registerModelDiscovery(AGY_SETTINGS_NAMESPACE, async (request: { provider?: string }) => {
        const section = sectionOf()
        const command = section.command ?? 'agy'
        // 空值 = 探测系统代理(见 proxy.ts);以前默认硬编码 7890,
      // 而本机常见的是 Clash Verge 的 7897,等于给 agy 指了一个死端口。
      const proxy = section.proxy ?? ''
        const action = request.provider ?? 'status'
        if (action === 'models') {
          // 列出 AGY 可用模型(**异步**:绝不同步阻塞 host 事件循环;
          // 旧实现 spawnSync 会冻结整个 GUI 约 6.5 秒)。
          const models = await runAgyModels(command, proxy)
          const entries = models.map((m) => ({ id: m.id, name: `${m.id}  ${m.name}` }))
          // 解析失败/无结果时回落到当前默认,避免弹窗空白。
          if (entries.length === 0) entries.push({ id: section.model, name: section.model })
          return entries
        }
        if (action === 'test') {
          const { ok, output } = await agyTest(command, proxy)
          return [{
            id: 'agy-test',
            // 展示 AGY 的真实回复内容(而非固定 hi);name 必须非空(客户端网关 min(1) 校验)。
            name: ok ? (output.slice(0, 300) || '(空回复)') : `✗ AGY 测试失败:${output.slice(0, 300)}`,
          }]
        }
        if (action === 'quota') {
          const quota = await runAgyQuota(command, proxy, true)
          return [{
            id: 'agy-quota',
            name: JSON.stringify(quota),
          }]
        }
        // 异步校验:不要在 discovery 回调里同步 spawn agy。
        const installed = await agyInstalledAsync(command)
        const loggedIn = installed && agyLoggedIn()
        let statusText = `AGY 安装:${installed ? '✓ 已安装' : '✗ 未安装'} | 登录状态:${installed ? (loggedIn ? '✓ 已登录' : '✗ 未登录') : '-'} | 命令:${command}`
        if (installed && loggedIn) {
          try {
            const quota = await runAgyQuota(command, proxy, false)
            if (quota.ok && quota.groups.length > 0) {
              const gemini = quota.groups.find((g) => g.name.toLowerCase().includes('gemini'))
              const b5h = gemini?.buckets.find((b) => b.window === '5h')
              const bWeek = gemini?.buckets.find((b) => b.window === 'weekly')
              if (b5h || bWeek) {
                const parts: string[] = []
                if (b5h) parts.push(`5h ${b5h.percentage}%`)
                if (bWeek) parts.push(`周 ${bWeek.percentage}%`)
                statusText += ` | Gemini配额:${parts.join(' / ')}`
              }
              if (quota.credits !== undefined) {
                statusText += ` | 积分:${quota.credits.remainingCredits}`
              }
            }
          } catch { /* 状态追加失败不影响主体 */ }
        }
        return [{
          id: 'agy-status',
          name: statusText,
        }]
      })
    } catch (error) {
      // llm-agy 可能被多个 ctx(realm)apply;llm 服务对已注册 discovery 抛
      // DUPLICATE_DISCOVERY,根 ctx 已注册时后续 ctx 跳过即可。
      if ((error as { code?: string })?.code !== 'DUPLICATE_DISCOVERY') throw error
    }
  }
  return sectionOf
}
