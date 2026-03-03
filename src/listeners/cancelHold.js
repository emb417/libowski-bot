import { Listener } from "@sapphire/framework";
import { InteractionType, ComponentType, MessageFlags } from "discord.js";
import { getLibraryCard } from "../lib/database.js";
import { loginToLibrary } from "../lib/AuthService.js";
import { cancelHold } from "../lib/HoldsService.js";
import logger from "../utils/logger.js";

export class CancelHoldButtonListener extends Listener {
  constructor(context, options) {
    super(context, {
      ...options,
      event: "interactionCreate",
    });
  }

  async run(interaction) {
    // Only handle button interactions
    if (
      interaction.type !== InteractionType.MessageComponent ||
      interaction.componentType !== ComponentType.Button
    ) {
      return;
    }

    // Only handle cancelHold buttons
    if (!interaction.customId.startsWith("cancelHold:")) {
      return;
    }

    try {
      await interaction.deferReply({
        flags: interaction.inGuild() ? MessageFlags.Ephemeral : undefined,
      });

      // Extract holdId and accountId from customId (format: "cancelHold:45349266:1304970348")
      const parts = interaction.customId.split(":");
      const metadataId = parts[1];
      const holdId = parts[2];
      const accountId = parts[3];

      if (!holdId || !accountId) {
        return interaction.editReply({
          content: "Invalid button data. Please try viewing your holds again.",
        });
      }

      // Check if user has a linked library card
      const libraryCard = await getLibraryCard(interaction.user.id);

      if (!libraryCard) {
        return interaction.editReply({
          content:
            "📚 You need to link your library card first.\n\nUse `/link-account` to connect your library card.",
        });
      }

      // Login to get session cookies
      logger.debug(
        `[CancelHold] Logging in for user ${interaction.user.username}`,
      );
      const { sessionCookies } = await loginToLibrary(
        libraryCard.cardNumber,
        libraryCard.pin,
      );

      if (!sessionCookies) {
        return interaction.editReply({
          content:
            "Failed to login to your library account. Please check your credentials with `/link-account`.",
        });
      }

      // Cancel the hold
      logger.info(
        `[CancelHold] Cancelling hold ${holdId} for user ${interaction.user.username}`,
      );

      await cancelHold(sessionCookies, metadataId, holdId, accountId);

      // Success!
      return interaction.editReply({
        content: `✅ **Hold cancelled successfully!**\n\nThe item has been removed from your holds list.`,
      });
    } catch (error) {
      logger.error(
        { err: error },
        `[CancelHold] Failed to cancel hold for user ${interaction.user.username}`,
      );

      const errorMessage = error?.message?.includes("Login failed")
        ? "Failed to login to your library account. Please verify your credentials with `/link-account`."
        : `Failed to cancel hold: ${error?.message || "Unknown error"}`;

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: errorMessage,
        });
      } else {
        return interaction.reply({
          content: errorMessage,
          ephemeral: true,
        });
      }
    }
  }
}
