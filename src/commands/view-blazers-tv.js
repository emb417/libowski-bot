import { Command } from "@sapphire/framework";
import { EmbedBuilder, MessageFlags } from "discord.js";
import logger from "../utils/logger.js";

export class ViewBlazersTVCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "view-blazers-tv",
      description: "View upcoming Portland Trail Blazers games on TV.",
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
      await interaction.deferReply({
        flags: interaction.inGuild() ? MessageFlags.Ephemeral : undefined,
      });

      logger.info(
        `[/view-blazers-tv] User ${interaction.user.username} requested Blazers TV schedule.`,
      );

      // Get current timestamp for the API request
      const currentTimestamp = Math.floor(Date.now() / 1000);

      // Fetch Gracenote TV listings
      const response = await fetch(
        "https://tvlistings.gracenote.com/api/sslgrid",
        {
          method: "POST",
          headers: {
            accept: "*/*",
            "accept-language":
              "en-US,en;q=0.9,es;q=0.8,pt;q=0.7,pt-BR;q=0.6,pt-PT;q=0.5",
            "cache-control": "no-cache",
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            pragma: "no-cache",
            "x-requested-with": "XMLHttpRequest",
            referer:
              "https://tvlistings.gracenote.com/ss-list-affiliates.html?aid=katu",
            "user-agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
          },
          body: `timespan=336&timestamp=${currentTimestamp}&prgsvcid=62792&headendId=NY65256&countryCode=USA&postalCode=97232&device=X&userId=-&aid=katu&DSTUTCOffset=-420&STDUTCOffset=-480&DSTStart=0001-01-01T00%3A00Z&DSTEnd=0001-01-01T00%3A00Z&languagecode=en`,
        },
      );

      if (!response.ok) {
        throw new Error(`TV listings API returned ${response.status}`);
      }

      const data = await response.json();

      // Extract listings from the date-grouped response
      // The API returns { "2026-02-28": [...], "2026-03-01": [...], ... }
      let allListings = [];

      if (typeof data === "object" && data !== null) {
        // Flatten all date groups into a single array
        for (const dateKey in data) {
          if (Array.isArray(data[dateKey])) {
            allListings = allListings.concat(data[dateKey]);
          }
        }
      } else {
        logger.warn("[ViewBlazersTVCommand] Unexpected API response structure");
        logger.debug({ data });
      }

      // Filter for Blazers games
      const blazersGames = allListings.filter((listing) => {
        const program = listing.program || {};
        const title = program.title || "";
        const episodeTitle = program.episodeTitle || "";
        const description = program.shortDesc || "";

        // Check if it's an NBA Basketball game featuring Portland Trail Blazers
        const isNBAGame =
          title.toLowerCase().includes("nba basketball") ||
          episodeTitle.toLowerCase().includes("nba basketball") ||
          title.toLowerCase().includes("nba:");

        const hasBlazers =
          title.toLowerCase().includes("portland trail blazers") ||
          title.toLowerCase().includes("trail blazers") ||
          episodeTitle.toLowerCase().includes("portland trail blazers") ||
          episodeTitle.toLowerCase().includes("trail blazers") ||
          description.toLowerCase().includes("portland trail blazers") ||
          description.toLowerCase().includes("trail blazers");

        return isNBAGame && hasBlazers;
      });

      if (blazersGames.length === 0) {
        return interaction.editReply({
          content:
            "🏀 No upcoming Portland Trail Blazers games found on the TV schedule in the next 14 days.",
        });
      }

      // Sort by start time
      const sortedGames = blazersGames.sort(
        (a, b) => a.startTime - b.startTime,
      );

      // Group games by date
      const gamesByDate = {};
      sortedGames.forEach((game) => {
        const date = game.progDate; // e.g., "2026-03-15"
        if (!gamesByDate[date]) {
          gamesByDate[date] = [];
        }
        gamesByDate[date].push(game);
      });

      // Get the first 10 unique dates (each date may have multiple showings)
      const uniqueDates = Object.keys(gamesByDate).sort().slice(0, 10);

      if (uniqueDates.length === 0) {
        return interaction.editReply({
          content:
            "🏀 No upcoming Portland Trail Blazers games found on the TV schedule in the next 14 days.",
        });
      }

      // Build embed
      const embed = new EmbedBuilder()
        .setTitle("🏀 Upcoming Portland Trail Blazers Games")
        .setColor("#E03A3E"); // Blazers red

      // Add each date as a field with all showtimes
      uniqueDates.forEach((date, index) => {
        const gamesOnDate = gamesByDate[date];
        const firstGame = gamesOnDate[0];
        const program = firstGame.program || {};
        const episodeTitle = program.episodeTitle || "";
        const title = program.title || "NBA Game";

        // Extract matchup from episodeTitle or title
        let matchup = episodeTitle || title;

        // If the title is "NBA Basketball" and episodeTitle has the matchup, use that
        if (title.toLowerCase().includes("nba basketball") && episodeTitle) {
          matchup = episodeTitle;
        }

        // Clean up any quotes
        const quoteMatch = matchup.match(/["']([^"']+)["']/);
        if (quoteMatch) {
          matchup = quoteMatch[1];
        }

        // Format the date
        const firstStartTime = new Date(firstGame.startTime * 1000);
        const dateStr = firstStartTime.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });

        // Collect all showtimes for this date
        const showtimes = gamesOnDate
          .map((game) => {
            const startTime = new Date(game.startTime * 1000);
            return startTime.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });
          })
          .join(", ");

        embed.addFields({
          name: `Game ${index + 1}: ${matchup}`,
          value: `📅  ${dateStr}  🕐  ${showtimes}`,
          inline: false,
        });
      });

      return interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      logger.error(
        { err: error },
        "[ViewBlazersTVCommand] Error fetching TV schedule",
      );

      const errorMessage = error?.message?.includes("API returned")
        ? `Failed to fetch TV schedule: ${error.message}`
        : `An error occurred while fetching the TV schedule: ${error?.message || "Unknown error"}`;

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
