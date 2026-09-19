import { describe, expect, it } from 'vitest'
import {
  parseAgyQuotaOutput,
  parseAgyQuotaText,
  parseAgyCreditsOutput,
  formatQuotaSummaryMarkdown,
  type AgyQuotaSummary,
} from '../src/quota.ts'

describe('AGY Quota 与用量解析模块', () => {
  const sampleJsonOutput = JSON.stringify({
    conversation_id: '',
    status: 'SUCCESS',
    response: 'Gemini Models\tWeekly Limit Remaining\t99%\t2026-09-26T04:17:07Z\nGemini Models\tFive Hour Limit Remaining\t96%\t2026-09-19T09:17:07Z\nClaude and GPT models\tWeekly Limit Remaining\t100%\t2026-09-26T05:18:26Z\n',
    command: {
      name: 'usage',
      data: {
        description: 'Quota is consumed proportionally to the cost of the tokens.',
        groups: [
          {
            name: 'Gemini Models',
            description: 'Models within this group: Gemini Flash, Gemini Pro',
            buckets: [
              {
                id: 'gemini-weekly',
                name: 'Weekly Limit Remaining',
                description: 'You have used some of your weekly limit, it will fully refresh in 6 days, 22 hours.',
                window: 'weekly',
                remaining_fraction: 0.9922435879707336,
                reset_time: '2026-09-26T04:17:07Z',
              },
              {
                id: 'gemini-5h',
                name: 'Five Hour Limit Remaining',
                description: 'You have used some of your 5-hour limit, it will fully refresh in 3 hours, 58 minutes.',
                window: '5h',
                remaining_fraction: 0.959291398525238,
                reset_time: '2026-09-19T09:17:07Z',
              },
            ],
          },
          {
            name: 'Claude and GPT models',
            description: 'Models within this group: Claude Opus, Claude Sonnet, GPT-OSS',
            buckets: [
              {
                id: '3p-weekly',
                name: 'Weekly Limit Remaining',
                window: 'weekly',
                remaining_fraction: 1,
                reset_time: '2026-09-26T05:18:26Z',
              },
            ],
          },
        ],
      },
    },
  })

  it('正确解析标准的 agy /quota JSON 输出', () => {
    const groups = parseAgyQuotaOutput(sampleJsonOutput)
    expect(groups).toHaveLength(2)

    const gemini = groups[0]
    expect(gemini.name).toBe('Gemini Models')
    expect(gemini.buckets).toHaveLength(2)

    const weekly = gemini.buckets[0]
    expect(weekly.id).toBe('gemini-weekly')
    expect(weekly.percentage).toBe(99)
    expect(weekly.resetTime).toBe('2026-09-26T04:17:07Z')

    const fiveHour = gemini.buckets[1]
    expect(fiveHour.id).toBe('gemini-5h')
    expect(fiveHour.percentage).toBe(96)
  })

  it('当 JSON 缺失 command.data 时优雅 fallback 到 response 制表符文本解析', () => {
    const fallbackJson = JSON.stringify({
      status: 'SUCCESS',
      response: 'Gemini Models\tWeekly Limit Remaining\t85%\t2026-09-26T04:00:00Z\nGemini Models\tFive Hour Limit Remaining\t70%\t2026-09-19T09:00:00Z\n',
    })
    const groups = parseAgyQuotaOutput(fallbackJson)
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Gemini Models')
    expect(groups[0].buckets).toHaveLength(2)
    expect(groups[0].buckets[0].percentage).toBe(85)
    expect(groups[0].buckets[1].percentage).toBe(70)
  })

  it('支持直接解析裸制表符文本', () => {
    const rawText = 'Claude and GPT models\tWeekly Limit Remaining\t100%\t2026-09-26T05:18:26Z'
    const groups = parseAgyQuotaText(rawText)
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Claude and GPT models')
    expect(groups[0].buckets[0].percentage).toBe(100)
  })

  it('正确解析 agy /credits 输出', () => {
    const creditsJson = JSON.stringify({
      status: 'SUCCESS',
      command: {
        name: 'credits',
        data: {
          remaining_credits: 42,
          upgrade_uri: 'https://antigravity.google/g1-upgrade',
        },
      },
    })
    const credits = parseAgyCreditsOutput(creditsJson)
    expect(credits).toEqual({
      remainingCredits: 42,
      upgradeUri: 'https://antigravity.google/g1-upgrade',
    })
  })

  it('格式化配额摘要 Markdown', () => {
    const summary: AgyQuotaSummary = {
      ok: true,
      updatedAt: 1726723200000,
      groups: [
        {
          name: 'Gemini Models',
          buckets: [
            {
              id: 'gemini-5h',
              name: 'Five Hour Limit Remaining',
              window: '5h',
              remainingFraction: 0.96,
              percentage: 96,
              description: 'Will refresh in 3h 58m',
            },
          ],
        },
      ],
      credits: {
        remainingCredits: 0,
      },
    }

    const md = formatQuotaSummaryMarkdown(summary)
    expect(md).toContain('Gemini Models')
    expect(md).toContain('96%')
    expect(md).toContain('Will refresh in 3h 58m')
    expect(md).toContain('0** 点')
  })

  it('失败时返回友好的错误提示与登录建议', () => {
    const summary: AgyQuotaSummary = {
      ok: false,
      updatedAt: Date.now(),
      groups: [],
      error: '命令执行超时',
    }
    const md = formatQuotaSummaryMarkdown(summary)
    expect(md).toContain('AGY 账号用量查询失败')
    expect(md).toContain('命令执行超时')
  })
})
