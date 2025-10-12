import './style.css'
import { setupVoiceAgent } from './voice-agent.ts'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="app-shell">
    <main class="app-main">
      <header class="app-header">
        <div class="brand-cluster">
          <span class="brand-mark">✦</span>
          <div class="brand-copy">
            <p class="brand-eyebrow">Voice Chatting with Coach AI</p>
            <h1 class="brand-title">Weekly Reflection Coaching</h1>
          </div>
        </div>
        <div id="usage-stats" class="usage-inline" style="display: none;">
          <div class="usage-inline-header">
            <span class="usage-inline-title">Usage metrics</span>
            <span class="usage-inline-duration" id="stat-session-duration">00:00</span>
          </div>
          <div class="usage-inline-grid">
            <div class="usage-inline-item">
              <span class="usage-inline-label">Req</span>
              <span class="usage-inline-value stat-value" id="stat-requests">0</span>
            </div>
            <div class="usage-inline-item">
              <span class="usage-inline-label">In</span>
              <span class="usage-inline-value stat-value" id="stat-input-tokens">0</span>
            </div>
            <div class="usage-inline-item">
              <span class="usage-inline-label">Out</span>
              <span class="usage-inline-value stat-value" id="stat-output-tokens">0</span>
            </div>
            <div class="usage-inline-item">
              <span class="usage-inline-label">Total</span>
              <span class="usage-inline-value stat-value" id="stat-total-tokens">0</span>
            </div>
            <div class="usage-inline-item">
              <span class="usage-inline-label">Cached</span>
              <span class="usage-inline-value stat-value" id="stat-cached-tokens">0</span>
            </div>
            <div class="usage-inline-item">
              <span class="usage-inline-label">Text</span>
              <span class="usage-inline-value stat-value" id="stat-text-tokens">0</span>
            </div>
            <div class="usage-inline-item">
              <span class="usage-inline-label">Audio</span>
              <span class="usage-inline-value stat-value" id="stat-audio-tokens">0</span>
            </div>
          </div>
        </div>
        <div class="session-cluster">
          <div class="status-indicator">
            <span id="status">切断済み</span>
            <div id="session-timer" class="session-timer" style="display: none;">
              セッション <span id="timer-display">00:00</span>
            </div>
          </div>
          <div class="session-actions">
            <button id="connect-btn" type="button" class="primary-action">コーチングセッション開始</button>
            <button id="disconnect-btn" type="button" class="neutral-action" disabled>セッション終了</button>
            <button id="new-session-btn" type="button" class="ghost-action" style="display: none;">新しい振り返りを開始</button>
          </div>
        </div>
      </header>

      <div class="content-grid">
        <section class="panel conversation-panel">
          <div class="panel-header">
            <div>
              <p class="panel-eyebrow">Live transcript</p>
              <h2 class="panel-title">Coaching conversation</h2>
            </div>
            <div class="panel-actions">
              <button id="copy-transcript-btn" type="button" class="icon-pill" style="display: none;">
                <span aria-hidden="true">📋</span>
                <span>ログをコピー</span>
              </button>
              <div id="summary-controls" class="summary-controls" style="display: none;">
                <button id="request-summary-btn" type="button" class="pill-button">まとめをリクエスト</button>
              </div>
            </div>
          </div>
          <div class="panel-body">
            <div id="instructions" class="instructions-card">
              <h3>🎯 セッションの始め方</h3>
              <p>「コーチングセッション開始」を押してマイクアクセスを許可すると、ICF認定コーチングアプローチによる週次振り返りがスタートします。</p>
              <div class="instructions-list">
                <div class="instruction-step">
                  <span class="step-label">オープニング</span>
                  <span class="step-copy">意図とフォーカスの設定</span>
                </div>
                <div class="instruction-step">
                  <span class="step-label">深い振り返り</span>
                  <span class="step-copy">一週間の体験を探求</span>
                </div>
                <div class="instruction-step">
                  <span class="step-label">洞察の統合</span>
                  <span class="step-copy">重要な学びの特定</span>
                </div>
                <div class="instruction-step">
                  <span class="step-label">前進的統合</span>
                  <span class="step-copy">次のアクションを設計</span>
                </div>
              </div>
            </div>
            <div id="conversation-log" class="conversation-log" style="display: none;">
              <div id="log-container" class="log-container"></div>
            </div>
          </div>
        </section>

        <aside class="support-rail">
          <section id="progress-panel" class="panel progress-panel" style="display: none;">
            <div class="panel-header">
              <div>
                <p class="panel-eyebrow">Session intelligence</p>
                <h2 class="panel-title">Coaching compass</h2>
              </div>
              <label class="auto-summary-toggle" for="auto-summary-toggle">
                <input id="auto-summary-toggle" type="checkbox" checked />
                自動まとめ提案
              </label>
            </div>
            <div class="summary-progress" id="summary-progress">
              <div class="phase-row" data-phase="opening">
                <div class="phase-top">
                  <span class="phase-label">オープニング</span>
                  <span class="phase-score" data-phase-score="opening">0%</span>
                </div>
                <div class="phase-track">
                  <div class="phase-fill" data-phase-fill="opening"></div>
                </div>
              </div>
              <div class="phase-row" data-phase="reflection">
                <div class="phase-top">
                  <span class="phase-label">深い振り返り</span>
                  <span class="phase-score" data-phase-score="reflection">0%</span>
                </div>
                <div class="phase-track">
                  <div class="phase-fill" data-phase-fill="reflection"></div>
                </div>
              </div>
              <div class="phase-row" data-phase="insight">
                <div class="phase-top">
                  <span class="phase-label">洞察の統合</span>
                  <span class="phase-score" data-phase-score="insight">0%</span>
                </div>
                <div class="phase-track">
                  <div class="phase-fill" data-phase-fill="insight"></div>
                </div>
              </div>
              <div class="phase-row" data-phase="integration">
                <div class="phase-top">
                  <span class="phase-label">前進的統合</span>
                  <span class="phase-score" data-phase-score="integration">0%</span>
                </div>
                <div class="phase-track">
                  <div class="phase-fill" data-phase-fill="integration"></div>
                </div>
              </div>
              <div class="phase-row" data-phase="closing">
                <div class="phase-top">
                  <span class="phase-label">クロージング</span>
                  <span class="phase-score" data-phase-score="closing">0%</span>
                </div>
                <div class="phase-track">
                  <div class="phase-fill" data-phase-fill="closing"></div>
                </div>
              </div>
            </div>
            <div class="current-phase" id="current-phase" aria-live="polite">現在のフェーズ: オープニングを探索中</div>
            <div class="progress-notes" id="progress-notes"></div>
            <div class="closure-suggestion" id="closure-suggestion" style="display: none;">
              <div class="closure-message" id="closure-message"></div>
              <div class="closure-actions">
                <button id="accept-summary-btn" type="button" class="closure-btn primary">まとめに移行する</button>
                <button id="continue-session-btn" type="button" class="closure-btn secondary">まだ続ける</button>
              </div>
            </div>
          </section>

        </aside>
      </div>
    </main>
  </div>
`

setupVoiceAgent()
