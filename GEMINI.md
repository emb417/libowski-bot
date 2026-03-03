# Project Overview

Libowski Bot is a Discord bot designed to assist users with managing their Blu-ray wishlists and tracking availability at WCCLS libraries. It provides automated notifications and various commands for interacting with library services.

## Key Technologies

- **Node.js**: The primary runtime for the bot.
- **Discord.js**: Library for interacting with the Discord API.
- **Docker**: Used for containerization of the bot.
- **Docker Compose**: Orchestrates the bot's deployment as part of the larger `rpi-stack` application.
- **pino**: Employed for structured logging within the Node.js service.
- **PostgreSQL**: Used for data persistence (e.g., wishlists, user configurations) via Docker volumes, typically managed by the `rpi-stack`'s database service.

## Architecture

Libowski Bot operates as a Dockerized service within a multi-service Docker Compose environment (`rpi-stack`). It communicates with a PostgreSQL database for data storage and interacts with the Discord API. Its deployment is managed alongside other services by `docker-compose.yml`.

## Directory Structure

- **`src/index.js`**: The main entry point for the Discord bot.
- **`src/commands/`**: Contains individual command files that define the bot's functionality within Discord (e.g., `add-to-wishlist.js`, `find-item.js`).
- **`src/listeners/`**: Houses event listener files for various Discord events (e.g., `ready.js`, `placeHold.js`).
- **`src/lib/`**: Contains core services and utilities, such as `AuthService.js`, `AvailabilityService.js`, `database.js`, and `SearchService.js`.
- **`src/utils/`**: Provides general utility functions, including logging (`logger.js`, `sapphire-logger.js`).
- **`Dockerfile`**: Defines the Docker image for the bot.
- **`package.json`**: Lists project dependencies and scripts.

## Building and Running

While Libowski Bot can be run individually for development, it's typically deployed as part of the `rpi-stack` using Docker Compose.

### Local Development (without Docker Compose)

1. **Navigate to the project directory:**

   ```bash
   cd /Users/eric/Dev/rpi-stack/libowski-bot
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set environment variables:** Create a `.env` file in the project root with necessary configurations (e.g., Discord bot token, database connection details).

4. **Start the bot:**

   ```bash
   npm start
   ```

### Deployment with Docker Compose (as part of `rpi-stack`)

Refer to the main `rpi-stack` `GEMINI.md` for full instructions. Generally, you would navigate to the `rpi-docker-compose` directory and use:

```bash
cd /Users/eric/Dev/rpi-stack/rpi-docker-compose
docker-compose up -d
```

For local rebuilds within the `rpi-stack` context, use the local compose file:

```bash
bash
docker compose -f docker-compose-local.yml up -d
```

## Development Conventions

- **Containerization**: Employs Docker for consistent environments.
- **Configuration**: Relies on environment variables for sensitive data and dynamic settings.
- **Logging**: Uses `pino` for structured, machine-readable logs.
- **Data Persistence**: Utilizes Docker volumes for database and application data persistence.
