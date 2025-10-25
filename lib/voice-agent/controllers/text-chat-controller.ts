import { type VoiceAgentDomRefs } from '../internals/dom-registry.ts'
import { type Modality } from '../internals/ui-state.ts'

interface TextChatControllerOptions {
  dom: VoiceAgentDomRefs
  sendTextMessage: (message: string) => Promise<void> | void
}

export class TextChatController {
  private readonly dom: VoiceAgentDomRefs
  private readonly sendTextMessage: (message: string) => Promise<void> | void
  private isConnected = false
  private currentModality: Modality = 'voice'
  private isComposing = false
  private removeListeners: (() => void)[] = []

  constructor(options: TextChatControllerOptions) {
    this.dom = options.dom
    this.sendTextMessage = options.sendTextMessage
  }

  init() {
    const { textChatInput, textChatForm } = this.dom
    if (!textChatInput || !textChatForm) return

    const handleInput = () => this.updateSubmitState()
    const handleCompositionStart = () => {
      this.isComposing = true
    }
    const handleCompositionEnd = () => {
      this.isComposing = false
      this.updateSubmitState()
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey) return
      if (event.isComposing || this.isComposing) return
      if (this.currentModality !== 'text') return
      event.preventDefault()
      if (this.dom.textChatSubmit?.disabled) return
      if (typeof textChatForm.requestSubmit === 'function') {
        textChatForm.requestSubmit()
      } else {
        textChatForm.dispatchEvent(new Event('submit', { cancelable: true }))
      }
    }
    const handleSubmit = async (event: Event) => {
      event.preventDefault()
      if (!this.isConnected || this.currentModality !== 'text') {
        if (this.dom.textChatHint) {
          this.dom.textChatHint.textContent = '接続後にテキストでメッセージを送信できます。'
          this.dom.textChatHint.style.display = 'block'
        }
        return
      }
      const message = textChatInput.value.trim()
      if (!message) {
        this.updateSubmitState()
        return
      }

      try {
        await this.sendTextMessage(message)
        textChatInput.value = ''
        this.updateSubmitState()
        textChatInput.focus()
      } catch (error) {
        console.error('Failed to send text message:', error)
        alert('メッセージの送信に失敗しました。接続状態を確認してください。')
      }
    }

    textChatInput.addEventListener('input', handleInput)
    textChatInput.addEventListener('compositionstart', handleCompositionStart)
    textChatInput.addEventListener('compositionend', handleCompositionEnd)
    textChatInput.addEventListener('keydown', handleKeydown)
    textChatForm.addEventListener('submit', handleSubmit)

    this.removeListeners.push(() => textChatInput.removeEventListener('input', handleInput))
    this.removeListeners.push(() => textChatInput.removeEventListener('compositionstart', handleCompositionStart))
    this.removeListeners.push(() => textChatInput.removeEventListener('compositionend', handleCompositionEnd))
    this.removeListeners.push(() => textChatInput.removeEventListener('keydown', handleKeydown))
    this.removeListeners.push(() => textChatForm.removeEventListener('submit', handleSubmit))

    this.refreshState()
  }

  dispose() {
    this.removeListeners.forEach((remove) => remove())
    this.removeListeners = []
  }

  setConnected(connected: boolean) {
    this.isConnected = connected
    this.refreshState()
  }

  setModality(modality: Modality) {
    this.currentModality = modality
    this.refreshState()
  }

  reset() {
    if (this.dom.textChatInput) {
      this.dom.textChatInput.value = ''
    }
    this.updateSubmitState()
  }

  private refreshState() {
    const { textChatForm, textChatInput, textChatHint } = this.dom
    const isTextMode = this.currentModality === 'text'
    const enable = isTextMode && this.isConnected

    if (textChatForm) {
      textChatForm.style.display = isTextMode ? 'flex' : 'none'
    }

    if (textChatInput) {
      textChatInput.disabled = !enable
      if (!enable) {
        textChatInput.value = textChatInput.value.trim()
      }
    }

    if (textChatHint) {
      textChatHint.style.display = isTextMode ? 'block' : 'none'
      if (isTextMode) {
        textChatHint.textContent = enable
          ? 'テキストでメッセージを送信できます。'
          : '接続後にテキストでメッセージを送信できます。'
      }
    }

    this.updateSubmitState()
  }

  private updateSubmitState() {
    if (!this.dom.textChatSubmit) return
    const trimmed = this.dom.textChatInput?.value.trim() ?? ''
    const enable = this.currentModality === 'text' && this.isConnected
    this.dom.textChatSubmit.disabled = !enable || trimmed.length === 0
  }
}
