# Slack-Notion-Gemini Bot TODO

`workspace/SPEC.md` の内容に基づく実装のステップと進捗管理です。

## Step 1：Slack → Gemini の疎通確認（MCP なし）
- [x] **1-1. Slack アプリの設定（ブラウザ作業）**
  - [x] Socket Mode 有効化、App-Level Token（`SLACK_APP_TOKEN`）取得
  - [x] Bot Token Scopes に `app_mentions:read`, `chat:write` 追加
  - [x] Event Subscriptions で `app_mention` 有効化
  - [x] ワークスペースにインストールして Bot Token（`SLACK_BOT_TOKEN`）取得
- [x] **1-2. プロジェクト初期設定**
  - [x] `npm init -y`
  - [x] 依存パッケージインストール (`@slack/bolt`, `@google/generative-ai`, `dotenv`)
  - [x] 開発用パッケージインストール (`typescript`, `ts-node`, `nodemon`, `@types/node`)
  - [x] `tsconfig.json` の設定
  - [x] `package.json` に scripts 追加 (`dev`, `build`, `start`)
  - [x] `.env` のひな形作成（上記 API キーを設定）
- [x] **1-3. Slack ↔ Gemini 連携の実装**
  - [x] `src/slack/app.ts` (Bolt アプリ基本設定)
  - [x] `src/gemini/client.ts` (Gemini API 呼び出し)
  - [x] `src/slack/handlers/mention.ts` (メンションハンドラの実装)
  - [x] `src/index.ts` (エントリーポイント)
- [x] **1-4. Step 1 の動作確認**
  - [x] `npm run dev` でローカル起動
  - [x] Slack でメンションを送ると、Gemini モデルからの回答が返ってくることを確認

## Step 2：Notion MCP の接続確認
- [x] **2-1. Notion アプリの設定（ブラウザ作業）**
  - [x] Notion インテグレーション作成、`NOTION_API_KEY` の取得
  - [x] テスト用ページへのコネクト（インテグレーション）追加
  - [x] `.env` に API キーを設定
- [x] **2-2. 追加パッケージのインストール**
  - [x] `@modelcontextprotocol/sdk`, `@notionhq/notion-mcp-server`
- [x] **2-3. Notion MCP 接続の実装**
  - [x] `src/mcp/client.ts` (stdio 経由での MCP Client 起動と接続)
  - [x] `src/mcp/tools.ts` (`listTools` と `callTool` のラッパー実装)
  - [x] `src/index.ts` (一時的な疎通確認コードの追加)
- [x] **2-4. Step 2 の動作確認**
  - [x] アプリ起動時に tools の一覧がコンソールに出力されることを確認
  - [x] `callTool` を使って特定の Notion ページが取得できることを確認

## Step 3：Gemini ↔ MCP ブリッジの実装
- [x] **3-1. tools の型変換の実装**
  - [x] `src/mcp/tools.ts` (MCP tools の schema を Gemini の `FunctionDeclaration` 形式に変換)
- [x] **3-2. エージェントループの実装**
  - [x] `src/gemini/agent.ts` (functionCall → callTool → functionResponse のやり取りをループ制御、最大イテレーション管理)
- [x] **3-3. ハンドラのつなぎこみとクリーンアップ**
  - [x] `src/slack/handlers/mention.ts` を直接の API 呼び出しからエージェント経由 (`runAgent`) に変更
  - [x] `src/index.ts` の疎通確認コードを削除し、きれいな状態に整備
- [x] **3-4. Step 3 の動作確認 (E2E)**
  - [x] Slack から「Notion を検索して」などと指示
  - [x] Gemini が MCP を複数回呼び出し、最終的な回答を Slack に返答するか確認
  - [x] エラー時の挙動や該当ページが見つからない場合のフォールバックの確認

## Step 4：Botの回答精度・検索クオリティの向上
- [x] **4-1. ツール定義（description）のチューニング**
  - [x] `src/mcp/tools.ts` の `toFunctionDeclarations` 処理を改修し、Notion MCPのデフォルトの `description` を、Botのユースケースに特化した具体的な説明（いつ・どのツールを・どのように使うべきか）に上書きする
- [ ] **4-2. システムプロンプト（systemInstruction）の高度化**
  - [ ] `src/gemini/agent.ts` の `systemInstruction` に以下を組み込む
    - [ ] **Notionのデータ構造**: 検索対象となる主要データベースのプロパティ構造
    - [ ] **質問タイプ別の検索戦略**: 質問に応じて `query_database`, `search`, `retrieve_page` をどう使い分けるかの指針
    - [ ] **ReActパターンの指示**: 「計画 → ツール実行 → 確認 → 回答」の思考フローの徹底
    - [ ] **Few-shotサンプル**: 期待される思考プロセスと検索の成功事例を提示
- [ ] **4-3. 検索結果の最適化とフォールバック処理**
  - [ ] 検索結果が0件だった場合の再検索アクションや、見つからない旨を正直に伝える指示をプロンプトに追記
  - [ ] [Optional] 取得したページデータが大きすぎる場合のコンテキスト長節約処理（メタデータの削減など）
- [ ] **4-4. [Optional] スキーマ情報のキャッシュ機構の導入**
  - [ ] 動的にデータベースのスキーマを取得してプロンプトに組み込む場合、毎回のリクエストでAPIを叩かないよう一定時間（1時間など）のインメモリキャッシュを実装する

## Step 5：デプロイ（任意）
- [ ] **Docker 環境整備**
  - [ ] `Dockerfile` の用意（`npx` で Notion MCP を実行できる Node.js 実行環境）
  - [ ] `docker compose up` でのローカルコンテナ動作確認
- [ ] **Cloud Run ヘのデプロイ**
  - [ ] Artifact Registry への Image Push
  - [ ] Cloud Run にデプロイ（`--min-instances=1` 設定）
