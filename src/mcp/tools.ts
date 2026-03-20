import { getMcpClient } from './client';

export const listTools = async () => {
  const client = await getMcpClient();
  const { tools } = await client.listTools();

  console.log(`取得した tools 数: ${tools.length}`);
  tools.forEach(t => console.log(` - ${t.name}: ${t.description}`));

  return tools;
};

export const callTool = async (name: string, args: Record<string, unknown>) => {
  const client = await getMcpClient();
  const result = await client.callTool({ name, arguments: args });
  return result;
};
