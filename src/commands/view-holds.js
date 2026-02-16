import { Command } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import { getLibraryCard } from "../lib/database.js";
import { loginToLibrary, fetchHolds } from "../lib/LibraryApiService.js";
import { ItemPaginatedMessage } from "../lib/ItemPaginatedMessage.js";
import logger from "../utils/logger.js";

export class ViewHoldsCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "view-holds",
      description: "View your library holds (requires linked account)",
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
        `[/view-holds] User ${interaction.user.username} is checking their holds`,
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
        `[ViewHolds] Logging in to library for ${interaction.user.username}`,
      );
      const sessionCookies = await loginToLibrary(
        libraryCard.cardNumber,
        libraryCard.pin,
      );

      // Fetch holds
      logger.debug(
        `[ViewHolds] Fetching holds for ${interaction.user.username}`,
      );
      const holds = await fetchHolds(sessionCookies);

      if (!holds || holds.length === 0) {
        return interaction.editReply({
          content: "You don't have any items on hold.",
        });
      }

      // Sort holds: Ready for pickup first, then by position in queue
      const sortedHolds = holds.sort((a, b) => {
        // Ready for pickup items come first
        if (
          a.holdStatus === "READY_FOR_PICKUP" &&
          b.holdStatus !== "READY_FOR_PICKUP"
        ) {
          return -1;
        }
        if (
          a.holdStatus !== "READY_FOR_PICKUP" &&
          b.holdStatus === "READY_FOR_PICKUP"
        ) {
          return 1;
        }

        // If both are ready for pickup, sort by pickup date (earliest first)
        if (
          a.holdStatus === "READY_FOR_PICKUP" &&
          b.holdStatus === "READY_FOR_PICKUP"
        ) {
          if (a.pickupByDate && b.pickupByDate) {
            return new Date(a.pickupByDate) - new Date(b.pickupByDate);
          }
          return 0;
        }

        // If both are not yet available, sort by position in queue
        if (
          a.holdStatus === "NOT_YET_AVAILABLE" &&
          b.holdStatus === "NOT_YET_AVAILABLE"
        ) {
          const posA = a.holdsPosition || 999999;
          const posB = b.holdsPosition || 999999;
          return posA - posB;
        }

        // Default: maintain original order
        return 0;
      });

      // Display holds using paginated message
      const paginatedMessage = new ItemPaginatedMessage(sortedHolds, {
        titlePrefix: "⏳ ",
        color: "#9B59B6",
        showAvailability: false,
        showLocation: false,
        showReserveLink: false,
        showHoldStatus: true,
      });

      return paginatedMessage.run(interaction, interaction.user);
    } catch (error) {
      logger.error({ err: error }, "[ViewHolds Command] Error");

      const errorMessage = error?.message?.includes("Login failed")
        ? "Failed to login to the library. Please check your card number and PIN using `/link-account`."
        : `An error occurred while fetching your holds: ${error?.message || "Unknown error"}`;

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
