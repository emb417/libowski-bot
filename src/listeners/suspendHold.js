import { Listener } from "@sapphire/framework";
import { InteractionType, ComponentType, MessageFlags } from "discord.js";
import { getLibraryCard } from "../lib/database.js";
import { loginToLibrary } from "../lib/AuthService.js";
import { suspendHold } from "../lib/HoldsService.js";
import logger from "../utils/logger.js";

export class SuspendHoldButtonListener extends Listener {
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

    // Only handle suspendHold buttons
    if (!interaction.customId.startsWith("suspendHold:")) {
      return;
    }

    try {
      await interaction.deferReply({
        flags: interaction.inGuild() ? MessageFlags.Ephemeral : undefined,
      });
      // Extract holdId and accountId from customId (format: "suspendHold:45349266:1304970348")
      const parts = interaction.customId.split(":");
      const holdId = parts[1];
      const accountId = parts[2];

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
        `[SuspendHold] Logging in for user ${interaction.user.username}`,
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

      // Suspend the hold
      logger.info(
        `[SuspendHold] Suspending hold ${holdId} for user ${interaction.user.username}`,
      );

      await suspendHold(sessionCookies, holdId, accountId);

      // Success!
      return interaction.editReply({
        content: `⏸️ **Hold suspended successfully!**\n\nYour hold has been paused and won't be filled until you resume it.`,
      });
    } catch (error) {
      logger.error(
        { err: error },
        `[SuspendHold] Failed to suspend hold for user ${interaction.user.username}`,
      );

      const errorMessage = error?.message?.includes("Login failed")
        ? "Failed to login to your library account. Please verify your credentials with `/link-account`."
        : `Failed to suspend hold: ${error?.message || "Unknown error"}`;

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
