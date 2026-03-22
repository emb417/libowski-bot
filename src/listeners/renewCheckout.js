import { Listener } from "@sapphire/framework";
import { InteractionType, ComponentType, MessageFlags } from "discord.js";
import { getLibraryCard } from "../lib/database.js";
import { loginToLibrary } from "../lib/AuthService.js";
import { renewCheckout } from "../lib/CheckoutService.js";
import logger from "../utils/logger.js";

export class RenewCheckoutButtonListener extends Listener {
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

    // Only handle renew buttons (format: "renewCheckout:checkoutId:accountId")
    if (!interaction.customId.startsWith("renewCheckout:")) {
      return;
    }

    try {
      await interaction.deferReply({
        flags: interaction.inGuild() ? MessageFlags.Ephemeral : undefined,
      });
      // Extract checkoutId and accountId from customId
      const parts = interaction.customId.split(":");
      const checkoutId = parts[1];
      const accountId = parts[2];

      if (!checkoutId || !accountId) {
        return interaction.editReply({
          content:
            "Invalid button data. Please try viewing your checkouts again.",
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
        `[RenewCheckout] Logging in for user ${interaction.user.username}`,
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

      // Renew the checkout
      logger.debug(
        `[RenewCheckout] Renewing checkout ${checkoutId} for user ${interaction.user.username}`,
      );

      await renewCheckout(sessionCookies, checkoutId, accountId);

      // Success!
      return interaction.editReply({
        content: `✅ **Item renewed successfully!**\n\nYour due date has been extended.`,
      });
    } catch (error) {
      const isHoldRequestError = error?.message?.includes("Item fills a hold request");

      if (isHoldRequestError) {
        // Logging handled by CheckoutService.js
      } else {
        logger.error(
          { err: error },
          `[RenewCheckout] Failed to renew checkout for user ${interaction.user.username}`,
        );
      }

      const errorMessage = error?.message?.includes("Login failed")
        ? "Failed to login to your library account. Please verify your credentials with `/link-account`."
        : isHoldRequestError
          ? "❌ **Renewal Failed:** This item cannot be renewed because another patron has a hold on it."
          : error?.message?.includes("cannot be renewed")
            ? "This item cannot be renewed. It may have reached the maximum number of renewals or have holds."
            : `Failed to renew item: ${error?.message || "Unknown error"}`;
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
