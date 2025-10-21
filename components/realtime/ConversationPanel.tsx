export function ConversationPanel() {
  return (
    <section className="panel conversation-panel">
      <div className="panel-header">
        <div>
          <p className="panel-eyebrow">Live transcript</p>
          <h2 className="panel-title">Coaching conversation</h2>
        </div>
        <div className="panel-actions">
          <button id="copy-transcript-btn" type="button" className="icon-pill" style={{ display: 'none' }}>
            <span aria-hidden="true">📋</span>
            <span>ログをコピー</span>
          </button>
          <div id="summary-controls" className="summary-controls" style={{ display: 'none' }}>
            <button id="request-summary-btn" type="button" className="pill-button">まとめをリクエスト</button>
          </div>
        </div>
      </div>
      <div className="panel-body">
        <div id="instructions" className="instructions-card">
          <h3>🎯 セッションの始め方</h3>
          <p>「コーチングセッション開始」を押してマイクアクセスを許可すると、AIコーチとの音声チャットがスタートします。</p>
          <p>ヘッダーのハンバーガーメニューから「Prompt personalization」を開いて質問に回答すると、あなたの個性に合わせたコーチングスタイルが自動でセットされます。</p>
          <p>下記の4つのモードを行き来しながら、コーチングセッションを進めていきます。</p>
          <div className="instructions-list">
            <div className="instruction-step">
              <span className="step-label">Reflective</span>
              <span className="step-copy">感情と価値をゆっくり言語化</span>
            </div>
            <div className="instruction-step">
              <span className="step-label">Discovery</span>
              <span className="step-copy">ゴールと現状・選択肢を整理</span>
            </div>
            <div className="instruction-step">
              <span className="step-label">Cognitive</span>
              <span className="step-copy">視点の転換で思考を解きほぐす</span>
            </div>
            <div className="instruction-step">
              <span className="step-label">Actionable</span>
              <span className="step-copy">次の一歩を合意し支援を整える</span>
            </div>
          </div>
        </div>
        <div id="conversation-log" className="conversation-log" style={{ display: 'none' }}>
          <div id="log-container" className="log-container"></div>
        </div>
        <form id="text-chat-form" className="text-chat-form" style={{ display: 'none' }}>
          <label htmlFor="text-chat-input" className="text-chat-label">テキストで送信</label>
          <div className="text-chat-controls">
            <textarea
              id="text-chat-input"
              className="text-chat-input"
              rows={2}
              placeholder="AIコーチに伝えたいことを入力してください"
              aria-label="コーチへのテキストメッセージ"
              disabled
            ></textarea>
            <button id="text-chat-submit" type="submit" className="text-chat-send" disabled>送信</button>
          </div>
          <p id="text-chat-hint" className="text-chat-hint">接続後にテキストでメッセージを送信できます。</p>
        </form>
      </div>
    </section>
  )
}
