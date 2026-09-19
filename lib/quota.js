/**
 * AGY (Antigravity) 账号用量与配额查询模块。
 *
 * 通过 `agy -p "/quota" --output-format json` 与 `agy -p "/credits" --output-format json`
 * 异步获取当前已登录账号的各模型组配额(5小时限额、每周限额)与 AI Credits 余额。
 * 全程异步 spawn,支持代理环境变量注入与短时间内存缓存。
 * @module llm-agy/quota
 */
import { spawn } from 'node:child_process';
import { resolveAgyProxy, agyProxyEnv } from './proxy.js';
import { readOption } from './model-catalog.js';
/**
 * 解析 `agy -p "/quota" --output-format json` 输出。
 * 兼容标准 JSON 结构与纯文本 tab 分隔 fallback。
 */
export function parseAgyQuotaOutput(raw) {
    const text = String(raw ?? '').trim();
    if (text.length === 0)
        return [];
    try {
        const parsed = JSON.parse(text);
        // 官方结构: parsed.command.data.groups
        const groupsData = parsed?.command?.data?.groups;
        if (Array.isArray(groupsData) && groupsData.length > 0) {
            return groupsData.map((g) => ({
                name: String(g.name ?? 'Unknown Group'),
                description: g.description ? String(g.description) : undefined,
                buckets: Array.isArray(g.buckets)
                    ? g.buckets.map((b) => {
                        const fraction = typeof b.remaining_fraction === 'number'
                            ? Math.max(0, Math.min(1, b.remaining_fraction))
                            : 1;
                        return {
                            id: String(b.id ?? ''),
                            name: String(b.name ?? ''),
                            description: b.description ? String(b.description) : undefined,
                            window: String(b.window ?? ''),
                            remainingFraction: fraction,
                            percentage: Math.round(fraction * 100),
                            resetTime: b.reset_time ? String(b.reset_time) : undefined,
                        };
                    })
                    : [],
            }));
        }
        // 若无 command.data.groups,尝试解析 response 字段文本
        if (typeof parsed?.response === 'string' && parsed.response.trim().length > 0) {
            return parseAgyQuotaText(parsed.response);
        }
    }
    catch {
        // 非合法 JSON,尝试作为纯文本行解析
        return parseAgyQuotaText(text);
    }
    return [];
}
/**
 * 解析制表符分隔的配额文本(如 `Gemini Models\tWeekly Limit Remaining\t99%\t2026-09-26T04:17:07Z`)。
 */
export function parseAgyQuotaText(text) {
    const groupMap = new Map();
    for (const line of text.split('\n')) {
        const parts = line.replace(/\r$/, '').split('\t').map((p) => p.trim());
        if (parts.length < 3)
            continue;
        const [groupName, bucketName, percentStr, resetTime] = parts;
        const match = percentStr.match(/(\d+)%/);
        const percentage = match ? parseInt(match[1], 10) : 100;
        const fraction = percentage / 100;
        const window = bucketName.toLowerCase().includes('5') || bucketName.toLowerCase().includes('five') ? '5h' : 'weekly';
        const bucket = {
            id: `${groupName}-${window}`.toLowerCase().replace(/\s+/g, '-'),
            name: bucketName,
            window,
            remainingFraction: fraction,
            percentage,
            resetTime: resetTime && resetTime.length > 0 ? resetTime : undefined,
        };
        const list = groupMap.get(groupName) ?? [];
        list.push(bucket);
        groupMap.set(groupName, list);
    }
    return Array.from(groupMap.entries()).map(([name, buckets]) => ({
        name,
        buckets,
    }));
}
/**
 * 解析 `agy -p "/credits" --output-format json` 输出。
 */
export function parseAgyCreditsOutput(raw) {
    const text = String(raw ?? '').trim();
    if (text.length === 0)
        return undefined;
    try {
        const parsed = JSON.parse(text);
        const creditsData = parsed?.command?.data;
        if (creditsData !== undefined && typeof creditsData.remaining_credits === 'number') {
            return {
                remainingCredits: creditsData.remaining_credits,
                upgradeUri: creditsData.upgrade_uri ? String(creditsData.upgrade_uri) : undefined,
            };
        }
        // fallback: response 文本
        if (typeof parsed?.response === 'string') {
            const match = parsed.response.match(/Remaining credits\s*(\d+)/i);
            if (match) {
                return {
                    remainingCredits: parseInt(match[1], 10),
                };
            }
        }
    }
    catch {
        const match = text.match(/Remaining credits\s*(\d+)/i);
        if (match) {
            return {
                remainingCredits: parseInt(match[1], 10),
            };
        }
    }
    return undefined;
}
/** 执行单个 agy -p 命令并获取输出(异步、带超时和代理解析)。 */
async function execAgyPrint(command, slashCmd, proxy) {
    let env = { ...process.env };
    try {
        const extra = agyProxyEnv((await resolveAgyProxy(proxy)).url);
        if (extra !== undefined)
            env = { ...env, ...extra };
    }
    catch { /* 忽略代理失败 */ }
    return new Promise((resolve, reject) => {
        let proc;
        try {
            proc = spawn(command, ['-p', slashCmd, '--output-format', 'json', '--print-timeout', '15s'], {
                stdio: ['ignore', 'pipe', 'ignore'],
                windowsHide: true,
                env,
            });
        }
        catch (e) {
            reject(e);
            return;
        }
        let out = '';
        let settled = false;
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            try {
                proc.kill();
            }
            catch { /* ignore */ }
            reject(new Error(`命令 agy -p "${slashCmd}" 执行超时(15s)`));
        }, 15_000);
        if (typeof timer.unref === 'function')
            timer.unref();
        proc.stdout?.setEncoding('utf8');
        proc.stdout?.on('data', (d) => {
            out += d;
            if (out.length > 500_000)
                out = out.slice(-500_000);
        });
        proc.on('error', (err) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            reject(err);
        });
        proc.on('close', (code) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            if (code === 0 || out.trim().length > 0) {
                resolve(out.trim());
            }
            else {
                reject(new Error(`命令退出码 ${code}`));
            }
        });
    });
}
/** 缓存配置:15 秒新鲜期,避免并发或频繁请求产生大量进程。 */
let cachedSummary;
let lastFetchTime = 0;
let inFlightPromise;
/**
 * 查询 AGY 当前已登录账号剩余用量(异步并发执行 /quota 与 /credits)。
 * @param command agy 命令路径。
 * @param proxy 代理设置。
 * @param forceRefresh 是否强制跳过缓存刷新。
 */
export async function runAgyQuota(commandValue, proxyValue, forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedSummary !== undefined && (now - lastFetchTime < 15_000)) {
        return cachedSummary;
    }
    if (inFlightPromise !== undefined) {
        return inFlightPromise;
    }
    const command = readOption(commandValue) ?? 'agy';
    const proxy = readOption(proxyValue) ?? '';
    inFlightPromise = (async () => {
        try {
            const [quotaRaw, creditsRaw] = await Promise.allSettled([
                execAgyPrint(command, '/quota', proxy),
                execAgyPrint(command, '/credits', proxy),
            ]);
            if (quotaRaw.status === 'rejected') {
                const errorMsg = String(quotaRaw.reason?.message ?? quotaRaw.reason);
                const res = {
                    ok: false,
                    updatedAt: Date.now(),
                    groups: [],
                    error: `获取配额失败: ${errorMsg}`,
                };
                return res;
            }
            const groups = parseAgyQuotaOutput(quotaRaw.value);
            const credits = creditsRaw.status === 'fulfilled' ? parseAgyCreditsOutput(creditsRaw.value) : undefined;
            const result = {
                ok: groups.length > 0,
                updatedAt: Date.now(),
                groups,
                credits,
                rawText: quotaRaw.value,
            };
            cachedSummary = result;
            lastFetchTime = Date.now();
            return result;
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return {
                ok: false,
                updatedAt: Date.now(),
                groups: [],
                error: `获取配额异常: ${msg}`,
            };
        }
        finally {
            inFlightPromise = undefined;
        }
    })();
    return inFlightPromise;
}
/**
 * 格式化配额摘要为人类可读的 Markdown 文本(用于对话回复或工具返回)。
 */
export function formatQuotaSummaryMarkdown(summary) {
    if (!summary.ok) {
        return `**AGY 账号用量查询失败**: ${summary.error ?? '未返回有效配额数据'}\n\n*提示: 请确认已在系统终端运行 \`agy\` 登录 Google 账号,并检查插件设置中的代理配置。*`;
    }
    const lines = ['### AGY 当前账号剩余配额与用量'];
    for (const group of summary.groups) {
        lines.push(`\n#### ${group.name}`);
        if (group.description) {
            lines.push(`*${group.description}*`);
        }
        for (const b of group.buckets) {
            const timeInfo = b.resetTime ? ` (重置时间: ${b.resetTime})` : '';
            const descInfo = b.description ? `\n  - 详细: ${b.description}` : '';
            lines.push(`- **${b.name}**: **${b.percentage}%** 剩余${timeInfo}${descInfo}`);
        }
    }
    if (summary.credits !== undefined) {
        lines.push('\n#### AI Credits');
        lines.push(`- **剩余积分**: **${summary.credits.remainingCredits}** 点`);
        if (summary.credits.upgradeUri) {
            lines.push(`- **升级/购买**: [${summary.credits.upgradeUri}](${summary.credits.upgradeUri})`);
        }
    }
    const dateStr = new Date(summary.updatedAt).toLocaleString();
    lines.push(`\n*更新时间: ${dateStr}*`);
    return lines.join('\n');
}
