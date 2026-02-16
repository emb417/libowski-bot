import { BlurayEmbed } from "./BlurayEmbed.js";
import { client } from "../index.js";
import logger from "../utils/logger.js";

export class BluraySingleMessage {
  static async sendToUser(userId, username, items, options = {}) {
    const {
      titlePrefix = "📀",
      color = "#00FF00",
      showAvailability = false,
      showLocation = true,
    } = options;

    try {
      const user = await client.users.fetch(userId);

      for (const item of items) {
        const embed = BlurayEmbed.createEmbed(item, {
          titlePrefix,
          color,
          showAvailability,
          showLocation,
        });

        await user.send({ embeds: [embed] });
      }

      logger.info(`Sent ${items.length} notifications to ${username}`);
    } catch (error) {
      logger.error(
        `Failed to send notification to user ${username} (${userId}):`,
        error,
      );
      throw error;
    }
  }

  static async sendToChannel(items, options = {}) {
    const {
      titlePrefix = "📦",
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
        const embed = BlurayEmbed.createEmbed(item, {
          titlePrefix,
          color,
          showAvailability,
          showLocation,
        });

        await channel.send({ embeds: [embed] });
      }

      logger.info(`Sent ${items.length} notifications to channel`);
    } catch (error) {
      logger.error(`Failed to send channel notification:`, error);
      throw error;
    }
  }
}
