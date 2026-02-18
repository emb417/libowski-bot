import { Command } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import { getBestSellers } from "../lib/database.js";
import { ItemPaginatedMessage } from "../lib/ItemPaginatedMessage.js";
import logger from "../utils/logger.js";

export class ViewBestSellersCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "view-bestsellers",
      description: "Get best seller (available now) library items",
      aliases: ["vb", "bs", "best", "new", "bestsellers"],
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

      const items = await getBestSellers();

      if (!items || items.length === 0) {
        return interaction.editReply(
          `Hey man, there just aren't any available now.`,
        );
      }

      const paginatedMessage = new ItemPaginatedMessage(items, {
        titlePrefix: "📀 ",
        color: "#0099FF",
        showAvailability: true,
        showLocation: false,
      });

      return paginatedMessage.run(interaction, interaction.user);
    } catch (error) {
      logger.error({ err: error }, "Dude! [BestSellers Command] Error");

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: `Dude, an error occurred while fetching library items: ${error?.message || "Unknown error"}`,
        });
      } else {
        return interaction.reply({
          content: `Dude, an error occurred while fetching library items: ${error?.message || "Unknown error"}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }
}
