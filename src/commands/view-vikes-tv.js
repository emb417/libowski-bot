import "dotenv/config";
import { Command } from "@sapphire/framework";
import { EmbedBuilder, MessageFlags } from "discord.js";
import * as cheerio from "cheerio";
import logger from "../utils/logger.js";

const SCHEDULE_URL = "https://www.vikings.com/schedule/";

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
      const games = [];

      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).html());
          if (json["@type"] === "SportsEvent") {
            games.push(json);
          }
        } catch (e) {
          // Ignore invalid JSON
        }
      });

      if (games.length === 0) {
        return interaction.editReply({
          content: "🏈 No Vikings games found on the schedule.",
        });
      }

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
          value: `📅 ${dateStr} at ${timeStr}`,
          inline: false,
        });
      });

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error({ err: error }, "[ViewVikesTVCommand] Error fetching schedule");
      return interaction.editReply({
        content: `An error occurred while fetching the schedule: ${error.message}`,
      });
    }
  }
}
