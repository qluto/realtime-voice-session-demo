import { type VoiceAgentDomRefs } from '../internals/dom-registry.ts'
import { type Modality } from '../internals/ui-state.ts'

type ModalityListener = (modality: Modality) => void

interface ModalityControllerOptions {
  dom: VoiceAgentDomRefs
}

export class ModalityController {
  private readonly dom: VoiceAgentDomRefs
  private currentModality: Modality = 'voice'
  private readonly listeners = new Set<ModalityListener>()
  private removeListeners: (() => void)[] = []

  constructor(options: ModalityControllerOptions) {
    this.dom = options.dom
  }

  init() {
    this.attachListeners()
    this.updateModalityUI()
  }

  dispose() {
    this.removeListeners.forEach((remove) => remove())
    this.removeListeners = []
    this.listeners.clear()
  }

  getModality(): Modality {
    return this.currentModality
  }

  setModality(modality: Modality) {
    if (this.currentModality === modality) return
    this.currentModality = modality
    this.updateModalityUI()
    this.notify()
  }

  subscribe(listener: ModalityListener): () => void {
    this.listeners.add(listener)
    listener(this.currentModality)
    return () => this.listeners.delete(listener)
  }

  private attachListeners() {
    const { modalityButtons } = this.dom
    modalityButtons.forEach((button, index) => {
      const handleClick = () => {
        const modality = (button.dataset.modality as Modality | undefined) ?? 'voice'
        this.setModality(modality)
      }
      const handleKeydown = (event: KeyboardEvent) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
        event.preventDefault()
        const offset = event.key === 'ArrowRight' ? 1 : -1
        const nextIndex = (index + offset + modalityButtons.length) % modalityButtons.length
        const nextButton = modalityButtons[nextIndex]
        nextButton.focus()
        const modality = (nextButton.dataset.modality as Modality | undefined) ?? 'voice'
        this.setModality(modality)
      }
      button.addEventListener('click', handleClick)
      button.addEventListener('keydown', handleKeydown)
      this.removeListeners.push(() => {
        button.removeEventListener('click', handleClick)
        button.removeEventListener('keydown', handleKeydown)
      })
    })
  }

  private updateModalityUI() {
    const { modalityButtons } = this.dom
    modalityButtons.forEach((button) => {
      const modality = button.dataset.modality as Modality | undefined
      const isActive = modality === this.currentModality
      button.classList.toggle('is-selected', isActive)
      button.setAttribute('aria-checked', isActive ? 'true' : 'false')
    })
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.currentModality))
  }
}
