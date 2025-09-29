import { RealtimeSession } from '@openai/agents/realtime'

export type PhaseKey = 'opening' | 'reflection' | 'insight' | 'integration' | 'closing'

type TranscriptEntry = {
  role: 'client' | 'coach'
  text: string
  timestamp: number
}

type SessionAnalyzerOptions = {
  session: RealtimeSession
  controls: {
    panel: HTMLElement | null
    phaseFills: Record<PhaseKey, HTMLElement | null>
    phaseScores: Record<PhaseKey, HTMLElement | null>
    currentPhase: HTMLElement | null
    progressNotes: HTMLElement | null
    closureContainer: HTMLElement | null
    closureMessage: HTMLElement | null
  }
  initialAutoSummary?: boolean
  onRequestSummary: () => Promise<void> | void
}

const PHASE_LABELS: Record<PhaseKey, string> = {
  opening: 'オープニング',
  reflection: '深い振り返り',
  insight: '洞察の統合',
  integration: '前進的統合',
  closing: 'クロージング'
}

const PHASE_ORDER: PhaseKey[] = ['opening', 'reflection', 'insight', 'integration', 'closing']

const SCORE_REQUEST_COOLDOWN = 15_000
const MAX_TRANSCRIPTS = 40
const SUPPRESSION_WINDOW = 120_000

export class SessionAnalyzer {
  private session: RealtimeSession
  private controls: SessionAnalyzerOptions['controls']
  private onRequestSummary: () => Promise<void> | void
  private transcripts: TranscriptEntry[] = []
  private processedEventIds = new Set<string>()
  private phaseScores: Record<PhaseKey, number> = {
    opening: 0,
    reflection: 0,
    insight: 0,
    integration: 0,
    closing: 0
  }
  private autoSummaryEnabled: boolean
  private pendingScore = false
  private pendingScoreEventId: string | null = null
  private lastScoreRequestedAt = 0
  private closureSuggested = false
  private summarySuppressedUntil = 0
  private disposed = false

  constructor(options: SessionAnalyzerOptions) {
    this.session = options.session
    this.controls = options.controls
    this.onRequestSummary = options.onRequestSummary
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
    this.pendingScore = false
    this.pendingScoreEventId = null
    this.hideClosureSuggestion()
    if (this.controls.panel) {
      this.controls.panel.classList.add('hidden')
      this.controls.panel.style.display = 'none'
    }
    this.resetScores()
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
    this.pendingScore = false
    this.pendingScoreEventId = null
    this.lastScoreRequestedAt = 0
    this.closureSuggested = false
    this.summarySuppressedUntil = 0
    this.resetScores()
  }

  private resetScores() {
    this.phaseScores = {
      opening: 0,
      reflection: 0,
      insight: 0,
      integration: 0,
      closing: 0
    }

    PHASE_ORDER.forEach((phase) => {
      const fill = this.controls.phaseFills[phase]
      const score = this.controls.phaseScores[phase]
      if (fill) fill.style.width = '0%'
      if (score) score.textContent = '0%'
    })

    if (this.controls.currentPhase) {
      this.controls.currentPhase.textContent = '現在のフェーズ: オープニングを探索中'
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

    this.scheduleProgressEvaluation()
  }

  private scheduleProgressEvaluation() {
    if (this.pendingScore) return
    const now = Date.now()
    if (now - this.lastScoreRequestedAt < SCORE_REQUEST_COOLDOWN) return
    if (this.transcripts.length < 4) return

    this.pendingScore = true
    this.lastScoreRequestedAt = now
    this.pendingScoreEventId = `progress_${Date.now()}`

    const transcriptSnippet = this.buildTranscriptSnippet()
    const prompt = this.buildProgressPrompt(transcriptSnippet)

    try {
      this.session.transport.sendEvent({
        event_id: this.pendingScoreEventId,
        type: 'response.create',
        response: {
          conversation: 'none',
          metadata: { purpose: 'progress-score' },
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
      console.error('Failed to request progress score:', error)
      this.pendingScore = false
      this.pendingScoreEventId = null
    }
  }

  private handleResponseDone(event: any) {
    const response = event?.response
    if (!response) return

    const purpose = response.metadata?.purpose || response.metadata?.Purpose
    if (purpose !== 'progress-score' && purpose !== 'closure-readiness') {
      return
    }

    this.pendingScore = false
    this.pendingScoreEventId = null

    const text = this.extractTextFromResponse(response)
    if (!text) return

    const parsed = this.safeParseJson(text)
    if (!parsed) return

    this.applyProgressResult(parsed)
  }

  private applyProgressResult(parsed: any) {
    const scores = this.normalizeScores(parsed)
    this.phaseScores = scores

    PHASE_ORDER.forEach((phase) => {
      const percentage = Math.round((scores[phase] ?? 0) * 100)
      const fill = this.controls.phaseFills[phase]
      const scoreEl = this.controls.phaseScores[phase]
      if (fill) {
        const clamped = Math.max(0, Math.min(100, percentage))
        fill.style.width = `${clamped}%`
      }
      if (scoreEl) {
        scoreEl.textContent = `${Math.max(0, Math.min(100, percentage))}%`
      }
    })

    const currentPhase = this.resolveCurrentPhase(parsed)
    if (this.controls.currentPhase && currentPhase) {
      this.controls.currentPhase.textContent = `現在のフェーズ: ${currentPhase}`
    }

    const reason = this.resolveSummaryReason(parsed)
    if (this.controls.progressNotes) {
      this.controls.progressNotes.textContent = reason
    }

    const summaryReady = this.isSummaryReady(parsed, scores)
    if (summaryReady && this.autoSummaryEnabled) {
      this.maybeShowClosureSuggestion(reason)
    }
  }

  private resolveCurrentPhase(parsed: any): string {
    const nextPhase = parsed.current_phase || parsed.next_phase || parsed.currentPhase || parsed.nextPhase
    if (typeof nextPhase === 'string') {
      const key = this.matchPhaseKey(nextPhase)
      if (key) return `${PHASE_LABELS[key]}`
      return nextPhase
    }

    const highest = [...PHASE_ORDER]
      .sort((a, b) => (this.phaseScores[b] ?? 0) - (this.phaseScores[a] ?? 0))[0]

    return PHASE_LABELS[highest] ?? '進行中'
  }

  private resolveSummaryReason(parsed: any): string {
    const reason = parsed.reason || parsed.summary_reason || parsed.notes || parsed.analysis
    if (typeof reason === 'string' && reason.trim()) {
      return reason.trim()
    }
    return '進行状況を分析しています。十分なデータが集まるとまとめ提案が表示されます。'
  }

  private isSummaryReady(parsed: any, scores: Record<PhaseKey, number>): boolean {
    const parsedReady = parsed.summary_ready ?? parsed.summaryReady ?? parsed.ready_for_summary ?? parsed.readyForSummary
    if (typeof parsedReady === 'boolean') return parsedReady

    const closingScore = scores.closing ?? 0
    const average = PHASE_ORDER.reduce((acc, key) => acc + (scores[key] ?? 0), 0) / PHASE_ORDER.length
    return closingScore >= 0.65 && average >= 0.6
  }

  private maybeShowClosureSuggestion(reason: string) {
    const now = Date.now()
    if (this.closureSuggested) return
    if (now < this.summarySuppressedUntil) return

    const container = this.controls.closureContainer
    const message = this.controls.closureMessage
    if (!container || !message) return

    const prompt = reason && reason.trim() ? reason.trim() : '主要フェーズを概ね完了しました。'
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
          instructions: 'The client would like to continue exploring before summarizing. Ask a concise, powerful question that deepens reflection while maintaining the session language.'
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

  private buildProgressPrompt(transcript: string): string {
    return `以下はコーチ(\"Coach\")とクライアント(\"Client\")の週次振り返りセッションの抜粋です。ICFコアコンピテンシーに基づき、各フェーズの進捗を0から1で評価してください。JSONのみを返し、フォーマットは次のとおりです:\n{\n  "scores": {\n    "opening": number,\n    "reflection": number,\n    "insight": number,\n    "integration": number,\n    "closing": number\n  },\n  "current_phase": string,\n  "summary_ready": boolean,\n  "reason": string\n}\nスコアは0から1の範囲で小数点2桁までにし、reasonは日本語で簡潔に記述してください。\n\nTranscript:\n${transcript}`
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

  private normalizeScores(parsed: any): Record<PhaseKey, number> {
    const scores: Partial<Record<PhaseKey, number>> = {}
    const source = parsed.scores || parsed.progress || parsed

    PHASE_ORDER.forEach((phase) => {
      const raw = source?.[phase]
      const value = typeof raw === 'number' ? raw : parseFloat(raw)
      if (!Number.isNaN(value)) {
        scores[phase] = Math.max(0, Math.min(1, value))
      } else {
        scores[phase] = 0
      }
    })

    return {
      opening: scores.opening ?? 0,
      reflection: scores.reflection ?? 0,
      insight: scores.insight ?? 0,
      integration: scores.integration ?? 0,
      closing: scores.closing ?? 0
    }
  }

  private matchPhaseKey(value: string): PhaseKey | null {
    const normalized = value.toLowerCase().replace(/[^a-z]/g, '')
    if (normalized.includes('opening')) return 'opening'
    if (normalized.includes('reflection')) return 'reflection'
    if (normalized.includes('insight')) return 'insight'
    if (normalized.includes('integration')) return 'integration'
    if (normalized.includes('closing')) return 'closing'
    return null
  }

  private safeParseJson(text: string): any | null {
    try {
      return JSON.parse(text)
    } catch (error) {
      console.warn('Failed to parse progress JSON:', text, error)
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
