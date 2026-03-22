# 4-2. システムプロンプト（systemInstruction）の高度化と実装方針

`workspace/TODO.md` の Step 4-2 に関連して実施した、Geminiアシスタントへのシステムプロンプト高度化の内容と方針をまとめます。

## 目的
Gemini（LLM）に対して、具体的な行動指針（ReActパターンなど）、ツールの正確な使い分けルール、および検索対象となるNotionのデータ構造を明示的に与えることで、Botの自律的な検索と回答の精度を向上させます。

## 実装内容と方針

### 1. `systemInstruction` の分離と実装
プロンプトが長大になることを見越し、`src/gemini/agent.ts` にハードコードせず別ファイル（`src/gemini/prompts.ts`）に切り出しました。
生成したプロンプトには以下の要素を組み込みました。

- **行動指針（ReActパターン）**: 「質問分析 → ツール選択・実行 → 結果確認 → 回答生成（または再検索）」という計画的な思考フローを徹底させています。
- **ツールの使い分け**: 
  - `API-query-data-source`：構造化データベースに対するプロパティでの絞り込み。
  - `API-post-search`：全文のキーワード検索や横断検索。
  - `API-retrieve-a-page`：ページの中のプロパティ詳細情報の取得。
  - `API-get-block-children`：ページ本文（コンテンツ）の取得。
- **Notionのデータ構造の明示**:
  - MCPツールを通じて事前にワークスペースを調査し、アクセス可能な「お店リスト_archived」データベース（DB ID: `b7036f04-...`）の具体的なプロパティ（`Genre`, `Place`, `Visited at`, `Tag`, `URL`, `Name` など）とそのデータ型を組み込みました。
- **検索戦略の例**: キーワード検索とプロパティフィルタリングの定石や、検索結果が0件だった場合に条件を緩めて再検索を行うフォールバックルールを設定しています。

### 2. エージェント側への組み込み
`src/gemini/agent.ts` の `GoogleGenerativeAI` 呼び出し部分にて、`getGenerativeModel` の引数に切り出した `systemInstruction` を渡し、モデル初期化時にプロンプトが反映されるように調整しました。

### 3. 【付随修正】ツール定義名（description）のマッピング修正
Step 4-1 で実装済みの `OVERRIDE_DESCRIPTIONS` において、想定したツール名（`notion_search`など）と、実際の `@notionhq/notion-mcp-server` のツール名（`API-post-search`など）に差異があることが分かりました。
プロンプト側でのツール指定と合わせるため、`src/mcp/tools.ts` 側のオーバーライド・キー名も実際の仕様に合わせた形式に修正しました。

## 期待される効果
「特定のお店の訪問日を教えて」「最近行ったお店は？」といった質問に対して、Bot が自ら `API-query-data-source` を選択し、`Visited at` 等のプロパティを利用して高精度に該当データを取得・回答できるようになります。
