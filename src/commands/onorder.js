import { Command } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import { getOnOrder } from "../lib/database.js";
import { BlurayPaginatedMessage } from "../lib/BlurayPaginatedMessage.js";
import logger from "../utils/logger.js";

export class OnOrderCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "onorder",
      description: "Get on order library items",
      aliases: ["onorder"],
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
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const items = await getOnOrder();

      if (!items || items.length === 0) {
        return interaction.editReply(`No items found for On Order.`);
      }

      const paginatedMessage = new BlurayPaginatedMessage(items, {
        titlePrefix: "🚚 ",
        color: "#FFD700",
        showAvailability: false,
        showLocation: false,
      });

      return paginatedMessage.run(interaction, interaction.user);
    } catch (error) {
      logger.error(`[OnOrder Command] Error:`, error);

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: `An error occurred while fetching library items: ${error.message}`,
        });
      } else {
        return interaction.reply({
          content: `An error occurred while fetching library items: ${error.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }
}
