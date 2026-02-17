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
import { ItemPaginatedMessage } from "../lib/ItemPaginatedMessage.js";
import logger from "../utils/logger.js";

export class FindVideoCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "find-video",
      description: "Search for video availability.",
      aliases: ["find-video"],
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
              .setName("mediatype")
              .setDescription("Filter by media type.")
              .setRequired(false)
              .addChoices(
                { name: "DVD", value: "DVD" },
                { name: "Blu-ray", value: "BLURAY" },
                { name: "Streaming Video", value: "STREAMING_VIDEO" },
                {
                  name: "All Video Formats",
                  value: "DVD|BLURAY|DVD_PBLURAY|STREAMING_VIDEO",
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
      const mediaType = interaction.options.getString("mediatype");

      const libraryData = await searchMediaAvailability(query, mediaType);
      const titles = transformToTitles(libraryData, "search_result");

      if (!titles || titles.length === 0) {
        logger.info(`No items found for search query: "${query}".`);
        return interaction.editReply(
          `No items found for "${query}". Try a different search term or media type.`,
        );
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

        return {
          ...title,
          availability: structuredAvailability,
        };
      });

      const paginatedMessage = new ItemPaginatedMessage(itemsWithAvailability, {
        titlePrefix: "🔍 ",
        color: "#3498DB",
        showAvailability: true,
        showLocation: false,
        showReserveLink: true,
      });

      return paginatedMessage.run(interaction, interaction.user);
    } catch (error) {
      logger.error({ err: error }, "Dude! [FindVideo Command] Error");

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: `Dude, an error occurred while searching for library items: ${error?.message || "Unknown error"}`,
        });
      } else {
        return interaction.reply({
          content: `Dude, an error occurred while searching for library items: ${error?.message || "Unknown error"}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }
}
