/**
 * AGY `--effort` 的模型级兼容判定。
 *
 * **背景**:AGY 的 `--effort low|medium|high` 是逐模型能力,不是全局开关。把
 * `--effort` 传给不支持的模型时,CLI 在**会话启动前的参数校验**阶段就直接拒绝
 * (实测 agy 1.2.7:约 7 秒返回、0 token、不产生会话、没有任何工具副作用):
 *
 * - Claude 全系:`--effort is not supported for model "claude-opus-4-6-thinking"`
 *   (`claude-opus-4-6-thinking` / `claude-sonnet-4-6` 实测均被拒);
 * - 模型 id 自带档位的 GPT-OSS:`--model gpt-oss-120b-medium conflicts with --effort=high`;
 * - 去掉 `--effort` 后两者都正常(实测 SUCCESS)。
 *
 * 而 Gemini 系列(如 `gemini-3.1-pro-high`)当前接受 `--effort`,档位后缀即模型
 * 选型的一部分 —— 是否再传 `--effort` 由下面的规则决定。
 *
 * 判定顺序:
 * 1. 模型 id 自带档位后缀(`-low` / `-medium` / `-high`):档位已由模型名固定,
 *    省略 `--effort`(同时天然规避 GPT-OSS 那类 conflict 拒绝);
 * 2. 实测不支持 `--effort` 的模型家族(Claude / GPT-OSS):省略;
 * 3. 其它模型照常传,一旦收到上面两种拒绝,就把该模型记入"不传 effort"缓存并
 *    去掉参数重跑 —— 拒绝发生在任何实际工作之前,重跑安全,且不计入重试次数。
 *
 * 第 3 条让未来 AGY 新增/变更模型时也能自愈:最坏多花一次 7 秒的快速失败。
 * @module llm-agy/effort
 */
/**
 * 该模型的 `--effort` 参数是否应该传给 AGY。
 *
 * @param model 本次请求的模型 id(`undefined`/空 = 不传 `--model`,用 AGY 默认模型)。
 * @param effort 配置的推理强度(`undefined`/空 = 用户没配,不必传)。
 * @returns 需要把 `--effort <effort>` 追加到命令行时为 true。
 */
export declare function shouldPassEffort(model: string | undefined, effort: string | undefined): boolean;
/**
 * 记住"该模型不接受 --effort":同一进程内后续调用直接省略该参数,不再白撞一次拒绝。
 * @param model 被 AGY 拒绝的模型 id。
 */
export declare function rememberEffortUnsupported(model: string | undefined): void;
/**
 * 该模型是否已被记为不支持 `--effort`(诊断/测试用)。
 * @param model 模型 id。
 */
export declare function isEffortUnsupported(model: string | undefined): boolean;
/**
 * 判断 AGY 的报错是不是 `--effort` 参数校验拒绝。
 * @param message AGY 返回的错误文本(如 `translator.resultError`)。
 */
export declare function isEffortRejection(message: string | undefined): boolean;
/** 清空运行时记忆(仅测试用;生产路径不应调用)。 */
export declare function resetEffortSupportCache(): void;
