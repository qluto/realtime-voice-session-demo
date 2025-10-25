'use client'

import { useEffect, useState } from 'react'
import { useDomNode } from '@/lib/voice-agent/internals/dom-registry.ts'

export function ConversationPanel() {
  const [showInstructions, setShowInstructions] = useState(true)
  const copyTranscriptBtnRef = useDomNode('copyTranscriptBtn')
  const requestSummaryBtnRef = useDomNode('requestSummaryBtn')
  const textChatFormRef = useDomNode('textChatForm')
  const textChatInputRef = useDomNode('textChatInput')
  const textChatSubmitRef = useDomNode('textChatSubmit')
  const textChatHintRef = useDomNode('textChatHint')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 720px)')
    const syncToViewport = (event?: MediaQueryListEvent) => {
      const isNarrow = typeof event === 'undefined' ? mq.matches : event.matches
      setShowInstructions(!isNarrow)
    }
    const handleChange = (event: MediaQueryListEvent) => syncToViewport(event)
    syncToViewport()
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleChange)
    } else if (typeof mq.addListener === 'function') {
      mq.addListener(handleChange)
    }
    return () => {
      if (typeof mq.removeEventListener === 'function') {
        mq.removeEventListener('change', handleChange)
      } else if (typeof mq.removeListener === 'function') {
        mq.removeListener(handleChange)
      }
    }
  }, [])

  const handleInstructionsToggle = () => {
    setShowInstructions((prev) => !prev)
  }

  return (
    <section className="panel conversation-panel">
      <div className="panel-header">
        <div>
          <p className="panel-eyebrow">Live transcript</p>
          <h2 className="panel-title">Coaching conversation</h2>
        </div>
        <div className="panel-actions">
          <button
            id="copy-transcript-btn"
            ref={copyTranscriptBtnRef}
            type="button"
            className="icon-pill"
          >
            <span aria-hidden="true">📋</span>
            <span>ログをコピー</span>
          </button>
          <div id="summary-controls" className="summary-controls">
            <button
              id="request-summary-btn"
              ref={requestSummaryBtnRef}
              type="button"
              className="pill-button"
            >
              まとめをリクエスト
            </button>
          </div>
        </div>
      </div>
      <div className="panel-body">
        <div className="instructions-toggle">
          <button
            type="button"
            className="instructions-toggle-button"
            onClick={handleInstructionsToggle}
            aria-expanded={showInstructions}
          >
            セッションガイドを{showInstructions ? '閉じる' : '開く'}
          </button>
        </div>
        {showInstructions && (
          <div id="instructions" className="instructions-card">
            <h3>🎯 セッションの始め方</h3>
            <p>「コーチングセッション開始」を押してマイクアクセスを許可すると、AIコーチとの音声チャットがスタートします。</p>
            <p>ヘッダーのハンバーガーメニューから「Prompt personalization」を開いて質問に回答すると、あなたの個性に合わせたコーチングスタイルが自動でセットされます。</p>
            <p>下記のGROWモデルの4フェーズを順にたどりながら、コーチングセッションを進めていきます。</p>
            <div className="instructions-list">
              <div className="instruction-step">
                <span className="step-label">Goal</span>
                <span className="step-copy">望む状態や今セッションで叶えたいことを言語化する</span>
              </div>
              <div className="instruction-step">
                <span className="step-label">Reality</span>
                <span className="step-copy">現在の状況や感情を整理し、どこに立っているかを把握する</span>
              </div>
              <div className="instruction-step">
                <span className="step-label">Options</span>
                <span className="step-copy">可能な選択肢やアプローチを広げ、アイデアを発散する</span>
              </div>
              <div className="instruction-step">
                <span className="step-label">Will</span>
                <span className="step-copy">次の一歩とコミットメントを決め、実行の準備を整える</span>
              </div>
            </div>
          </div>
        )}
        <div id="conversation-log" className="conversation-log">
          <div id="log-container" className="log-container"></div>
        </div>
        <form id="text-chat-form" ref={textChatFormRef} className="text-chat-form">
          <label htmlFor="text-chat-input" className="text-chat-label">テキストで送信</label>
          <div className="text-chat-controls">
            <textarea
              id="text-chat-input"
              ref={textChatInputRef}
              className="text-chat-input"
              rows={2}
              placeholder="AIコーチに伝えたいことを入力してください"
              aria-label="コーチへのテキストメッセージ"
              disabled
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
            ></textarea>
            <button
              id="text-chat-submit"
              ref={textChatSubmitRef}
              type="submit"
              className="text-chat-send"
              disabled
            >
              送信
            </button>
          </div>
          <p id="text-chat-hint" ref={textChatHintRef} className="text-chat-hint">
            接続後にテキストでメッセージを送信できます。
          </p>
        </form>
      </div>
    </section>
  )
}
