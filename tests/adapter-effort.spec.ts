/**
 * 适配器 `--effort` 参数回归测试。
 *
 * AGY 的 `--effort` 是**逐模型**能力,传错模型必然在会话启动前被拒(用户实测
 * `claude-opus-4-6-thinking`:`invalid model selection ... --effort is not
 * supported for model ...`)。因此适配器必须:
 *   1. Claude 这类不支持 effort 的模型不传 `--effort`;
 *   2. 能力表未覆盖的模型照常传;
 *   3. 一旦仍被 AGY 拒绝,记住该模型、去掉参数重跑一次,且**不消耗重试次数**。
 */
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { AgyLlmAdapter } from '../src/adapter.ts'
import { resetEffortSupportCache } from '../src/effort.ts'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, spawn: vi.fn() }
})

const { spawn } = await import('node:child_process')
const mockedSpawn = vi.mocked(spawn)

/** 假 AGY 进程:stdout 立即可读为给定行,读完即 EOF,进程视为已退出(code 0)。 */
function fakeProc(lines: string[]): EventEmitter & Record<string, unknown> {
  const proc = new EventEmitter() as EventEmitter & Record<string, unknown>
  proc.stdout = Readable.from(lines.map(line => `${line}\n`))
  proc.stderr = undefined
  proc.pid = 777
  proc.exitCode = 0
  proc.signalCode = null
  proc.kill = vi.fn()
  return proc
}

const STEP_DELTA_OK = JSON.stringify({ event: 'step_update', step_update: { text_delta: 'ok' } })
const RESULT_OK = JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'ok' } })
/** 真实成功流:先流式文本,再 result 终局事件。 */
const OK_STREAM = [STEP_DELTA_OK, RESULT_OK]
const RESULT_EFFORT_REJECTED = JSON.stringify({
  event: 'result',
  result: {
    status: 'ERROR',
    error: 'invalid model selection (--model "claude-opus-4-6-thinking" --effort "high"): '
      + '--effort is not supported for model "claude-opus-4-6-thinking"',
  },
})

const ctx = { get: () => undefined } as unknown as Context

function makeAdapter(model: string, maxAttempts?: number): AgyLlmAdapter {
  return new AgyLlmAdapter(ctx, {
    command: 'agy',
    model,
    effort: 'high',
    extraArgs: [],
    // 强制直连:跳过系统代理探测(读注册表,最长 3 秒),用例保持毫秒级。
    proxy: 'off',
    ...maxAttempts !== undefined ? { maxAttempts } : {},
  })
}

function options(model: string): GenerateOptions {
  return {
    provider: 'agy',
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  } as unknown as GenerateOptions
}

async function drain(gen: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of gen) chunks.push(chunk)
  return chunks
}

/**
 * 所有经 spawn 启动 **agy** 的调用参数。
 * 只按命令名筛选:mock 是模块级的,vite/vitest 自身也可能调用 node:child_process.spawn。
 */
function agyCalls(): string[][] {
  return mockedSpawn.mock.calls
    .filter(call => call[0] === 'agy')
    .map(call => (call[1] ?? []) as string[])
}

/** 第 n 次 agy 调用传给 agy 的参数数组。 */
function spawnedArgs(call = 0): string[] {
  return agyCalls()[call] ?? []
}

describe('AgyLlmAdapter:--effort 与模型能力匹配', () => {
  beforeEach(() => {
    resetEffortSupportCache()
    mockedSpawn.mockReset()
  })

  it('Claude 模型不传 --effort(AGY 不支持,传了必然被拒)', async () => {
    mockedSpawn.mockImplementation(() => fakeProc(OK_STREAM) as never)
    const chunks = await drain(makeAdapter('claude-opus-4-6-thinking').stream(options('claude-opus-4-6-thinking')))
    const args = spawnedArgs()
    expect(args).toContain('--model')
    expect(args).toContain('claude-opus-4-6-thinking')
    expect(args).not.toContain('--effort')
    expect(JSON.stringify(chunks)).toContain('ok')
  })

  it('能力表未覆盖的模型照常把配置的 effort 传给 AGY', async () => {
    mockedSpawn.mockImplementation(() => fakeProc(OK_STREAM) as never)
    await drain(makeAdapter('gemini-4.0-pro').stream(options('gemini-4.0-pro')))
    const args = spawnedArgs()
    expect(args[args.indexOf('--effort') + 1]).toBe('high')
  })

  it('被 AGY 拒绝 effort 时去掉参数重跑,且不消耗重试次数(maxAttempts=1 仍会重跑)', async () => {
    mockedSpawn
      .mockImplementationOnce(() => fakeProc([RESULT_EFFORT_REJECTED]) as never)
      .mockImplementationOnce(() => fakeProc(OK_STREAM) as never)
    const chunks = await drain(makeAdapter('gemini-4.0-pro', 1).stream(options('gemini-4.0-pro')))
    expect(agyCalls()).toHaveLength(2)
    expect(spawnedArgs(0)).toContain('--effort')
    expect(spawnedArgs(1)).not.toContain('--effort')
    // 重跑成功后按正常结果收尾,而不是把 effort 拒绝报成任务失败。
    expect(JSON.stringify(chunks)).toContain('ok')
  })
})
