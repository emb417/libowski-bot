import { Command } from "@sapphire/framework";
import { EmbedBuilder, MessageFlags } from "discord.js";
import { removeWishListItem, getWishListItems } from "../lib/database.js";
import logger from "../utils/logger.js";

export class RemoveFromWishlistCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "remove-from-wishlist",
      description: "Remove a title from your wishlist",
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
              .setDescription("Item title to remove from wishlist")
              .setRequired(true)
              .setAutocomplete(true),
          ),
      registryOptions,
    );
  }

  async autocompleteRun(interaction) {
    try {
      const focusedValue = interaction.options.getFocused().toLowerCase();
      const userId = interaction.user.id;

      const wishlistItems = await getWishListItems(userId);

      const filtered = wishlistItems
        .filter((item) => item.toLowerCase().includes(focusedValue))
        .slice(0, 25);

      await interaction.respond(
        filtered.map((item) => ({
          name: item.length > 100 ? item.substring(0, 97) + "..." : item,
          value: item,
        })),
      );
    } catch (error) {
      console.error(`[Remove From Wishlist Autocomplete] Error:`, error);
      await interaction.respond([]);
    }
  }

  async chatInputRun(interaction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const title = interaction.options.getString("title");
      const userId = interaction.user.id;

      const result = await removeWishListItem(userId, title);

      const embed = new EmbedBuilder()
        .setTitle("🗑️ Removed from Wishlist")
        .setDescription(
          `So like, **${title}** has been removed from your wishlist, man!`,
        )
        .setColor(0xed4245)
        .setFooter({
          text: `Remaining Items: ${result.totalItems}`,
        });

      return interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      logger.error(
        { err: error },
        "Dude! [Remove From Wishlist Command] Error",
      );

      let errorMessage = `Dude, an error occurred while removing from wishlist: ${error?.message || "Unknown error"}`;

      if (error.message === "User or wishlist not found") {
        errorMessage =
          "Dude,you don't have a wishlist yet! Use `/add-to-wishlist` to create one, man.";
      } else if (error.message === "Title not found in wishlist") {
        errorMessage = `Dude, "${interaction.options.getString("title")}" is not in your wishlist.`;
      }

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
