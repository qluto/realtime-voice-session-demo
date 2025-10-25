import {
  coachingModeGuides,
  coachingModeOrder,
  type CoachingMode,
  type GrowPhase,
  type PersonalityPreset,
  type SessionPurposePreset
} from '../utils/prompt-presets.ts'

export const coachFoundations = `# ICF Core Competencies Integration
## Foundation (A)
- DEMONSTRATE ETHICAL PRACTICE: Maintain complete confidentiality and respect for the client's autonomy
- EMBODY COACHING MINDSET: Stay curious, flexible, and client-centred throughout the session

## Co-Creating Relationship (B)
- ESTABLISH AGREEMENTS: Confirm scope, desired outcomes, and the client's ownership of the agenda
- CULTIVATE TRUST AND SAFETY: Create space for honest sharing about challenges and successes
- MAINTAIN PRESENCE: Stay fully focused and responsive to the client's words and emotions

## Communicating Effectively (C)
- LISTEN ACTIVELY: Pay attention to what's said and unsaid, reflecting back key themes
- EVOKE AWARENESS: Use powerful questions to help the client discover insights that matter to them

## Cultivating Learning & Growth (D)
- FACILITATE CLIENT GROWTH: Support translating insight into intentional forward motion

# Language Guidelines
## Language Matching
Respond in the same language as the client unless they indicate otherwise.

## Unclear Audio Handling
- Only respond to clear audio input
- If audio is unclear, say: "I want to make sure I'm fully present with you - could you repeat that?"
- If there's background noise: "There seems to be some background sound - can you say that again?"

# Safety & Escalation
- If the client shares significant emotional distress or mental health concerns, respond with empathy and suggest they consider professional support
- Stay within coaching scope—avoid therapy, advice-giving, or problem-solving
- If conversation veers into areas requiring expertise beyond coaching, gently redirect toward reflection

# Key Coaching Behaviors
- ASK rather than tell
- REFLECT what you hear without adding interpretation
- CREATE SPACE for silence and processing
- FOLLOW the client's agenda and interests
- TRUST the client's wisdom and capability
- NOTICE patterns, themes, and energy shifts
- STAY CURIOUS about the client's experience

# Anti-Repetition Guidelines
1. **Before each question**: Scan recent conversation for similar themes or questions
2. **If a topic was discussed**: Either go deeper into an unexplored aspect or move to a completely different area
3. **When in doubt**: Ask about something that builds on their last response rather than starting fresh
4. **Integration phase**: Choose ONE focused direction rather than asking multiple similar "next" questions

Remember: Your role is to facilitate THEIR reflection and insight, not to provide answers or advice. AVOID asking questions that sound like variations of what has already been explored.`

export type DynamicPromptContext = {
  mode?: CoachingMode
  summary?: string
  rationale?: string
  coachFocus?: string
  questions?: string[]
  confidence?: Partial<Record<CoachingMode, number>>
}

function renderModeSection(mode: CoachingMode): string {
  const guide = coachingModeGuides[mode]
  const questionLines = guide.questionSeeds.map((item) => `- ${item}`).join('\n')
  const moveLines = guide.coachingMoves.map((item) => `- ${item}`).join('\n')
  const watchLines = guide.watchOuts.map((item) => `- ${item}`).join('\n')

  return `## ${guide.label}
${guide.description}
Intention: ${guide.intention}

Question seeds to keep fresh:
${questionLines}

High-leverage moves:
${moveLines}

Watch-outs:
${watchLines}`
}

function renderGrowPhaseGuidance(purpose: SessionPurposePreset): string {
  const growPhases: GrowPhase[] = ['goal', 'reality', 'options', 'will']
  const phaseLabels: Record<GrowPhase, string> = {
    goal: 'Goal',
    reality: 'Reality',
    options: 'Options',
    will: 'Will'
  }

  const sections = growPhases
    .filter((phase) => purpose.growGuidance[phase])
    .map((phase) => {
      return `## ${phaseLabels[phase]} Phase
${purpose.growGuidance[phase]}`
    })
    .join('\n\n')

  return sections || 'Apply GROW framework dynamically based on client needs.'
}

function formatConfidenceSnapshot(confidence?: Partial<Record<CoachingMode, number>>): string {
  if (!confidence) return 'Live confidence pending — stay observant and choose the most resonant mode.'
  const parts = coachingModeOrder.map((mode) => {
    const value = Math.max(0, Math.min(1, confidence[mode] ?? 0))
    const percent = Math.round(value * 100)
    return `${coachingModeGuides[mode].label}: ${percent}%`
  })
  return parts.join(', ')
}

function buildLiveCompassSection(purpose: SessionPurposePreset, dynamic?: DynamicPromptContext): string {
  const phaseLabels: Record<GrowPhase, string> = {
    goal: 'Goal',
    reality: 'Reality',
    options: 'Options',
    will: 'Will'
  }

  if (!dynamic || !dynamic.mode) {
    const defaultPhase = purpose.defaultPhase
    const phaseGuidance = purpose.growGuidance[defaultPhase] ?? 'Begin exploring with the client.'
    return `# Live Conversation Compass
Current guidance: Begin with ${phaseLabels[defaultPhase]} phase of the GROW model.
Why: ${phaseGuidance}
Confidence snapshot: ${formatConfidenceSnapshot()}
Flow through GROW phases naturally as the client's needs emerge.`
  }

  const guide = coachingModeGuides[dynamic.mode]
  const lines: string[] = [`Current mode: ${guide.label}`]
  if (dynamic.summary) lines.push(`Mini-summary: ${dynamic.summary}`)
  if (dynamic.rationale) lines.push(`Why now: ${dynamic.rationale}`)
  if (dynamic.coachFocus) lines.push(`Next focus: ${dynamic.coachFocus}`)
  lines.push(`Confidence snapshot: ${formatConfidenceSnapshot(dynamic.confidence)}`)

  const questionList = (dynamic.questions && dynamic.questions.length > 0
    ? dynamic.questions
    : guide.questionSeeds.slice(0, 2)
  ).map((item) => `- ${item}`).join('\n')

  lines.push('Ask 1-2 of these questions next:')
  lines.push(questionList)
  lines.push('Stay agile—pivot to another mode when the client indicates a new need or readiness.')

  return `# Live Conversation Compass
${lines.join('\n')}`
}

export function buildAgentInstructions(
  personality: PersonalityPreset,
  purpose: SessionPurposePreset,
  preferenceDirectives: string[] = [],
  dynamicContext?: DynamicPromptContext
): string {
  const emphasisLines = purpose.emphasis.map((item) => `- ${item}`).join('\n')
  const modeSections = coachingModeOrder.map((mode) => renderModeSection(mode)).join('\n\n')
  const growGuidance = renderGrowPhaseGuidance(purpose)

  const sections = [
    `# Role & Objective
${purpose.roleStatement}`,
    `# Personality & Tone
## Personality
${personality.personality}

## Tone
${personality.tone}

## Length
${personality.length}

## Pacing
${personality.pacing}

## Response Focus
${personality.responseFocus}`,
    `# Session Purpose Highlights — ${purpose.label}
${purpose.focusStatement}

${emphasisLines}`,
    `# GROW Framework Guidance
${growGuidance}`,
    `# Coaching Mode Compass
${modeSections}`,
    buildLiveCompassSection(purpose, dynamicContext)
  ]

  if (preferenceDirectives.length > 0) {
    sections.push(`# Session Personalization Cues
${preferenceDirectives.map((directive) => `- ${directive}`).join('\n')}`)
  }

  sections.push(coachFoundations)

  return sections.join('\n\n')
}
