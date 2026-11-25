# Demo: personal news channel delivered to Telegram

A script publishes a digest of RSS/Atom feeds to a channel you own; the listener picks up the
event from Soroban RPC and delivers it to a Telegram chat. Everything runs on testnet.

Prerequisites: `pnpm install`, the `notify-dev` identity in the Stellar CLI keystore (or set
`CAATINGA_SOURCE`), Postgres (`pnpm db:up`), and a Telegram bot token from @BotFather.

## 1. Create the channel

`.env` needs the network settings (see `.env.example`); `ctg sync-env` writes the contract id.

```sh
pnpm --filter @notify/cli exec tsx src/index.ts channel create
# prints the channel id, e.g. 3
```

## 2. Follow the channel from Telegram

Start the listener; with `TELEGRAM_BOT_TOKEN` set it also runs the bot.

```sh
TELEGRAM_BOT_TOKEN=<token> pnpm --filter @notify/listener dev
```

Optionally give the channel a name (shown in every message; the contract stores none):

```sh
pnpm --filter @notify/listener channels set <channelId> "My news"
```

Then, in a private chat with your bot, send `/subscribe <channelId>` (`/list` and
`/unsubscribe <channelId>` also work). Each message ends with a `Verify on-chain` link to the
transaction in stellar.expert.

The bot token is read from the environment only; it is never stored in the database. Without the
bot you can still register a chat by hand:
`pnpm --filter @notify/listener targets add <channelId> telegram <chat_id>`.

## 3. Publish a digest

```sh
export NEWS_CHANNEL_ID=<channelId>
export NEWS_FEEDS=https://hnrss.org/frontpage,https://www.theverge.com/rss/index.xml
pnpm --filter @notify/cli news-digest --dry-run   # print the digest, publish nothing
pnpm --filter @notify/cli news-digest             # publish it on-chain
```

`NEWS_ITEMS_PER_FEED` (default 5) limits items per feed. The digest is cut to 4000 bytes, the
largest body the listener displays, dropping whole items rather than cutting one in half.

## 4. Every 6 hours

Not installed by the repo. Example crontab line (adjust paths):

```cron
0 */6 * * * cd /path/to/notify && NEWS_CHANNEL_ID=<id> NEWS_FEEDS=<urls> pnpm --filter @notify/cli news-digest
```
