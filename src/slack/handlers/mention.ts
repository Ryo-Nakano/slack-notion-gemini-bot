import { generateReply } from '../../gemini/client';

export const mentionHandler = async ({ event, say }: any) => {
  // Prevent infinite loops from the bot's own messages
  if (event.bot_id) return;

  const userMessage = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

  const reply = await generateReply(userMessage);
  await say({ text: reply, thread_ts: event.ts });
};
