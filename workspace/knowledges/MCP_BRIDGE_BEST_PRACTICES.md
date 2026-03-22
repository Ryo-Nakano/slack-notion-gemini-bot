# Gemini & MCP Bridge (エージェントループ) 実装のベストプラクティス

Gemini API (`@google/generative-ai`) と Model Context Protocol (MCP) を TypeScript で連携させる「ブリッジ（エージェントループ）」の実装に関するベストプラクティスと調査結果をまとめました。

---

## 1. Schema 変換のベストプラクティス (MCP Tool → Gemini FunctionDeclaration)

MCP サーバーが公開する Tools のスキーマ（JSON Schema 形式）を、Gemini が理解できる `FunctionDeclaration` 形式に正確に変換する必要があります。この変換の正確さが、Gemini がツールを正しく呼び出せるかどうかに直結します。

### ポイント
- **型のマッピング**: JSON Schema の `string`, `number`, `boolean`, `object`, `array` は、それぞれ Gemini の `SchemaType` Enum (`SchemaType.STRING`, `SchemaType.NUMBER`, など) にマッピングします。
- **Description の必須化**: 
  - LLM は `description` を読んで「いつそのツールを呼ぶか」を推論・判断します。
  - もし MCP 側から `description` が提供されていない（空である）場合は、分かりやすいフォールバックの文字列を入れるか、エラーとして弾いて MCP 側の定義を強制させるのがベストです。
- **パラメーターの厳密な定義**: 
  - `properties` と `required` フィールドを正確に渡します。
  - パラメーターが存在しないツールの場合でも、Gemini 側が文法エラーを起こさないように空のオブジェクト `{}` を定義するなど、安全に処理する必要があります。

---

## 2. エージェントループ (Agent Loop) の制御

Gemini が「ツールを呼び出すべき」と判断した場合、テキストではなく `functionCall` を返してきます。これをキャッチして MCP サーバーで実行し、その結果を再び Gemini に渡すループ構造が「ブリッジ」の役割を果たします。

### 基本的な処理フロー
1. **ユーザー要求とツールの提示**: ユーザーからの入力テキストと、変換した `tools` (`FunctionDeclaration[]`) を含めて `generateContent` を呼び出します。
2. **レスポンスの判定**: 
   - レスポンス内に `functionCall` が存在する場合、ツール呼び出しを実行します。
   - 存在しない場合は、最終的なテキスト回答が得られたとみなしてループを抜けます。
3. **ツールの実行と返却**:
   - `functionCall` に含まれるツール名と引数 (`args`) を使って、MCP Client の `callTool` を実行します。
   - 実行結果を以下のような `functionResponse` 形式の Content オブジェクトに包み、次のプロンプトとして Gemini に追加送信します。
     ```json
     { 
       "functionResponse": { 
         "name": "tool_name", 
         "response": { "result": "..." } 
       } 
     }
     ```
4. **継続**: `functionCall` がなくなるまで繰り返します。

### 必須のベストプラクティス
- **無制限ループの未然防止**: 
  - `MAX_ITERATIONS` (例: 10回まで) のような上限をハードコーディングして設けます。
  - モデルが判断を誤り、同じツールを無限に呼び続ける事態を防ぐための安全装置です。上限を超過した場合は強制終了し、ユーザーにエラー状態または途中結果を出力します。
- **会話履歴 (History) の完全な保持**: 
  - Gemini API はステートレス（状態を持たない）ため、1回のループで発生した `user` → `model (functionCall)` → `user (functionResponse)` のやり取りをすべて配列（`Content[]`）に蓄積し、毎回すべて送信し直す必要があります。

---

## 3. エラーハンドリングとフォールバック

システムを安定して稼働させるために、以下の異常系の対応を組み込むことが推奨されます。

- **ツール呼び出しの失敗と自己修復**: 
  - MCP 側での `callTool` が API のタイムアウトや引数エラーで失敗した場合、アプリケーションをクラッシュ（throw）させるのではなく、エラーメッセージをテキストとして `functionResponse` に含めて Gemini に返却します。
  - これにより、「先ほどのツールの実行は○○という理由で失敗しました」という事実を LLM に認識させることができ、LLM が自分で別の手段をとるか、ユーザーに謝罪して対応するような自己修復サイクルの余地が生まれます。
- **コンテキスト長（Token 限度）の管理**: 
  - Notion や大規模な DB から情報量が膨大なデータが返却された場合、そのまま Gemini に送るとコンテキスト長（Token 上限）を使い果たす恐れがあります。
  - 受け取ったレスポンス文字列の長さをチェックし、長すぎる場合は切り詰める (Truncate 処理) か、要約して渡すなどのセーフティネットを入れると安全です。

---

## まとめと実装への反映

これから行う実装（`src/mcp/tools.ts` および `src/gemini/agent.ts`）において、以下の3つを特に意識して設計・実装を行います。

1. **`toFunctionDeclarations` での厳格なスキーマ変換**
2. **`runAgent` 内での `MAX_ITERATIONS` および History の確実な蓄積**
3. **`try/catch` を用いたツールエラー時の LLM への結果フィードバック**
