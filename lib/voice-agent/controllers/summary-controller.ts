import { type VoiceAgentDomRefs } from '../internals/dom-registry.ts'
import { type SessionAnalyzer } from '../session-analyzer/index.ts'

const SUMMARY_PROMPT = '今までの会話を基に、今週の振り返りの重要なポイントをまとめてください。セッションを自然にクロージングに向けてください。'
const SUMMARY_DISCONNECT_DELAY = 1500

interface SummaryControllerOptions {
  dom: VoiceAgentDomRefs
  disconnect: () => void
  getDesiredOutputModalities: () => ('audio' | 'text')[]
  recordLocalUserMessage: (message: string, options?: { log?: boolean }) => HTMLElement | null
  sendSummaryPrompt: (prompt: string) => Promise<void>
}

interface SummaryCompletionOptions {
  responseId: string | null
  purpose?: string | null
  requiresAudioPlaybackStop: boolean
}

export class SummaryController {
  private readonly dom: VoiceAgentDomRefs
  private readonly disconnect: () => void
  private readonly getDesiredOutputModalities: () => ('audio' | 'text')[]
  private readonly recordLocalUserMessage: SummaryControllerOptions['recordLocalUserMessage']
  private readonly sendSummaryPrompt: (prompt: string) => Promise<void>
  private summaryAwaitingCompletion = false
  private summaryResponseId: string | null = null
  private summaryWaitingForPlaybackStop = false
  private summaryAutoDisconnectTimer: ReturnType<typeof setTimeout> | null = null
  private sessionAnalyzer: SessionAnalyzer | null = null
  private isConnected = false
  private removeListeners: (() => void)[] = []

  constructor(options: SummaryControllerOptions) {
    this.dom = options.dom
    this.disconnect = options.disconnect
    this.getDesiredOutputModalities = options.getDesiredOutputModalities
    this.recordLocalUserMessage = options.recordLocalUserMessage
    this.sendSummaryPrompt = options.sendSummaryPrompt
  }

  init() {
    this.attachListeners()
  }

  dispose() {
    this.removeListeners.forEach((remove) => remove())
    this.removeListeners = []
    this.clearAutoDisconnectTimer()
  }

  setSessionAnalyzer(analyzer: SessionAnalyzer | null) {
    this.sessionAnalyzer = analyzer
    if (this.dom.autoSummaryToggle && analyzer) {
      analyzer.setAutoSummaryEnabled(this.dom.autoSummaryToggle.checked)
    }
  }

  setConnected(connected: boolean) {
    this.isConnected = connected
  }

  isWaitingForPlaybackStop() {
    return this.summaryWaitingForPlaybackStop
  }

  reset() {
    this.summaryAwaitingCompletion = false
    this.summaryResponseId = null
    this.summaryWaitingForPlaybackStop = false
    this.clearAutoDisconnectTimer()
  }

  markSummaryInitiated() {
    this.sessionAnalyzer?.markSummaryInitiated()
  }

  async requestSummary(triggeredByAnalyzer = false) {
    if (!this.isConnected) return

    try {
      this.markSummaryInitiated()
      this.reset()
      this.summaryAwaitingCompletion = true
      this.summaryResponseId = null

      this.recordLocalUserMessage('セッションのまとめを要求しました。')
      const desiredModalities = this.getDesiredOutputModalities()
      this.summaryWaitingForPlaybackStop = desiredModalities.includes('audio')

      await this.sendSummaryPrompt(SUMMARY_PROMPT)

      if (this.dom.closureSuggestion) {
        this.dom.closureSuggestion.style.display = 'none'
      }

      console.log('📝 Summary request sent to coach')
    } catch (error) {
      console.error('Failed to send summary request:', error)
      this.reset()
      if (!triggeredByAnalyzer) {
        alert('Failed to request summary. Please try again.')
      }
    }
  }

  handleResponseCreated(responseId: string | null, purpose: string | null) {
    if (!this.summaryAwaitingCompletion) return
    if (purpose === 'session-summary') {
      this.summaryResponseId = responseId
      console.log('🧾 Summary response started', { responseId, viaMetadata: true })
    } else if (!this.summaryResponseId && responseId) {
      this.summaryResponseId = responseId
      console.log('🧾 Summary response started', { responseId, viaMetadata: false })
    }
  }

  handleResponseCompleted({ responseId, purpose, requiresAudioPlaybackStop }: SummaryCompletionOptions) {
    if (!this.summaryAwaitingCompletion) return
    const matchesPurpose = purpose === 'session-summary'
    const matchesId = this.summaryResponseId && responseId && this.summaryResponseId === responseId

    if (matchesPurpose || matchesId) {
      this.summaryAwaitingCompletion = false
      this.summaryResponseId = null
      if (requiresAudioPlaybackStop) {
        this.summaryWaitingForPlaybackStop = true
        console.log('✅ Summary response finished, waiting for audio playback to stop before disconnecting')
      } else {
        console.log('✅ Summary response finished in text mode, scheduling auto disconnect')
        this.scheduleSummaryAutoDisconnect()
      }
    }
  }

  handleAudioPlaybackStopped() {
    if (!this.summaryWaitingForPlaybackStop) return
    this.summaryWaitingForPlaybackStop = false
    console.log('✅ Summary audio playback stopped, scheduling auto disconnect')
    this.scheduleSummaryAutoDisconnect()
  }

  private attachListeners() {
    if (this.dom.autoSummaryToggle) {
      const handleChange = () => {
        this.sessionAnalyzer?.setAutoSummaryEnabled(this.dom.autoSummaryToggle!.checked)
      }
      this.dom.autoSummaryToggle.addEventListener('change', handleChange)
      this.removeListeners.push(() => this.dom.autoSummaryToggle?.removeEventListener('change', handleChange))
    }

    if (this.dom.acceptSummaryBtn) {
      const handleClick = async () => {
        if (this.sessionAnalyzer) {
          await this.sessionAnalyzer.acceptClosureSuggestion()
        } else {
          await this.requestSummary(false)
        }
      }
      this.dom.acceptSummaryBtn.addEventListener('click', handleClick)
      this.removeListeners.push(() => this.dom.acceptSummaryBtn?.removeEventListener('click', handleClick))
    }

    if (this.dom.continueSessionBtn) {
      const handleClick = () => {
        if (this.sessionAnalyzer) {
          this.sessionAnalyzer.declineClosureSuggestion()
        } else if (this.dom.closureSuggestion) {
          this.dom.closureSuggestion.style.display = 'none'
        }
      }
      this.dom.continueSessionBtn.addEventListener('click', handleClick)
      this.removeListeners.push(() => this.dom.continueSessionBtn?.removeEventListener('click', handleClick))
    }

    if (this.dom.requestSummaryBtn) {
      const handleClick = () => {
        void this.requestSummary(false)
      }
      this.dom.requestSummaryBtn.addEventListener('click', handleClick)
      this.removeListeners.push(() => this.dom.requestSummaryBtn?.removeEventListener('click', handleClick))
    }
  }

  private scheduleSummaryAutoDisconnect() {
    if (this.summaryAutoDisconnectTimer) return
    this.summaryAutoDisconnectTimer = setTimeout(() => {
      this.summaryAutoDisconnectTimer = null
      this.disconnect()
    }, SUMMARY_DISCONNECT_DELAY)
  }

  private clearAutoDisconnectTimer() {
    if (this.summaryAutoDisconnectTimer) {
      clearTimeout(this.summaryAutoDisconnectTimer)
      this.summaryAutoDisconnectTimer = null
    }
  }
}
