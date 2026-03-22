import { GoogleGenerativeAI, Content, Part } from '@google/generative-ai';
import { listTools, callTool, toFunctionDeclarations } from '../mcp/tools';
import { systemInstruction } from './prompts';

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
    systemInstruction,
    tools: [{ functionDeclarations }],
  });

  const history: Content[] = [
    ...priorHistory,
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let result;
    try {
      result = await model.generateContent({ contents: history });
    } catch (error: any) {
      console.error('[Agent] Error calling Gemini API:', error);
      if (error?.status === 429 || error?.message?.includes('429')) {
        return '現在リクエストが混み合っているため、制限がかかっています。しばらく時間をおいてから再試行してください。';
      }
      if (error?.status === 400 || error?.message?.includes('Token limit') || error?.message?.includes('too large')) {
        return '取得した情報が大きすぎるため、AIが処理できませんでした。もう少し条件を絞って質問してください。';
      }
      throw error;
    }
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

        const resultString = JSON.stringify(toolResult);
        let finalResult: any = toolResult;
        if (resultString.length > 100000) {
          console.warn(`[Agent] Tool ${toolName} returned large result (${resultString.length} chars). Returning partial error to Gemini.`);
          finalResult = { error: "Result is too large. Please refine your search query or specify a smaller page_size to reduce the response size." };
        }

        toolResponsesParts.push({
          functionResponse: {
            name: toolName,
            response: finalResult,
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
