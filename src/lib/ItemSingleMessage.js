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
      showPlaceHoldButton = false,
      accountId = null,
      branchId = null,
    } = options;

    try {
      const user = await client.users.fetch(userId);

      for (const item of items) {
        const { embed, components } = ItemEmbed.createEmbed(item, {
          titlePrefix,
          color,
          showAvailability,
          showLocation,
          showHoldStatus,
          showPlaceHoldButton: showPlaceHoldButton && !item.holdInfo,
          showCancelHoldButton: !!item.holdInfo?.id && !!item.canCancel,
          showSuspendButton: !!item.canSuspend,
          showResumeButton: !!item.canResume,
          accountId,
          branchId,
          holdId: item.holdInfo?.id ?? null,
          metadataId: item.id,
          hasExistingHold: !!item.holdInfo,
        });

        await user.send({ embeds: [embed], components });
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
      accountId = null,
      branchId = null,
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
        const { embed, components } = ItemEmbed.createEmbed(item, {
          titlePrefix,
          color,
          showAvailability,
          showLocation,
          showHoldStatus: true,
          showPlaceHoldButton: !item.holdInfo,
          showCancelHoldButton: !!item.holdInfo?.id && !!item.canCancel,
          showSuspendButton: !!item.canSuspend,
          showResumeButton: !!item.canResume,
          accountId,
          branchId,
          holdId: item.holdInfo?.id ?? null,
          metadataId: item.id,
          hasExistingHold: !!item.holdInfo,
        });

        await channel.send({ embeds: [embed], components });
      }

      logger.info(`The Dude sent ${items.length} notifications to channel`);
    } catch (error) {
      logger.error(`The Dude failed to send channel notification:`, error);
      throw error;
    }
  }
}
