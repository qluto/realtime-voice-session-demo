import { collectDomRefs } from '../internals/dom-registry.ts'
import { createStorageService } from '../internals/storage-service.ts'
import { createVoiceAgentState, type Modality } from '../internals/ui-state.ts'
import { SidebarController } from './sidebar-controller.ts'
import { QuestionnaireController } from './questionnaire-controller.ts'
import { ModalityController } from './modality-controller.ts'
import { TextChatController } from './text-chat-controller.ts'
import { SummaryController } from './summary-controller.ts'
import { SessionController } from './session-controller.ts'
import {
  getSessionPurposePreset,
  defaultPurposeId
} from '../utils/prompt-presets.ts'
import {
  getPersonalityPreset,
  defaultPersonalityId,
  type PersonalityPreset
} from '../utils/prompt-presets.ts'
import { buildAgentInstructions, type DynamicPromptContext } from '../prompts/prompt-builder.ts'

interface VoiceAgentControllerOptions {
  tokenEndpoint: string
}

export class VoiceAgentController {
  private readonly dom = collectDomRefs()
  private readonly storage = createStorageService()
  private readonly stateStore = createVoiceAgentState()
  private readonly sidebarController = new SidebarController({ dom: this.dom, storage: this.storage })
  private readonly questionnaireController = new QuestionnaireController({ dom: this.dom, storage: this.storage })
  private readonly modalityController = new ModalityController({ dom: this.dom })
  private readonly summaryController: SummaryController
  private readonly sessionController: SessionController
  private readonly textChatController: TextChatController
  private activePersonalityPreset: PersonalityPreset = getPersonalityPreset(defaultPersonalityId)
  private currentPurposePreset = getSessionPurposePreset(defaultPurposeId)
  private lastPreferenceDirectives: string[] = []
  private questionnaireComplete = false
  private currentModality: Modality = 'voice'
  private lastDynamicContext: DynamicPromptContext | null = null

  constructor(options: VoiceAgentControllerOptions) {
    const sessionRef: { current: SessionController | null } = { current: null }
    this.summaryController = new SummaryController({
      dom: this.dom,
      disconnect: () => sessionRef.current?.disconnect(),
      getDesiredOutputModalities: () => this.getDesiredOutputModalities(),
      recordLocalUserMessage: (message, recordOptions) =>
        sessionRef.current?.recordLocalUserMessage(message, recordOptions) ?? null,
      sendSummaryPrompt: async (prompt) => {
        if (!sessionRef.current) throw new Error('Session is not ready')
        await sessionRef.current.sendSummaryPrompt(prompt)
      }
    })

    this.sessionController = new SessionController({
      tokenEndpoint: options.tokenEndpoint,
      dom: this.dom,
      summaryController: this.summaryController,
      getDesiredOutputModalities: () => this.getDesiredOutputModalities(),
      onStatusChange: this.handleConnectionStatusUpdate
    })

    sessionRef.current = this.sessionController

    this.textChatController = new TextChatController({
      dom: this.dom,
      sendTextMessage: async (message: string) => {
        await this.sessionController.sendUserText(message)
      }
    })
  }

  init() {
    this.sidebarController.init()
    this.summaryController.init()
    this.questionnaireController.init()
    this.modalityController.init()
    this.textChatController.init()

    this.setupQuestionnaireSubscriptions()
    this.setupModalitySubscriptions()
    this.setupPurposeControls()
    this.setupConnectionControls()
    this.setupTranscriptCopy()
    this.syncInitialSidebarState()
    this.resetStatusUi()
  }

  dispose() {
    this.sidebarController.dispose()
    this.summaryController.dispose()
    this.questionnaireController.dispose()
    this.modalityController.dispose()
    this.textChatController.dispose()
    window.removeEventListener('beforeunload', this.handleBeforeUnload)
  }

  private setupQuestionnaireSubscriptions() {
    this.questionnaireController.subscribe((state) => {
      this.activePersonalityPreset = state.personalityPreset
      this.lastPreferenceDirectives = state.preferenceDirectives
      this.questionnaireComplete = state.isComplete
      this.stateStore.update({ questionnaireComplete: state.isComplete })
      this.sidebarController.setQuestionnaireComplete(state.isComplete)
      if (this.sessionController.isSessionConnected()) {
        this.syncSessionInstructions()
      }
    })
  }

  private setupModalitySubscriptions() {
    this.modalityController.subscribe((modality) => {
      this.currentModality = modality
      this.stateStore.update({ currentModality: modality })
      this.textChatController.setModality(modality)
      this.summaryController.setModality(modality)
      this.sessionController.handleModalityChange(modality)
      this.syncSessionInstructions()
    })
  }

  private setupPurposeControls() {
    const storedPurpose = this.storage.getPurpose()
    if (this.dom.purposeSelect) {
      if (!this.dom.purposeSelect.value) {
        this.dom.purposeSelect.value = defaultPurposeId
      }

      if (storedPurpose && Array.from(this.dom.purposeSelect.options).some((option) => option.value === storedPurpose)) {
        this.dom.purposeSelect.value = storedPurpose
      }

      this.dom.purposeSelect.addEventListener('change', () => {
        const value = this.dom.purposeSelect?.value || defaultPurposeId
        this.storage.setPurpose(value || null)
        this.currentPurposePreset = getSessionPurposePreset(value)
        this.updatePurposeDescription()
        this.syncSessionInstructions()
      })
    }

    this.updatePurposeDescription()
  }

  private setupConnectionControls() {
    this.dom.connectBtn.addEventListener('click', () => {
      void this.startSession()
    })

    this.dom.newSessionBtn.addEventListener('click', () => {
      void this.startSession()
    })

    this.dom.disconnectBtn.addEventListener('click', () => {
      void this.handleDisconnect()
    })

    window.addEventListener('beforeunload', this.handleBeforeUnload)
  }

  private setupTranscriptCopy() {
    if (!this.dom.copyTranscriptBtn) return
    const button = this.dom.copyTranscriptBtn
    const handleCopy = async () => {
      const logContainer = document.getElementById('log-container')
      if (!logContainer) return

      const messages = Array.from(logContainer.querySelectorAll<HTMLElement>('.message'))
      if (messages.length === 0) return

      const transcript = messages
        .map((message) => {
          const role = message.classList.contains('user') ? 'You' : 'Coach'
          const timestamp = message.querySelector<HTMLElement>('.message-timestamp')?.textContent?.trim()
          const content = message.querySelector<HTMLElement>('.message-content')?.textContent?.trim() || ''
          const header = timestamp ? `[${timestamp}] ${role}` : role
          return `${header}\n${content}`
        })
        .join('\n\n')

      const tryClipboard = async () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(transcript)
          return true
        }
        return false
      }

      let copied = false
      try {
        copied = transcript.length > 0 ? await tryClipboard() : false
      } catch (error) {
        console.error('Failed to write transcript via clipboard API:', error)
        copied = false
      }

      if (!copied && transcript.length > 0) {
        const helper = document.createElement('textarea')
        helper.value = transcript
        helper.setAttribute('readonly', 'true')
        helper.style.position = 'absolute'
        helper.style.left = '-9999px'
        document.body.appendChild(helper)
        helper.select()
        try {
          copied = document.execCommand('copy')
        } catch (error) {
          console.error('Fallback copy failed:', error)
          copied = false
        } finally {
          document.body.removeChild(helper)
        }
      }

      if (copied) {
        button.classList.add('copied')
        const originalLabel = button.getAttribute('data-label') || button.innerHTML
        if (!button.getAttribute('data-label')) {
          button.setAttribute('data-label', originalLabel)
        }
        button.innerHTML = '<span aria-hidden="true">✅</span><span>コピーしました</span>'
        setTimeout(() => {
          const saved = button.getAttribute('data-label')
          if (saved) {
            button.innerHTML = saved
          }
          button.classList.remove('copied')
        }, 2000)
      } else {
        alert('コピーに失敗しました。ブラウザ設定をご確認ください。')
      }
    }

    button.addEventListener('click', handleCopy)
  }

  private syncInitialSidebarState() {
    if (this.dom.configSidebar?.classList.contains('is-open')) {
      document.body.classList.add('config-sidebar-open')
    } else {
      document.body.classList.remove('config-sidebar-open')
    }
  }

  private resetStatusUi() {
    this.handleConnectionStatusUpdate({
      connected: false,
      connecting: false,
      hasUsageData: false
    })
  }

  private async startSession() {
    try {
      this.textChatController.reset()
      this.lastDynamicContext = null
      const instructions = this.buildInstructions()
      const modalities = this.getDesiredOutputModalities()
      await this.sessionController.connect({
        instructions,
        outputModalities: modalities,
        personalityPresetId: this.activePersonalityPreset.id,
        purposePresetId: this.currentPurposePreset.id,
        questionnaireCompleted: this.questionnaireComplete,
        preferenceDirectives: this.lastPreferenceDirectives,
        summaryAutoEnabled: this.dom.autoSummaryToggle?.checked ?? true
      })
    } catch (error) {
      console.error('Failed to connect:', error)
      alert('Failed to connect to voice agent. Please check your ephemeral token and try again.')
    }
  }

  private async handleDisconnect() {
    await this.sessionController.disconnect()
    this.textChatController.reset()
    this.lastDynamicContext = null
  }

  private buildInstructions(dynamicContext?: DynamicPromptContext | null) {
    return buildAgentInstructions(
      this.activePersonalityPreset,
      this.currentPurposePreset,
      this.lastPreferenceDirectives,
      dynamicContext ?? undefined
    )
  }

  private syncSessionInstructions(dynamicContext: DynamicPromptContext | null = this.lastDynamicContext) {
    if (!this.sessionController.isSessionConnected()) return
    const instructions = this.buildInstructions(dynamicContext)
    const modalities = this.getDesiredOutputModalities()
    void this.sessionController.updateSessionConfig({
      instructions,
      outputModalities: modalities
    })
  }

  private getDesiredOutputModalities(): ('audio' | 'text')[] {
    return this.currentModality === 'text' ? ['text'] : ['audio']
  }

  private updatePurposeDescription() {
    if (this.dom.purposeDescription) {
      this.dom.purposeDescription.textContent = this.currentPurposePreset.description
    }
  }

  private handleConnectionStatusUpdate = (status: { connected: boolean; connecting: boolean; hasUsageData: boolean }) => {
    const { connected, connecting, hasUsageData } = status
    this.stateStore.update({ isConnected: connected, isConnecting: connecting })

    if (this.dom.purposeSelect) {
      this.dom.purposeSelect.disabled = connected || connecting
    }
    this.questionnaireController.setInputsDisabled(connected || connecting)

    if (this.dom.statusElement) {
      if (connecting) {
        this.dom.statusElement.textContent = '接続中...'
      } else if (connected) {
        this.dom.statusElement.textContent = '接続済み'
      } else {
        this.dom.statusElement.textContent = '切断済み'
      }
    }

    if (this.dom.statusIndicator) {
      const baseClass = 'status-indicator'
      if (connecting) {
        this.dom.statusIndicator.className = `${baseClass} connecting`
      } else if (connected) {
        this.dom.statusIndicator.className = `${baseClass} connected`
      } else {
        this.dom.statusIndicator.className = `${baseClass} disconnected`
      }
    }

    if (connecting) {
      this.toggleButtonVisibility({ connect: false, disconnect: false, newSession: false })
      this.setButtonDisabledState(true)
    } else if (connected) {
      this.toggleButtonVisibility({ connect: false, disconnect: true, newSession: false })
      this.dom.disconnectBtn.disabled = false
      this.dom.connectBtn.disabled = true
      this.dom.newSessionBtn.disabled = true
    } else {
      if (hasUsageData) {
        this.toggleButtonVisibility({ connect: false, disconnect: false, newSession: true })
        this.dom.newSessionBtn.disabled = false
      } else {
        this.toggleButtonVisibility({ connect: true, disconnect: false, newSession: false })
        this.dom.connectBtn.disabled = false
      }
      this.dom.disconnectBtn.disabled = true
    }

    this.textChatController.setConnected(connected)
  }

  private toggleButtonVisibility(options: { connect: boolean; disconnect: boolean; newSession: boolean }) {
    this.dom.connectBtn.style.display = options.connect ? 'inline-block' : 'none'
    this.dom.disconnectBtn.style.display = options.disconnect ? 'inline-block' : 'none'
    this.dom.newSessionBtn.style.display = options.newSession ? 'inline-block' : 'none'
  }

  private setButtonDisabledState(disabled: boolean) {
    this.dom.connectBtn.disabled = disabled
    this.dom.disconnectBtn.disabled = disabled
    this.dom.newSessionBtn.disabled = disabled
  }

  private handleBeforeUnload = () => {
    this.sessionController.shutdown()
  }
}
