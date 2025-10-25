import { type VoiceAgentDomRefs } from '../internals/dom-registry.ts'
import { type StorageService } from '../internals/storage-service.ts'

type FocusTarget = 'close' | 'trigger' | null

interface SidebarControllerOptions {
  dom: VoiceAgentDomRefs
  storage: StorageService
}

export class SidebarController {
  private readonly dom: VoiceAgentDomRefs
  private readonly storage: StorageService
  private questionnaireComplete = false
  private storedHiddenPreference: boolean
  private hasAppliedStoredPreference = false
  private isOpen = false
  private removeDocumentClick: (() => void) | null = null
  private removeListeners: (() => void)[] = []

  constructor(options: SidebarControllerOptions) {
    this.dom = options.dom
    this.storage = options.storage
    this.storedHiddenPreference = this.storage.getSidebarHidden()
  }

  init() {
    const initialOpen = this.dom.configSidebar?.classList.contains('is-open') ?? false
    this.setOpen(initialOpen, { persist: false })
    this.attachListeners()
  }

  dispose() {
    this.removeListeners.forEach((remove) => remove())
    this.removeListeners = []
    if (this.removeDocumentClick) {
      this.removeDocumentClick()
      this.removeDocumentClick = null
    }
  }

  setQuestionnaireComplete(complete: boolean) {
    this.questionnaireComplete = complete
    this.updateControlsAvailability()

    if (!complete) {
      this.hasAppliedStoredPreference = false
      this.storedHiddenPreference = false
      this.setOpen(true, { persist: false })
      return
    }

    if (!this.hasAppliedStoredPreference) {
      this.setOpen(!this.storedHiddenPreference, { persist: false })
      this.hasAppliedStoredPreference = true
    }
  }

  setOpen(open: boolean, options: { persist?: boolean; focusTarget?: FocusTarget } = {}) {
    const { persist = true, focusTarget = null } = options
    this.isOpen = open

    if (this.dom.configSidebar) {
      this.dom.configSidebar.classList.toggle('is-open', open)
      this.dom.configSidebar.setAttribute('aria-hidden', String(!open))
    }
    if (this.dom.configSidebarBackdrop) {
      this.dom.configSidebarBackdrop.classList.toggle('is-open', open)
    }
    if (this.dom.configOpenBtn) {
      this.dom.configOpenBtn.setAttribute('aria-expanded', String(open))
    }

    if (open) {
      document.body.classList.add('config-sidebar-open')
      if (focusTarget === 'close' && !(this.dom.configCloseBtn?.disabled)) {
        this.dom.configCloseBtn?.focus()
      }
    } else {
      document.body.classList.remove('config-sidebar-open')
      if (focusTarget === 'trigger' && !(this.dom.configOpenBtn?.disabled)) {
        this.dom.configOpenBtn?.focus()
      }
    }

    if (persist) {
      this.storage.setSidebarHidden(!open)
      this.storedHiddenPreference = !open
    }
  }

  private attachListeners() {
    if (this.dom.configOpenBtn) {
      this.dom.configOpenBtn.addEventListener('click', this.handleOpenClick)
      this.removeListeners.push(() => this.dom.configOpenBtn?.removeEventListener('click', this.handleOpenClick))
    }
    if (this.dom.configCloseBtn) {
      this.dom.configCloseBtn.addEventListener('click', this.handleCloseClick)
      this.removeListeners.push(() => this.dom.configCloseBtn?.removeEventListener('click', this.handleCloseClick))
    }
    if (this.dom.configSidebarBackdrop) {
      this.dom.configSidebarBackdrop.addEventListener('click', this.handleBackdropClick)
      this.removeListeners.push(() => this.dom.configSidebarBackdrop?.removeEventListener('click', this.handleBackdropClick))
    }
    if (this.dom.configSidebarSurface) {
      this.dom.configSidebarSurface.addEventListener('keydown', this.handleSurfaceKeydown)
      this.removeListeners.push(() => this.dom.configSidebarSurface?.removeEventListener('keydown', this.handleSurfaceKeydown))
    }

    const documentClick = (event: MouseEvent) => {
      if (!this.questionnaireComplete) return
      if (!this.isOpen) return
      const target = event.target as Node | null
      if (!target) return
      if (this.dom.configSidebarSurface?.contains(target)) return
      if (this.dom.configOpenBtn?.contains(target)) return
      this.setOpen(false, { focusTarget: 'trigger' })
    }

    document.addEventListener('click', documentClick)
    this.removeDocumentClick = () => document.removeEventListener('click', documentClick)
  }

  private updateControlsAvailability() {
    const lockControls = !this.questionnaireComplete
    if (this.dom.configCloseBtn) {
      this.dom.configCloseBtn.disabled = lockControls
    }
    if (this.dom.configOpenBtn) {
      if (lockControls) {
        this.dom.configOpenBtn.setAttribute('aria-disabled', 'true')
        this.dom.configOpenBtn.disabled = true
      } else {
        this.dom.configOpenBtn.removeAttribute('aria-disabled')
        this.dom.configOpenBtn.disabled = false
      }
    }
  }

  private handleOpenClick = () => {
    this.setOpen(true, { persist: false, focusTarget: 'close' })
  }

  private handleCloseClick = () => {
    if (!this.questionnaireComplete) return
    this.setOpen(false, { focusTarget: 'trigger' })
  }

  private handleBackdropClick = () => {
    if (!this.questionnaireComplete) return
    this.setOpen(false, { focusTarget: 'trigger' })
  }

  private handleSurfaceKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.questionnaireComplete) {
      event.preventDefault()
      this.setOpen(false, { focusTarget: 'trigger' })
    }
  }
}
