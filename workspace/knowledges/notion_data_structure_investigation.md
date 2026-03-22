# Notion データ構造の調査方法

Bot が Notion のデータベースを的確に検索できるようにするため、事前に `notion-mcp-server` を経由してデータ構造（データベースやプロパティの構成）を調査しました。その際の手順とスクリプトの仕組みを記録します。

## 1. 調査の目的
システムプロンプト（`systemInstruction`）に対象データベースの情報を組み込むため、Bot がアクセス可能な Notion データベースの**ID**、**名前**、および**各プロパティの名前とデータ型（title, date, multi_select など）**を正確に把握する必要がありました。

## 2. 調査の仕組み
Notion MCP サーバーが提供する `callTool` インターフェースを利用し、一時的な調査用スクリプト（`investigate_notion.ts`）を作成・実行して情報を抽出しました。

### 使用した MCP ツール
- **ツール名**: `API-post-search`
- **目的**: Notion 内のページやデータベースを横断検索・一覧取得するツール。
- **パラメータ**: 
  取得対象を「データベース」のみに絞り込むため、以下の filter を適用しました。
  ```json
  {
    "filter": { "value": "data_source", "property": "object" }
  }
  ```
  *(※Notion API ではデータベースオブジェクトを `data_source` と指定してフィルタリングします)*

### 調査用スクリプトの処理フロー
TypeScript と `@modelcontextprotocol/sdk` のクライアント（`src/mcp/tools.ts`）を利用し、以下のような処理を行いました。

1. **環境変数のロード**: `import 'dotenv/config'` で `NOTION_API_KEY` を読み込み。
2. **ツールの実行**: `callTool('API-post-search', { filter: ... })` を実行。
3. **結果の解析**: MCP から返却されたテキスト（Notion API のレスポンス本体）を JSON としてパース。
4. **プロパティの抽出**: 
   - `body.results` 配列に格納されている各データベースオブジェクト（`db`）を走査。
   - `db.title` からデータベースの可読名を取得。
   - `db.properties` に含まれるオブジェクトを展開し、設定されている**プロパティ名**と、その**データ型**（`type`フィールド）を一覧としてコンソールに出力。

## 3. 実際の抽出結果の例
コマンドラインにてスクリプトを実行（`npx ts-node investigate_notion.ts`）した結果、対象ワークスペース内でアクセス権を付与しているデータベースの構造が以下のように取得できました。

```text
Found 1 data_sources
---
DB Name: お店リスト_archived
DB ID: b7036f04-3387-4587-a94d-cd3baa87e83c
  - Genre [multi_select]
  - _original_page_id [rich_text]
  - created_at [created_time]
  - Place [select]
  - Visited at [date]
  - Tag [multi_select]
  - URL [url]
  - Name [title]
```

## 4. この情報の活用方法
取得したデータベース名、ID、およびプロパティ構成を、Gemini アシスタントを初期化する際の **システムプロンプト（`src/gemini/prompts.ts`）に記述**しました。
これにより、Gemini は「お店のジャンルで絞り込みたい場合は \`Genre\` プロパティを使う」「訪問日でフィルタするなら \`Visited at\` を指定する」といったように、Notion API（\`API-query-data-source\`）で利用可能な正しいクエリパラメータを自律的に推定・構築できるようになります。
