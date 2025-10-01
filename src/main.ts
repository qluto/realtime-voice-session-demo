import './style.css'
import { setupVoiceAgent } from './voice-agent.ts'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <header class="top-header">
      <h1 class="brand-title">🌟 Weekly Reflection Coaching</h1>
      <div class="header-controls">
        <div class="status-indicator">
          <span id="status">切断済み</span>
          <div id="session-timer" style="display: none; margin-left: 1rem; font-size: 0.9rem; font-weight: 500; color: #3B5C4C;">
            セッション: <span id="timer-display">00:00</span>
          </div>
        </div>
        <div class="controls">
          <button id="connect-btn" type="button">コーチングセッション開始</button>
          <button id="disconnect-btn" type="button" disabled>セッション終了</button>
          <button id="new-session-btn" type="button" style="display: none;">新しい振り返りを開始</button>
        </div>
      </div>
    </header>

    <div class="main-content">
      <div class="conversation-center">
        <div class="conversation-log" id="conversation-log" style="display: none;">
          <!-- <h3>💬 Conversation</h3> -->
          <div class="log-container" id="log-container">
            <!-- Messages will appear here -->
          </div>
        </div>
        <div class="progress-panel" id="progress-panel" style="display: none;">
          <div class="progress-header">
            <span class="progress-title">📈 セッション進行度</span>
            <label class="auto-summary-toggle" for="auto-summary-toggle">
              <input id="auto-summary-toggle" type="checkbox" checked />
              自動まとめ提案
            </label>
          </div>
          <div class="summary-progress" id="summary-progress">
            <div class="phase-row" data-phase="opening">
              <span class="phase-label">オープニング</span>
              <div class="phase-bar">
                <div class="phase-fill" data-phase-fill="opening"></div>
              </div>
              <span class="phase-score" data-phase-score="opening">0%</span>
            </div>
            <div class="phase-row" data-phase="reflection">
              <span class="phase-label">深い振り返り</span>
              <div class="phase-bar">
                <div class="phase-fill" data-phase-fill="reflection"></div>
              </div>
              <span class="phase-score" data-phase-score="reflection">0%</span>
            </div>
            <div class="phase-row" data-phase="insight">
              <span class="phase-label">洞察の統合</span>
              <div class="phase-bar">
                <div class="phase-fill" data-phase-fill="insight"></div>
              </div>
              <span class="phase-score" data-phase-score="insight">0%</span>
            </div>
            <div class="phase-row" data-phase="integration">
              <span class="phase-label">前進的統合</span>
              <div class="phase-bar">
                <div class="phase-fill" data-phase-fill="integration"></div>
              </div>
              <span class="phase-score" data-phase-score="integration">0%</span>
            </div>
            <div class="phase-row" data-phase="closing">
              <span class="phase-label">クロージング</span>
              <div class="phase-bar">
                <div class="phase-fill" data-phase-fill="closing"></div>
              </div>
              <span class="phase-score" data-phase-score="closing">0%</span>
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
        </div>
        <div class="instructions" id="instructions">
          <p><strong>🎯 あなたの週次振り返りセッション</strong></p>
          <p>「コーチングセッション開始」をクリックしてマイクアクセスを許可すると、ICF認定コーチングアプローチによるガイド付き週次振り返りが始まります。</p>
          <p><strong>📋 セッション構成（約10分間）：</strong></p>
          <ul style="text-align: left; margin: 0.5rem 0; padding-left: 1.5rem;">
            <li><strong>オープニング：</strong> 意図とフォーカスの設定</li>
            <li><strong>深い振り返り：</strong> あなたの一週間の体験を探求</li>
            <li><strong>洞察の統合：</strong> 重要な学びの特定</li>
            <li><strong>前進的統合：</strong> 意図的なアクションの計画</li>
          </ul>
          <p><strong>💡 コーチングアプローチ：</strong> パワフルな質問、積極的傾聴、そしてあなた自身の知恵を信じて洞察を発見します。</p>
          <p><strong>技術的情報：</strong> エフェメラルトークンが自動生成されます。サーバーがポート3001で動作していることを確認してください。</p>
        </div>
      </div>

      <aside class="stats-sidebar">
        <div class="usage-stats" id="usage-stats" style="display: none;">
          <h3>📊 Statistics</h3>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-label">Duration:</span>
              <span class="stat-value" id="stat-session-duration">00:00</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Requests:</span>
              <span class="stat-value" id="stat-requests">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Input Tokens:</span>
              <span class="stat-value" id="stat-input-tokens">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Output Tokens:</span>
              <span class="stat-value" id="stat-output-tokens">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Total Tokens:</span>
              <span class="stat-value" id="stat-total-tokens">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Cached:</span>
              <span class="stat-value" id="stat-cached-tokens">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Text:</span>
              <span class="stat-value" id="stat-text-tokens">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Audio:</span>
              <span class="stat-value" id="stat-audio-tokens">0</span>
            </div>
          </div>
          <div class="cost-section">
            <h4>💰 Cost</h4>
            <div class="cost-grid">
              <div class="cost-item">
                <span class="cost-label">Input:</span>
                <span class="cost-value" id="cost-input">$0.00</span>
              </div>
              <div class="cost-item">
                <span class="cost-label">Cached:</span>
                <span class="cost-value cached" id="cost-cached-input">$0.00</span>
              </div>
              <div class="cost-item">
                <span class="cost-label">Output:</span>
                <span class="cost-value" id="cost-output">$0.00</span>
              </div>
              <div class="cost-item total-cost">
                <span class="cost-label">Total:</span>
                <span class="cost-value" id="cost-total">$0.00</span>
              </div>
              <div class="cost-item savings">
                <span class="cost-label">Savings:</span>
                <span class="cost-value" id="cost-savings">$0.00</span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
`

setupVoiceAgent()
