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
          <div class="summary-controls" id="summary-controls" style="display: none;">
            <button id="request-summary-btn" type="button" class="summary-btn">
              📝 セッションのまとめを要求
            </button>
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
