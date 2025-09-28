import './style.css'
import { setupVoiceAgent } from './voice-agent.ts'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>🌟 Weekly Reflection Coaching</h1>
    <div class="chat-container">
      <div class="status-indicator">
        <span id="status">Disconnected</span>
        <div id="session-timer" style="display: none; margin-top: 0.5rem; font-size: 1.1rem; font-weight: 600; color: #22c55e;">
          Session: <span id="timer-display">00:00</span>
        </div>
      </div>
      <div class="controls">
        <button id="connect-btn" type="button">Start Coaching Session</button>
        <button id="disconnect-btn" type="button" disabled>End Session</button>
        <button id="new-session-btn" type="button" style="display: none;">Start New Reflection</button>
      </div>
      <div class="usage-stats" id="usage-stats" style="display: none;">
        <h3>📊 Usage Statistics</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Session Duration:</span>
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
            <span class="stat-label">Cached Tokens:</span>
            <span class="stat-value" id="stat-cached-tokens">0</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Text Tokens:</span>
            <span class="stat-value" id="stat-text-tokens">0</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Audio Tokens:</span>
            <span class="stat-value" id="stat-audio-tokens">0</span>
          </div>
        </div>
        <div class="cost-section">
          <h4>💰 Cost Breakdown (gpt-realtime)</h4>
          <div class="cost-grid">
            <div class="cost-item">
              <span class="cost-label">Input Cost:</span>
              <span class="cost-value" id="cost-input">$0.00</span>
            </div>
            <div class="cost-item">
              <span class="cost-label">Cached Input Cost:</span>
              <span class="cost-value cached" id="cost-cached-input">$0.00</span>
            </div>
            <div class="cost-item">
              <span class="cost-label">Output Cost:</span>
              <span class="cost-value" id="cost-output">$0.00</span>
            </div>
            <div class="cost-item total-cost">
              <span class="cost-label">Total Cost:</span>
              <span class="cost-value" id="cost-total">$0.00</span>
            </div>
            <div class="cost-item savings">
              <span class="cost-label">Cache Savings:</span>
              <span class="cost-value" id="cost-savings">$0.00</span>
            </div>
          </div>
        </div>
      </div>
      <div class="instructions">
        <p><strong>🎯 Your Weekly Reflection Session</strong></p>
        <p>Click "Start Coaching Session" and allow microphone access to begin your guided weekly reflection with an ICF-certified coaching approach.</p>
        <p><strong>📋 Session Structure (20 minutes):</strong></p>
        <ul style="text-align: left; margin: 0.5rem 0; padding-left: 1.5rem;">
          <li><strong>Opening:</strong> Setting intention and focus</li>
          <li><strong>Deep Reflection:</strong> Exploring your week's experiences</li>
          <li><strong>Insight Synthesis:</strong> Identifying key learnings</li>
          <li><strong>Forward Integration:</strong> Planning intentional action</li>
        </ul>
        <p><strong>💡 Coaching Approach:</strong> Powerful questions, active listening, and trusting your wisdom to discover insights.</p>
        <p><strong>Technical:</strong> Ephemeral tokens auto-generated. Ensure server runs on port 3001.</p>
      </div>
    </div>
  </div>
`

setupVoiceAgent()
