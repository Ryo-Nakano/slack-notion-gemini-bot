import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { runAgent } from '../../gemini/agent';
import type { Content } from '@google/generative-ai';

type MentionArgs = SlackEventMiddlewareArgs<'app_mention'> & AllMiddlewareArgs;

const HISTORY_LIMIT = 5;

const buildPriorHistory = async (
  client: MentionArgs['client'],
  event: MentionArgs['event'],
  botUserId: string,
): Promise<Content[]> => {
  // スレッドでない（初回メンション）なら履歴なし
  if (!event.thread_ts) return [];

  const res = await client.conversations.replies({
    channel: event.channel,
    ts: event.thread_ts,
    limit: HISTORY_LIMIT + 1,  // 今回の自分のメッセージ分を1件余分に取得
  });

  return (res.messages ?? [])
    .filter(msg => {
      if (msg.ts === event.ts) return false;  // 今回のメッセージ自体は除外
      if (msg.bot_id && msg.text?.includes('少々お待ちください')) return false;  // 中間メッセージを除外
      if (!msg.bot_id && !msg.text?.includes(`<@${botUserId}>`)) return false;  // Bot 宛でない発言を除外
      return true;
    })
    .slice(-HISTORY_LIMIT)
    .map(msg => ({
      role: msg.bot_id ? 'model' : 'user',
      parts: [{ text: (msg.text ?? '').replace(/<@[A-Z0-9]+>/g, '').trim() }],
    } as Content));
};

export const mentionHandler = async ({ event, say, client }: MentionArgs) => {
  if (event.bot_id) return;

  const userMessage = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  await say({ text: '少々お待ちください...', thread_ts: event.ts });

  const authRes = await client.auth.test();
  const botUserId = authRes.user_id ?? '';

  let reply: string;
  try {
    const priorHistory = await buildPriorHistory(client, event, botUserId);
    reply = await runAgent(userMessage, priorHistory);
  } catch (e) {
    console.error('Agent error:', e);
    reply = 'エラーが発生しました。しばらく待ってから再試行してください。';
  }

  await say({ text: reply, thread_ts: event.ts });
};
