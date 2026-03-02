import { MessageFlags } from "discord.js";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { getLibraryCard } from "../lib/database.js";
import { loginToLibrary, renewCheckout } from "../lib/LibraryApiService.js";
import logger from "../utils/logger.js";

export class RenewCheckoutHandler extends InteractionHandler {
  constructor(ctx, options) {
    super(ctx, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.Button,
    });
  }

  parse(interaction) {
    if (!interaction.customId.startsWith("renew_checkout:")) return this.none();
    const [, checkoutId, accountId] = interaction.customId.split(":");
    return this.some({ checkoutId, accountId });
  }

  async run(interaction, { checkoutId, accountId }) {
    await interaction.deferReply({
      flags: interaction.inGuild() ? MessageFlags.Ephemeral : undefined,
    });
    try {
      const libraryCard = await getLibraryCard(interaction.user.id);
      if (!libraryCard) {
        return interaction.editReply(
          "❌ No library card linked. Use `/link-account` first.",
        );
      }
      const sessionCookies = await loginToLibrary(
        libraryCard.cardNumber,
        libraryCard.pin,
      );
      await renewCheckout(sessionCookies, checkoutId, accountId);
      return interaction.editReply("✅ Item renewed successfully!");
    } catch (err) {
      logger.error({ err }, "Failed to renew checkout");
      return interaction.editReply(`❌ Failed to renew: ${err.message}`);
    }
  }
}
