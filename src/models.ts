/**
 * AGY 可用模型查询工具。
 *
 * AGY CLI 自带 `models` 子命令,输出 `id\t名称` 逐行(stdout);
 * "Fetching available models..." 等提示走 stderr,不影响解析。
 * 主代理先查询再以准确的 model id 委派。
 *
 * 注意实现是**异步**的:`agy models` 实测要 6.5 秒(需联网),用 spawnSync 会
 * 把 dsh host 的事件循环冻住,连带卡死整个 GUI。
 * @module llm-agy/models
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { runAgyModels, readOption, type AgyOptionValue } from './model-catalog.js'

/**
 * 解析 `agy models` 输出,返回模型 id + 名称列表文本。
 * @param command agy 可执行文件(或返回它的 getter)。
 * @param proxy 代理配置值(或返回它的 getter);空值表示探测系统代理。
 * @returns 供工具展示的文本。
 */
export async function listAgyModels(
  command: AgyOptionValue<string> | undefined,
  proxy?: AgyOptionValue<string>,
): Promise<string> {
  const models = await runAgyModels(command, proxy)
  if (models.length === 0) {
    return '`agy models` returned nothing. 检查:agy 是否安装、是否已登录;'
      + '关掉 TUN 时,插件设置里的代理是否已配置(可填 http://127.0.0.1:7897,'
      + '留空则探测系统代理)。'
  }
  return models.map((m) => `- ${m.id} — ${m.name}`).join('\n')
}

/** 注册模型查询工具(与 subagent_agy_ui 配套)。 */
export function registerAgyModelsTool(
  ctx: Context,
  options: {
    command: AgyOptionValue<string>
    proxy?: AgyOptionValue<string>
    toolName: string
  },
): void {
  ctx.tools.register(defineTool({
    name: options.toolName,
    description:
      'List the model ids currently supported by the AGY (Antigravity) CLI. Call this before delegating when you '
      + 'want a non-default model, then pass one of the returned ids in the `model` argument of subagent_agy_ui.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    isConcurrencySafe: () => true,
    async execute() {
      // 实时读取配置:设置面板改了命令/代理,这里立刻跟上。
      return await listAgyModels(options.command, readOption(options.proxy))
    },
  }))
}
