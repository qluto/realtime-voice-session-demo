import { RealtimeSession } from '@openai/agents/realtime'

export type PhaseKey = 'goal' | 'reality' | 'options' | 'will'

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
  getOutputModalities: () => ('audio' | 'text')[]
}

const PHASE_LABELS: Record<PhaseKey, string> = {
  goal: 'Goal（目標設定）',
  reality: 'Reality（現状把握）',
  options: 'Options（選択肢の探索）',
  will: 'Will（意志と行動）'
}

const PHASE_ORDER: PhaseKey[] = ['goal', 'reality', 'options', 'will']

const SCORE_REQUEST_COOLDOWN = 15_000
const MAX_TRANSCRIPTS = 40
const SUPPRESSION_WINDOW = 120_000

export class SessionAnalyzer {
  private session: RealtimeSession
  private controls: SessionAnalyzerOptions['controls']
  private onRequestSummary: () => Promise<void> | void
  private readOutputModalities: () => ('audio' | 'text')[]
  private transcripts: TranscriptEntry[] = []
  private processedEventIds = new Set<string>()
  private phaseScores: Record<PhaseKey, number> = {
    goal: 0,
    reality: 0,
    options: 0,
    will: 0
  }
  private autoSummaryEnabled: boolean
  private pendingScore = false
  private pendingScoreEventId: string | null = null
  private lastScoreRequestedAt = 0
  private summarySuppressedUntil = 0
  private disposed = false
  private awaitingSummaryConsent = false
  private pendingConsentCheck = false
  private summaryInProgress = false

  constructor(options: SessionAnalyzerOptions) {
    this.session = options.session
    this.controls = options.controls
    this.onRequestSummary = options.onRequestSummary
    this.readOutputModalities = options.getOutputModalities
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
      this.pendingConsentCheck = false
    }
  }

  async acceptClosureSuggestion() {
    if (this.disposed) return
    this.requestSummaryFromAnalyzer()
  }

  declineClosureSuggestion() {
    if (this.disposed) return
    this.handleSummaryDeclined()
  }

  markSummaryInitiated() {
    if (this.disposed) return
    this.hideClosureSuggestion()
    this.awaitingSummaryConsent = false
    this.pendingConsentCheck = false
    this.summaryInProgress = true
  }

  dispose() {
    this.disposed = true
    this.transcripts = []
    this.processedEventIds.clear()
    this.pendingScore = false
    this.pendingScoreEventId = null
    this.pendingConsentCheck = false
    this.awaitingSummaryConsent = false
    this.summaryInProgress = false
    // retain UI state until next session
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
    this.summarySuppressedUntil = 0
    this.awaitingSummaryConsent = false
    this.pendingConsentCheck = false
    this.summaryInProgress = false
    this.resetScores()
  }

  private resetScores() {
    this.phaseScores = {
      goal: 0,
      reality: 0,
      options: 0,
      will: 0
    }

    PHASE_ORDER.forEach((phase) => {
      const fill = this.controls.phaseFills[phase]
      const score = this.controls.phaseScores[phase]
      if (fill) fill.style.width = '0%'
      if (score) score.textContent = '0%'
    })

    if (this.controls.currentPhase) {
      this.controls.currentPhase.textContent = '現在のフェーズ: Goal（目標設定）を探索中'
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

    if (role === 'client') {
      this.maybeEvaluateSummaryConsent(text)
    }

    this.scheduleProgressEvaluation()
  }

  private scheduleProgressEvaluation() {
    if (this.summaryInProgress) return
    if (this.awaitingSummaryConsent) return
    if (this.pendingConsentCheck) return
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
    if (purpose === 'summary-consent-eval') {
      this.pendingConsentCheck = false
      const text = this.extractTextFromResponse(response)
      if (!text) return
      const parsed = this.safeParseJson(text)
      if (!parsed) return
      this.handleSummaryConsentResult(parsed)
      return
    }

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
      this.maybePromptSummaryConsent(reason)
    }
  }

  private resolveCurrentPhase(parsed: any): string {
    const nextPhase = parsed.current_phase || parsed.next_phase || parsed.currentPhase || parsed.nextPhase
    if (typeof nextPhase === 'string') {
      const key = this.matchPhaseKey(nextPhase)
      if (key) return PHASE_LABELS[key]
      return nextPhase
    }

    const highest = [...PHASE_ORDER].sort((a, b) => (this.phaseScores[b] ?? 0) - (this.phaseScores[a] ?? 0))[0]
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

    const willScore = scores.will ?? 0
    const average = PHASE_ORDER.reduce((acc, key) => acc + (scores[key] ?? 0), 0) / PHASE_ORDER.length
    return willScore >= 0.65 && average >= 0.6
  }

  private showClosureSuggestion(reason: string) {
    const container = this.controls.closureContainer
    const message = this.controls.closureMessage
    if (!container || !message) return

    const prompt = reason && reason.trim() ? reason.trim() : '主要フェーズを概ね完了しました。'
    message.textContent = `${prompt}\nセッションをまとめに移行しますか？`
    container.style.display = 'block'
  }

  private maybePromptSummaryConsent(reason: string) {
    if (this.disposed) return
    if (this.summaryInProgress) return
    const now = Date.now()
    if (now < this.summarySuppressedUntil) return

    this.showClosureSuggestion(reason)

    if (this.awaitingSummaryConsent) {
      return
    }

    this.awaitingSummaryConsent = true
    try {
      const instructions = this.buildSummaryConsentPrompt(reason)
      const outputModalities = this.determineOutputModalities(true)
      this.session.transport.sendEvent({
        type: 'response.create',
        response: {
          conversation: 'none',
          metadata: { purpose: 'summary-consent' },
          output_modalities: outputModalities,
          instructions
        }
      })
    } catch (error) {
      console.error('Failed to prompt summary consent:', error)
      this.awaitingSummaryConsent = false
    }
  }

  private buildSummaryConsentPrompt(reason: string): string {
    const base = reason && reason.trim()
      ? `進行状況の解析結果として「${reason.trim()}」と判断しています。`
      : '進行状況の解析から、主要なフェーズが十分に探索されたと判断しています。'
    return `${base} セッションのまとめに移行して良いか、クライアントに丁寧に確認してください。必ず「そろそろまとめに入りますか？」というフレーズを含め、日本語で短く尋ねてください。`
  }

  private maybeEvaluateSummaryConsent(latestClientText: string) {
    if (!this.awaitingSummaryConsent) return
    if (this.summaryInProgress) return
    if (this.pendingConsentCheck) return

    const eventId = `summary_consent_${Date.now()}`
    const transcript = this.buildTranscriptSnippet(10)
    const prompt = this.buildConsentClassificationPrompt(transcript, latestClientText)

    this.pendingConsentCheck = true
    try {
      this.session.transport.sendEvent({
        event_id: eventId,
        type: 'response.create',
        response: {
          conversation: 'none',
          metadata: { purpose: 'summary-consent-eval' },
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
      console.error('Failed to evaluate summary consent:', error)
      this.pendingConsentCheck = false
    }
  }

  private buildConsentClassificationPrompt(transcript: string, latestClientText: string): string {
    return `あなたはコーチングセッションのモデレーターです。最新のクライアント発話が「まとめに入る」ことへの同意かどうかを判定してください。会話の抜粋と最新のクライアント発話が以下にあります。\n\nTranscript:\n${transcript}\n\nLatest client message:\n${latestClientText}\n\nJSONのみで回答し、次のフォーマットを厳守してください:\n{\n  "decision": "accept" | "decline" | "uncertain",\n  "confidence": number,\n  "reason": string\n}\n\n"accept"はまとめへの移行に同意、"decline"は拒否または保留、判断不能の場合は"uncertain"としてください。reasonは日本語で短く記述してください。`
  }

  private hideClosureSuggestion() {
    const container = this.controls.closureContainer
    if (container) {
      container.style.display = 'none'
    }
    this.awaitingSummaryConsent = false
  }

  private sendContinuationPrompt() {
    const outputModalities = this.determineOutputModalities(true)
    try {
      this.session.transport.sendEvent({
        type: 'response.create',
        response: {
          conversation: 'none',
          metadata: { purpose: 'summary-dismissed' },
          output_modalities: outputModalities,
          instructions: 'The client would like to continue exploring before summarizing. Ask a concise, powerful question that deepens reflection while maintaining the session language.'
        }
      })
    } catch (error) {
      console.error('Failed to send continuation prompt:', error)
    }
  }

  private handleSummaryConsentResult(parsed: any) {
    if (this.summaryInProgress) return
    const decisionRaw = typeof parsed.decision === 'string' ? parsed.decision.toLowerCase().trim() : ''
    if (decisionRaw === 'accept') {
      this.requestSummaryFromAnalyzer()
      return
    }

    if (decisionRaw === 'decline') {
      this.handleSummaryDeclined()
    }
  }

  private requestSummaryFromAnalyzer() {
    if (this.disposed) return
    this.awaitingSummaryConsent = false
    this.pendingConsentCheck = false
    this.summaryInProgress = true
    this.hideClosureSuggestion()
    Promise.resolve(this.onRequestSummary()).catch((error) => {
      console.error('Failed to request session summary:', error)
      this.summaryInProgress = false
    })
  }

  private handleSummaryDeclined() {
    this.awaitingSummaryConsent = false
    this.pendingConsentCheck = false
    this.hideClosureSuggestion()
    this.summarySuppressedUntil = Date.now() + SUPPRESSION_WINDOW
    this.sendContinuationPrompt()
  }

  private buildTranscriptSnippet(limit: number = 12): string {
    const recent = this.transcripts.slice(-limit)
    return recent
      .map((entry) => `${entry.role === 'client' ? 'Client' : 'Coach'}: ${entry.text}`)
      .join('\n')
  }

  private buildProgressPrompt(transcript: string): string {
    return `以下はコーチ("Coach")とクライアント("Client")のコーチングセッションの抜粋です。GROWモデル（Goal→Reality→Options→Will）に基づき、各フェーズの進捗を0から1で評価してください。JSONのみを返し、フォーマットは次のとおりです:\n{\n  "scores": {\n    "goal": number,\n    "reality": number,\n    "options": number,\n    "will": number\n  },\n  "current_phase": string,\n  "summary_ready": boolean,\n  "reason": string\n}\n\n各フェーズの評価基準:\n- goal: 目標や望む成果が明確化されているか\n- reality: 現状の把握、課題や状況の理解が深まっているか\n- options: 選択肢や可能性が十分に探索されているか\n- will: 具体的な行動やコミットメントが設定されているか\n\nスコアは0から1の範囲で小数点2桁までにし、reasonは日本語で簡潔に記述してください。\n\nTranscript:\n${transcript}`
  }

  private determineOutputModalities(preferAudio: boolean): ('audio' | 'text')[] {
    const provided = this.readOutputModalities?.() ?? []
    const sanitized = Array.from(new Set(provided)).filter((value): value is 'audio' | 'text' => value === 'audio' || value === 'text')
    if (!sanitized.length) {
      return ['text']
    }
    if (!preferAudio) {
      return sanitized
    }
    if (!sanitized.includes('audio')) {
      return sanitized.includes('text') ? sanitized : ['text']
    }
    if (!sanitized.includes('text')) {
      return [...sanitized, 'text']
    }
    return sanitized
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
      goal: scores.goal ?? 0,
      reality: scores.reality ?? 0,
      options: scores.options ?? 0,
      will: scores.will ?? 0
    }
  }

  private matchPhaseKey(value: string): PhaseKey | null {
    const normalized = value.toLowerCase().replace(/[^a-z]/g, '')
    if (normalized.includes('goal')) return 'goal'
    if (normalized.includes('reality')) return 'reality'
    if (normalized.includes('option')) return 'options'
    if (normalized.includes('will')) return 'will'
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
