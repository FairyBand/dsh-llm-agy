/**
 * AGY 可用模型查询工具。
 *
 * AGY CLI 自带 `models` 子命令,输出 `id\t名称` 逐行(stdout);
 * "Fetching available models..." 等提示走 stderr,不影响解析。
 * 主代理先查询再以准确的 model id 委派。
 * @module llm-agy/models
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { runAgyModels } from './model-catalog.js';
/**
 * 解析 `agy models` 输出,返回模型 id + 名称列表文本。
 *
 * 异步实现:**绝不 spawnSync** —— 工具调用发生在 dsh host 进程里,同步等待
 * agy(实测 6.5 秒)会冻结整个 GUI。
 */
export async function listAgyModels(command, proxy) {
    const models = await runAgyModels(command, proxy);
    if (models.length === 0) {
        return `\`agy models\` returned nothing. 检查:agy 是否安装、是否已登录;`
            + `关掉 TUN 时,插件设置里的代理是否已配置(可填 http://127.0.0.1:7897,`
            + `留空则探测系统代理)。`;
    }
    return models.map((m) => `- ${m.id} — ${m.name}`).join('\n');
}
/** 注册模型查询工具(与 subagent_agy_ui 配套)。 */
export function registerAgyModelsTool(ctx, options) {
    ctx.tools.register(defineTool({
        name: options.toolName,
        description: 'List the model ids currently supported by the AGY (Antigravity) CLI. Call this before delegating when you '
            + 'want a non-default model, then pass one of the returned ids in the `model` argument of subagent_agy_ui.',
        parameters: {},
        output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
        },
        isConcurrencySafe: () => true,
        async execute() {
            return await listAgyModels(options.command, options.proxy);
        },
    }));
}
