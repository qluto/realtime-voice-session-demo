# セッション終了メカニズム実装計画

## 概要

現在のWeekly Reflection Coachingアプリケーションに、コーチングセッションの適切な終了を導くための2つのアプローチを検討・実装する。

## 現在の課題

- セッションは手動終了ボタンのみで終了
- 明確なセッション完了の仕組みが不足
- 振り返りのまとめや統合フェーズが不完全になる可能性

## 実装アプローチ

### AI主導の自動判定システム

**概念:**
コーチが音声対話の裏で、時間管理や良い振り返りがどの程度進んでいるかの採点を行い続け、採点基準もしくは経過時間が一定閾値以上になったらまとめに入ることを促す。Realtime APIが提供する会話ストリーム（`conversation.item.*`）と応答ライフサイクル（`response.*`）を監視し、フェーズ進捗を数値化する。

**実現可能性:** ✅ **実現可能（複雑）**

**技術的根拠:**
- セッション状態は`session.created` → `session.updated`イベントで同期可能。
- 入力音声はWebRTCトラックに加え、必要に応じて`input_audio_buffer.*`イベントで検知できる。
- モデル出力は`response.output_audio_transcript.delta`や`response.output_text.delta`から逐次取得でき、進行度スコアリングに利用できる。

## 実装計画

### AI主導の自動判定システム

#### 1.1 進行度評価システム
- **イベントフックとデータ収集**
  - `session.created`イベントをトリガーに解析状態を初期化。
  - WebRTC経由では`pc.ontrack`のストリームに加え、`response.output_audio_transcript.delta`/`response.output_text.delta`サーバーイベントを購読し、最新テキストを逐次バッファリング。
  - WebSocket経由の場合は`input_audio_buffer.speech_started`/`speech_stopped`で発話セグメントをマークし、`conversation.item.added`と組み合わせてタイムラインを構築。
- **フェーズスコアリング（ICF 5段階）**
  - Opening & Agenda Setting / Deep Reflection / Insight Synthesis / Forward Integration / Closing の5指標を0-1スコアで管理。
  - 直近の会話チャンクを`response.create`（`conversation: "none"`、`metadata: { purpose: "progress-score" }`）でモデルに送り、`response.done`で返るテキスト結果を解析して各フェーズを更新。
  - `turn_detection`を`semantic_vad`のままにしておき、音声の切れ目でバッファを確定することで不要なAPI呼び出しを抑制。

#### 1.2 自動まとめ判定ロジック
- **時間ベース判定**
  - `sessionTimer`が8分に到達した時点で下限ラインを設定し、`response.done`毎に経過フェーズを評価。
  - タイマーは`session.created`イベントをトリガーにスタートし、`session.updated`の再接続にも対応。
- **内容ベース判定**
  - フェーズスコア合計が`>= 3.5`（例）かつ`Closing`スコアが0.7未満の場合はまとめへの移行候補。
  - 追加で`response.create`に`metadata: { purpose: "closure-readiness" }`を付けたクエリを定期発火し、モデルから「次に取るべき行動」をミニテキストで返させる。

#### 1.3 ユーザーインタラクション
- **まとめ提案機能**
  - 判定が成立したら、`conversation.item.create`で`role: "assistant"`の提案メッセージ（例: "このセッションをまとめに移行しましょうか？"）を挿入。
  - UIでは提案バナーを表示し、`response.create`で`output_modalities: ["text"]`か音声レスポンス（`output_modalities: ["audio"]`）を選択できるトグルを提供。
- **応答選択肢**
  - ユーザーが「まだ続ける」を選んだ場合は`response.create`（`conversation: "none"`, `metadata: { purpose: "dismissal" }`）を送り、モデルに次の深掘り質問を生成させる。

#### 1.4 統合UI更新
- **進行度表示**
  - フェーズスコアを`summary-progress`コンポーネントに反映し、`response.function_call_arguments.delta`などバックグラウンド処理中はローディングを表示。
  - 現在検出中のフェーズ名をユーザーに提示し、`response.output_text.done`受信時に更新。
- **モード切替**
  - セッション開始時に「自動まとめモードを有効化」のトグルを提供し、フラグに応じて提案ロジックを有効/無効化。
- **アクセシビリティ**
  - 音声のみのインターフェースでも提案が届くよう、`response.output_audio.delta`で得た音声を再生しつつ、回避策としてテキスト通知も表示。

#### 実装ファイル:
- `lib/voice-agent/index.ts`: 進行度評価とタイミング判定
- `lib/voice-agent/session-analyzer/index.ts`: 会話分析機能
- `components/realtime/ConversationPanel.tsx`: 進行度UI要素の追加
- `app/globals.css`: 進行度表示のスタイリング

## 技術仕様

### OpenAI Realtime API活用
```typescript
// フェーズスコアリングをバックグラウンドで取得
dataChannel.send(JSON.stringify({
  type: 'response.create',
  response: {
    conversation: 'none',
    metadata: { purpose: 'progress-score' },
    output_modalities: ['text'],
    input: [
      { type: 'item_reference', id: lastConversationItemId },
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: buildProgressPrompt(transcriptSlice) }]
      }
    ]
  }
}));

// 閾値到達後にまとめ用の応答を生成
dataChannel.send(JSON.stringify({
  type: 'response.create',
  response: {
    output_modalities: ['audio'],
    instructions: 'セッションを短く振り返り、次のアクションを提案してクロージングしてください。'
  }
}));
```

## 期待される効果

- 最適なタイミングでのセッション終了
- コーチング品質の一貫性向上
- セッション時間の効率的活用

## リスク評価

### 技術的リスク
- **中**: 会話分析の精度に依存

### ユーザー体験リスク
- **中**: 自動判定の精度とユーザー受容性

## 成功指標

1. **機能成功指標**
   - まとめ機能の利用率
   - セッション完了率の向上
   - ユーザー満足度の向上

2. **技術成功指標**
   - レスポンス時間の維持
   - エラー率の最小化
   - システム安定性の確保
