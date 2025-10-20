import { RealtimeSession } from '@openai/agents/realtime'
import type { CoachingMode } from './utils/prompt-presets'

export type ModeKey = CoachingMode

export type CoachingAnalysis = {
  summary: string
  rationale: string
  coachFocus: string
  mode: ModeKey
  confidence: Record<ModeKey, number>
  questions: string[]
  summaryReady: boolean
  summaryReason: string
}

type TranscriptEntry = {
  role: 'client' | 'coach'
  text: string
  timestamp: number
}

type SessionAnalyzerOptions = {
  session: RealtimeSession
  controls: {
    panel: HTMLElement | null
    modeFills: Record<ModeKey, HTMLElement | null>
    modeScores: Record<ModeKey, HTMLElement | null>
    currentMode: HTMLElement | null
    progressNotes: HTMLElement | null
    closureContainer: HTMLElement | null
    closureMessage: HTMLElement | null
  }
  initialAutoSummary?: boolean
  onRequestSummary: () => Promise<void> | void
  onAnalysisUpdate?: (analysis: CoachingAnalysis) => void
}

const MODE_LABELS: Record<ModeKey, string> = {
  reflective: 'Reflective（感情・価値の内省）',
  discovery: 'Discovery（目標と選択肢の探求）',
  actionable: 'Actionable（行動と合意づくり）',
  cognitive: 'Cognitive（視点の転換）'
}

const MODE_ORDER: ModeKey[] = ['reflective', 'discovery', 'actionable', 'cognitive']

const ANALYSIS_COOLDOWN = 15_000
const MAX_TRANSCRIPTS = 40
const SUPPRESSION_WINDOW = 120_000

export class SessionAnalyzer {
  private session: RealtimeSession
  private controls: SessionAnalyzerOptions['controls']
  private onRequestSummary: () => Promise<void> | void
  private onAnalysisUpdate?: (analysis: CoachingAnalysis) => void
  private transcripts: TranscriptEntry[] = []
  private processedEventIds = new Set<string>()
  private modeScores: Record<ModeKey, number> = {
    reflective: 0,
    discovery: 0,
    actionable: 0,
    cognitive: 0
  }
  private autoSummaryEnabled: boolean
  private pendingAnalysis = false
  private pendingAnalysisEventId: string | null = null
  private lastAnalysisRequestedAt = 0
  private closureSuggested = false
  private summarySuppressedUntil = 0
  private disposed = false
  private lastAnalysisSignature: string | null = null

  constructor(options: SessionAnalyzerOptions) {
    this.session = options.session
    this.controls = options.controls
    this.onRequestSummary = options.onRequestSummary
    this.onAnalysisUpdate = options.onAnalysisUpdate
    this.autoSummaryEnabled = options.initialAutoSummary ?? true

    this.resetUi()
  }

  handleTransportEvent(event: any) {
    if (this.disposed) return

    const type = event?.type
    if (!type) return

    if (type === 'session.created') {
      this.handleSessionCreated()
      return
    }

    if (type === 'session.updated' && this.controls.panel) {
      this.controls.panel.style.display = 'block'
    }

    if (type === 'conversation.item.input_audio_transcription.completed') {
      this.recordTranscript('client', event.transcript, event)
      return
    }

    if (type === 'conversation.item.created') {
      const item = event.item
      if (!item) return
      const role = item.role === 'user' ? 'client' : 'coach'
      const text = this.extractTextFromItem(item)
      this.recordTranscript(role, text, event)
      return
    }

    if (type === 'response.text.done' || type === 'response.output_text.done') {
      this.recordTranscript('coach', event.text, event)
      return
    }

    if (type === 'response.audio_transcript.done' || type === 'response.output_audio_transcript.done') {
      this.recordTranscript('coach', event.transcript, event)
      return
    }

    if (type === 'response.done') {
      this.handleResponseDone(event)
      return
    }
  }

  setAutoSummaryEnabled(enabled: boolean) {
    this.autoSummaryEnabled = enabled
    if (!enabled) {
      this.hideClosureSuggestion()
    }
  }

  async acceptClosureSuggestion() {
    if (this.disposed) return
    this.hideClosureSuggestion()
    this.closureSuggested = true
    try {
      await this.onRequestSummary()
    } catch (error) {
      console.error('Failed to request session summary:', error)
    }
  }

  declineClosureSuggestion() {
    if (this.disposed) return
    this.hideClosureSuggestion()
    this.summarySuppressedUntil = Date.now() + SUPPRESSION_WINDOW
    this.closureSuggested = false
    this.sendContinuationPrompt()
  }

  markSummaryInitiated() {
    if (this.disposed) return
    this.hideClosureSuggestion()
    this.closureSuggested = true
  }

  dispose() {
    this.disposed = true
    this.transcripts = []
    this.processedEventIds.clear()
    this.pendingAnalysis = false
    this.pendingAnalysisEventId = null
    this.lastAnalysisSignature = null
    // keep current UI state visible until a new session begins
  }

  private handleSessionCreated() {
    this.resetAnalyzerState()
    if (this.controls.panel) {
      this.controls.panel.classList.remove('hidden')
      this.controls.panel.style.display = 'block'
    }
    if (this.controls.progressNotes) {
      this.controls.progressNotes.textContent = 'コーチングの進行状況を解析しています...'
    }
  }

  private resetAnalyzerState() {
    this.transcripts = []
    this.processedEventIds.clear()
    this.pendingAnalysis = false
    this.pendingAnalysisEventId = null
    this.lastAnalysisRequestedAt = 0
    this.closureSuggested = false
    this.summarySuppressedUntil = 0
    this.lastAnalysisSignature = null
    this.resetScores()
  }

  private resetScores() {
    this.modeScores = {
      reflective: 0,
      discovery: 0,
      actionable: 0,
      cognitive: 0
    }

    MODE_ORDER.forEach((mode) => {
      const fill = this.controls.modeFills[mode]
      const score = this.controls.modeScores[mode]
      if (fill) fill.style.width = '0%'
      if (score) score.textContent = '0%'
    })

    if (this.controls.currentMode) {
      this.controls.currentMode.textContent = '現在のモード: 解析中'
    }
  }

  private recordTranscript(role: 'client' | 'coach', rawText: unknown, event: any) {
    if (!rawText || typeof rawText !== 'string') return

    const text = rawText.trim()
    if (!text) return

    const eventId = this.getEventId(event)
    if (eventId) {
      if (this.processedEventIds.has(eventId)) {
        return
      }
      this.processedEventIds.add(eventId)
    }

    this.transcripts.push({
      role,
      text,
      timestamp: Date.now()
    })

    if (this.transcripts.length > MAX_TRANSCRIPTS) {
      this.transcripts.splice(0, this.transcripts.length - MAX_TRANSCRIPTS)
    }

    this.scheduleAnalysis()
  }

  private scheduleAnalysis() {
    if (this.pendingAnalysis) return
    const now = Date.now()
    if (now - this.lastAnalysisRequestedAt < ANALYSIS_COOLDOWN) return
    if (this.transcripts.length < 4) return

    this.pendingAnalysis = true
    this.lastAnalysisRequestedAt = now
    this.pendingAnalysisEventId = `analysis_${Date.now()}`

    const transcriptSnippet = this.buildTranscriptSnippet()
    const prompt = this.buildAnalysisPrompt(transcriptSnippet)

    try {
      this.session.transport.sendEvent({
        event_id: this.pendingAnalysisEventId,
        type: 'response.create',
        response: {
          conversation: 'none',
          metadata: { purpose: 'coaching-analysis' },
          output_modalities: ['text'],
          input: [
            {
              type: 'message',
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: prompt
                }
              ]
            }
          ]
        }
      })
    } catch (error) {
      console.error('Failed to request coaching analysis:', error)
      this.pendingAnalysis = false
      this.pendingAnalysisEventId = null
    }
  }

  private handleResponseDone(event: any) {
    const response = event?.response
    if (!response) return

    const purpose = response.metadata?.purpose || response.metadata?.Purpose
    if (purpose !== 'coaching-analysis' && purpose !== 'closure-readiness') {
      return
    }

    this.pendingAnalysis = false
    this.pendingAnalysisEventId = null

    const text = this.extractTextFromResponse(response)
    if (!text) return

    const parsed = this.safeParseJson(text)
    if (!parsed) return

    this.applyAnalysisResult(parsed)
  }

  private applyAnalysisResult(parsed: any) {
    const confidence = this.normalizeConfidence(parsed)
    this.modeScores = confidence

    MODE_ORDER.forEach((mode) => {
      const percentage = Math.round((confidence[mode] ?? 0) * 100)
      const fill = this.controls.modeFills[mode]
      const scoreEl = this.controls.modeScores[mode]
      if (fill) {
        const clamped = Math.max(0, Math.min(100, percentage))
        fill.style.width = `${clamped}%`
      }
      if (scoreEl) {
        scoreEl.textContent = `${Math.max(0, Math.min(100, percentage))}%`
      }
    })

    const analysis = this.buildAnalysisPayload(parsed, confidence)
    if (!analysis) {
      return
    }

    if (this.controls.currentMode) {
      const label = MODE_LABELS[analysis.mode]
      this.controls.currentMode.textContent = `現在のモード: ${label}`
    }

    if (this.controls.progressNotes) {
      const parts = [analysis.summary, analysis.rationale, analysis.coachFocus].filter((value) => Boolean(value && value.trim()))
      this.controls.progressNotes.textContent = parts.join('\n')
    }

    if (analysis.summaryReady && this.autoSummaryEnabled) {
      this.maybeShowClosureSuggestion(analysis.summaryReason)
    }

    const signature = JSON.stringify({
      mode: analysis.mode,
      summary: analysis.summary,
      rationale: analysis.rationale,
      focus: analysis.coachFocus,
      questions: analysis.questions
    })

    if (this.lastAnalysisSignature !== signature) {
      this.lastAnalysisSignature = signature
      this.onAnalysisUpdate?.(analysis)
    }
  }

  private buildAnalysisPayload(parsed: any, confidence: Record<ModeKey, number>): CoachingAnalysis | null {
    const modeValue = this.extractMode(parsed)
    if (!modeValue) return null

    const summary = this.ensureString(parsed.summary || parsed.conversation_summary || parsed.recaps)
    const rationale = this.ensureString(parsed.rationale || parsed.reason || parsed.analysis)
    const coachFocus = this.ensureString(parsed.coach_focus || parsed.next_focus || parsed.focus)
    const summaryReady = this.extractBoolean(parsed.summary_ready ?? parsed.ready_for_summary ?? parsed.summaryReady ?? parsed.readyForSummary)
    const summaryReason = this.ensureString(
      parsed.summary_reason ||
        parsed.summaryReason ||
        parsed.closure_reason ||
        parsed.closureReason ||
        parsed.closure_note
    )

    const questionsSource = Array.isArray(parsed.questions)
      ? parsed.questions
      : Array.isArray(parsed.coach_message?.questions)
        ? parsed.coach_message.questions
        : []
    const questionsRaw = questionsSource as any[]
    const questions = questionsRaw
      .map((value: any) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value: string) => Boolean(value))

    return {
      summary,
      rationale,
      coachFocus,
      mode: modeValue,
      confidence,
      questions,
      summaryReady,
      summaryReason: summaryReason || (summaryReady ? '主要テーマが収束しつつあります。' : '')
    }
  }

  private extractMode(parsed: any): ModeKey | null {
    const raw = parsed.mode || parsed.current_mode || parsed.mode_choice
    if (typeof raw === 'string') {
      const normalized = raw.toLowerCase().trim()
      if (normalized.startsWith('reflect')) return 'reflective'
      if (normalized.startsWith('discov')) return 'discovery'
      if (normalized.startsWith('action')) return 'actionable'
      if (normalized.startsWith('cogn')) return 'cognitive'
    }

    const highest = [...MODE_ORDER].sort((a, b) => (this.modeScores[b] ?? 0) - (this.modeScores[a] ?? 0))[0]
    return highest ?? null
  }

  private maybeShowClosureSuggestion(reason: string) {
    const now = Date.now()
    if (this.closureSuggested) return
    if (now < this.summarySuppressedUntil) return

    const container = this.controls.closureContainer
    const message = this.controls.closureMessage
    if (!container || !message) return

    const prompt = reason && reason.trim() ? reason.trim() : 'セッションをまとめる準備が整いつつあります。'
    message.textContent = `${prompt}\nセッションをまとめに移行しますか？`
    container.style.display = 'block'
    this.closureSuggested = true
  }

  private hideClosureSuggestion() {
    const container = this.controls.closureContainer
    if (container) {
      container.style.display = 'none'
    }
    this.closureSuggested = false
  }

  private sendContinuationPrompt() {
    try {
      this.session.transport.sendEvent({
        type: 'response.create',
        response: {
          conversation: 'none',
          metadata: { purpose: 'summary-dismissed' },
          output_modalities: ['audio', 'text'],
          instructions: 'The client would like to continue exploring before summarizing. Ask one concise, powerful question that deepens reflection while maintaining the session language.'
        }
      })
    } catch (error) {
      console.error('Failed to send continuation prompt:', error)
    }
  }

  private buildTranscriptSnippet(limit: number = 12): string {
    const recent = this.transcripts.slice(-limit)
    return recent
      .map((entry) => `${entry.role === 'client' ? 'Client' : 'Coach'}: ${entry.text}`)
      .join('\n')
  }

  private buildAnalysisPrompt(transcript: string): string {
    return `You are a senior coaching supervisor helping an AI coach decide how to steer the next turn. Analyse the recent conversation snippet and respond with pure JSON matching the schema below. Use the four-mode compass: Reflective (emotions, meaning), Discovery (goal, reality, options), Actionable (commitment, accountability), Cognitive (reframe assumptions).
{
  "summary": string,                // 1 short sentence recap in conversation language when obvious, otherwise Japanese
  "mode": "reflective" | "discovery" | "actionable" | "cognitive",
  "mode_confidence": {
    "reflective": number,           // 0-1 with two decimals
    "discovery": number,
    "actionable": number,
    "cognitive": number
  },
  "rationale": string,             // why this mode now (<=2 sentences)
  "coach_focus": string,           // where the coach should steer next (deepening or converging)
  "questions": string[],           // 1-2 short coaching questions aligned with the chosen mode
  "summary_ready": boolean,        // true if the session can move to wrap-up gracefully
  "summary_reason": string         // Japanese explanation for why/why not
}
Keep the JSON compact. Values in mode_confidence must be numbers between 0 and 1. Do not add extra keys.

Transcript:
${transcript}`
  }

  private extractTextFromItem(item: any): string {
    if (!item) return ''
    if (typeof item.content === 'string') return item.content
    if (Array.isArray(item.content)) {
      return item.content
        .map((part: any) => (typeof part === 'string' ? part : part?.text ?? part?.transcript ?? ''))
        .filter((value: string) => Boolean(value && value.trim()))
        .join(' ')
    }
    if (item.content?.text) return item.content.text
    if (item.content?.transcript) return item.content.transcript
    return ''
  }

  private extractTextFromResponse(response: any): string | null {
    if (!response) return null

    const texts: string[] = []

    if (Array.isArray(response.output)) {
      for (const item of response.output) {
        if (!item) continue
        if (typeof item === 'string') {
          texts.push(item)
          continue
        }
        if (item.text && typeof item.text === 'string') {
          texts.push(item.text)
        }
        if (Array.isArray(item.content)) {
          item.content.forEach((part: any) => {
            if (!part) return
            if (typeof part === 'string') {
              texts.push(part)
              return
            }
            if (typeof part.text === 'string') {
              texts.push(part.text)
              return
            }
            if (typeof part.value === 'string') {
              texts.push(part.value)
              return
            }
          })
        }
      }
    }

    if (!texts.length) {
      if (Array.isArray(response.output_text)) {
        texts.push(...response.output_text.filter((value: any) => typeof value === 'string'))
      } else if (typeof response.output_text === 'string') {
        texts.push(response.output_text)
      }
    }

    const combined = texts.join(' ').trim()
    return combined || null
  }

  private normalizeConfidence(parsed: any): Record<ModeKey, number> {
    const source = parsed.mode_confidence || parsed.confidence || parsed.scores || parsed
    const result: Record<ModeKey, number> = {
      reflective: 0,
      discovery: 0,
      actionable: 0,
      cognitive: 0
    }

    MODE_ORDER.forEach((mode) => {
      const raw = source?.[mode]
      const value = typeof raw === 'number' ? raw : parseFloat(raw)
      if (!Number.isNaN(value) && Number.isFinite(value)) {
        result[mode] = Math.max(0, Math.min(1, value))
      }
    })

    return result
  }

  private safeParseJson(text: string): any | null {
    try {
      return JSON.parse(text)
    } catch (error) {
      console.warn('Failed to parse analysis JSON:', text, error)
      return null
    }
  }

  private getEventId(event: any): string | null {
    if (!event) return null
    if (typeof event.event_id === 'string') return event.event_id
    if (typeof event.id === 'string') return event.id
    if (typeof event.item_id === 'string') return event.item_id
    if (event.response?.id) return `response_${event.response.id}`
    return null
  }

  private ensureString(value: any): string {
    if (typeof value === 'string') return value.trim()
    return ''
  }

  private extractBoolean(value: any): boolean {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (normalized === 'true') return true
      if (normalized === 'false') return false
    }
    return false
  }

  private resetUi() {
    if (this.controls.panel) {
      this.controls.panel.classList.add('hidden')
      this.controls.panel.style.display = 'none'
    }
    this.resetScores()
    if (this.controls.progressNotes) {
      this.controls.progressNotes.textContent = ''
    }
    this.hideClosureSuggestion()
  }
}
