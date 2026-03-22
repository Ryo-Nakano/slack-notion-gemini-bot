# ツール定義（description）のチューニング方針

`workspace/TODO.md` の Step 4-1 および `workspace/knowledges/ai_bot_accuracy.md` の内容に基づき、Notion MCP サーバーから提供されるツールの `description` を Gemini 向けに最適化（上書き）します。

## 目的
LLM（Gemini）が、いつ・どのツールを・どのように使うべきかの判断根拠となる情報を具体化し、検索やデータ取得の精度を向上させます。

## 上書きツール定義の対応表

以下のマッピング定義を使用し、`toFunctionDeclarations` 内の `description` 生成処理で使用します。

```typescript
const OVERRIDE_DESCRIPTIONS: Record<string, string> = {
  'notion_query_database': '構造化されたNotionデータベースをプロパティ条件で検索する。日付・タグ・担当者など明確な条件で絞り込む場合に使う。例: 昨日の議事録、〇〇さんの担当タスク、先週の意思決定。',
  'notion_search': 'Notion全体を対象としたキーワード全文検索機能。特定のデータベースに情報があるか不明な場合や、横断的にキーワードで素早く探したい場合に使う。',
  'notion_retrieve_page': '特定のNotionページのメタデータやプロパティを取得する。検索（searchやquery_database）で該当するpage_idが判明したあとに、その詳細を得るために使う。',
  'notion_retrieve_block_children': '特定のブロック（ページ単体も含む）内の子要素（本文テキストなど）を取得する。ページ自体の内容や詳細なコンテンツを読みたい場合に必要。',
};
```

**実装方針:**
- `toFunctionDeclarations` 内で `OVERRIDE_DESCRIPTIONS[tool.name]` が存在すればそれを優先的に使用。
- 存在しない場合は従来通りオリジナルの `tool.description` にフォールバックします。
