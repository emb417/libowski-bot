import "dotenv/config";
import { Command } from "@sapphire/framework";
import { EmbedBuilder, MessageFlags } from "discord.js";
import * as cheerio from "cheerio";
import logger from "../utils/logger.js";

const SCHEDULE_URL = "https://www.vikings.com/schedule/";

// Candidate selectors for the "network" text on a matchup card. The exact
// class name has changed on nfl.com club-site templates before, so we try
// several and use whichever one actually returns text.
const TV_SELECTORS = [
  ".nfl-o-matchup-cards__media-tv--networks",
  ".nfl-o-matchup-card__media-tv--networks",
  "[class*='media-tv']",
  "[class*='matchup'] [class*='network']",
];

export class ViewVikesTVCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "view-vikes-tv",
      description: "View upcoming Minnesota Vikings games.",
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
        `[/view-vikes-tv] User ${interaction.user.username} requested Vikings schedule.`,
      );

      const response = await fetch(SCHEDULE_URL, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch schedule: ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // --- 1. Pull every SportsEvent out of the page's JSON-LD, without
      // assuming it lives inside any particular card wrapper. Sites commonly
      // emit these as one script with an array, one script per event, or
      // wrapped in an @graph — so we handle all three shapes.
      const sportsEvents = [];
      $('script[type="application/ld+json"]').each((_, el) => {
        const raw = $(el).html();
        if (!raw) return;

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (e) {
          return;
        }

        const candidates = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.["@graph"])
            ? parsed["@graph"]
            : [parsed];

        for (const item of candidates) {
          if (item && item["@type"] === "SportsEvent" && item.startDate) {
            sportsEvents.push(item);
          }
        }
      });

      logger.info(
        `[/view-vikes-tv] Found ${sportsEvents.length} SportsEvent entries in JSON-LD.`,
      );

      if (sportsEvents.length === 0) {
        return interaction.editReply({
          content: "🏈 No Vikings games found on the schedule.",
        });
      }

      // --- 2. Best-effort TV network lookup, matched by position. The
      // JSON-LD events are typically emitted in the same order the cards
      // appear on the page, so we zip them up by index. If nothing matches,
      // we just fall back to "TBD" instead of dropping the whole game.
      let $tvNodes = $();
      for (const selector of TV_SELECTORS) {
        $tvNodes = $(selector);
        if ($tvNodes.length > 0) {
          logger.info(
            `[/view-vikes-tv] Using TV selector "${selector}" (${$tvNodes.length} matches).`,
          );
          break;
        }
      }

      const games = sportsEvents.map((event, i) => {
        const tvText = $tvNodes.eq(i)?.text().trim();
        return { ...event, tv: tvText || "TBD" };
      });

      // Filter upcoming games (startDate is in the future)
      const now = new Date();
      const upcomingGames = games
        .filter((g) => new Date(g.startDate) > now)
        .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
        .slice(0, 10);

      if (upcomingGames.length === 0) {
        return interaction.editReply({
          content: "🏈 No upcoming Vikings games found.",
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🏈 Upcoming Minnesota Vikings Games")
        .setColor("#4F2683") // Vikings purple
        .setFooter({ text: "Schedule via vikings.com" });

      upcomingGames.forEach((game) => {
        const date = new Date(game.startDate);
        const dateStr = date.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        const timeStr = date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });

        const homeTeam = game.homeTeam?.name || "Unknown";
        const awayTeam = game.awayTeam?.name || "Unknown";
        const opponent = homeTeam === "Minnesota Vikings" ? awayTeam : homeTeam;
        const location = homeTeam === "Minnesota Vikings" ? "Home" : "Away";

        embed.addFields({
          name: `${opponent} (${location})`,
          value: `📅 ${dateStr} at ${timeStr}\n📺 ${game.tv}`,
          inline: false,
        });
      });

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error(
        { err: error },
        "[ViewVikesTVCommand] Error fetching schedule",
      );
      return interaction.editReply({
        content: `An error occurred while fetching the schedule: ${error.message}`,
      });
    }
  }
}
