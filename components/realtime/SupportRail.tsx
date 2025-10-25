'use client'

import {
  useDomNode,
  usePhaseFillNode,
  usePhaseScoreNode
} from '@/lib/voice-agent/internals/dom-registry.ts'

const phases = [
  { key: 'goal', label: 'Goal' },
  { key: 'reality', label: 'Reality' },
  { key: 'options', label: 'Options' },
  { key: 'will', label: 'Will' }
] as const

interface PhaseProgressRowProps {
  phase: typeof phases[number]
}

function PhaseProgressRow({ phase }: PhaseProgressRowProps) {
  const fillRef = usePhaseFillNode(phase.key)
  const scoreRef = usePhaseScoreNode(phase.key)

  return (
    <div className="phase-row" data-phase={phase.key}>
      <div className="phase-top">
        <span className="phase-label">{phase.label}</span>
        <span className="phase-score" data-phase-score={phase.key} ref={scoreRef}>0%</span>
      </div>
      <div className="phase-track">
        <div className="phase-fill" data-phase-fill={phase.key} ref={fillRef}></div>
      </div>
    </div>
  )
}

export function SupportRail() {
  const progressPanelRef = useDomNode('progressPanel')
  const autoSummaryToggleRef = useDomNode('autoSummaryToggle')
  const currentPhaseRef = useDomNode('currentPhase')
  const progressNotesRef = useDomNode('progressNotes')
  const closureSuggestionRef = useDomNode('closureSuggestion')
  const closureMessageRef = useDomNode('closureMessage')
  const acceptSummaryBtnRef = useDomNode('acceptSummaryBtn')
  const continueSessionBtnRef = useDomNode('continueSessionBtn')

  return (
    <aside className="support-rail">
      <section
        id="progress-panel"
        ref={progressPanelRef}
        className="panel progress-panel"
        style={{ display: 'none' }}
      >
        <div className="panel-header">
          <div>
            <p className="panel-eyebrow">Session intelligence</p>
            <h2 className="panel-title">Coaching journey</h2>
          </div>
          <label className="auto-summary-toggle" htmlFor="auto-summary-toggle">
            <input
              id="auto-summary-toggle"
              ref={autoSummaryToggleRef}
              type="checkbox"
              defaultChecked
            />
            自動まとめ提案
          </label>
        </div>
        <div className="summary-progress" id="summary-progress">
          {phases.map((phase) => (
            <PhaseProgressRow phase={phase} key={phase.key} />
          ))}
        </div>
        <div
          className="current-phase"
          id="current-phase"
          ref={currentPhaseRef}
          aria-live="polite"
        >
          現在のフェーズ: 解析中
        </div>
        <div className="progress-notes" id="progress-notes" ref={progressNotesRef}></div>
        <div
          className="closure-suggestion"
          id="closure-suggestion"
          ref={closureSuggestionRef}
          style={{ display: 'none' }}
        >
          <div className="closure-message" id="closure-message" ref={closureMessageRef}></div>
          <div className="closure-actions">
            <button
              id="accept-summary-btn"
              ref={acceptSummaryBtnRef}
              type="button"
              className="closure-btn primary"
            >
              まとめに移行する
            </button>
            <button
              id="continue-session-btn"
              ref={continueSessionBtnRef}
              type="button"
              className="closure-btn secondary"
            >
              まだ続ける
            </button>
          </div>
        </div>
      </section>
    </aside>
  )
}
