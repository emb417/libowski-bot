import { Command } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import { getLibraryCard } from "../lib/database.js";
import { loginToLibrary, fetchCheckedOut } from "../lib/LibraryApiService.js";
import { ItemPaginatedMessage } from "../lib/ItemPaginatedMessage.js";
import logger from "../utils/logger.js";

export class ViewCheckedOutCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "view-checked-out",
      description: "View your currently checked out library items",
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

      logger.info(
        `[/view-checked-out] User ${interaction.user.username} is checking their checked out items`,
      );

      // Get user's library card
      const libraryCard = await getLibraryCard(interaction.user.id);

      if (!libraryCard) {
        return interaction.editReply({
          content:
            "You don't have a library card linked. Use `/link-account` to link your card first.",
        });
      }

      // Login to library
      logger.debug(
        `[ViewCheckedOut] Logging in to library for ${interaction.user.username}`,
      );
      const sessionCookies = await loginToLibrary(
        libraryCard.cardNumber,
        libraryCard.pin,
      );

      if (!sessionCookies) {
        return interaction.editReply({
          content:
            "Failed to log in to your library account. Please check your credentials with `/link-account`.",
        });
      }

      // Fetch checked out items
      logger.debug(
        `[ViewCheckedOut] Fetching checked out items for ${interaction.user.username}`,
      );
      const checkedOutItems = await fetchCheckedOut(sessionCookies);

      if (!checkedOutItems || checkedOutItems.length === 0) {
        return interaction.editReply({
          content: "You don't have any items checked out.",
        });
      }

      // Sort by due date (earliest first)
      const sortedItems = checkedOutItems.sort((a, b) => {
        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate) - new Date(b.dueDate);
        }
        return 0;
      });

      // Display checked out items using paginated message
      const paginatedMessage = new ItemPaginatedMessage(sortedItems, {
        titlePrefix: "🏠 ",
        color: "#3498DB",
        showAvailability: false,
        showLocation: false,
        showReserveLink: false,
        showHoldStatus: false,
        showCheckoutStatus: true,
      });

      return paginatedMessage.run(interaction, interaction.user);
    } catch (error) {
      logger.error({ err: error }, "[ViewCheckedOut Command] Error");

      const errorMessage = error?.message?.includes("Login failed")
        ? "Failed to login to the library. Please check your card number and PIN using `/link-account`."
        : `An error occurred while fetching your checked out items: ${error?.message || "Unknown error"}`;

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
