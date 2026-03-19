# Slack-Notion-Gemini Bot TODO

`workspace/SPEC.md` の内容に基づく実装のステップと進捗管理です。

## Step 1：Slack → Gemini の疎通確認（MCP なし）
- [ ] **1-1. Slack アプリの設定（ブラウザ作業）**
  - [ ] Socket Mode 有効化、App-Level Token（`SLACK_APP_TOKEN`）取得
  - [ ] Bot Token Scopes に `app_mentions:read`, `chat:write` 追加
  - [ ] Event Subscriptions で `app_mention` 有効化
  - [ ] ワークスペースにインストールして Bot Token（`SLACK_BOT_TOKEN`）取得
- [ ] **1-2. プロジェクト初期設定**
  - [ ] `npm init -y`
  - [ ] 依存パッケージインストール (`@slack/bolt`, `@google/generative-ai`, `dotenv`)
  - [ ] 開発用パッケージインストール (`typescript`, `ts-node`, `nodemon`, `@types/node`)
  - [ ] `tsconfig.json` の設定
  - [ ] `package.json` に scripts 追加 (`dev`, `build`, `start`)
  - [ ] `.env` のひな形作成（上記 API キーを設定）
- [ ] **1-3. Slack ↔ Gemini 連携の実装**
  - [ ] `src/slack/app.ts` (Bolt アプリ基本設定)
  - [ ] `src/gemini/client.ts` (Gemini API 呼び出し)
  - [ ] `src/slack/handlers/mention.ts` (メンションハンドラの実装)
  - [ ] `src/index.ts` (エントリーポイント)
- [ ] **1-4. Step 1 の動作確認**
  - [ ] `npm run dev` でローカル起動
  - [ ] Slack でメンションを送ると、Gemini モデルからの回答が返ってくることを確認

## Step 2：Notion MCP の接続確認
- [ ] **2-1. Notion アプリの設定（ブラウザ作業）**
  - [ ] Notion インテグレーション作成、`NOTION_API_KEY` の取得
  - [ ] テスト用ページへのコネクト（インテグレーション）追加
  - [ ] `.env` に API キーを設定
- [ ] **2-2. 追加パッケージのインストール**
  - [ ] `@modelcontextprotocol/sdk`, `@notionhq/notion-mcp-server`
- [ ] **2-3. Notion MCP 接続の実装**
  - [ ] `src/mcp/client.ts` (stdio 経由での MCP Client 起動と接続)
  - [ ] `src/mcp/tools.ts` (`listTools` と `callTool` のラッパー実装)
  - [ ] `src/index.ts` (一時的な疎通確認コードの追加)
- [ ] **2-4. Step 2 の動作確認**
  - [ ] アプリ起動時に tools の一覧がコンソールに出力されることを確認
  - [ ] `callTool` を使って特定の Notion ページが取得できることを確認

## Step 3：Gemini ↔ MCP ブリッジの実装
- [ ] **3-1. tools の型変換の実装**
  - [ ] `src/mcp/tools.ts` (MCP tools の schema を Gemini の `FunctionDeclaration` 形式に変換)
- [ ] **3-2. エージェントループの実装**
  - [ ] `src/gemini/agent.ts` (functionCall → callTool → functionResponse のやり取りをループ制御、最大イテレーション管理)
- [ ] **3-3. ハンドラのつなぎこみとクリーンアップ**
  - [ ] `src/slack/handlers/mention.ts` を直接の API 呼び出しからエージェント経由 (`runAgent`) に変更
  - [ ] `src/index.ts` の疎通確認コードを削除し、きれいな状態に整備
- [ ] **3-4. Step 3 の動作確認 (E2E)**
  - [ ] Slack から「Notion を検索して」などと指示
  - [ ] Gemini が MCP を複数回呼び出し、最終的な回答を Slack に返答するか確認
  - [ ] エラー時の挙動や該当ページが見つからない場合のフォールバックの確認

## デプロイ（任意）
- [ ] **Docker 環境整備**
  - [ ] `Dockerfile` の用意（`npx` で Notion MCP を実行できる Node.js 実行環境）
  - [ ] `docker compose up` でのローカルコンテナ動作確認
- [ ] **Cloud Run ヘのデプロイ**
  - [ ] Artifact Registry への Image Push
  - [ ] Cloud Run にデプロイ（`--min-instances=1` 設定）
