import './style.css'
import { setupVoiceAgent } from './voice-agent.ts'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>OpenAI Voice Agent Chat</h1>
    <div class="chat-container">
      <div class="status-indicator">
        <span id="status">Disconnected</span>
      </div>
      <div class="controls">
        <button id="connect-btn" type="button">Connect to Voice Agent</button>
        <button id="disconnect-btn" type="button" disabled>Disconnect</button>
        <button id="new-session-btn" type="button" style="display: none;">Start New Session</button>
      </div>
      <div class="usage-stats" id="usage-stats" style="display: none;">
        <h3>📊 Usage Statistics</h3>
        <div class="stats-grid">
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
        <p>Click "Connect to Voice Agent" and allow microphone access to start talking with the AI assistant.</p>
        <p><strong>Automatic Setup:</strong> Ephemeral tokens are automatically generated using your .env OPENAI_API_KEY.</p>
        <p><strong>Usage tracking:</strong> Token consumption and cached input statistics are logged to the browser console and displayed above while connected.</p>
        <p><strong>Requirements:</strong> Make sure the token generation server is running on port 3001.</p>
      </div>
    </div>
  </div>
`

setupVoiceAgent()
