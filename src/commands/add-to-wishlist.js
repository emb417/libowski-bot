import { Command } from "@sapphire/framework";
import { EmbedBuilder, MessageFlags } from "discord.js";
import { addWishListItem } from "../lib/database.js";
import logger from "../utils/logger.js";

export class AddToWishlistCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "add-to-wishlist",
      description: "Add a title to your wishlist",
      aliases: ["atw"],
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
              .setName("title")
              .setDescription("Item title to add to wishlist")
              .setRequired(true),
          ),
      registryOptions,
    );
  }

  async chatInputRun(interaction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const title = interaction.options.getString("title");

      const user = {
        id: interaction.user.id,
        username: interaction.user.username,
      };

      const result = await addWishListItem(user, title);

      const embed = new EmbedBuilder()
        .setTitle("✅ Added to Wishlist")
        .setDescription(`**${title}** has been added to your wishlist!`)
        .setColor(0x57f287)
        .setFooter({ text: `Total Items: ${result.totalItems}` });

      return interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      logger.error(`[Add To Wishlist Command] Error:`, error);

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: `An error occurred while adding to wishlist: ${error.message}`,
        });
      } else {
        return interaction.reply({
          content: `An error occurred while adding to wishlist: ${error.message}`,
          ephemeral: true,
        });
      }
    }
  }
}
