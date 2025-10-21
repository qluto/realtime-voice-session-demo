'use client'

import { useEffect } from 'react'
import { RealtimeApp } from '@/components/realtime/RealtimeApp'
import { setupVoiceAgent } from '@/lib/voice-agent'

export default function HomePage() {
  useEffect(() => {
    setupVoiceAgent()
  }, [])

  return <RealtimeApp />
}
