# 🎳 Libowski Bot

Libowski Bot is a Discord bot designed for movie enthusiasts who use the Washington County Cooperative Library Services (WCCLS). It tracks Blu-ray availability, manages personal wishlists, and sends automated notifications when requested titles become available at your preferred library locations.

## 🌟 Features

- **Availability Tracking**: Automatically checks WCCLS for new and best-selling Blu-ray titles.
- **On-Order Notifications**: Posts to a designated Discord channel when new Blu-rays are put on order by the library.
- **Personal Wishlist**: Add movies to your private wishlist and get a Direct Message the moment they are available for pickup.
- **Smart Notifications**: Remembers when you were last notified to avoid spamming, with configurable cooldowns.
- **Slash Commands**: Intuitive interaction using modern Discord slash commands.

## 🚀 Getting Started

### Prerequisites

- Node.js (v24 or higher recommended)
- A Discord Bot Token
- A Discord Server (Guild) for slash command registration

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/emb417/libowski-bot.git
   cd libowski-bot
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up your environment variables (see Configuration).

4. Start the bot:

   ```bash
   npm start
   ```

## ⚙️ Configuration

Create a `.env` file in the root directory with the following variables:

| Variable                | Description                                                 | Default           |
| :---------------------- | :---------------------------------------------------------- | :---------------- |
| `DISCORD_TOKEN`         | Your Discord Bot Token                                      | **Required**      |
| `CLIENT_ID`             | Your Discord Bot Client ID                                  | **Required**      |
| `GUILD_ID`              | The ID of the server for instant slash command registration | **Required**      |
| `DISCORD_CHANNEL_ID`    | Channel ID for "On Order" notifications                     | **Required**      |
| `AVAILABILITY_SCHEDULE` | Cron schedule for availability checks                       | `*/15 8-18 * * *` |
| `ON_ORDER_SCHEDULE`     | Cron schedule for "On Order" checks                         | `0 */6 * * *`     |
| `NOTIFY_DELAY`          | Cooldown (ms) between notifications for the same item       | `86400000` (24h)  |
| `LOG_LEVEL`             | Log level                                                   | `info`            |

## 🕹️ Commands

- `/add-to-wishlist` (alias: `/atw`): Add a title to your wishlist.
- `/remove-from-wishlist`: Remove a title from your wishlist.
- `/view-wishlist`: View your current wishlist.
- `/bestsellers`: Browse best-selling Blu-rays currently available at tracked locations.
- `/onorder`: Browse new Blu-rays that are currently on order.

## 🐳 Docker

The bot is designed to run in a Docker container. It uses a local JSON database (via `lowdb`) stored at `/app/data/db.json`.

To build and run:

```bash
docker build -t libowski-bot .
docker run -v $(pwd)/data:/app/data --env-file .env libowski-bot
```

## 🛠️ Built With

- [Sapphire Framework](https://www.sapphirejs.dev/) - A powerful framework for discord.js.
- [Discord.js](https://discord.js.org/) - The most popular library for interacting with the Discord API.
- [Lowdb](https://github.com/typicode/lowdb) - A simple, local JSON database.
- [Cheerio](https://cheerio.js.org/) - Fast, flexible, and lean implementation of core jQuery designed specifically for the server.
- [Pino](https://getpino.io/) - Super fast, all natural JSON logger.

---

"The Dude abides." 🎳
