import "dotenv/config";
import { GatewayIntentBits, Partials } from "discord.js";
import { SapphireClient, LogLevel } from "@sapphire/framework";
import { scheduleCronJobs } from "./lib/cronJobs.js";
import logger from "./utils/logger.js";
import { SapphirePinoLogger } from "./utils/sapphire-logger.js";

process.on("uncaughtException", (error) => {
  logger.error({ err: error }, "Uncaught Exception thrown");
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error({ err: reason }, "Unhandled Rejection at: Promise");
});

export const client = new SapphireClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
  loadMessageCommandListeners: true,
  logger: { instance: new SapphirePinoLogger(LogLevel.Info) },
});

async function main() {
  logger.info("Starting Discord bot...");
  try {
    logger.info("Attempting to log in Discord bot...");
    await client.login(process.env.DISCORD_TOKEN);
    scheduleCronJobs();
    logger.info("Discord bot logged in successfully.");
  } catch (error) {
    logger.error("Error during bot startup:", error);
    process.exit(1);
  }
}

main();
