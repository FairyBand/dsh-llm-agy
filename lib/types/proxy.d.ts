/**
 * AGY 代理解析:手动指定 / 探测系统代理 / 强制直连。
 *
 * `proxy` 配置项支持三种写法:
 *
 * - `auto`(默认)或留空:**探测系统代理**,探测不到就**直连**。
 *   ① 环境变量 `HTTPS_PROXY` / `https_proxy` / `HTTP_PROXY` / `http_proxy` /
 *      `ALL_PROXY` / `all_proxy`(取第一个非空的);
 *   ② 操作系统的 Internet 设置:Windows 注册表 Internet Settings 的
 *      `ProxyEnable` + `ProxyServer`;macOS 的 `scutil --proxy`。
 *   两者都没有 → **不注入任何代理**,直接交给本机网络(含 TUN)。
 * - `http://127.0.0.1:7897`(也接受 `127.0.0.1:7897`、`7897`):**手动指定**,
 *   原样注入,不做探测、不做改写。
 * - `off` / `none` / `direct`:**强制直连**,即使系统开着代理也不用。
 *
 * 明确**不做**的事:扫描本机常见代理端口(7897/7890/…)。那是猜测用户意图的
 * 隐式魔法 —— 猜中会掩盖"代理根本没配好"这个真实问题,猜错则静默走错出口。
 * 系统代理是标准信号:读到就用,读不到就是没有。没有代理时直接连,让 agy 自己
 * 去连(能连上说明本机网络/TUN 本来就通,连不上也该报网络错,而不是被一个来路
 * 不明的端口接管)。
 *
 * 为什么必须注入代理才能"不开 TUN 也连上 antigravity":agy 是 Go 程序,尊重
 * HTTPS_PROXY/HTTP_PROXY,注入后流量经代理(Clash 之类)按规则出门,不再依赖 TUN
 * 的透明劫持。实测(agy 1.2.2):HTTPS_PROXY 指向黑洞端口 127.0.0.1:1 时,`agy -p ...`
 * 立刻报 eligibility check 的 `proxyconnect ... refused`;指向 7897 时正常返回 `pong`。
 * 所以代理要么给对、要么不给 —— 绝不猜。
 *
 * 还有一条硬约束:**绝不阻塞事件循环**。插件跑在 dsh host 进程里,任何 spawnSync /
 * 同步等待都会冻结整个 GUI(工作目录、历史会话、模型目录、输入框全部排队)。
 * 因此读取注册表/`scutil` 一律用 `spawn`(异步 + 超时)。
 * @module llm-agy/proxy
 */
/** 一次代理解析的结果。 */
export interface AgyProxyResolution {
    /** 实际使用的代理地址;undefined 表示直连。 */
    url?: string;
    /** 来源:手动指定 / 环境变量 / 操作系统设置 / 直连。 */
    source: 'configured' | 'system-env' | 'system-os' | 'direct';
    /** 说明(配置值不可解析等;归因用)。 */
    note?: string;
}
/** 解析出的代理目标。 */
export interface AgyProxyTarget {
    host: string;
    port: number;
    url: string;
}
/**
 * 解析代理地址,返回 host/port 与规范化 URL。
 * @param value 形如 `http://127.0.0.1:7897` / `127.0.0.1:7897` / `7897` 的配置值。
 * @returns 解析结果;无法解析时为 undefined。
 */
export declare function parseProxyTarget(value: string | undefined): AgyProxyTarget | undefined;
/**
 * 解析本次 AGY 调用应当使用的代理(带缓存与并发去重)。
 * @param spec 设置面板/插件配置里的代理值;
 *   空或 `auto` = 探测系统代理(探测不到则直连),
 *   `off`/`none`/`direct` = 强制直连,
 *   其余按 URL 或 host:port 手动指定。
 * @returns `{ url, source, note }`;`url` 为 undefined 表示直连。
 */
export declare function resolveAgyProxy(spec: string | undefined): Promise<AgyProxyResolution>;
/**
 * 构造注入给 agy 子进程的代理环境变量。
 * agy 是 Go 程序,只认 HTTP_PROXY/HTTPS_PROXY/NO_PROXY(大小写均可),
 * ALL_PROXY 一并给出以覆盖将来可能换成别的 HTTP 客户端的版本。
 * @param url 代理地址;空表示直连。
 * @returns 需要合并进 env 的键值;直连时为 undefined。
 */
export declare function agyProxyEnv(url: string | undefined): Record<string, string> | undefined;
