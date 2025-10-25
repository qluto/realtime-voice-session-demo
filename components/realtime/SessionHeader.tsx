'use client'

import { useDomNode, useModalityButton } from '@/lib/voice-agent/internals/dom-registry.ts'

export function SessionHeader() {
  const connectBtnRef = useDomNode('connectBtn')
  const disconnectBtnRef = useDomNode('disconnectBtn')
  const newSessionBtnRef = useDomNode('newSessionBtn')
  const statusElementRef = useDomNode('statusElement')
  const statusIndicatorRef = useDomNode('statusIndicator')
  const configOpenBtnRef = useDomNode('configOpenBtn')
  const modalityToggleRef = useDomNode('modalityToggle')
  const registerVoiceModality = useModalityButton('voice')
  const registerTextModality = useModalityButton('text')

  return (
    <header className="app-header">
      <div className="brand-cluster">
        <span className="brand-mark">✦</span>
        <div className="brand-copy">
          <p className="brand-eyebrow">Realtime Coaching with Coach AI</p>
          <h1 className="brand-title">Adaptive Dialogue Studio</h1>
        </div>
      </div>
      <div className="session-cluster">
        <button
          id="config-open-btn"
          ref={configOpenBtnRef}
          type="button"
          className="hamburger-button"
          aria-label="設定メニューを開く"
          aria-expanded="true"
        >
          <span className="hamburger-icon" aria-hidden="true">☰</span>
        </button>
        <div className="status-indicator" ref={statusIndicatorRef}>
          <span id="status" ref={statusElementRef}>切断済み</span>
          <div id="session-timer" className="session-timer" style={{ display: 'none' }}>
            セッション <span id="timer-display">00:00</span>
          </div>
        </div>
        <div
          id="modality-toggle"
          ref={modalityToggleRef}
          className="modality-toggle"
          role="radiogroup"
          aria-label="会話モード"
        >
          <button
            id="modality-voice"
            ref={registerVoiceModality}
            type="button"
            className="modality-option is-selected"
            data-modality="voice"
            role="radio"
            aria-checked="true"
          >
            <span aria-hidden="true">🎙️</span>
            <span>音声モード</span>
          </button>
          <button
            id="modality-text"
            ref={registerTextModality}
            type="button"
            className="modality-option"
            data-modality="text"
            role="radio"
            aria-checked="false"
          >
            <span aria-hidden="true">⌨️</span>
            <span>テキストモード</span>
          </button>
        </div>
        <div className="session-actions">
          <button id="connect-btn" ref={connectBtnRef} type="button" className="primary-action">
            コーチングセッション開始
          </button>
          <button id="disconnect-btn" ref={disconnectBtnRef} type="button" className="neutral-action" disabled>
            セッション終了
          </button>
          <button
            id="new-session-btn"
            ref={newSessionBtnRef}
            type="button"
            className="ghost-action"
            style={{ display: 'none' }}
          >
            新しい振り返りを開始
          </button>
        </div>
      </div>
    </header>
  )
}
