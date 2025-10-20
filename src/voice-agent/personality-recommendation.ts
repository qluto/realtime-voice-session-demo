import {
  defaultPersonalityId,
  personalityPresets,
  type PersonalityPreset
} from '../utils/prompt-presets.ts'

export type PersonalityId = PersonalityPreset['id']
export type QuestionnaireQuestionId = 'pace' | 'support' | 'emotion'

export const questionnaireQuestionIds: QuestionnaireQuestionId[] = ['pace', 'support', 'emotion']

const personalityScoreBaseline: Record<PersonalityId, number> = {
  'warm-professional': 1.5,
  'direct-challenger': 0.8,
  'mindful-reflective': 1.5
}

const personalityQuestionScores: Record<QuestionnaireQuestionId, Record<string, Partial<Record<PersonalityId, number>>>> = {
  pace: {
    steady: {
      'warm-professional': 2,
      'mindful-reflective': 2
    },
    dynamic: {
      'direct-challenger': 3,
      'warm-professional': 1
    },
    spacious: {
      'mindful-reflective': 3,
      'warm-professional': 1
    }
  },
  support: {
    affirming: {
      'warm-professional': 3,
      'mindful-reflective': 1
    },
    challenging: {
      'direct-challenger': 3,
      'warm-professional': 1
    },
    reflective: {
      'mindful-reflective': 3,
      'warm-professional': 2
    }
  },
  emotion: {
    warm: {
      'warm-professional': 3,
      'mindful-reflective': 1
    },
    balanced: {
      'direct-challenger': 2,
      'warm-professional': 2
    },
    gentle: {
      'mindful-reflective': 3,
      'warm-professional': 1
    }
  }
}

const personalityQuestionRationales: Record<QuestionnaireQuestionId, Record<string, string>> = {
  pace: {
    steady: '落ち着いたテンポを望んだため、安心感のあるスタイルを優先しました。',
    dynamic: 'テンポ良く進めたいニーズから、チャレンジングで推進力のあるスタイルを重視しました。',
    spacious: '余白を大切にしたい選択から、マインドフルに寄り添うスタイルを強調しました。'
  },
  support: {
    affirming: '励ましと受容を求める回答により、温かくプロフェッショナルな支援を推奨しています。',
    challenging: '率直さと挑戦を求める回答から、ストレッチをかけるスタイルが合いやすいと判断しました。',
    reflective: '静かな内省を支えてほしい回答に基づき、丁寧に問いかけるスタイルを選びました。'
  },
  emotion: {
    warm: '感情を適度に共有してほしい回答により、温かい関わりを重視しています。',
    balanced: '感情表現は控えめが良いとの回答から、クールで明晰なスタイルを選択しました。',
    gentle: '穏やかな共感を求める回答のため、マインドフルな落ち着きに比重を置きました。'
  }
}

const preferenceDirectiveTexts: Record<QuestionnaireQuestionId, Record<string, string>> = {
  pace: {
    steady: 'Keep the coaching tempo steady and grounded, leaving reflective pauses for the client.',
    dynamic: 'Maintain an upbeat, forward-moving cadence that keeps momentum while staying attentive.',
    spacious: 'Offer a gently paced cadence with generous silence so the client can process internally.'
  },
  support: {
    affirming: 'Lead with affirming reflections before inviting new perspectives or questions.',
    challenging: 'Provide candid, future-facing challenges that stretch thinking while honouring agency.',
    reflective: 'Mirror language softly and use open questions that deepen inner reflection.'
  },
  emotion: {
    warm: 'Express calibrated warmth and emotional resonance when acknowledging the client\'s experiences.',
    balanced: 'Keep emotional expression measured and composed, focusing on clarity and structure.',
    gentle: 'Offer soothing empathy and name shifts in tone or sensations with a soft presence.'
  }
}

const preferenceSummaryTexts: Record<QuestionnaireQuestionId, Record<string, string>> = {
  pace: {
    steady: '落ち着いたテンポで進めたい',
    dynamic: 'テンポよく前進したい',
    spacious: '余白を重視したい'
  },
  support: {
    affirming: '励ましと受容を重視',
    challenging: 'ストレッチと挑戦を歓迎',
    reflective: '静かな内省サポートを希望'
  },
  emotion: {
    warm: '適度な感情共有が安心',
    balanced: '感情表現は控えめが良い',
    gentle: '柔らかな共感を求める'
  }
}

export type QuestionnaireResponses = Partial<Record<QuestionnaireQuestionId, string>>

export type PersonalityRecommendation = {
  personalityId: PersonalityId
  rationale: string[]
  preferenceDirectives: string[]
  preferenceSummaries: string[]
}

export function computePersonalityRecommendation(responses: QuestionnaireResponses): PersonalityRecommendation {
  const aggregateScores: Record<PersonalityId, number> = {} as Record<PersonalityId, number>

  personalityPresets.forEach((preset) => {
    aggregateScores[preset.id] = personalityScoreBaseline[preset.id] ?? 0
  })

  const rationale: string[] = []
  const preferenceDirectives: string[] = []
  const preferenceSummaries: string[] = []

  questionnaireQuestionIds.forEach((questionId) => {
    const responseValue = responses[questionId]
    if (!responseValue) {
      return
    }
    const scoreMap = personalityQuestionScores[questionId]?.[responseValue]
    if (scoreMap) {
      Object.entries(scoreMap).forEach(([personalityId, score]) => {
        const id = personalityId as PersonalityId
        aggregateScores[id] += score ?? 0
      })
    }
    const rationaleText = personalityQuestionRationales[questionId]?.[responseValue]
    if (rationaleText) {
      rationale.push(rationaleText)
    }
    const directive = preferenceDirectiveTexts[questionId]?.[responseValue]
    if (directive) {
      preferenceDirectives.push(directive)
    }
    const summary = preferenceSummaryTexts[questionId]?.[responseValue]
    if (summary) {
      preferenceSummaries.push(summary)
    }
  })

  let bestPersonalityId: PersonalityId = defaultPersonalityId
  let bestScore = Number.NEGATIVE_INFINITY

  personalityPresets.forEach((preset) => {
    const score = aggregateScores[preset.id]
    if (score > bestScore) {
      bestScore = score
      bestPersonalityId = preset.id
    } else if (score === bestScore && preset.id === defaultPersonalityId) {
      bestPersonalityId = preset.id
    }
  })

  return {
    personalityId: bestPersonalityId,
    rationale,
    preferenceDirectives,
    preferenceSummaries
  }
}
