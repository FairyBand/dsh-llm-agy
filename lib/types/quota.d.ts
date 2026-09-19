/**
 * AGY (Antigravity) 账号用量与配额查询模块。
 *
 * 通过 `agy -p "/quota" --output-format json` 与 `agy -p "/credits" --output-format json`
 * 异步获取当前已登录账号的各模型组配额(5小时限额、每周限额)与 AI Credits 余额。
 * 全程异步 spawn,支持代理环境变量注入与短时间内存缓存。
 * @module llm-agy/quota
 */
import { type AgyOptionValue } from './model-catalog.js';
/** 单个配额窗口(如 5小时限额、每周限额)。 */
export interface AgyQuotaBucket {
    id: string;
    name: string;
    description?: string;
    window: string;
    remainingFraction: number;
    percentage: number;
    resetTime?: string;
}
/** 模型组配额(如 Gemini Models、Claude and GPT models)。 */
export interface AgyQuotaGroup {
    name: string;
    description?: string;
    buckets: AgyQuotaBucket[];
}
/** AI 积分余额与升级链接。 */
export interface AgyCreditsInfo {
    remainingCredits: number;
    upgradeUri?: string;
}
/** 结构化配额汇总结果。 */
export interface AgyQuotaSummary {
    ok: boolean;
    updatedAt: number;
    groups: AgyQuotaGroup[];
    credits?: AgyCreditsInfo;
    error?: string;
    rawText?: string;
}
/**
 * 解析 `agy -p "/quota" --output-format json` 输出。
 * 兼容标准 JSON 结构与纯文本 tab 分隔 fallback。
 */
export declare function parseAgyQuotaOutput(raw: string): AgyQuotaGroup[];
/**
 * 解析制表符分隔的配额文本(如 `Gemini Models\tWeekly Limit Remaining\t99%\t2026-09-26T04:17:07Z`)。
 */
export declare function parseAgyQuotaText(text: string): AgyQuotaGroup[];
/**
 * 解析 `agy -p "/credits" --output-format json` 输出。
 */
export declare function parseAgyCreditsOutput(raw: string): AgyCreditsInfo | undefined;
/**
 * 查询 AGY 当前已登录账号剩余用量(异步并发执行 /quota 与 /credits)。
 * @param command agy 命令路径。
 * @param proxy 代理设置。
 * @param forceRefresh 是否强制跳过缓存刷新。
 */
export declare function runAgyQuota(commandValue?: AgyOptionValue<string>, proxyValue?: AgyOptionValue<string>, forceRefresh?: boolean): Promise<AgyQuotaSummary>;
/**
 * 格式化配额摘要为人类可读的 Markdown 文本(用于对话回复或工具返回)。
 */
export declare function formatQuotaSummaryMarkdown(summary: AgyQuotaSummary): string;
