import { Command } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import { getLibraryCard } from "../lib/database.js";
import { loginToLibrary } from "../lib/AuthService.js";
import {
  getAvailableBibItems,
  getAllLocations,
} from "../lib/AvailabilityService.js";
import { fetchHolds } from "../lib/HoldsService.js";
import {
  searchMediaAvailability,
  transformToTitles,
} from "../lib/SearchService.js";
import { ItemPaginatedMessage } from "../lib/ItemPaginatedMessage.js";
import logger from "../utils/logger.js";

export class FindItemCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "find-item",
      description: "Search for any library item and place holds.",
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
              .setName("query")
              .setDescription("The title or keyword to search for.")
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName("format")
              .setDescription("Filter by format type.")
              .setRequired(false)
              .addChoices(
                { name: "Books", value: "BK" },
                { name: "eBooks", value: "EBOOK" },
                { name: "Audiobooks", value: "AB" },
                { name: "DVD", value: "DVD" },
                { name: "Blu-ray", value: "BLURAY" },
                { name: "Music CD", value: "MUSIC_CD" },
                { name: "Graphic Novels", value: "GRAPHIC_NOVEL" },
                { name: "Magazines", value: "MAG" },
                {
                  name: "All Formats",
                  value: "BK|EBOOK|AB|DVD|BLURAY|MUSIC_CD|GRAPHIC_NOVEL|MAG",
                },
              ),
          ),
      registryOptions,
    );
  }

  async chatInputRun(interaction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const query = interaction.options.getString("query", true);
      const format = interaction.options.getString("format");

      // Get user's library card (optional for searching, required for holds)
      let sessionCookies = null; // Declare sessionCookies here
      const libraryCard = await getLibraryCard(interaction.user.id);
      let holds = [];
      let accountId = null;

      if (libraryCard) {
        try {
          const loginData = await loginToLibrary(
            libraryCard.cardNumber,
            libraryCard.pin,
          );
          sessionCookies = loginData.sessionCookies; // Assign it here
          const holdData = await fetchHolds(sessionCookies);
          holds = holdData.holds;
          accountId = holdData.accountId;
        } catch (error) {
          logger.warn(
            `[FindItem] Login or holds fetch failed for ${interaction.user.username}: ${error.message || "Unknown error"}`,
            error.stack,
          );
          // Continue without login/holds - user can still search
        }
      }

      // Search for items
      const libraryData = await searchMediaAvailability(
        query,
        format,
        sessionCookies ? { sessionCookies } : null,
      );
      const titles = transformToTitles(libraryData, "search_result");

      if (!titles || titles.length === 0) {
        logger.info(`No items found for search query: "${query}".`);
        return interaction.editReply(
          `No items found for "${query}". Try a different search term or format.`,
        );
      }

      const bibResults = await getAvailableBibItems(titles);

      const itemsWithAvailability = titles.map((title) => {
        const bibResult = bibResults.find((res) => res.id === title.id);
        const hold = holds.find((h) => h.id === title.id);

        const heldCopies = bibResult?.heldCopies ?? 0;
        const totalCopies = bibResult?.totalCopies ?? 0;
        const availableCopies = bibResult?.availableCopies ?? [];

        const locations = getAllLocations();

        const structuredAvailability = locations.reduce((acc, location) => {
          const isAvailableAtLocation = availableCopies.some(
            (bibItem) => bibItem.branch?.name === location.name,
          );
          if (isAvailableAtLocation) {
            acc[location.code] = {
              location: location.name,
              lastAvailableTime: Math.floor(Date.now() / 1000),
            };
          }
          return acc;
        }, {});

        return {
          ...title,
          heldCopies,
          totalCopies,
          availability: structuredAvailability,
          // Root level action flags to match view-holds and ItemPaginatedMessage expectations
          canCancel: hold?.canCancel ?? false,
          canSuspend: hold?.canSuspend ?? false,
          canResume: hold?.canResume ?? false,
          holdInfo: hold
            ? {
                id: hold.holdId,
                status: hold.holdStatus,
                position: hold.holdsPosition,
                pickupLocation: hold.pickupLocation,
                expiryDate: hold.expiryDate,
              }
            : null,
        };
      });

      const paginatedMessage = new ItemPaginatedMessage(itemsWithAvailability, {
        titlePrefix: "🔍 ",
        color: "#2ECC71",
        showAvailability: true,
        showLocation: false,
        showHoldStatus: true,
        showPlaceHoldButton: true,
        showCancelHoldButton: true,
        showSuspendButton: true,
        showResumeButton: true,
        showCheckoutStatus: false,
        accountId,
      });

      // Add a note if user is not logged in
      if (!libraryCard) {
        await interaction.followUp({
          content:
            "💡 **Tip:** Link your library card with `/link-account` to place holds directly from search results!",
          flags: MessageFlags.Ephemeral,
        });
      }

      return paginatedMessage.run(interaction, interaction.user);
    } catch (error) {
      logger.error({ err: error }, "[FindItem Command] Error");

      const errorMessage = error?.message?.includes("Login failed")
        ? "Failed to login to the library. Your search will continue, but you won't be able to place holds. Please check your credentials with `/link-account`."
        : `An error occurred while searching for library items: ${error?.message || "Unknown error"}`;

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
