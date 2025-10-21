import { describe, expect, it } from 'vitest'
import { formatTime } from './session-timer.ts'

describe('formatTime', () => {
  it('pads minutes and seconds to two digits', () => {
    expect(formatTime(0)).toBe('00:00')
    expect(formatTime(5)).toBe('00:05')
    expect(formatTime(125)).toBe('02:05')
  })
})
