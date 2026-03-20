import 'dotenv/config';
import { app } from './slack/app';
import { listTools, callTool } from './mcp/tools';

(async () => {
  // === Step 2: Notion MCP 接続確認用の一時コード ===
  await listTools();

  // FIXME: YOUR_NOTION_PAGE_ID を実際のNotionページID（32桁）に書き換えてください
  try {
    const result = await callTool('API-retrieve-a-database', {
      database_id: '2d952ef6616b495db6bf8ee97e45aad5',
    });
    console.log('callTool result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.log('Failed to call tool (Notion ID likely invalid):', String(e));
  }
  // =================================================

  await app.start();
  console.log('Bot is running');
})();
