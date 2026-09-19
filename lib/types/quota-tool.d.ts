/**
 * AGY 账号剩余配额查询工具。
 * 允许主模型或子代理在对话中实时查询当前 AGY (Antigravity CLI) 账号剩余配额与 AI 积分。
 * @module llm-agy/quota-tool
 */
import type { Context } from '@deepseek-ai/cordis';
import { type AgyOptionValue } from './model-catalog.js';
/** 注册配额查询工具。 */
export declare function registerAgyQuotaTool(ctx: Context, options: {
    command: AgyOptionValue<string>;
    proxy?: AgyOptionValue<string>;
    toolName?: string;
}): void;
