export function SupportRail() {
  return (
    <aside className="support-rail">
      <section id="progress-panel" className="panel progress-panel" style={{ display: 'none' }}>
        <div className="panel-header">
          <div>
            <p className="panel-eyebrow">Session intelligence</p>
            <h2 className="panel-title">Coaching compass</h2>
          </div>
          <label className="auto-summary-toggle" htmlFor="auto-summary-toggle">
            <input id="auto-summary-toggle" type="checkbox" defaultChecked />
            自動まとめ提案
          </label>
        </div>
        <div className="summary-progress" id="summary-progress">
          <div className="phase-row" data-mode="reflective">
            <div className="phase-top">
              <span className="phase-label">Reflective</span>
              <span className="phase-score" data-mode-score="reflective">0%</span>
            </div>
            <div className="phase-track">
              <div className="phase-fill" data-mode-fill="reflective"></div>
            </div>
          </div>
          <div className="phase-row" data-mode="discovery">
            <div className="phase-top">
              <span className="phase-label">Discovery</span>
              <span className="phase-score" data-mode-score="discovery">0%</span>
            </div>
            <div className="phase-track">
              <div className="phase-fill" data-mode-fill="discovery"></div>
            </div>
          </div>
          <div className="phase-row" data-mode="cognitive">
            <div className="phase-top">
              <span className="phase-label">Cognitive</span>
              <span className="phase-score" data-mode-score="cognitive">0%</span>
            </div>
            <div className="phase-track">
              <div className="phase-fill" data-mode-fill="cognitive"></div>
            </div>
          </div>
          <div className="phase-row" data-mode="actionable">
            <div className="phase-top">
              <span className="phase-label">Actionable</span>
              <span className="phase-score" data-mode-score="actionable">0%</span>
            </div>
            <div className="phase-track">
              <div className="phase-fill" data-mode-fill="actionable"></div>
            </div>
          </div>
        </div>
        <div className="current-phase" id="current-mode" aria-live="polite">現在のモード: 解析中</div>
        <div className="progress-notes" id="progress-notes"></div>
        <div className="closure-suggestion" id="closure-suggestion" style={{ display: 'none' }}>
          <div className="closure-message" id="closure-message"></div>
          <div className="closure-actions">
            <button id="accept-summary-btn" type="button" className="closure-btn primary">まとめに移行する</button>
            <button id="continue-session-btn" type="button" className="closure-btn secondary">まだ続ける</button>
          </div>
        </div>
      </section>
    </aside>
  )
}
