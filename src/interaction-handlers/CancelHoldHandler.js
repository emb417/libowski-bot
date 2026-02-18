import { MessageFlags } from "discord.js";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { getLibraryCard } from "../lib/database.js";
import { loginToLibrary, cancelHold } from "../lib/LibraryApiService.js";

export class CancelHoldHandler extends InteractionHandler {
  constructor(ctx, options) {
    super(ctx, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.Button,
    });
  }

  // Sapphire calls this first to decide if this handler owns the interaction
  parse(interaction) {
    if (interaction.customId.startsWith("cancel_hold:")) {
      const [, metadataId, holdId, accountId] = interaction.customId.split(":");
      return this.some({
        action: "cancel",
        metadataId,
        holdId,
        accountId,
      });
    }
    return this.none();
  }

  async run(interaction, { metadataId, holdId, accountId }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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

      await cancelHold(sessionCookies, metadataId, holdId, accountId);
      return interaction.editReply("✅ Hold cancelled successfully!");
    } catch (err) {
      return interaction.editReply(`❌ Failed to place hold: ${err.message}`);
    }
  }
}
