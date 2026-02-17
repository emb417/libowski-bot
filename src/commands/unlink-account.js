import { Command } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import { unlinkLibraryCard } from "../lib/database.js";
import logger from "../utils/logger.js";

export class UnlinkAccountCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "unlink-account",
      description: "Unlink your library card from this bot",
    });
  }

  registerApplicationCommands(registry) {
    const guildId = process.env.GUILD_ID;
    const registryOptions = guildId ? { guildIds: [guildId] } : {};

    registry.registerChatInputCommand(
      (builder) => builder.setName(this.name).setDescription(this.description),
      registryOptions,
    );
  }

  async chatInputRun(interaction) {
    try {
      // Always reply ephemerally for privacy
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      await unlinkLibraryCard(interaction.user.id);

      return interaction.editReply({
        content: `✅ Library card unlinked successfully!\n\nYour card information has been removed from our database. You can link it again at any time using \`/link-account\`.`,
      });
    } catch (error) {
      logger.error({ err: error }, "[UnlinkAccount Command] Error");

      const errorMessage =
        error?.message === "Dude! User not found" ||
        error?.message === "Dude! No library card linked to this account"
          ? "You don't have a library card linked. Use `/link-account` to link one."
          : `An error occurred while unlinking your library card: ${error?.message || "Unknown error"}`;

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: errorMessage,
        });
      } else {
        return interaction.reply({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }
}
