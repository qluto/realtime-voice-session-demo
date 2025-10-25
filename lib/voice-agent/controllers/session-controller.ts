import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime'
import {
  addMessageToLog,
  addConversationEndMarker,
  clearConversationLog,
  showConversationLog,
  hideConversationLog
} from '../utils/conversation-logger'
import { startSessionTimer, stopSessionTimer } from '../utils/session-timer'
import {
  startUsageTracking,
  stopUsageTracking,
  resetUsageStats,
  getHasUsageData
} from '../utils/usage-tracker'
import {
  showRecordingIndicator,
  hideRecordingIndicator,
  startSpeakingAnimation,
  stopSpeakingAnimation
} from '../utils/speaking-animation'
import { SessionAnalyzer } from '../session-analyzer/index.ts'
import { type VoiceAgentDomRefs } from '../internals/dom-registry.ts'
import { type Modality } from '../internals/ui-state.ts'
import { SummaryController } from './summary-controller.ts'

interface ConnectOptions {
  instructions: string
  outputModalities: ('audio' | 'text')[]
  personalityPresetId: string
  purposePresetId: string
  questionnaireCompleted: boolean
  preferenceDirectives: string[]
  summaryAutoEnabled: boolean
}

interface ConnectionStatus {
  connected: boolean
  connecting: boolean
  hasUsageData: boolean
}

interface SessionControllerOptions {
  tokenEndpoint: string
  dom: VoiceAgentDomRefs
  summaryController: SummaryController
  getDesiredOutputModalities: () => ('audio' | 'text')[]
  onStatusChange: (status: ConnectionStatus) => void
}

const suppressedPurposeSet = new Set(['progress-score', 'closure-readiness', 'summary-consent-eval'])

export class SessionController {
  private readonly tokenEndpoint: string
  private readonly dom: VoiceAgentDomRefs
  private readonly summaryController: SummaryController
  private readonly getDesiredOutputModalities: () => ('audio' | 'text')[]
  private readonly onStatusChange: (status: ConnectionStatus) => void
  private session: RealtimeSession | null = null
  private sessionAnalyzer: SessionAnalyzer | null = null
  private isConnected = false
  private isConnecting = false
  private currentModality: Modality = 'voice'
  private hasSentInitialGreeting = false
  private lastInstructionsSent: string | null = null
  private lastOutputModalities: ('audio' | 'text')[] | null = null
  private pendingLocalUserMessages: string[] = []
  private suppressedResponseIds = new Set<string>()
  private suppressedItemIds = new Set<string>()
  private connectFallbackTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: SessionControllerOptions) {
    this.tokenEndpoint = options.tokenEndpoint
    this.dom = options.dom
    this.summaryController = options.summaryController
    this.getDesiredOutputModalities = options.getDesiredOutputModalities
    this.onStatusChange = options.onStatusChange
  }

  async connect(options: ConnectOptions) {
    this.summaryController.reset()
    resetUsageStats()
    clearConversationLog()

    this.updateStatus(false, true)

    try {
      const token = await this.generateEphemeralToken()
      this.pendingLocalUserMessages = []
      this.suppressedResponseIds.clear()
      this.suppressedItemIds.clear()
      this.hasSentInitialGreeting = false
      this.lastInstructionsSent = options.instructions
      this.lastOutputModalities = [...options.outputModalities]

      console.log('🎛️ Starting session with presets:', {
        personality: options.personalityPresetId,
        purpose: options.purposePresetId,
        questionnaireCompleted: options.questionnaireCompleted,
        preferenceDirectives: options.preferenceDirectives
      })

      const agent = new RealtimeAgent({
        name: 'Coach',
        instructions: options.instructions
      })

      this.session = new RealtimeSession(agent, {
        model: 'gpt-realtime',
        config: {
          outputModalities: options.outputModalities
        }
      })

      this.session.on('transport_event', this.handleTransportEvent)
      this.session.on('error', this.handleSessionError)

      this.sessionAnalyzer?.dispose()
      this.sessionAnalyzer = new SessionAnalyzer({
        session: this.session,
        controls: {
          panel: this.dom.progressPanel || null,
          phaseFills: this.dom.phaseFillElements,
          phaseScores: this.dom.phaseScoreElements,
          currentPhase: this.dom.currentPhase || null,
          progressNotes: this.dom.progressNotes || null,
          closureContainer: this.dom.closureSuggestion || null,
          closureMessage: this.dom.closureMessage || null
        },
        getOutputModalities: this.getDesiredOutputModalities,
        initialAutoSummary: options.summaryAutoEnabled,
        onRequestSummary: () => this.summaryController.requestSummary(true)
      })
      this.summaryController.setSessionAnalyzer(this.sessionAnalyzer)

      await this.session.connect({
        apiKey: token
      })

      this.connectFallbackTimer = setTimeout(() => {
        if (this.session && !this.isConnected) {
          console.log('Voice agent connected! You can now speak to the assistant.')
          this.handleConnected()
        }
      }, 1000)
    } catch (error) {
      console.error('Connection failed:', error)
      this.summaryController.reset()
      this.summaryController.setSessionAnalyzer(null)
      this.cleanupAnalyzer()
      this.updateStatus(false)
      throw error
    }
  }

  async disconnect() {
    console.log('Disconnecting from voice agent...')
    this.stopConnectFallbackTimer()

    stopUsageTracking(this.session)
    stopSessionTimer()
    stopSpeakingAnimation()
    hideRecordingIndicator()

    this.summaryController.reset()
    this.summaryController.setSessionAnalyzer(null)
    this.cleanupAnalyzer()
    this.lastInstructionsSent = null
    this.lastOutputModalities = null
    this.hasSentInitialGreeting = false
    this.pendingLocalUserMessages = []
    this.suppressedResponseIds.clear()
    this.suppressedItemIds.clear()

    addConversationEndMarker()

    if (this.session) {
      try {
        this.session.close()
      } catch (error) {
        console.error('Error during disconnect:', error)
      }
      this.session = null
    }

    this.updateStatus(false)
    console.log('Disconnected from voice agent')
  }

  isSessionConnected() {
    return this.isConnected
  }

  shutdown() {
    try {
      this.session?.close()
    } catch (error) {
      console.error('Error closing session during shutdown:', error)
    }
  }

  getSessionAnalyzer() {
    return this.sessionAnalyzer
  }

  handleModalityChange(modality: Modality) {
    this.currentModality = modality
    this.lastOutputModalities = null
    this.updateMicrophoneState()
  }

  recordLocalUserMessage(raw: string, options: { log?: boolean } = {}) {
    const trimmed = raw.trim()
    if (!trimmed) return null
    this.pendingLocalUserMessages.push(this.normalizeForDedup(trimmed))
    if (options.log === false) return null
    return addMessageToLog('user', trimmed)
  }

  async sendUserText(message: string) {
    if (!this.session || !this.isConnected) {
      throw new Error('Session is not connected')
    }
    this.recordLocalUserMessage(message)
    await this.session.sendMessage({
      type: 'message',
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: message
        }
      ]
    })
  }

  async sendSummaryPrompt(prompt: string) {
    if (!this.session || !this.isConnected) {
      throw new Error('Session is not connected')
    }
    await this.session.sendMessage({
      type: 'message',
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: prompt
        }
      ]
    })
  }

  async updateSessionConfig(config: { instructions?: string; outputModalities?: ('audio' | 'text')[] }) {
    if (!this.session) return
    const instructions = config.instructions ?? this.lastInstructionsSent
    const outputModalities = config.outputModalities ?? this.lastOutputModalities ?? this.getDesiredOutputModalities()

    if (!instructions) return

    const instructionsChanged = instructions !== this.lastInstructionsSent
    const modalitiesChanged = !this.modalitiesAreEqual(this.lastOutputModalities, outputModalities)

    if (!instructionsChanged && !modalitiesChanged) {
      return
    }

    try {
      this.session.transport.updateSessionConfig({
        instructions,
        outputModalities
      })
      this.lastInstructionsSent = instructions
      this.lastOutputModalities = [...outputModalities]
      console.log('🧭 Updated live coaching instructions', {
        modalities: outputModalities.join(', ')
      })
    } catch (error) {
      console.error('Failed to update session instructions:', error)
    }
  }

  private handleConnected() {
    if (!this.session) return
    this.isConnected = true
    this.isConnecting = false
    this.updateStatus(true)
    this.updateMicrophoneState()
    startUsageTracking(this.session)
    startSessionTimer()
    this.sendInitialGreeting()
  }

  private updateStatus(connected: boolean, connecting: boolean = false) {
    this.isConnected = connected
    this.isConnecting = connecting
    const hasUsageData = getHasUsageData()

    this.onStatusChange({ connected, connecting: this.isConnecting, hasUsageData })

    if (connected) {
      showConversationLog()
    } else {
      hideConversationLog(hasUsageData)
    }

    this.summaryController.setConnected(connected)
  }

  private getGreetingForCurrentTime() {
    const hour = new Date().getHours()
    if (hour < 5) return 'こんばんは'
    if (hour < 11) return 'おはようございます'
    if (hour < 18) return 'こんにちは'
    if (hour < 22) return 'こんばんは'
    return 'こんばんは'
  }

  private sendInitialGreeting() {
    if (!this.session) return
    if (this.hasSentInitialGreeting) return
    const greeting = this.getGreetingForCurrentTime()
    if (!greeting) return
    try {
      this.recordLocalUserMessage(greeting, { log: false })
      this.session.sendMessage({
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text: greeting
        }]
      })
      this.hasSentInitialGreeting = true
      console.log('🙋 Sent automatic greeting message to agent:', greeting)
    } catch (error) {
      console.error('Failed to send initial greeting:', error)
    }
  }

  private updateMicrophoneState() {
    if (!this.session) return
    const shouldMute = this.currentModality === 'text'
    try {
      this.session.mute(shouldMute)
      console.log(
        shouldMute
          ? '🔇 Microphone muted because text mode is active'
          : '🎙️ Microphone unmuted for voice mode'
      )
    } catch (error) {
      console.error('Failed to update microphone state:', error)
    }

    if (shouldMute) {
      hideRecordingIndicator()
    }
  }

  private async generateEphemeralToken(): Promise<string> {
    if (!this.dom.statusElement) return ''
    this.dom.statusElement.textContent = 'トークン生成中...'

    try {
      const response = await fetch(this.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(`Token generation failed: ${errorData.error}`)
      }

      const data = await response.json()
      console.log('✅ New ephemeral token generated')
      return data.token
    } catch (error) {
      console.error('❌ Failed to generate ephemeral token:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to generate ephemeral token: ${errorMessage}`)
    }
  }

  private handleTransportEvent = (event: any) => {
    console.log('🎯 Transport event:', event.type, event)
    console.log(`⏰ ${new Date().toLocaleTimeString()} - EVENT: ${event.type}:`, event)

    if (event.type.includes('audio')) {
      console.log(`🔊 AUDIO EVENT: ${event.type}`, event)
    }

    if (event.type === 'response.created') {
      const response = event.response
      const purpose = response?.metadata?.purpose || response?.metadata?.Purpose || null
      this.summaryController.handleResponseCreated(response?.id || null, purpose)
      this.maybeSuppressResponse(response)
    } else if (event.type === 'response.output_item.added' || event.type === 'response.output_item.done') {
      if (event.response_id && this.suppressedResponseIds.has(event.response_id)) {
        this.recordSuppressedItemId(event.item)
      }
    }

    if (event.type === 'session.created') {
      console.log('Connected to OpenAI Realtime API')
      this.handleConnected()
    } else if (event.type === 'error' || event.type === 'close') {
      console.log('Disconnected from OpenAI Realtime API')
      this.handleDisconnectCleanup()
      this.updateStatus(false)
    } else if (event.type === 'input_audio_buffer.speech_started') {
      console.log('User started speaking - stopping coach animation')
      stopSpeakingAnimation()
      showRecordingIndicator()
    } else if (event.type === 'input_audio_buffer.speech_stopped') {
      console.log('User stopped speaking')
      hideRecordingIndicator()
    } else if (event.type === 'conversation.item.input_audio_transcription.completed') {
      const transcript = event.transcript
      if (transcript && transcript.trim()) {
        this.recordLocalUserMessage(transcript)
      }
    } else if (event.type === 'response.output_text.delta') {
      if (!event.response_id || !this.suppressedResponseIds.has(event.response_id)) {
        console.log('Assistant text delta:', event.delta)
      }
    } else if (event.type === 'response.output_text.done') {
      if (!event.response_id || !this.suppressedResponseIds.has(event.response_id)) {
        const text = event.text
        if (text && text.trim()) {
          addMessageToLog('assistant', text.trim())
        }
      }
    } else if (event.type === 'conversation.item.created' || event.type === 'conversation.item.added') {
      this.handleConversationItem(event.item)
    } else if (event.type === 'response.audio_transcript.delta') {
      const transcript = event.delta
      if (transcript) {
        console.log('🎵 Assistant audio delta:', transcript)
      }
    } else if (event.type === 'response.audio_transcript.done') {
      const transcript = event.transcript
      if (transcript && transcript.trim()) {
        console.log('📝 Adding assistant audio transcript:', transcript)
        const messageId = `audio_transcript_${Date.now()}_${Math.random()}`
        const messageElement = addMessageToLog('assistant', transcript.trim(), undefined, messageId)
        console.log('🎵 Starting animation after audio transcript done')
        startSpeakingAnimation(messageElement)
      }
    } else if (event.type === 'response.output_audio_transcript.done') {
      const transcript = event.transcript
      if (transcript && transcript.trim()) {
        console.log('📝 Adding assistant output audio transcript:', transcript)
        const messageId = `output_audio_transcript_${Date.now()}_${Math.random()}`
        const messageElement = addMessageToLog('assistant', transcript.trim(), undefined, messageId)
        console.log('🎵 Starting animation after output audio transcript done')
        startSpeakingAnimation(messageElement)
      }
    } else if (event.type === 'response.done') {
      const response = event.response
      const suppressed = this.maybeSuppressResponse(response)
      if (suppressed) {
        (response?.output ?? []).forEach((item: any) => this.recordSuppressedItemId(item))
      } else if (response && response.output) {
        response.output.forEach((item: any) => {
          if (item.type === 'message' && item.role === 'assistant') {
            const content = item.content
            if (Array.isArray(content)) {
              content.forEach((c: any) => {
                if (c.type === 'text' && c.text) {
                  console.log('📝 Adding assistant text from response.done:', c.text)
                  addMessageToLog('assistant', c.text)
                }
              })
            } else if (content && content.text) {
              console.log('📝 Adding assistant content from response.done:', content.text)
              addMessageToLog('assistant', content.text)
            }
          }
        })
      }

      const responseId = response?.id || event.response_id || null
      const purpose = response?.metadata?.purpose || response?.metadata?.Purpose || null
      const requiresAudioStop = this.summaryController.isWaitingForPlaybackStop()
      this.summaryController.handleResponseCompleted({
        responseId,
        purpose,
        requiresAudioPlaybackStop: requiresAudioStop
      })
    } else if (event.type === 'output_audio_buffer.stopped') {
      console.log('🔊 Audio playback stopped - stopping animation')
      stopSpeakingAnimation()
      this.summaryController.handleAudioPlaybackStopped()
    } else if (event.type === 'response.audio.done') {
      console.log('🔊 Audio done - stopping animation')
      stopSpeakingAnimation()
      this.summaryController.handleAudioPlaybackStopped()
    }

    this.sessionAnalyzer?.handleTransportEvent(event)
  }

  private handleSessionError = (error: any) => {
    console.error('Session error:', error)
    alert(`Error: ${error?.error || 'Unknown error occurred'}`)
    this.handleDisconnectCleanup()
    this.updateStatus(false)
  }

  private handleDisconnectCleanup() {
    this.stopConnectFallbackTimer()
    stopUsageTracking(this.session)
    stopSessionTimer()
    stopSpeakingAnimation()
    hideRecordingIndicator()
    this.summaryController.reset()
    this.summaryController.setSessionAnalyzer(null)
    this.cleanupAnalyzer()
    this.sessionAnalyzer = null
    this.session = null
    this.hasSentInitialGreeting = false
    this.pendingLocalUserMessages = []
    this.suppressedResponseIds.clear()
    this.suppressedItemIds.clear()
    this.lastInstructionsSent = null
    this.lastOutputModalities = null
  }

  private cleanupAnalyzer() {
    this.sessionAnalyzer?.dispose()
    this.sessionAnalyzer = null
  }

  private stopConnectFallbackTimer() {
    if (this.connectFallbackTimer) {
      clearTimeout(this.connectFallbackTimer)
      this.connectFallbackTimer = null
    }
  }

  private handleConversationItem(item: any) {
    if (!item || !item.content) return
    if (this.suppressedItemIds.has(item.id)) return

    const content = Array.isArray(item.content)
      ? item.content.map((c: any) => c.text || c.transcript || '').join(' ')
      : item.content.text || item.content.transcript || ''

    const trimmedContent = content.trim()
    if (!trimmedContent) return

    let shouldLog = true
    if (item.role === 'user') {
      const normalizedContent = this.normalizeForDedup(trimmedContent)
      const pendingIndex = this.pendingLocalUserMessages.indexOf(normalizedContent)
      if (pendingIndex !== -1) {
        this.pendingLocalUserMessages.splice(pendingIndex, 1)
        shouldLog = false
      }
    }

    if (shouldLog) {
      addMessageToLog(item.role === 'user' ? 'user' : 'assistant', trimmedContent)
    }
  }

  private maybeSuppressResponse(response: any): boolean {
    if (!response) return false
    const purpose = response.metadata?.purpose || response.metadata?.Purpose
    if (purpose && suppressedPurposeSet.has(String(purpose))) {
      if (response.id) {
        this.suppressedResponseIds.add(response.id)
      }
      return true
    }
    return false
  }

  private recordSuppressedItemId(item: any) {
    const itemId = item?.id
    if (typeof itemId === 'string' && itemId.length > 0) {
      this.suppressedItemIds.add(itemId)
    }
  }

  private modalitiesAreEqual(previous: ('audio' | 'text')[] | null, next: ('audio' | 'text')[]) {
    if (!previous) return false
    if (previous.length !== next.length) return false
    for (let index = 0; index < next.length; index += 1) {
      if (previous[index] !== next[index]) {
        return false
      }
    }
    return true
  }

  private normalizeForDedup(value: string) {
    return value.trim().replace(/\s+/g, ' ')
  }
}
