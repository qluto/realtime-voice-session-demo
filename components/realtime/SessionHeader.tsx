export function SessionHeader() {
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
          type="button"
          className="hamburger-button"
          aria-label="設定メニューを開く"
          aria-expanded="true"
        >
          <span className="hamburger-icon" aria-hidden="true">☰</span>
        </button>
        <div className="status-indicator">
          <span id="status">切断済み</span>
          <div id="session-timer" className="session-timer" style={{ display: 'none' }}>
            セッション <span id="timer-display">00:00</span>
          </div>
        </div>
        <div id="modality-toggle" className="modality-toggle" role="radiogroup" aria-label="会話モード">
          <button
            id="modality-voice"
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
          <button id="connect-btn" type="button" className="primary-action">コーチングセッション開始</button>
          <button id="disconnect-btn" type="button" className="neutral-action" disabled>セッション終了</button>
          <button id="new-session-btn" type="button" className="ghost-action" style={{ display: 'none' }}>
            新しい振り返りを開始
          </button>
        </div>
      </div>
    </header>
  )
}
