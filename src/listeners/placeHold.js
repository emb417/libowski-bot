import { Listener } from "@sapphire/framework";
import { InteractionType, ComponentType, MessageFlags } from "discord.js";
import { getLibraryCard } from "../lib/database.js";
import { loginToLibrary } from "../lib/AuthService.js";
import { placeHold } from "../lib/HoldsService.js";
import logger from "../utils/logger.js";

export class PlaceHoldButtonListener extends Listener {
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

    // Only handle placeHold buttons
    if (!interaction.customId.startsWith("placeHold:")) {
      return;
    }

    try {
      await interaction.deferReply({
        flags: interaction.inGuild() ? MessageFlags.Ephemeral : undefined,
      });
      // Extract metadataId from customId (format: "placeHold:S143C4543748")
      const metadataId = interaction.customId.split(":")[1];

      if (!metadataId) {
        return interaction.editReply({
          content:
            "Invalid button data. Please try searching for the item again.",
        });
      }

      // Check if user has a linked library card
      const libraryCard = await getLibraryCard(interaction.user.id);

      if (!libraryCard) {
        return interaction.editReply({
          content:
            "📚 You need to link your library card first.\n\nUse `/link-account` to connect your library card, then you'll be able to place holds!",
        });
      }

      // Login to get session cookies
      logger.debug(
        `[PlaceHold] Logging in for user ${interaction.user.username}`,
      );
      const { sessionCookies, accountId, branchId } = await loginToLibrary(
        libraryCard.cardNumber,
        libraryCard.pin,
        true,
      );

      if (!sessionCookies) {
        return interaction.editReply({
          content:
            "Failed to login to your library account. Please check your credentials with `/link-account`.",
        });
      }

      // Place the hold
      logger.info(
        `[PlaceHold] Placing hold on ${metadataId} for user ${interaction.user.username}`,
      );

      const result = await placeHold(
        sessionCookies,
        metadataId,
        accountId,
        branchId,
      );

      // Success!
      return interaction.editReply({
        content: `✅ **Hold placed successfully!**\n\nYou'll be notified when the item is ready for pickup.`,
      });
    } catch (error) {
      logger.error(
        { err: error },
        `[PlaceHold] Failed to place hold for user ${interaction.user.username}`,
      );

      const errorMessage = error?.message?.includes("Login failed")
        ? "Failed to login to your library account. Please verify your credentials with `/link-account`."
        : error?.message?.includes("already on hold")
          ? "You already have this item on hold."
          : `Failed to place hold: ${error?.message || "Unknown error"}`;

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
