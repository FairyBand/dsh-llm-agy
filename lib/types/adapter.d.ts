/**
 * AGY 模型适配器:provider 路由 'agy'。
 * 对齐 llm-deepseek/adapter.ts 的结构:LLM 适配器负责 spawn 上游 + 用翻译模块
 * 产出 StreamChunk;工具步骤落地为会话事件(tool/call + tool/result)。
 * @module llm-agy/adapter
 */
import type { Context } from '@deepseek-ai/cordis';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';
import { type AgyOptionValue } from './model-catalog.js';
/** 适配器配置(由 index.ts 传入)。 */
export interface AgyAdapterOptions {
    /** agy 可执行文件;可为 getter,设置面板改动即时生效。 */
    command: AgyOptionValue<string>;
    /** 默认模型;可为 getter。 */
    model: AgyOptionValue<string>;
    /** 推理强度;可为 getter。 */
    effort: AgyOptionValue<string>;
    extraArgs: string[];
    /**
     * AGY 资格检查/API 流量代理。留空或 `auto` = 探测系统代理,探测不到则直连;
     * 填入 http://host:port 即为手动指定(关掉 TUN 时靠它把流量交给代理 ——
     * agy 是 Go 程序,读取 HTTPS_PROXY);`off`/`none`/`direct` = 强制直连;也可为 getter。
     */
    proxy?: AgyOptionValue<string>;
    /** 启动级失败重试次数。 */
    maxAttempts?: number;
    /** 启动级失败重试间隔(毫秒)。 */
    retryDelayMs?: number;
    /**
     * 兼容旧配置:无输出兜底时长(ms,默认 10 分钟),作为动态空闲阈值的上限。
     * 动态阈值参数见 {@link AgyAdapterOptions.timeouts}。
     */
    stallTimeoutMs?: number;
    /**
     * 动态空闲超时预算(默认见 {@link DEFAULT_AGY_RUN_TIMEOUTS}):热身行数内
     * 一律 idleMaxMs 宽容,样本足够后阈值 = clamp(历史最大行间隔 × factor,
     * idleMinMs, idleMaxMs)。无总时长上限——有 stdout 行就永远续期。
     */
    timeouts?: {
        firstMs?: number;
        idleMinMs?: number;
        idleMaxMs?: number;
        idleFactor?: number;
        idleWarmupLines?: number;
    };
}
/**
 * AGY 模型适配器。stream() 每次调用:
 * 序列化 prompt → spawn agy -p → 逐行翻译为 StreamChunk(实时) →
 * 工具步骤落地为会话事件 → usage/finish 收尾。
 */
export declare class AgyLlmAdapter extends LlmAdapter {
    private readonly ctx;
    private readonly options;
    /**
     * 模型目录:listModels() 只读它(零 IO),发现走后台异步刷新。
     * 目录构建位于 GUI 启动必经路径上,这里绝不允许出现同步 IO ——
     * 曾因 listModels() 里 spawnSync("agy models") 冻结 host 6.5 秒,
     * 导致工作目录/历史会话/模型列表/输入框全部排队等待。
     */
    private readonly catalog;
    constructor(ctx: Context, options: AgyAdapterOptions);
    /**
     * 绑定模型元数据与分发流入口(rc.2+ 的 LlmAdapter 接口)。
     * 显式实现而非依赖基类:插件对宿主 dsh-llm 版本保持兼容
     * (rc.6 宿主不调用此方法;rc.2+ 宿主调用本实现)。
     */
    prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<{
        model: LlmResolvedModelInfo;
        stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>;
    }>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    /** 提供商展示信息(模型选择器 / 提供商列表里的名字)。 */
    providerInfo(provider: string): {
        id: string;
        name: string;
    };
    /**
     * 模型目录(**零 IO,立即返回**)。
     *
     * 基类 `LlmAdapter.listModels()` 默认返回空数组;不覆盖它,provider `agy`
     * 在模型选择器里就永远是"零个模型",而 buildModelCatalog() 会把空分组整个
     * 过滤掉 —— 于是连 agy 分组都不出现,这正是"工作区里选不到 agy 的 Gemini
     * 模型"的直接原因。
     *
     * **不得引入任何同步 IO**:本方法在 GUI 启动必经路径上被调用,旧的
     * spawnSync("agy models") 实现会冻结 host 事件循环 6.5 秒。
     * 目录来自内置表 + 后台异步刷新的缓存。
     */
    listModels(provider: string): Promise<LlmResolvedModelInfo[]>;
    resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
}
