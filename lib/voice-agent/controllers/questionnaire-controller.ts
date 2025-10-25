import { type VoiceAgentDomRefs } from '../internals/dom-registry.ts'
import { type StorageService, type QuestionnaireResponses } from '../internals/storage-service.ts'
import {
  computePersonalityRecommendation,
  questionnaireQuestionIds,
  type PersonalityId
} from '../questionnaire/personality-recommendation.ts'
import {
  getPersonalityPreset,
  defaultPersonalityId
} from '../utils/prompt-presets.ts'

const defaultRecommendationMessage = '回答すると、もっとも相性の良いコーチスタイルをご案内します。'

export interface QuestionnaireState {
  responses: QuestionnaireResponses
  isComplete: boolean
  activePersonalityId: PersonalityId
  preferenceDirectives: string[]
  personalityPreset: ReturnType<typeof getPersonalityPreset>
}

type QuestionnaireListener = (state: QuestionnaireState) => void

interface QuestionnaireControllerOptions {
  dom: VoiceAgentDomRefs
  storage: StorageService
}

export class QuestionnaireController {
  private readonly dom: VoiceAgentDomRefs
  private readonly storage: StorageService
  private readonly listeners = new Set<QuestionnaireListener>()
  private coachInputs: HTMLInputElement[] = []
  private coachOptionLabels: HTMLLabelElement[] = []
  private state: QuestionnaireState = {
    responses: {},
    isComplete: false,
    activePersonalityId: defaultPersonalityId,
    preferenceDirectives: [],
    personalityPreset: getPersonalityPreset(defaultPersonalityId)
  }
  private removeListeners: (() => void)[] = []

  constructor(options: QuestionnaireControllerOptions) {
    this.dom = options.dom
    this.storage = options.storage
  }

  init() {
    this.setupInputs()
    this.applyStoredResponses()
    this.refreshCoachOptionClasses()
    this.updateRecommendation()
  }

  dispose() {
    this.removeListeners.forEach((remove) => remove())
    this.removeListeners = []
    this.listeners.clear()
  }

  getState(): QuestionnaireState {
    return this.state
  }

  subscribe(listener: QuestionnaireListener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  setInputsDisabled(disabled: boolean) {
    this.coachInputs.forEach((input) => {
      input.disabled = disabled
    })
  }

  private setupInputs() {
    if (!this.dom.coachCalibratorForm) return
    this.coachInputs = Array.from(
      this.dom.coachCalibratorForm.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    )
    this.coachOptionLabels = Array.from(
      this.dom.coachCalibratorForm.querySelectorAll<HTMLLabelElement>('.coach-option')
    )

    this.coachInputs.forEach((input) => {
      const handleChange = () => {
        this.refreshCoachOptionClasses()
        this.updateRecommendation()
      }
      input.addEventListener('change', handleChange)
      this.removeListeners.push(() => input.removeEventListener('change', handleChange))
    })
  }

  private applyStoredResponses() {
    if (!this.dom.coachCalibratorForm) return
    const stored = this.storage.getQuestionnaire()
    if (!stored) return
    questionnaireQuestionIds.forEach((questionId) => {
      const storedValue = stored[questionId]
      if (!storedValue) return
      const selector = `input[type="radio"][name="coach-q-${questionId}"][value="${storedValue}"]`
      const input = this.dom.coachCalibratorForm?.querySelector<HTMLInputElement>(selector)
      if (input) {
        input.checked = true
      }
    })
  }

  private collectResponses(): QuestionnaireResponses {
    const responses: QuestionnaireResponses = {}
    questionnaireQuestionIds.forEach((questionId) => {
      const fieldset = this.dom.coachCalibratorForm?.querySelector(`[data-question-id="${questionId}"]`)
      const selected = fieldset?.querySelector<HTMLInputElement>('input[type="radio"]:checked')
      if (selected) {
        responses[questionId] = selected.value
      }
    })
    return responses
  }

  private refreshCoachOptionClasses() {
    this.coachOptionLabels.forEach((label) => {
      const input = label.querySelector<HTMLInputElement>('input[type="radio"]')
      if (!input) return
      if (input.checked) {
        label.classList.add('is-selected')
      } else {
        label.classList.remove('is-selected')
      }
    })
  }

  private updateRecommendation() {
    const responses = this.collectResponses()
    const responseCount = Object.keys(responses).length
    if (responseCount === 0) {
      this.storage.setQuestionnaire(null)
    } else {
      this.storage.setQuestionnaire(responses)
    }

    const complete = questionnaireQuestionIds.every((questionId) => Boolean(responses[questionId]))
    if (!complete) {
      this.state = {
        responses,
        isComplete: false,
        activePersonalityId: defaultPersonalityId,
        preferenceDirectives: [],
        personalityPreset: getPersonalityPreset(defaultPersonalityId)
      }
      this.updateRecommendationDisplayIncomplete()
      this.notify()
      return
    }

    const recommendation = computePersonalityRecommendation(responses)
    const preset = getPersonalityPreset(recommendation.personalityId)

    this.state = {
      responses,
      isComplete: true,
      activePersonalityId: recommendation.personalityId,
      preferenceDirectives: recommendation.preferenceDirectives,
      personalityPreset: preset
    }

    this.updateRecommendationDisplayComplete(preset.label, preset.description, recommendation)
    this.notify()
  }

  private updateRecommendationDisplayIncomplete() {
    if (this.dom.coachRecommendationLabel) {
      this.dom.coachRecommendationLabel.textContent = this.state.personalityPreset.label
    }
    if (this.dom.coachRecommendationDescription) {
      this.dom.coachRecommendationDescription.textContent = defaultRecommendationMessage
    }
    if (this.dom.coachRecommendationRationale) {
      this.dom.coachRecommendationRationale.style.display = 'none'
      this.dom.coachRecommendationRationale.textContent = ''
    }
  }

  private updateRecommendationDisplayComplete(label: string, description: string, recommendation: ReturnType<typeof computePersonalityRecommendation>) {
    if (this.dom.coachRecommendationLabel) {
      this.dom.coachRecommendationLabel.textContent = label
    }
    if (this.dom.coachRecommendationDescription) {
      this.dom.coachRecommendationDescription.textContent = description
    }
    if (this.dom.coachRecommendationRationale) {
      const summaries = recommendation.preferenceSummaries
      const rationaleText = recommendation.rationale
      const combined = [...summaries, ...rationaleText]
      if (combined.length > 0) {
        this.dom.coachRecommendationRationale.textContent = combined.join('／')
        this.dom.coachRecommendationRationale.style.display = 'block'
      } else {
        this.dom.coachRecommendationRationale.textContent = ''
        this.dom.coachRecommendationRationale.style.display = 'none'
      }
    }
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.state))
  }
}
