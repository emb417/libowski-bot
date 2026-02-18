import { ItemEmbed } from "./ItemEmbed.js";
import { client } from "../index.js";
import logger from "../utils/logger.js";

export class ItemSingleMessage {
  static async sendToUser(userId, username, items, options = {}) {
    const {
      titlePrefix = "📀 ",
      color = "#00FF00",
      showAvailability = false,
      showLocation = true,
      showHoldStatus = false,
      showHoldButton = false,
    } = options;

    try {
      const user = await client.users.fetch(userId);

      for (const item of items) {
        const { embed } = ItemEmbed.createEmbed(item, {
          titlePrefix,
          color,
          showAvailability,
          showLocation,
          showHoldStatus,
          showHoldButton,
        });

        await user.send({ embeds: [embed] });
      }

      logger.info(`The Dude sent ${items.length} notifications to ${username}`);
    } catch (error) {
      logger.error(
        `The Dude failed to send notification to user ${username} (${userId}):`,
        error,
      );
      throw error;
    }
  }

  static async sendToChannel(items, options = {}) {
    const {
      titlePrefix = "🚚 ",
      color = "#FFA500",
      showAvailability = false,
      showLocation = false,
    } = options;

    try {
      const channelId = process.env.DISCORD_CHANNEL_ID;
      if (!channelId) {
        logger.warn(
          "DISCORD_CHANNEL_ID not set, skipping channel notification",
        );
        return;
      }

      const channel = await client.channels.fetch(channelId);

      for (const item of items) {
        const { embed } = ItemEmbed.createEmbed(item, {
          titlePrefix,
          color,
          showAvailability,
          showLocation,
          showHoldButton: false,
        });

        await channel.send({ embeds: [embed] });
      }

      logger.info(`The Dude sent ${items.length} notifications to channel`);
    } catch (error) {
      logger.error(`The Dude failed to send channel notification:`, error);
      throw error;
    }
  }
}
