const phases = [
  { key: 'opening', label: 'Opening' },
  { key: 'reflection', label: 'Reflection' },
  { key: 'insight', label: 'Insight' },
  { key: 'integration', label: 'Integration' },
  { key: 'closing', label: 'Closing' }
] as const

export function SupportRail() {
  return (
    <aside className="support-rail">
      <section id="progress-panel" className="panel progress-panel" style={{ display: 'none' }}>
        <div className="panel-header">
          <div>
            <p className="panel-eyebrow">Session intelligence</p>
            <h2 className="panel-title">Coaching journey</h2>
          </div>
          <label className="auto-summary-toggle" htmlFor="auto-summary-toggle">
            <input id="auto-summary-toggle" type="checkbox" defaultChecked />
            自動まとめ提案
          </label>
        </div>
        <div className="summary-progress" id="summary-progress">
          {phases.map((phase) => (
            <div className="phase-row" data-phase={phase.key} key={phase.key}>
              <div className="phase-top">
                <span className="phase-label">{phase.label}</span>
                <span className="phase-score" data-phase-score={phase.key}>0%</span>
              </div>
              <div className="phase-track">
                <div className="phase-fill" data-phase-fill={phase.key}></div>
              </div>
            </div>
          ))}
        </div>
        <div className="current-phase" id="current-phase" aria-live="polite">
          現在のフェーズ: 解析中
        </div>
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
