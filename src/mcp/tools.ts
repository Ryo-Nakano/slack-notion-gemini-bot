import { getMcpClient } from './client';
import { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { FunctionDeclaration, SchemaType } from '@google/generative-ai';

// Convert JSON Schema type to Gemini SchemaType
const mapType = (type: string | undefined): SchemaType => {
  switch (type) {
    case 'string':
      return SchemaType.STRING;
    case 'number':
    case 'integer':
      return SchemaType.NUMBER;
    case 'boolean':
      return SchemaType.BOOLEAN;
    case 'object':
      return SchemaType.OBJECT;
    case 'array':
      return SchemaType.ARRAY;
    default:
      return SchemaType.STRING;
  }
};

// Map properties recursively (simplified for standard MCP tools)
const mapProperties = (properties: any): Record<string, any> => {
  const result: Record<string, any> = {};
  if (!properties) return result;
  
  for (const [key, value] of Object.entries<any>(properties)) {
    result[key] = {
      type: mapType(value.type),
      description: value.description,
    };
    if (value.type === 'object' && value.properties) {
      result[key].properties = mapProperties(value.properties);
    }
    if (value.type === 'array' && value.items) {
      result[key].items = {
        type: mapType(value.items.type),
      };
      if (value.items.properties) {
        result[key].items.properties = mapProperties(value.items.properties);
      }
    }
  }
  return result;
};

// MCP の tool スキーマを Gemini の FunctionDeclaration に変換
export const toFunctionDeclarations = (tools: McpTool[]): FunctionDeclaration[] => {
  return tools.map(tool => {
    // If inputSchema is missing properties entirely, ensure an empty object is created
    // to prevent validation errors on Gemini side, though mcp types generally have it.
    const properties = tool.inputSchema?.properties ? mapProperties(tool.inputSchema.properties) : {};
    
    // Provide a fallback description if missing
    const description = tool.description && tool.description.trim() !== '' 
      ? tool.description 
      : `Tool to execute ${tool.name}`;

    return {
      name: tool.name,
      description: description,
      parameters: {
        type: SchemaType.OBJECT,
        properties: properties,
        required: (tool.inputSchema?.required as string[]) ?? [],
      },
    };
  });
};

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
