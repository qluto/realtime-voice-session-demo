import { useCallback } from 'react'

import { type Modality } from '../internals/ui-state.ts'
import { type PhaseKey } from '../session-analyzer/index.ts'

export interface VoiceAgentDomRefs {
  connectBtn: HTMLButtonElement
  disconnectBtn: HTMLButtonElement
  newSessionBtn: HTMLButtonElement
  statusElement: HTMLSpanElement
  statusIndicator: HTMLElement
  apiKeyInput: HTMLInputElement | null
  purposeSelect: HTMLSelectElement | null
  purposeDescription: HTMLElement | null
  coachCalibratorForm: HTMLFormElement | null
  coachRecommendationLabel: HTMLElement | null
  coachRecommendationDescription: HTMLElement | null
  coachRecommendationRationale: HTMLElement | null
  configSidebar: HTMLElement | null
  configSidebarSurface: HTMLElement | null
  configSidebarBackdrop: HTMLElement | null
  configOpenBtn: HTMLButtonElement | null
  configCloseBtn: HTMLButtonElement | null
  progressPanel: HTMLElement | null
  currentPhase: HTMLElement | null
  progressNotes: HTMLElement | null
  closureSuggestion: HTMLElement | null
  closureMessage: HTMLElement | null
  autoSummaryToggle: HTMLInputElement | null
  acceptSummaryBtn: HTMLButtonElement | null
  continueSessionBtn: HTMLButtonElement | null
  requestSummaryBtn: HTMLButtonElement | null
  copyTranscriptBtn: HTMLButtonElement | null
  modalityToggle: HTMLElement | null
  modalityButtons: HTMLButtonElement[]
  textChatForm: HTMLFormElement | null
  textChatInput: HTMLTextAreaElement | null
  textChatSubmit: HTMLButtonElement | null
  textChatHint: HTMLElement | null
  phaseFillElements: Record<PhaseKey, HTMLElement | null>
  phaseScoreElements: Record<PhaseKey, HTMLElement | null>
}

type ScalarDomKey = Exclude<keyof VoiceAgentDomRefs, 'modalityButtons' | 'phaseFillElements' | 'phaseScoreElements'>

const scalarRegistry: Partial<{ [K in ScalarDomKey]: VoiceAgentDomRefs[K] }> = {}
const phaseFillRegistry: Record<PhaseKey, HTMLElement | null> = {
  goal: null,
  reality: null,
  options: null,
  will: null
}
const phaseScoreRegistry: Record<PhaseKey, HTMLElement | null> = {
  goal: null,
  reality: null,
  options: null,
  will: null
}
const modalityOrder: Modality[] = ['voice', 'text']
const modalityRegistry: Partial<Record<Modality, HTMLButtonElement>> = {}

const registerScalar = <K extends ScalarDomKey>(key: K, value: VoiceAgentDomRefs[K] | null) => {
  if (value) {
    scalarRegistry[key] = value
  } else {
    delete scalarRegistry[key]
  }
}

export const useDomNode = <K extends ScalarDomKey>(key: K) =>
  useCallback((element: VoiceAgentDomRefs[K] | null) => {
    registerScalar(key, element)
  }, [key])

export const useModalityButton = (modality: Modality) =>
  useCallback((element: HTMLButtonElement | null) => {
    if (element) {
      modalityRegistry[modality] = element
    } else {
      delete modalityRegistry[modality]
    }
  }, [modality])

export const usePhaseFillNode = (phase: PhaseKey) =>
  useCallback((element: HTMLElement | null) => {
    phaseFillRegistry[phase] = element ?? null
  }, [phase])

export const usePhaseScoreNode = (phase: PhaseKey) =>
  useCallback((element: HTMLElement | null) => {
    phaseScoreRegistry[phase] = element ?? null
  }, [phase])

const requireElement = <T extends Element>(element: T | undefined, message: string): T => {
  if (!element) {
    throw new Error(message)
  }
  return element
}

export const collectDomRefs = (): VoiceAgentDomRefs => {
  const connectBtn = requireElement(
    scalarRegistry.connectBtn,
    'Missing connect button registration'
  )
  const disconnectBtn = requireElement(
    scalarRegistry.disconnectBtn,
    'Missing disconnect button registration'
  )
  const newSessionBtn = requireElement(
    scalarRegistry.newSessionBtn,
    'Missing new session button registration'
  )
  const statusElement = requireElement(
    scalarRegistry.statusElement,
    'Missing status element registration'
  )
  const statusIndicator = requireElement(
    scalarRegistry.statusIndicator,
    'Missing status indicator registration'
  )

  const modalityButtons = modalityOrder.map((modality) => {
    const button = modalityRegistry[modality]
    if (!button) {
      throw new Error(`Missing modality button registration for ${modality}`)
    }
    return button
  })

  return {
    connectBtn,
    disconnectBtn,
    newSessionBtn,
    statusElement,
    statusIndicator,
    apiKeyInput: scalarRegistry.apiKeyInput ?? null,
    purposeSelect: scalarRegistry.purposeSelect ?? null,
    purposeDescription: scalarRegistry.purposeDescription ?? null,
    coachCalibratorForm: scalarRegistry.coachCalibratorForm ?? null,
    coachRecommendationLabel: scalarRegistry.coachRecommendationLabel ?? null,
    coachRecommendationDescription: scalarRegistry.coachRecommendationDescription ?? null,
    coachRecommendationRationale: scalarRegistry.coachRecommendationRationale ?? null,
    configSidebar: scalarRegistry.configSidebar ?? null,
    configSidebarSurface: scalarRegistry.configSidebarSurface ?? null,
    configSidebarBackdrop: scalarRegistry.configSidebarBackdrop ?? null,
    configOpenBtn: scalarRegistry.configOpenBtn ?? null,
    configCloseBtn: scalarRegistry.configCloseBtn ?? null,
    progressPanel: scalarRegistry.progressPanel ?? null,
    currentPhase: scalarRegistry.currentPhase ?? null,
    progressNotes: scalarRegistry.progressNotes ?? null,
    closureSuggestion: scalarRegistry.closureSuggestion ?? null,
    closureMessage: scalarRegistry.closureMessage ?? null,
    autoSummaryToggle: scalarRegistry.autoSummaryToggle ?? null,
    acceptSummaryBtn: scalarRegistry.acceptSummaryBtn ?? null,
    continueSessionBtn: scalarRegistry.continueSessionBtn ?? null,
    requestSummaryBtn: scalarRegistry.requestSummaryBtn ?? null,
    copyTranscriptBtn: scalarRegistry.copyTranscriptBtn ?? null,
    modalityToggle: scalarRegistry.modalityToggle ?? null,
    modalityButtons,
    textChatForm: scalarRegistry.textChatForm ?? null,
    textChatInput: scalarRegistry.textChatInput ?? null,
    textChatSubmit: scalarRegistry.textChatSubmit ?? null,
    textChatHint: scalarRegistry.textChatHint ?? null,
    phaseFillElements: { ...phaseFillRegistry },
    phaseScoreElements: { ...phaseScoreRegistry }
  }
}
