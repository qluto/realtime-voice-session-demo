import './style.css'
import { setupVoiceAgent } from './voice-agent.ts'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="app-shell">
    <main class="app-main">
      <header class="app-header">
        <div class="brand-cluster">
          <span class="brand-mark">✦</span>
          <div class="brand-copy">
            <p class="brand-eyebrow">Realtime Coaching with Coach AI</p>
            <h1 class="brand-title">Adaptive Dialogue Studio</h1>
          </div>
        </div>
        <div class="session-cluster">
          <button id="config-open-btn" type="button" class="hamburger-button" aria-label="設定メニューを開く" aria-expanded="true">
            <span class="hamburger-icon" aria-hidden="true">☰</span>
          </button>
          <div class="status-indicator">
            <span id="status">切断済み</span>
            <div id="session-timer" class="session-timer" style="display: none;">
              セッション <span id="timer-display">00:00</span>
            </div>
          </div>
          <div id="modality-toggle" class="modality-toggle" role="radiogroup" aria-label="会話モード">
            <button
              id="modality-voice"
              type="button"
              class="modality-option is-selected"
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
              class="modality-option"
              data-modality="text"
              role="radio"
              aria-checked="false"
            >
              <span aria-hidden="true">⌨️</span>
              <span>テキストモード</span>
            </button>
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
              <p>「コーチングセッション開始」を押してマイクアクセスを許可すると、AIコーチとの音声チャットがスタートします。</p>
              <p>ヘッダーのハンバーガーメニューから「Prompt personalization」を開いて質問に回答すると、あなたの個性に合わせたコーチングスタイルが自動でセットされます。</p>
              <p>下記の4つのモードを行き来しながら、コーチングセッションを進めていきます。</p>
              <div class="instructions-list">
                <div class="instruction-step">
                  <span class="step-label">Reflective</span>
                  <span class="step-copy">感情と価値をゆっくり言語化</span>
                </div>
                <div class="instruction-step">
                  <span class="step-label">Discovery</span>
                  <span class="step-copy">ゴールと現状・選択肢を整理</span>
                </div>
                <div class="instruction-step">
                  <span class="step-label">Cognitive</span>
                  <span class="step-copy">視点の転換で思考を解きほぐす</span>
                </div>
                <div class="instruction-step">
                  <span class="step-label">Actionable</span>
                  <span class="step-copy">次の一歩を合意し支援を整える</span>
                </div>
              </div>
            </div>
            <div id="conversation-log" class="conversation-log" style="display: none;">
              <div id="log-container" class="log-container"></div>
            </div>
            <form id="text-chat-form" class="text-chat-form" style="display: none;">
              <label for="text-chat-input" class="text-chat-label">テキストで送信</label>
              <div class="text-chat-controls">
                <textarea
                  id="text-chat-input"
                  class="text-chat-input"
                  rows="2"
                  placeholder="AIコーチに伝えたいことを入力してください"
                  aria-label="コーチへのテキストメッセージ"
                  disabled
                ></textarea>
                <button id="text-chat-submit" type="submit" class="text-chat-send" disabled>送信</button>
              </div>
              <p id="text-chat-hint" class="text-chat-hint">接続後にテキストでメッセージを送信できます。</p>
            </form>
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
              <div class="phase-row" data-mode="reflective">
                <div class="phase-top">
                  <span class="phase-label">Reflective</span>
                  <span class="phase-score" data-mode-score="reflective">0%</span>
                </div>
                <div class="phase-track">
                  <div class="phase-fill" data-mode-fill="reflective"></div>
                </div>
              </div>
              <div class="phase-row" data-mode="discovery">
                <div class="phase-top">
                  <span class="phase-label">Discovery</span>
                  <span class="phase-score" data-mode-score="discovery">0%</span>
                </div>
                <div class="phase-track">
                  <div class="phase-fill" data-mode-fill="discovery"></div>
                </div>
              </div>
              <div class="phase-row" data-mode="cognitive">
                <div class="phase-top">
                  <span class="phase-label">Cognitive</span>
                  <span class="phase-score" data-mode-score="cognitive">0%</span>
                </div>
                <div class="phase-track">
                  <div class="phase-fill" data-mode-fill="cognitive"></div>
                </div>
              </div>
              <div class="phase-row" data-mode="actionable">
                <div class="phase-top">
                  <span class="phase-label">Actionable</span>
                  <span class="phase-score" data-mode-score="actionable">0%</span>
                </div>
                <div class="phase-track">
                  <div class="phase-fill" data-mode-fill="actionable"></div>
                </div>
              </div>
            </div>
            <div class="current-phase" id="current-mode" aria-live="polite">現在のモード: 解析中</div>
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

      <aside id="config-sidebar" class="config-sidebar is-open" aria-hidden="false" aria-labelledby="config-sidebar-title">
        <div class="config-sidebar-surface" id="config-sidebar-surface" role="dialog" aria-modal="true" aria-labelledby="config-sidebar-title" tabindex="-1">
          <header class="config-sidebar-header">
            <div class="config-sidebar-headline">
              <p class="panel-eyebrow">Session setup</p>
              <h2 id="config-sidebar-title" class="panel-title">Prompt personalization</h2>
            </div>
            <button id="config-close-btn" type="button" class="config-sidebar-close" aria-label="設定メニューを閉じる">✕</button>
          </header>
          <div class="config-sidebar-body" id="config-sidebar-body">
            <section class="coach-calibrator">
              <div class="coach-calibrator-header">
                <p class="coach-calibrator-eyebrow">コーチの性格調整</p>
                <p class="coach-calibrator-intro">質問に答えると、あなたのスタイルに近いコーチングペルソナを自動でおすすめします。</p>
              </div>
              <form id="coach-calibrator" class="coach-calibrator-form">
                <fieldset class="coach-question" data-question-id="pace">
                  <legend>セッションの進め方で安心できるペースは？</legend>
                  <div class="coach-options">
                    <label class="coach-option">
                      <input type="radio" name="coach-q-pace" value="steady" />
                      <span class="coach-option-label">落ち着いたテンポでじっくり対話したい</span>
                    </label>
                    <label class="coach-option">
                      <input type="radio" name="coach-q-pace" value="dynamic" />
                      <span class="coach-option-label">テンポ良く前進したい</span>
                    </label>
                    <label class="coach-option">
                      <input type="radio" name="coach-q-pace" value="spacious" />
                      <span class="coach-option-label">ゆっくり深呼吸できる余白が欲しい</span>
                    </label>
                  </div>
                </fieldset>
                <fieldset class="coach-question" data-question-id="support">
                  <legend>コーチからどんな関わり方を受けたいですか？</legend>
                  <div class="coach-options">
                    <label class="coach-option">
                      <input type="radio" name="coach-q-support" value="affirming" />
                      <span class="coach-option-label">温かく励ましながら受け止めてほしい</span>
                    </label>
                    <label class="coach-option">
                      <input type="radio" name="coach-q-support" value="challenging" />
                      <span class="coach-option-label">率直で前向きなチャレンジをかけてほしい</span>
                    </label>
                    <label class="coach-option">
                      <input type="radio" name="coach-q-support" value="reflective" />
                      <span class="coach-option-label">静かに問い返しながら内省を支えてほしい</span>
                    </label>
                  </div>
                </fieldset>
                <fieldset class="coach-question" data-question-id="emotion">
                  <legend>コーチの感情の表現はどのくらいがしっくりきますか？</legend>
                  <div class="coach-options">
                    <label class="coach-option">
                      <input type="radio" name="coach-q-emotion" value="warm" />
                      <span class="coach-option-label">感情を適度に共有しながら温かさを伝えてほしい</span>
                    </label>
                    <label class="coach-option">
                      <input type="radio" name="coach-q-emotion" value="balanced" />
                      <span class="coach-option-label">感情は控えめで落ち着いた語り口がよい</span>
                    </label>
                    <label class="coach-option">
                      <input type="radio" name="coach-q-emotion" value="gentle" />
                      <span class="coach-option-label">柔らかく穏やかに共感してほしい</span>
                    </label>
                  </div>
                </fieldset>
              </form>
              <div class="coach-recommendation" id="coach-recommendation">
                <p class="coach-recommendation-label">推奨スタイル: <span id="coach-recommendation-label">ウォーム&プロフェッショナル</span></p>
                <p id="coach-recommendation-description" class="coach-recommendation-description">回答すると、もっとも相性の良いコーチスタイルをご案内します。</p>
                <p id="coach-recommendation-rationale" class="coach-recommendation-rationale" style="display: none;"></p>
              </div>
            </section>
            <div class="select-field conversation-purpose">
              <label for="purpose-select">セッションの目的</label>
              <select id="purpose-select">
                <option value="weekly-reflection">週次の振り返り</option>
                <option value="goal-calibration">目標キャリブレーション</option>
                <option value="resilience-reset">レジリエンス・リセット</option>
              </select>
              <p id="purpose-description" class="preset-description">一週間の出来事や学びを整理し、次の行動に繋げたいときに。</p>
            </div>
          </div>
        </div>
      </aside>
      <div id="config-sidebar-backdrop" class="config-sidebar-backdrop is-open" aria-hidden="true"></div>
    </main>
  </div>
`

setupVoiceAgent()
