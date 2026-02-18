import { Command } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import {
  searchMediaAvailability,
  transformToTitles,
} from "../lib/LibraryApiService.js";
import {
  getAvailableBibItems,
  getAllLocations,
} from "../lib/AvailabilityService.js";
import { getLibraryCard } from "../lib/database.js";
import { loginToLibrary } from "../lib/LibraryApiService.js";
import { ItemPaginatedMessage } from "../lib/ItemPaginatedMessage.js";
import logger from "../utils/logger.js";

export class FindItemCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "find-item",
      description: "Search for any library item and place holds.",
      aliases: ["find"],
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
      const libraryCard = await getLibraryCard(interaction.user.id);
      let sessionCookies = null;

      if (libraryCard) {
        try {
          sessionCookies = await loginToLibrary(
            libraryCard.cardNumber,
            libraryCard.pin,
          );
        } catch (error) {
          logger.warn(
            `[FindItem] Login failed for ${interaction.user.username}:`,
            error,
          );
          // Continue without login - user can still search
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

      // Extract account info and existing holds from search results
      const holdsMap = new Map();
      const holdsEntities = libraryData.entities?.holds ?? {};
      for (const hold of Object.values(holdsEntities)) {
        if (hold.metadataId) {
          holdsMap.set(hold.metadataId, hold);
        }
      }

      const availableBibItems = await getAvailableBibItems(titles);

      const itemsWithAvailability = titles.map((title) => {
        const availabilityForTitle = availableBibItems.filter(
          (bib) => bib.id === title.id,
        );

        const locations = getAllLocations();

        const structuredAvailability = locations.reduce((acc, location) => {
          const isAvailableAtLocation = availabilityForTitle.some(
            (bib) => bib.branch?.name === location.name,
          );
          if (isAvailableAtLocation) {
            acc[location.code] = {
              location: location.name,
              lastAvailableTime: Math.floor(Date.now() / 1000),
            };
          }
          return acc;
        }, {});

        const holdInfo = holdsMap.get(title.id) ?? null;

        return {
          ...title,
          availability: structuredAvailability,
          holdInfo: holdInfo
            ? {
                id: holdInfo.holdsId,
                status: holdInfo.status,
                position: holdInfo.holdsPosition,
                pickupLocation: holdInfo.pickupLocation?.name,
                expiryDate: holdInfo.expiryDate,
              }
            : null,
        };
      });

      const accountId = Object.keys(libraryData.entities?.accounts ?? {})[0];
      const branchId =
        libraryData.entities?.accounts?.[accountId]?.singleClickHoldsSettings
          ?.branchId;

      const paginatedMessage = new ItemPaginatedMessage(itemsWithAvailability, {
        titlePrefix: "🔍 ",
        color: "#2ECC71",
        showAvailability: true,
        showLocation: false,
        showReserveLink: false,
        showHoldStatus: true,
        showCheckoutStatus: false,
        accountId,
        branchId,
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
