import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

let mcpClient: Client | null = null;

export const getMcpClient = async (): Promise<Client> => {
  if (mcpClient) return mcpClient;

  // `@notionhq/notion-mcp-server` を npx 経由で stdio 起動
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    env: {
      ...process.env,
      OPENAI_API_KEY: 'dummy', // 必須環境変数の場合のエラー回避用
      NOTION_TOKEN: process.env.NOTION_API_KEY || '',
    },
  });

  mcpClient = new Client(
    { name: 'slack-bot', version: '1.0.0' },
    { capabilities: {} }
  );

  await mcpClient.connect(transport);
  console.log('MCP client connected');
  return mcpClient;
};
