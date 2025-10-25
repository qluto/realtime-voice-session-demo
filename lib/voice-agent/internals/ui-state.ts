export type Modality = 'voice' | 'text'

export interface VoiceAgentUiState {
  isConnected: boolean
  isConnecting: boolean
  currentModality: Modality
  questionnaireComplete: boolean
}

export type VoiceAgentStateListener = (state: VoiceAgentUiState) => void

export interface VoiceAgentStateStore {
  getState(): VoiceAgentUiState
  update(patch: Partial<VoiceAgentUiState>): void
  subscribe(listener: VoiceAgentStateListener): () => void
}

const defaultState: VoiceAgentUiState = {
  isConnected: false,
  isConnecting: false,
  currentModality: 'voice',
  questionnaireComplete: false
}

export const createVoiceAgentState = (initialState: Partial<VoiceAgentUiState> = {}): VoiceAgentStateStore => {
  let state: VoiceAgentUiState = { ...defaultState, ...initialState }
  const listeners = new Set<VoiceAgentStateListener>()

  const notify = () => {
    listeners.forEach((listener) => listener(state))
  }

  return {
    getState: () => state,
    update: (patch) => {
      state = { ...state, ...patch }
      notify()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      listener(state)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
