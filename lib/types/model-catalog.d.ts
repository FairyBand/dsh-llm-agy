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
/** 一个配置项:字面值,或返回当前值的 getter(设置面板改动即时生效)。 */
export type AgyOptionValue<T> = T | (() => T);
/** 目录条目的展示元数据(与 dsh-llm 的目录条目结构对齐)。 */
export interface AgyCatalogModel {
    provider: string;
    id: string;
    name: string;
    inputModalities: string[];
}
/** 目录构造参数。 */
export interface AgyCatalogOptions {
    /** agy 可执行文件。 */
    command?: AgyOptionValue<string>;
    /** 当前配置的默认模型(会排在目录首位)。 */
    model?: AgyOptionValue<string>;
    /** 代理配置值(空/auto = 探测系统代理)。 */
    proxy?: AgyOptionValue<string>;
}
/** 内置模型表(实测 `agy models` 输出,agy 1.2.7;是否再传 --effort 见 effort.ts)。 */
export declare const BUILTIN_AGY_MODELS: ReadonlyArray<readonly [string, string]>;
/**
 * 取配置值:支持 getter 函数,这样设置面板里改模型/代理能即时生效(不必重启)。
 * @param value 配置值,或返回配置值的函数。
 * @returns 当前值。
 */
export declare function readOption<T>(value: AgyOptionValue<T> | undefined): T | undefined;
/**
 * 解析 `agy models` 输出为 id/name 列表。
 * 输出形如两列 `id\t显示名`;"Fetching available models..." 走 stderr,一并容忍。
 * @param out 合并后的 stdout 文本。
 * @returns 解析出的模型;无有效行时为空数组。
 */
export declare function parseAgyModelsOutput(out: unknown): {
    id: string;
    name: string;
}[];
/**
 * 跑一次 `agy models` 并解析结果(**全程异步,绝不阻塞事件循环**)。
 * 同时把代理解析结果注入子进程,保证关掉 TUN 后也能联网取到列表。
 * @param command agy 可执行文件(或返回它的函数)。
 * @param proxy 代理配置值(或返回它的函数)。
 * @returns 模型列表;失败/超时/无输出时为空数组。
 */
export declare function runAgyModels(command: AgyOptionValue<string> | undefined, proxy: AgyOptionValue<string> | undefined): Promise<{
    id: string;
    name: string;
}[]>;
/**
 * 一次 AGY 模型目录。实例由适配器持有。
 *
 * 生命周期:`list()` 永不触发 IO;`scheduleRefresh()` 最多同时跑一个后台刷新。
 */
export declare class AgyModelCatalog {
    private readonly options;
    /** 后台刷新得到的模型(undefined = 还没成功跑过)。 */
    private discovered;
    /** 上一次刷新尝试的完成时间(失败也记,避免反复重排)。 */
    private refreshedAt;
    /** 进行中的刷新 Promise(并发去重)。 */
    private refreshing;
    /** 是否已经排过一次延迟刷新。 */
    private scheduled;
    constructor(options: AgyCatalogOptions);
    /** 当前配置的默认模型 id。 */
    get configuredModel(): string;
    /**
     * 列出模型(零 IO,立即返回)。
     * 顺序:当前配置的模型 → 内置表 → 后台刷新发现的新模型。
     * @param provider provider 路由名(必须是 `agy`)。
     * @returns 目录中的模型元数据。
     */
    list(provider: string): AgyCatalogModel[];
    /**
     * 取某个模型的显示名(供 resolveModel 用;零 IO)。
     * @param id 模型 id。
     * @returns 显示名;未知 id 时回退为 id 本身。
     */
    displayName(id: string): string;
    /**
     * 排一次后台刷新(异步,不阻塞)。
     * 首次延迟 FIRST_REFRESH_DELAY_MS 启动;REFRESH_TTL_MS 内不重复跑。
     */
    scheduleRefresh(): void;
    /**
     * 立即跑一次刷新(异步;失败静默,保留现有目录)。
     * @returns 刷新完成即 resolve。
     */
    refresh(): Promise<void>;
    /** 真正执行 `agy models` 并写入发现结果。 */
    private runRefresh;
}
