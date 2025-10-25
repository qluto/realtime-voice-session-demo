'use client'

import { useDomNode } from '@/lib/voice-agent/internals/dom-registry.ts'

export function ConfigSidebar() {
  const configSidebarRef = useDomNode('configSidebar')
  const configSidebarSurfaceRef = useDomNode('configSidebarSurface')
  const configSidebarBackdropRef = useDomNode('configSidebarBackdrop')
  const configCloseBtnRef = useDomNode('configCloseBtn')
  const purposeSelectRef = useDomNode('purposeSelect')
  const purposeDescriptionRef = useDomNode('purposeDescription')
  const coachCalibratorFormRef = useDomNode('coachCalibratorForm')
  const coachRecommendationLabelRef = useDomNode('coachRecommendationLabel')
  const coachRecommendationDescriptionRef = useDomNode('coachRecommendationDescription')
  const coachRecommendationRationaleRef = useDomNode('coachRecommendationRationale')

  return (
    <>
      <aside
        id="config-sidebar"
        ref={configSidebarRef}
        className="config-sidebar is-open"
        aria-hidden="false"
        aria-labelledby="config-sidebar-title"
      >
        <div
          className="config-sidebar-surface"
          id="config-sidebar-surface"
          ref={configSidebarSurfaceRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="config-sidebar-title"
          tabIndex={-1}
        >
          <header className="config-sidebar-header">
            <div className="config-sidebar-headline">
              <p className="panel-eyebrow">Session setup</p>
              <h2 id="config-sidebar-title" className="panel-title">Prompt personalization</h2>
            </div>
            <button
              id="config-close-btn"
              ref={configCloseBtnRef}
              type="button"
              className="config-sidebar-close"
              aria-label="設定メニューを閉じる"
            >
              ✕
            </button>
          </header>
          <div className="config-sidebar-body" id="config-sidebar-body">
            <div className="select-field conversation-purpose">
              <label htmlFor="purpose-select">セッションの目的</label>
              <select id="purpose-select" ref={purposeSelectRef}>
                <option value="weekly-reflection">週次の振り返り</option>
                <option value="goal-calibration">目標キャリブレーション</option>
                <option value="resilience-reset">レジリエンス・リセット</option>
                <option value="free-talk">自由対話</option>
              </select>
              <p
                id="purpose-description"
                ref={purposeDescriptionRef}
                className="preset-description"
              >
                一週間の出来事や学びを整理し、次の行動に繋げたいときに。
              </p>
            </div>
            <section className="coach-calibrator">
              <div className="coach-calibrator-header">
                <p className="coach-calibrator-eyebrow">コーチの性格調整</p>
                <p className="coach-calibrator-intro">質問に答えると、あなたのスタイルに近いコーチングペルソナを自動でおすすめします。</p>
              </div>
              <form
                id="coach-calibrator"
                ref={coachCalibratorFormRef}
                className="coach-calibrator-form"
              >
                <fieldset className="coach-question" data-question-id="pace">
                  <legend>セッションの進め方で安心できるペースは？</legend>
                  <div className="coach-options">
                    <label className="coach-option">
                      <input type="radio" name="coach-q-pace" value="steady" />
                      <span className="coach-option-label">落ち着いたテンポでじっくり対話したい</span>
                    </label>
                    <label className="coach-option">
                      <input type="radio" name="coach-q-pace" value="dynamic" />
                      <span className="coach-option-label">テンポ良く前進したい</span>
                    </label>
                    <label className="coach-option">
                      <input type="radio" name="coach-q-pace" value="spacious" />
                      <span className="coach-option-label">ゆっくり深呼吸できる余白が欲しい</span>
                    </label>
                  </div>
                </fieldset>
                <fieldset className="coach-question" data-question-id="support">
                  <legend>コーチからどんな関わり方を受けたいですか？</legend>
                  <div className="coach-options">
                    <label className="coach-option">
                      <input type="radio" name="coach-q-support" value="affirming" />
                      <span className="coach-option-label">温かく励ましながら受け止めてほしい</span>
                    </label>
                    <label className="coach-option">
                      <input type="radio" name="coach-q-support" value="challenging" />
                      <span className="coach-option-label">率直で前向きなチャレンジをかけてほしい</span>
                    </label>
                    <label className="coach-option">
                      <input type="radio" name="coach-q-support" value="reflective" />
                      <span className="coach-option-label">静かに問い返しながら内省を支えてほしい</span>
                    </label>
                  </div>
                </fieldset>
                <fieldset className="coach-question" data-question-id="emotion">
                  <legend>コーチの感情の表現はどのくらいがしっくりきますか？</legend>
                  <div className="coach-options">
                    <label className="coach-option">
                      <input type="radio" name="coach-q-emotion" value="warm" />
                      <span className="coach-option-label">感情を適度に共有しながら温かさを伝えてほしい</span>
                    </label>
                    <label className="coach-option">
                      <input type="radio" name="coach-q-emotion" value="balanced" />
                      <span className="coach-option-label">感情は控えめで落ち着いた語り口がよい</span>
                    </label>
                    <label className="coach-option">
                      <input type="radio" name="coach-q-emotion" value="gentle" />
                      <span className="coach-option-label">柔らかく穏やかに共感してほしい</span>
                    </label>
                  </div>
                </fieldset>
              </form>
              <div className="coach-recommendation" id="coach-recommendation">
                <p className="coach-recommendation-label">
                  推奨スタイル:{' '}
                  <span id="coach-recommendation-label" ref={coachRecommendationLabelRef}>
                    ウォーム&プロフェッショナル
                  </span>
                </p>
                <p
                  id="coach-recommendation-description"
                  ref={coachRecommendationDescriptionRef}
                  className="coach-recommendation-description"
                >
                  回答すると、もっとも相性の良いコーチスタイルをご案内します。
                </p>
                <p
                  id="coach-recommendation-rationale"
                  ref={coachRecommendationRationaleRef}
                  className="coach-recommendation-rationale"
                  style={{ display: 'none' }}
                ></p>
              </div>
            </section>
          </div>
        </div>
      </aside>
      <div
        id="config-sidebar-backdrop"
        ref={configSidebarBackdropRef}
        className="config-sidebar-backdrop is-open"
        aria-hidden="true"
      ></div>
    </>
  )
}
