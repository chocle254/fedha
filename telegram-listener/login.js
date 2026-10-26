// One-time login. Prints a session string to paste into .env as TG_SESSION. Never share it: it is full access to your account.
import 'dotenv/config';
import readline from 'readline';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

const client = new TelegramClient(new StringSession(''), Number(process.env.TG_API_ID), process.env.TG_API_HASH, { connectionRetries: 5 });
await client.start({
  phoneNumber: () => ask('Phone number (with country code): '),
  phoneCode: () => ask('Code Telegram sent you: '),
  password: () => ask('2FA password (if any): '),
  onError: (e) => console.error(e.message)
});
console.log('\nTG_SESSION=' + client.session.save() + '\n');
rl.close();
await client.disconnect();
process.exit(0);
