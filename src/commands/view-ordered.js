import { Command } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import { getOnOrder } from "../lib/database.js";
import { ItemPaginatedMessage } from "../lib/ItemPaginatedMessage.js";
import logger from "../utils/logger.js";

export class ViewOrderedCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "view-ordered",
      description: "Get on order library items",
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
        return interaction.editReply(
          `So look, man, there just aren't any new items ordered recently, you know, man.`,
        );
      }

      const paginatedMessage = new ItemPaginatedMessage(items, {
        titlePrefix: "🚚 ",
        color: "#FFD700",
        showAvailability: false,
        showLocation: false,
      });

      return paginatedMessage.run(interaction, interaction.user);
    } catch (error) {
      logger.error({ err: error }, "Dude! [OnOrder Command] Error");

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
