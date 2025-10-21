import { describe, expect, it } from 'vitest'
import { calculateCost, OPENAI_PRICING } from './cost-calculator.ts'

describe('calculateCost', () => {
  it('computes detailed token costs and savings', () => {
    const usage = {
      inputTokens: 1000,
      outputTokens: 500,
      inputTokensDetails: [
        { text_tokens: 600, audio_tokens: 200, cached_tokens: 100 },
        { text_tokens: 100, audio_tokens: 0, cached_tokens: 50 }
      ]
    }

    const result = calculateCost(usage, 'gpt-realtime')

    expect(result.totalCachedTokens).toBe(150)
    expect(result.totalNonCachedTokens).toBe(850)
    expect(result.totalTextTokens).toBe(700)
    expect(result.totalAudioTokens).toBe(200)
    expect(result.inputCost).toBeCloseTo((850 / 1_000_000) * OPENAI_PRICING['gpt-realtime'].input)
    expect(result.cachedInputCost).toBeCloseTo((150 / 1_000_000) * OPENAI_PRICING['gpt-realtime'].cachedInput)
    expect(result.outputCost).toBeCloseTo((500 / 1_000_000) * OPENAI_PRICING['gpt-realtime'].output)
    expect(result.totalCost).toBeCloseTo(result.inputCost + result.cachedInputCost + result.outputCost)
    expect(result.savings).toBeCloseTo((150 / 1_000_000) * (OPENAI_PRICING['gpt-realtime'].input - OPENAI_PRICING['gpt-realtime'].cachedInput))
  })

  it('falls back to default pricing when model is unknown', () => {
    const usage = {
      inputTokens: 200,
      outputTokens: 100,
      inputTokensDetails: []
    }

    const result = calculateCost(usage, 'non-existent-model')
    const pricing = OPENAI_PRICING['gpt-realtime']

    expect(result.inputCost).toBeCloseTo((200 / 1_000_000) * pricing.input)
    expect(result.outputCost).toBeCloseTo((100 / 1_000_000) * pricing.output)
  })
})
