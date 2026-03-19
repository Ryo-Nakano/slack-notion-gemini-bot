# Slack Bot 仕様書：Notion MCP × Gemini API 連携

## 概要

Slack へのメンションをトリガーに、Notion から情報を取得し、Gemini が回答を生成して Slack に返答する Bot。

---

## アーキテクチャ

```
Slack mention
    ↓ (Socket Mode or Events API)
Bot Server (Node.js / TypeScript)
    ├─ spawn → Notion MCP Server (stdio)
    │           ↑ tools 取得 / callTool
    └─ Gemini API
           ↑ FunctionDeclaration (MCP tools を変換)
           ↓ functionCall → MCP → functionResponse → ループ
    ↓
Slack へ reply
```

---

## 技術スタック

| 役割 | 技術 |
|---|---|
| Bot フレームワーク | `@slack/bolt` (Socket Mode) |
| MCP クライアント | `@modelcontextprotocol/sdk` |
| Notion MCP Server | `@notionhq/notion-mcp-server` |
| LLM | `@google/generative-ai` (Gemini) |
| 言語 | Node.js / TypeScript |

---

## ボトルネックと対策

### 1. Notion MCP Server のトランスポート問題

公式の Notion MCP Server（`@notionhq/notion-mcp-server`）は **stdio ベース**で設計されており、CLIツールやエディタから子プロセスとして起動する前提。  
常駐プロセスである Bot サーバーから使うには以下の2方式を検討する。

| 方式 | 内容 | 難易度 |
|---|---|---|
| **子プロセス方式** | Bot サーバーが起動時に MCP サーバーを `spawn` して stdio で通信 | 中（セッション管理が必要） |
| **HTTP/SSE 方式** | `mcp-proxy` 等でラップして HTTP エンドポイント化 | 中〜高 |

**→ 最小構成では子プロセス方式を推奨。** `@modelcontextprotocol/sdk` の `StdioClientTransport` を使って接続する。

---

### 2. Gemini ↔ MCP ブリッジ（自前実装）

Gemini API は MCP にネイティブ非対応のため、以下のエージェントループを自前実装する。

```
① MCP サーバーから tools 一覧を取得
② Gemini の FunctionDeclaration 形式に変換
③ Gemini に tools 付きでメッセージ送信
④ Gemini が functionCall を返したら → MCP サーバーへ callTool
⑤ 結果を functionResponse として Gemini に戻す
⑥ Gemini が最終テキストを返すまで ④〜⑤ をループ
```

MCP の JSON Schema → Gemini の `FunctionDeclaration` 変換は機械的だが、**④〜⑥のループ実装が設計上の核心**。

---

### 3. Slack Events API のエンドポイント問題

Slack Events API は **公開 HTTPS エンドポイントが必須**。開発時に詰まりやすい。

| 環境 | 推奨方法 |
|---|---|
| ローカル開発 | Socket Mode（公開 URL 不要） |
| 本番運用 | Cloud Run / Fly.io 等にデプロイ + Events API |

**→ 最小構成では Socket Mode を使い、公開 URL なしで開発する。**

---

## 実装ロードマップ

### Step 1：Slack → Gemini の疎通確認（MCP なし）

- Slack Bot アプリを作成（Socket Mode 有効化）
- メンションを受け取り、Gemini にそのまま転送
- Gemini のレスポンスを Slack に返す

### Step 2：Notion MCP の接続確認

- `@notionhq/notion-mcp-server` を子プロセスとして起動
- `StdioClientTransport` で接続し、`tools/list` が返ることを確認
- `callTool` で Notion のページ取得が動くことを確認

### Step 3：Gemini ↔ MCP ブリッジの実装

- MCP tools を `FunctionDeclaration` 形式に変換する関数を実装
- エージェントループ（functionCall → callTool → functionResponse）を実装
- Slack からの入力を渡して、最終回答が返ることを E2E で確認

---

## 必要な環境変数

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...   # Socket Mode 用
NOTION_API_KEY=secret_...
GEMINI_API_KEY=...
```

---

## ディレクトリ構成

```
slack-notion-gemini-bot/
├── src/
│   ├── index.ts                  # エントリーポイント
│   ├── slack/
│   │   ├── app.ts                # Bolt アプリ初期化
│   │   └── handlers/
│   │       └── mention.ts        # メンションイベントハンドラ
│   ├── mcp/
│   │   ├── client.ts             # MCP クライアント初期化・管理
│   │   └── tools.ts              # MCP tools → FunctionDeclaration 変換
│   ├── gemini/
│   │   ├── client.ts             # Gemini クライアント初期化
│   │   └── agent.ts              # エージェントループ実装
│   └── utils/
│       └── logger.ts             # ロガー
├── .env
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

### 構成判断の理由

**`slack / mcp / gemini` で3分割する理由**

Bot の責務は明確に3つに分離できる。

| ディレクトリ | 責務 |
|---|---|
| `slack/` | イベント受信・返信（I/O） |
| `mcp/` | Notion との通信（ツール層） |
| `gemini/` | 推論・ループ制御（LLM 層） |

将来 Gemini を別モデルに差し替えたい、Notion 以外の MCP を追加したいという変更が起きたとき、影響範囲が1ディレクトリに閉じる。

**`slack/handlers/mention.ts` を切り出す理由**

Bolt はイベントの種類（`app_mention`, `message`, `action` 等）が増えると `app.ts` が肥大化しがちなため、ハンドラを `handlers/` 以下に分けて `app.ts` はルーティングだけに専念させる。

**`mcp/client.ts` と `mcp/tools.ts` を分ける理由**

`client.ts` は「MCP サーバーとの接続セッション管理」、`tools.ts` は「取得した tools を Gemini 用スキーマに変換するロジック」と役割が異なる。1ファイルにまとめると変換ロジックのテストが書きにくくなる。

**`gemini/agent.ts` にループを集約する理由**

エージェントループ（`functionCall → callTool → functionResponse → 繰り返し`）はこのシステムの最も複雑な部分。ここだけ独立させることで、最大イテレーション数の管理・エラー時のフォールバック・デバッグログ出力が一箇所に集まり読み書きしやすくなる。

**フラット寄りにする理由**

最小構成の段階で `domain/` や `infrastructure/` のようなレイヤードアーキテクチャを持ち込むとファイルを探す往復コストが増える。この粒度が「見通しとスケーラビリティのバランス」として適切。

---

## デプロイフロー

### 本番環境：Cloud Run

Cloud Run は **コンテナをそのまま実行するサービス**（AWS でいう ECS Fargate に近い）。Lambda とは異なり、常駐プロセスが持てるため、Notion MCP Server を子プロセスとして spawn し stdio 接続を維持する今回の構成と相性が良い。

```
① ローカルで開発・動作確認（npm run dev）
       ↓
② Docker で動作確認（docker compose up）
       ↓
③ Artifact Registry に push
       ↓
④ Cloud Run がイメージを pull して実行
```

### 開発フェーズごとの作業方針

| フェーズ | 方法 | 理由 |
|---|---|---|
| 普段のコーディング | `npm run dev`（nodemon） | 速いフィードバックループ |
| コンテナ動作確認 | `docker compose up` | デプロイ前の最終確認 |
| 本番デプロイ | Cloud Run に push | 本番運用 |

**ローカルで動くものを完成させてから Docker 化する**のが正しい順番。アプリが正常に動いていれば Docker 化はパッケージング作業に過ぎない。逆の順番で進めると、バグ・コンテナ設定ミス・Cloud Run 設定ミスの切り分けができず詰まりやすい。

### Dockerfile

Notion MCP Server を子プロセスとして spawn するため、コンテナ内に `npx` が使える Node.js 環境が必要。

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["node", "dist/index.js"]
```

### デプロイコマンド

```bash
# イメージビルド
docker build -t slack-bot .

# Artifact Registry に push
docker tag slack-bot asia-northeast1-docker.pkg.dev/PROJECT_ID/REPO/slack-bot
docker push asia-northeast1-docker.pkg.dev/PROJECT_ID/REPO/slack-bot

# Cloud Run にデプロイ
gcloud run deploy slack-bot \
  --image asia-northeast1-docker.pkg.dev/PROJECT_ID/REPO/slack-bot \
  --region asia-northeast1 \
  --min-instances=1 \
  --set-env-vars SLACK_BOT_TOKEN=xxx,...
```

### Cloud Run の注意点

**スケールゼロ問題**：リクエストがない時間が続くとコンテナが停止し、次のリクエスト時にコールドスタートが発生する。再 spawn のコストが加わるため初回レスポンスが遅くなる。

`--min-instances=1` で常時起動にすることで回避できる。Slack Bot 用途ではコスト増は許容範囲内。

---

## 備考

- Gemini のモデルは `gemini-1.5-pro` または `gemini-2.0-flash` を推奨（function calling 対応必須）
- Notion MCP が返す tools の数が多い場合、Gemini のコンテキスト長に注意
- エージェントループは無限ループしないよう、最大イテレーション数を設けること

---

## 実装詳細

### Step 1 詳細：Slack → Gemini 疎通確認

大きく **「Slack アプリの設定」「環境構築」「実装」「動作確認」** の4段階に分かれる。

#### 1-1. Slack アプリの作成（api.slack.com）

1. https://api.slack.com/apps で「Create New App」→「From scratch」
2. **Socket Mode を有効化**
   - `Settings > Socket Mode` → Enable
   - App-Level Token を発行（スコープ：`connections:write`）→ `SLACK_APP_TOKEN`
3. **Bot Token スコープを追加**
   - `OAuth & Permissions > Bot Token Scopes` に以下を追加
     - `app_mentions:read`（メンション受信）
     - `chat:write`（メッセージ送信）
4. **Event Subscriptions を有効化**
   - `Event Subscriptions > Subscribe to bot events` に `app_mention` を追加
5. アプリをワークスペースにインストール → `SLACK_BOT_TOKEN` を取得
6. Bot をテスト用チャンネルに招待

#### 1-2. プロジェクト初期設定

```bash
mkdir slack-notion-gemini-bot && cd slack-notion-gemini-bot
npm init -y
npm install @slack/bolt @google/generative-ai dotenv
npm install -D typescript ts-node nodemon @types/node
npx tsc --init
```

`tsconfig.json` の最低限の設定：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true
  }
}
```

`package.json` に scripts 追加：

```json
"scripts": {
  "dev": "nodemon --exec ts-node src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js"
}
```

#### 1-3. 実装

**`src/index.ts`**
```typescript
import { app } from './slack/app';

(async () => {
  await app.start();
  console.log('Bot is running');
})();
```

**`src/slack/app.ts`**
```typescript
import { App } from '@slack/bolt';
import { mentionHandler } from './handlers/mention';
import 'dotenv/config';

export const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

app.event('app_mention', mentionHandler);
```

**`src/slack/handlers/mention.ts`**
```typescript
import { generateReply } from '../../gemini/client';

export const mentionHandler = async ({ event, say }: any) => {
  const userMessage = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

  const reply = await generateReply(userMessage);
  await say({ text: reply, thread_ts: event.ts });
};
```

**`src/gemini/client.ts`**
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

export const generateReply = async (message: string): Promise<string> => {
  const result = await model.generateContent(message);
  return result.response.text();
};
```

#### 1-4. 動作確認チェックリスト

```
□ npm run dev でエラーなく起動する
□ Slack でボットにメンションを送ると反応する
□ メンション部分（<@UXXXXXXX>）が除去されて Gemini に渡っている
□ Gemini の返答がスレッドに返ってくる
□ 日本語のメッセージでも正常に動作する
```

#### Step 1 完了の定義

「Slack でメンションを送ったら、Gemini が生成したテキストがスレッドに返ってくる」状態。MCP・Notion は一切関係なく、**Slack ↔ Gemini の I/O だけが通っていれば OK。**

---

### Step 2 詳細：Notion MCP 接続確認

大きく **「Notion 側の設定」「パッケージ追加」「実装」「動作確認」** の4段階に分かれる。

#### 2-1. Notion インテグレーションの作成

1. https://www.notion.so/my-integrations で「新しいインテグレーション」を作成
2. 名前を設定（例：`slack-bot-dev`）→ `NOTION_API_KEY` を取得
3. Bot に読み取らせたい Notion ページ・DB を開き、右上「…」→「コネクトの追加」→ 作成したインテグレーションを追加

> インテグレーションを追加していないページは MCP から見えないので注意。

#### 2-2. パッケージ追加

```bash
npm install @modelcontextprotocol/sdk @notionhq/notion-mcp-server
```

#### 2-3. 実装

**`src/mcp/client.ts`**
```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

let mcpClient: Client | null = null;

export const getMcpClient = async (): Promise<Client> => {
  if (mcpClient) return mcpClient;

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    env: {
      ...process.env,
      OPENAI_API_KEY: 'dummy', // notion-mcp-server が要求するが今は未使用
      NOTION_API_KEY: process.env.NOTION_API_KEY!,
    },
  });

  mcpClient = new Client({ name: 'slack-bot', version: '1.0.0' });
  await mcpClient.connect(transport);

  console.log('MCP client connected');
  return mcpClient;
};
```

**`src/mcp/tools.ts`**
```typescript
import { getMcpClient } from './client';

// MCP から tools 一覧を取得して確認用に出力
export const listTools = async () => {
  const client = await getMcpClient();
  const { tools } = await client.listTools();

  console.log(`取得した tools 数: ${tools.length}`);
  tools.forEach(t => console.log(` - ${t.name}: ${t.description}`));

  return tools;
};

// 指定した tool を呼び出す
export const callTool = async (name: string, args: Record<string, unknown>) => {
  const client = await getMcpClient();
  const result = await client.callTool({ name, arguments: args });
  return result;
};
```

**`src/index.ts`（Step 2 確認用に一時的に追記）**
```typescript
import { app } from './slack/app';
import { listTools, callTool } from './mcp/tools';

(async () => {
  // MCP 接続確認
  await listTools();

  // Notion ページ取得の疎通確認（ページIDは実際のものに差し替え）
  const result = await callTool('notion_retrieve_page', {
    page_id: 'YOUR_NOTION_PAGE_ID',
  });
  console.log('callTool result:', JSON.stringify(result, null, 2));

  await app.start();
  console.log('Bot is running');
})();
```

#### 2-4. `notion-mcp-server` の tools 一覧（主要なもの）

接続が成功すると以下のような tools が取得できる。

| tool 名 | 内容 |
|---|---|
| `notion_search` | キーワードでページ・DB を検索 |
| `notion_retrieve_page` | ページ ID を指定してページを取得 |
| `notion_query_database` | DB をフィルタ・ソートして取得 |
| `notion_retrieve_block_children` | ブロックの子要素（本文）を取得 |
| `notion_create_page` | ページを新規作成 |
| `notion_update_page` | ページのプロパティを更新 |

Step 2 の時点では **読み取り系（`notion_search` / `notion_retrieve_page`）が動けば十分**。

#### 2-5. 動作確認チェックリスト

```
□ npm run dev 起動時に「MCP client connected」が出力される
□ listTools() で tools が10件以上取得できる
□ callTool('notion_retrieve_page', ...) でページの内容が返ってくる
□ インテグレーションを追加していないページはエラーになることを確認する
□ プロセス終了時にコンソールエラーが出ないこと
```

#### Step 2 完了の定義

「起動時に MCP サーバーへの接続が確立され、Notion のページ内容を `callTool` で取得できる」状態。Gemini との連携はまだ不要。**MCP ↔ Notion の I/O だけが通っていれば OK。**

---

### Step 3 詳細：Gemini ↔ MCP ブリッジ実装

大きく **「tools 変換」「エージェントループ実装」「ハンドラへの組み込み」「動作確認」** の4段階に分かれる。

#### 3-1. MCP tools → Gemini FunctionDeclaration 変換

MCP が返す tools の JSON Schema を、Gemini が解釈できる `FunctionDeclaration` 形式に変換する関数を実装する。

**`src/mcp/tools.ts`（変換関数を追記）**
```typescript
import { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { FunctionDeclaration, SchemaType } from '@google/generative-ai';

// MCP の tool スキーマを Gemini の FunctionDeclaration に変換
export const toFunctionDeclarations = (tools: McpTool[]): FunctionDeclaration[] => {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description ?? '',
    parameters: {
      type: SchemaType.OBJECT,
      properties: tool.inputSchema?.properties ?? {},
      required: (tool.inputSchema?.required as string[]) ?? [],
    },
  }));
};
```

#### 3-2. エージェントループの実装

Gemini が `functionCall` を返す限り MCP を呼び続け、最終的なテキスト回答が得られるまでループする。

**`src/gemini/agent.ts`**
```typescript
import { GoogleGenerativeAI, Content, Part } from '@google/generative-ai';
import { getMcpClient } from '../mcp/client';
import { listTools, callTool, toFunctionDeclarations } from '../mcp/tools';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const MAX_ITERATIONS = 10;

export const runAgent = async (userMessage: string): Promise<string> => {
  // ① MCP から tools 取得 → FunctionDeclaration に変換
  const mcpTools = await listTools();
  const functionDeclarations = toFunctionDeclarations(mcpTools);

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{ functionDeclarations }],
  });

  // 会話履歴を保持しながらループ
  const history: Content[] = [];
  const userPart: Content = { role: 'user', parts: [{ text: userMessage }] };
  history.push(userPart);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await model.generateContent({ contents: history });
    const response = result.response;
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    // アシスタントの返答を履歴に追加
    history.push({ role: 'model', parts });

    // ② functionCall がなければ最終回答として返す
    const functionCalls = parts.filter((p: Part) => p.functionCall);
    if (functionCalls.length === 0) {
      return parts.map((p: Part) => p.text ?? '').join('');
    }

    // ③ functionCall ごとに MCP を呼び出して結果を履歴に積む
    const toolResultParts: Part[] = [];
    for (const part of functionCalls) {
      const { name, args } = part.functionCall!;
      console.log(`Calling MCP tool: ${name}`, args);

      let toolResponse: unknown;
      try {
        toolResponse = await callTool(name, args as Record<string, unknown>);
      } catch (e) {
        toolResponse = { error: String(e) };
      }

      toolResultParts.push({
        functionResponse: {
          name,
          response: { content: JSON.stringify(toolResponse) },
        },
      });
    }

    // ④ tool 結果を user ロールで履歴に追加してループ継続
    history.push({ role: 'user', parts: toolResultParts });
  }

  return 'エラー：最大試行回数に達しました。';
};
```

#### 3-3. ハンドラへの組み込み

Step 1 で作成した `mention.ts` の `generateReply` を `runAgent` に差し替える。

**`src/slack/handlers/mention.ts`**
```typescript
import { runAgent } from '../../gemini/agent';

export const mentionHandler = async ({ event, say }: any) => {
  const userMessage = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

  // 処理中であることをユーザーに伝える
  await say({ text: '少々お待ちください...', thread_ts: event.ts });

  const reply = await runAgent(userMessage);
  await say({ text: reply, thread_ts: event.ts });
};
```

**`src/index.ts`（Step 2 の確認用コードを削除してクリーンに戻す）**
```typescript
import { app } from './slack/app';
import { getMcpClient } from './mcp/client';

(async () => {
  await getMcpClient(); // 起動時に MCP 接続を確立
  await app.start();
  console.log('Bot is running');
})();
```

#### 3-4. エージェントループの処理フロー（整理）

```
Slack メンション受信
    ↓
① listTools() → MCP から tools 一覧取得
    ↓
② toFunctionDeclarations() → Gemini 形式に変換
    ↓
③ Gemini にユーザーメッセージ + tools を送信
    ↓
④ Gemini が functionCall を返す
    ↓
⑤ callTool() → MCP 経由で Notion を操作
    ↓
⑥ 結果を functionResponse として Gemini に返す
    ↓
④〜⑥ を Gemini がテキストを返すまで繰り返す（最大10回）
    ↓
Slack にテキスト回答を返信
```

#### 3-5. 動作確認チェックリスト

```
□ 「〇〇についてNotionで調べて」とメンションすると notion_search が呼ばれる
□ Gemini が functionCall → MCP → functionResponse のループを複数回実行できる
□ 最終的にテキスト回答が Slack スレッドに返ってくる
□ Notion に存在しない情報を聞いたとき、適切に「見つからない」と返ってくる
□ MAX_ITERATIONS に達した場合のエラーメッセージが返ってくる
□ MCP callTool がエラーになっても Bot がクラッシュしないこと
```

#### Step 3 完了の定義

「Slack でメンションを送ると、Gemini が必要に応じて Notion を検索・参照しながら回答を生成し、スレッドに返ってくる」状態。**3つの I/O（Slack ↔ Gemini ↔ MCP/Notion）がすべて繋がっていれば OK。**
