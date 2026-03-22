import { GoogleGenerativeAI, Content, Part } from '@google/generative-ai';
import { listTools, callTool, toFunctionDeclarations } from '../mcp/tools';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const MAX_ITERATIONS = 10;

export const runAgent = async (
  userMessage: string,
  priorHistory: Content[] = [],
): Promise<string> => {
  const mcpTools = await listTools();
  const functionDeclarations = toFunctionDeclarations(mcpTools);

  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite-preview',
    tools: [{ functionDeclarations }],
  });

  const history: Content[] = [
    ...priorHistory,
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await model.generateContent({ contents: history });
    const response = result.response;

    // Function call があるか判定
    const functionCalls = response.functionCalls();

    if (!functionCalls || functionCalls.length === 0) {
      // function call が無ければ最終的なテキスト回答が得られたので終了
      return response.text();
    }

    // AI側のレスポンス履歴を追加（関数呼び出しだけでなくテキスト等の推論過程もすべて保持する）
    history.push({
      role: 'model',
      parts: response.candidates?.[0]?.content?.parts || [],
    });

    const toolResponsesParts: Part[] = [];

    // functionCall を処理する
    for (const call of functionCalls) {
      const toolName = call.name;
      const toolArgs = call.args as Record<string, unknown>;
      try {
        console.log(`[Agent] Calling MCP Tool: ${toolName} with args:`, toolArgs);
        const toolResult = await callTool(toolName, toolArgs);
        console.log(`[Agent] Tool ${toolName} finished successfully.`);

        toolResponsesParts.push({
          functionResponse: {
            name: toolName,
            response: toolResult as Record<string, any>,
          },
        });
      } catch (error: any) {
        console.error(`[Agent] Error in tool ${toolName}:`, error);
        toolResponsesParts.push({
          functionResponse: {
            name: toolName,
            response: { error: error.message },
          },
        });
      }
    }

    // ツール実行結果を User 側のレスポンスとして追加
    history.push({
      role: 'user',
      parts: toolResponsesParts,
    });
  }

  // Max iterations reached
  throw new Error(`Agent loop exceeded maximum iterations (${MAX_ITERATIONS}).`);
};
