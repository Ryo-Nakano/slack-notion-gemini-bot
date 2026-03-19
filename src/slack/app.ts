import { App } from '@slack/bolt';
import { mentionHandler } from './handlers/mention';
import 'dotenv/config';

export const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

app.event('app_mention', mentionHandler);
