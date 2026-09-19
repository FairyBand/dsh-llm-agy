import { beforeEach, describe, expect, it } from 'vitest'
import {
  isEffortRejection,
  isEffortUnsupported,
  rememberEffortUnsupported,
  resetEffortSupportCache,
  shouldPassEffort,
} from '../src/effort.ts'

describe('AGY --effort 模型兼容判定', () => {
  beforeEach(() => {
    resetEffortSupportCache()
  })

  describe('shouldPassEffort', () => {
    it('模型 id 自带档位后缀时省略 --effort(档位由模型名固定)', () => {
      expect(shouldPassEffort('gemini-3.8-flash-high', 'high')).toBe(false)
      expect(shouldPassEffort('gemini-3.8-flash-medium', 'high')).toBe(false)
      expect(shouldPassEffort('gemini-3.1-pro-low', 'high')).toBe(false)
      expect(shouldPassEffort('gpt-oss-120b-medium', 'high')).toBe(false)
    })

    it('Claude 全系不传 --effort(实测 AGY 直接拒绝该参数)', () => {
      expect(shouldPassEffort('claude-opus-4-6-thinking', 'high')).toBe(false)
      expect(shouldPassEffort('claude-sonnet-4-6', 'high')).toBe(false)
    })

    it('无后缀且不在"不支持"家族里的模型照常传 --effort', () => {
      expect(shouldPassEffort('gemini-4.0-pro', 'high')).toBe(true)
      expect(shouldPassEffort('some-future-model', 'medium')).toBe(true)
    })

    it('未显式指定模型时交给 AGY 自己的默认模型', () => {
      expect(shouldPassEffort(undefined, 'high')).toBe(true)
      expect(shouldPassEffort('', 'high')).toBe(true)
      expect(shouldPassEffort('   ', 'high')).toBe(true)
    })

    it('effort 未配置(undefined/空串)时不传', () => {
      expect(shouldPassEffort('gemini-4.0-pro', undefined)).toBe(false)
      expect(shouldPassEffort('gemini-4.0-pro', '')).toBe(false)
    })

    it('运行时学到的模型不再传 --effort,且只影响该模型', () => {
      expect(shouldPassEffort('gemini-4.0-pro', 'high')).toBe(true)
      rememberEffortUnsupported('gemini-4.0-pro')
      expect(isEffortUnsupported('gemini-4.0-pro')).toBe(true)
      expect(shouldPassEffort('gemini-4.0-pro', 'high')).toBe(false)
      // 其它模型不受影响。
      expect(shouldPassEffort('gemini-5.0-pro', 'high')).toBe(true)
    })

    it('记忆忽略空模型 id,不污染判定', () => {
      rememberEffortUnsupported(undefined)
      rememberEffortUnsupported('  ')
      expect(isEffortUnsupported('')).toBe(false)
      expect(shouldPassEffort('gemini-4.0-pro', 'high')).toBe(true)
    })
  })

  describe('isEffortRejection', () => {
    it('识别"模型不支持 --effort"的实测报错(Claude)', () => {
      expect(isEffortRejection(
        'invalid model selection (--model "claude-opus-4-6-thinking" --effort "high"): '
        + '--effort is not supported for model "claude-opus-4-6-thinking"',
      )).toBe(true)
    })

    it('识别"模型自带档位与 --effort 冲突"的实测报错(Gemini/GPT-OSS)', () => {
      expect(isEffortRejection(
        'invalid model selection (--model "gemini-3.1-pro-low" --effort "high"): '
        + '--model gemini-3.1-pro-low conflicts with --effort=high',
      )).toBe(true)
      expect(isEffortRejection(
        'invalid model selection (--model "gpt-oss-120b-medium" --effort "high"): '
        + '--model gpt-oss-120b-medium conflicts with --effort=high',
      )).toBe(true)
    })

    it('其它 AGY 错误不被误判为 effort 拒绝', () => {
      expect(isEffortRejection('invalid model selection (--model "nope"): unknown model "nope"')).toBe(false)
      expect(isEffortRejection('UNAVAILABLE (code 503): No capacity available for model x')).toBe(false)
      expect(isEffortRejection('AGY 调用超时(静默超过 150s 无输出)')).toBe(false)
      expect(isEffortRejection(undefined)).toBe(false)
      expect(isEffortRejection('')).toBe(false)
    })
  })
})
