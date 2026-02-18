import { MessageFlags } from "discord.js";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { getLibraryCard } from "../lib/database.js";
import { loginToLibrary, placeHold } from "../lib/LibraryApiService.js";

export class PlaceHoldHandler extends InteractionHandler {
  constructor(ctx, options) {
    super(ctx, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.Button,
    });
  }

  // Sapphire calls this first to decide if this handler owns the interaction
  parse(interaction) {
    if (interaction.customId.startsWith("place_hold:")) {
      const [, metadataId, accountId, branchId] =
        interaction.customId.split(":");
      return this.some({ metadataId, accountId, branchId });
    }
    return this.none();
  }

  async run(interaction, { metadataId, accountId, branchId }) {
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

      await placeHold(sessionCookies, metadataId, accountId, branchId);
      return interaction.editReply("✅ Hold placed successfully!");
    } catch (err) {
      return interaction.editReply(`❌ Failed to place hold: ${err.message}`);
    }
  }
}
