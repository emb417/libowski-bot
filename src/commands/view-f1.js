import "dotenv/config";
import { Command } from "@sapphire/framework";
import { EmbedBuilder, MessageFlags } from "discord.js";
import logger from "../utils/logger.js";

const SCHEDULE_URL = "https://racingnews365.com/f1/calendar/2026";

export class ViewF1Command extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "view-f1",
      description: "View the next 5 upcoming Formula 1 races this season.",
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
        "[/view-f1] User " +
          interaction.user.username +
          " requested F1 season schedule.",
      );

      const response = await fetch(SCHEDULE_URL, {
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) {
        throw new Error("racingnews365.com returned " + response.status);
      }

      const html = await response.text();
      const races = this.parseRaces(html);

      if (races.length === 0) {
        return interaction.editReply({
          content:
            "🏎️ No Formula 1 races found. The schedule may be unavailable right now.",
        });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const upcomingRaces = races
        .filter((r) => r.raceDate >= today)
        .slice(0, 5);

      if (upcomingRaces.length === 0) {
        return interaction.editReply({
          content:
            "🏎️ No upcoming Formula 1 races found for the rest of the season.",
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🏎️ Upcoming Formula 1 Races — 2026 Season")
        .setColor("#E8002D")
        .setFooter({ text: "Schedule via racingnews365.com" });

      upcomingRaces.forEach((race) => {
        embed.addFields({
          name: "Round " + race.round + ": " + race.name,
          value:
            "🏟️  " + race.circuit + "\n🏁  " + this.formatDate(race.raceDate),
          inline: false,
        });
      });

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error(
        { err: error },
        "[ViewF1Command] Error fetching F1 schedule",
      );
      const msg =
        "An error occurred while fetching the F1 schedule: " +
        (error && error.message ? error.message : "Unknown error");
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ content: msg });
      }
      return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }
  }

  /**
   * Parse the racingnews365.com calendar table.
   *
   * Each data row looks like:
   *   <tr>
   *     <td>1</td>
   *     <td><a href="...">aus Australian GP</a></td>
   *     <td>Albert Park</td>
   *     <td>08 Mar 2026</td>
   *   </tr>
   *
   * We extract the four <td> values per row.
   */
  parseRaces(html) {
    const races = [];

    // Extract all <tr> blocks that contain race data
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      const cells = [];

      let cellMatch;
      const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
        // Strip inner HTML tags and decode basic entities
        const text = cellMatch[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        cells.push(text);
      }

      // We expect exactly 4 cells: round, name, circuit, date
      if (cells.length !== 4) continue;

      const [roundStr, rawName, circuit, dateStr] = cells;

      const round = parseInt(roundStr, 10);
      if (isNaN(round)) continue;

      // rawName may start with a country code like "aus " — strip it
      // e.g. "aus Australian GP" → "Australian GP"
      const name = rawName.replace(/^[a-z]{2,3}\s+/i, "").trim();

      // dateStr is "08 Mar 2026"
      const raceDate = this.parseDate(dateStr);
      if (!raceDate) continue;

      races.push({ round, name, circuit, raceDate });
    }

    races.sort((a, b) => a.round - b.round);
    return races;
  }

  parseDate(dateStr) {
    // Format: "08 Mar 2026"
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }

  formatDate(date) {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
}
