import { VoiceAgentController } from './controllers/voice-agent-controller.ts'

declare global {
  interface Window {
    __voiceAgentInitialized?: boolean
  }
}

const tokenEndpoint = process.env.NEXT_PUBLIC_TOKEN_ENDPOINT || '/api/generate-token'

let voiceAgentController: VoiceAgentController | null = null

export function setupVoiceAgent() {
  if (typeof window === 'undefined') return
  if (window.__voiceAgentInitialized) return

  try {
    voiceAgentController = new VoiceAgentController({ tokenEndpoint })
    voiceAgentController.init()
    window.__voiceAgentInitialized = true
  } catch (error) {
    console.error('Failed to initialize voice agent:', error)
    voiceAgentController = null
    window.__voiceAgentInitialized = false
  }
}

export function teardownVoiceAgent() {
  voiceAgentController?.dispose()
  voiceAgentController = null
  if (typeof window !== 'undefined') {
    window.__voiceAgentInitialized = false
  }
}
