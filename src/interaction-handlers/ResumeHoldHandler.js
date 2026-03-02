import { MessageFlags } from "discord.js";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { getLibraryCard } from "../lib/database.js";
import { loginToLibrary, resumeHold } from "../lib/LibraryApiService.js";

export class ResumeHoldHandler extends InteractionHandler {
  constructor(ctx, options) {
    super(ctx, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.Button,
    });
  }

  // Sapphire calls this first to decide if this handler owns the interaction
  parse(interaction) {
    if (interaction.customId.startsWith("resume_hold:")) {
      const [, holdId, accountId] = interaction.customId.split(":");
      return this.some({
        holdId,
        accountId,
      });
    }
    return this.none();
  }

  async run(interaction, { holdId, accountId }) {
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

      await resumeHold(sessionCookies, holdId, accountId);
      return interaction.editReply("✅ Hold resumed successfully!");
    } catch (err) {
      return interaction.editReply(`❌ Failed to place hold: ${err.message}`);
    }
  }
}
