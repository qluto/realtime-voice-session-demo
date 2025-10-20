import type { CoachingMode } from '../utils/prompt-presets.ts'

export type ModeKey = CoachingMode

export const MODE_LABELS: Record<ModeKey, string> = {
  reflective: 'Reflective（感情・価値の内省）',
  discovery: 'Discovery（目標と選択肢の探求）',
  actionable: 'Actionable（行動と合意づくり）',
  cognitive: 'Cognitive（視点の転換）'
}

export const MODE_ORDER: ModeKey[] = ['reflective', 'discovery', 'actionable', 'cognitive']

export const ANALYSIS_COOLDOWN = 15_000
export const MAX_TRANSCRIPTS = 40
export const SUPPRESSION_WINDOW = 120_000
