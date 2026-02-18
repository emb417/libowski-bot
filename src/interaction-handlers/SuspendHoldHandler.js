import { MessageFlags } from "discord.js";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { getLibraryCard } from "../lib/database.js";
import { loginToLibrary, suspendHold } from "../lib/LibraryApiService.js";

export class SuspendHoldHandler extends InteractionHandler {
  constructor(ctx, options) {
    super(ctx, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.Button,
    });
  }

  // Sapphire calls this first to decide if this handler owns the interaction
  parse(interaction) {
    if (interaction.customId.startsWith("suspend_hold:")) {
      const [, holdId, accountId] = interaction.customId.split(":");
      return this.some({
        holdId,
        accountId,
      });
    }
    return this.none();
  }

  async run(interaction, { holdId, accountId }) {
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

      await suspendHold(sessionCookies, holdId, accountId);
      return interaction.editReply("✅ Hold suspended for 1 month!");
    } catch (err) {
      return interaction.editReply(`❌ Failed to place hold: ${err.message}`);
    }
  }
}
