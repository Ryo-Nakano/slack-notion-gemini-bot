import { app } from './slack/app';

(async () => {
  await app.start();
  console.log('Bot is running');
})();
