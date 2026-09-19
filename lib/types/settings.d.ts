/**
 * AGY 设置区:
 * - installSettingsSection 注册 `agy` namespace,设置面板自动出现 AntiGravity 配置表单。
 * - 模型探测通道:客户端面板按钮走 api.llm.discoverModels(状态/测试)。
 * @module llm-agy/settings
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const AGY_SETTINGS_NAMESPACE = "agy";
/** AGY 设置表单 schema(schemastery Schema;settings.register 会把 schema 当函数调用)。 */
export declare const AgySettingsConfig: any;
/** 读取 readImageAgy 开关(默认开启)。 */
export declare function readImageAgyEnabled(ctx: Context): boolean;
/** 读取 searchOverride 开关(默认开启):开 = 注册进全局 web 搜索缝,关 = 仅独立 agy_web_search 工具。 */
export declare function searchOverrideEnabled(ctx: Context): boolean;
/**
 * 检测 AGY 是否已安装(命令存在)。
 *
 * 同步接口但**不做同步 spawn**:绝对路径查文件存在即可(微秒级);否则乐观返回
 * true,交由 {@link agyInstalledAsync} 后台校验。原先的 spawnSync 会在 host 事件
 * 循环上起一个 agy 进程,是"打开设置/插件页卡住"的来源之一。
 */
export declare function agyInstalled(command: string): boolean;
/**
 * 异步校验命令可执行性(不阻塞事件循环)。
 * @param command agy 可执行文件。
 * @returns 校验结果;结果进缓存。
 */
export declare function agyInstalledAsync(command: string): Promise<boolean>;
/**
 * 检测 AGY 登录状态。
 * 注意:`agy auth status` 不是有效命令(会挂起),不能用于检测。
 * 可靠依据:AGY 数据目录存在 + 已有会话记录(说明完成过登录与使用)。
 */
export declare function agyLoggedIn(): boolean;
/**
 * 发起真实测试:让 AGY 回答一个真实问题,返回实际回复内容。
 *
 * 代理解析同样是异步的 —— 面板里的测试与实际对话走同一套代理注入逻辑,
 * 这样"面板测试通过但对话连不上"的错配不会再出现。
 */
export declare function agyTest(command: string, proxy: string): Promise<{
    ok: boolean;
    output: string;
}>;
/** 注册设置区与模型探测通道(客户端面板按钮走 api.llm.discoverModels,不落会话)。 */
export declare function registerAgySettings(ctx: Context): () => Record<string, string>;
