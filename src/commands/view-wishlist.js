import { Command } from "@sapphire/framework";
import { EmbedBuilder, MessageFlags } from "discord.js";
import { getWishListItems } from "../lib/database.js";

import logger from "../utils/logger.js";

export class ViewWishlistCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "view-wishlist",
      description: "View your wishlist",
      aliases: ["vw", "wishlist"],
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

      const userId = interaction.user.id;
      const items = await getWishListItems(userId);

      if (items.length === 0) {
        return interaction.editReply({
          content:
            "Come on, man, I mean, your wishlist is empty, man! Use `/add-to-wishlist` to add items.",
        });
      }

      const listItems = items
        .map((item, index) => `${index + 1}. ${item}`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setTitle("✨ Your Wishlist")
        .setDescription(listItems)
        .setColor(0x5865f2);

      return interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      logger.error({ err: error }, "Dude! [View Wishlist Command] Error");

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: `Dude, an error occurred while fetching your wishlist: ${error?.message || "Unknown error"}`,
        });
      } else {
        return interaction.reply({
          content: `Dude, an error occurred while fetching your wishlist: ${error?.message || "Unknown error"}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }
}
