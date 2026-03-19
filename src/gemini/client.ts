import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

export const generateReply = async (message: string): Promise<string> => {
  const result = await model.generateContent(message);
  return result.response.text();
};
