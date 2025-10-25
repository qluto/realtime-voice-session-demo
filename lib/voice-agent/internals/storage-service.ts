import { type QuestionnaireResponses } from '../questionnaire/personality-recommendation.ts'

const STORAGE_KEYS = {
  questionnaire: 'voiceCoach.questionnaire',
  purpose: 'voiceCoach.purpose',
  sidebarHidden: 'voiceCoach.sidebarHidden'
} as const

export interface StorageService {
  getQuestionnaire(): QuestionnaireResponses | null
  setQuestionnaire(responses: QuestionnaireResponses | null): void
  getPurpose(): string | null
  setPurpose(value: string | null): void
  getSidebarHidden(): boolean
  setSidebarHidden(hidden: boolean): void
}

const hasWindow = typeof window !== 'undefined'
const hasLocalStorage = hasWindow && typeof window.localStorage !== 'undefined'

const readLocalStorage = (key: string): string | null => {
  if (!hasLocalStorage) return null
  try {
    return window.localStorage.getItem(key)
  } catch (error) {
    console.warn(`Failed to read localStorage key "${key}":`, error)
    return null
  }
}

const writeLocalStorage = (key: string, value: string | null) => {
  if (!hasLocalStorage) return
  try {
    if (value === null) {
      window.localStorage.removeItem(key)
    } else {
      window.localStorage.setItem(key, value)
    }
  } catch (error) {
    console.warn(`Failed to write localStorage key "${key}":`, error)
  }
}

const parseQuestionnaire = (raw: string | null): QuestionnaireResponses | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    console.warn('Failed to parse questionnaire responses:', error)
    return null
  }
}

export const createStorageService = (): StorageService => {
  return {
    getQuestionnaire: () => parseQuestionnaire(readLocalStorage(STORAGE_KEYS.questionnaire)),
    setQuestionnaire: (responses) => {
      if (!responses || Object.keys(responses).length === 0) {
        writeLocalStorage(STORAGE_KEYS.questionnaire, null)
      } else {
        writeLocalStorage(STORAGE_KEYS.questionnaire, JSON.stringify(responses))
      }
    },
    getPurpose: () => readLocalStorage(STORAGE_KEYS.purpose),
    setPurpose: (value) => {
      writeLocalStorage(STORAGE_KEYS.purpose, value)
    },
    getSidebarHidden: () => readLocalStorage(STORAGE_KEYS.sidebarHidden) === 'true',
    setSidebarHidden: (hidden) => {
      writeLocalStorage(STORAGE_KEYS.sidebarHidden, hidden ? 'true' : 'false')
    }
  }
}

export type { QuestionnaireResponses }
