import { Command } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import { linkLibraryCard } from "../lib/database.js";
import logger from "../utils/logger.js";

export class LinkAccountCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "link-account",
      description: "Link your library card to receive personalized features",
    });
  }

  registerApplicationCommands(registry) {
    const guildId = process.env.GUILD_ID;
    const registryOptions = guildId ? { guildIds: [guildId] } : {};

    registry.registerChatInputCommand(
      (builder) =>
        builder
          .setName(this.name)
          .setDescription(this.description)
          .addStringOption((option) =>
            option
              .setName("card-number")
              .setDescription("Your library card number")
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName("pin")
              .setDescription("Your library card PIN")
              .setRequired(true),
          ),
      registryOptions,
    );
  }

  async chatInputRun(interaction) {
    try {
      // Always reply ephemerally for privacy
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const cardNumber = interaction.options.getString("card-number", true);
      const pin = interaction.options.getString("pin", true);

      logger.info(
        `[/link-account] User ${interaction.user.username} is linking their library card`,
      );

      // Save to database
      await linkLibraryCard(
        interaction.user.id,
        interaction.user.username,
        cardNumber,
        pin,
      );

      return interaction.editReply({
        content: `✅ Library card linked successfully!\n\nYour card information is stored securely and will be used for personalized features like checking your holds list.\n\nTo unlink your card at any time, use \`/unlink-account\`.`,
      });
    } catch (error) {
      logger.error({ err: error }, "[LinkAccount Command] Error");

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: `An error occurred while linking your library card: ${error?.message || "Unknown error"}`,
        });
      } else {
        return interaction.reply({
          content: `An error occurred while linking your library card: ${error?.message || "Unknown error"}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }
}
