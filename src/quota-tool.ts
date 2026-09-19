/**
 * AGY 账号剩余配额查询工具。
 * 允许主模型或子代理在对话中实时查询当前 AGY (Antigravity CLI) 账号剩余配额与 AI 积分。
 * @module llm-agy/quota-tool
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { runAgyQuota, formatQuotaSummaryMarkdown } from './quota.js'
import { type AgyOptionValue } from './model-catalog.js'

/** 注册配额查询工具。 */
export function registerAgyQuotaTool(
  ctx: Context,
  options: {
    command: AgyOptionValue<string>
    proxy?: AgyOptionValue<string>
    toolName?: string
  },
): void {
  const toolName = options.toolName ?? 'check_agy_quota'

  ctx.tools.register(defineTool({
    name: toolName,
    description:
      'Check the remaining quota, 5-hour/weekly usage limits, and AI credit balance for the currently logged-in '
      + 'Antigravity (AGY) account. Call this tool when the user asks about remaining Gemini usage, quota limits, '
      + 'credits balance, or refresh countdown.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    isConcurrencySafe: () => true,
    async execute() {
      const summary = await runAgyQuota(options.command, options.proxy, true)
      return formatQuotaSummaryMarkdown(summary)
    },
  }))
}
