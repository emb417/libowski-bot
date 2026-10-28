import "dotenv/config";
import { Command } from "@sapphire/framework";
import { EmbedBuilder, MessageFlags } from "discord.js";
import logger from "../utils/logger.js";

const ALLOWLIST = ["katu", "kunp", "nbc", "peacock", "prime video"];

export class ViewBlazersTVCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "view-blazers-tv",
      description:
        "View upcoming Portland Trail Blazers games on TV with replay times (filtered by your services).",
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
        `[/view-blazers-tv] User ${interaction.user.username} requested filtered Blazers TV schedule with replay times.`,
      );

      const now = new Date();

      // 1. Fetch Gracenote TV listings (KUNP with replay times)
      let gnGames = [];
      try {
        const ptFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Los_Angeles",
          year: "numeric",
          month: "numeric",
          day: "numeric",
        });
        const parts = ptFormatter.formatToParts(now);
        const pYear = parts.find((p) => p.type === "year").value;
        const pMonth = parts.find((p) => p.type === "month").value;
        const pDay = parts.find((p) => p.type === "day").value;

        let guessTime = Date.UTC(pYear, pMonth - 1, pDay, 7, 0, 0);
        for (let h = 0; h < 24; h++) {
          const testDate = new Date(Date.UTC(pYear, pMonth - 1, pDay, h, 0, 0));
          const laHourStr = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/Los_Angeles",
            hour: "numeric",
            hour12: false,
          }).format(testDate);
          const laHour = parseInt(laHourStr.replace(/^24$/, "0"), 10);
          const laDay = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/Los_Angeles",
            day: "numeric",
          }).format(testDate);

          if (laHour === 0 && parseInt(laDay, 10) === parseInt(pDay, 10)) {
            guessTime = testDate.getTime();
            break;
          }
        }
        const currentTimestamp = Math.floor(guessTime / 1000);

        const response = await fetch(
          "https://tvlistings.gracenote.com/api/sslgrid",
          {
            method: "POST",
            headers: {
              accept: "*/*",
              "accept-language":
                "en-US,en;q=0.9,es;q=0.8,pt;q=0.7,pt-BR;q=0.6,pt-PT;q=0.5",
              "cache-control": "no-cache",
              "content-type":
                "application/x-www-form-urlencoded; charset=UTF-8",
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

        if (response.ok) {
          const data = await response.json();
          let allListings = [];
          if (typeof data === "object" && data !== null) {
            for (const dateKey in data) {
              if (Array.isArray(data[dateKey])) {
                allListings = allListings.concat(data[dateKey]);
              }
            }
          }
          gnGames = allListings.filter((listing) => {
            const program = listing.program || {};
            const title = program.title || "";
            const episodeTitle = program.episodeTitle || "";
            const description = program.shortDesc || "";

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
        }
      } catch (gnError) {
        logger.warn(
          { err: gnError },
          "[ViewBlazersTVCommand] Gracenote fetch failed, continuing with NBA schedule source",
        );
      }

      // 2. Fetch NBA Schedule API
      let nbaGames = [];
      try {
        const currentYear = now.getFullYear();
        const seasonYear =
          now.getMonth() >= 9
            ? `${currentYear}-${(currentYear + 1).toString().slice(2)}`
            : `${currentYear - 1}-${currentYear.toString().slice(2)}`;
        const nbaRes = await fetch(
          `https://stats.nba.com/stats/scheduleLeagueV2?LeagueID=00&Season=${seasonYear}`,
          {
            headers: {
              "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              referer: "https://www.nba.com/schedule/blazers",
            },
          },
        );

        if (nbaRes.ok) {
          const json = await nbaRes.json();
          const gameDates = json.leagueSchedule?.gameDates || [];
          for (const gd of gameDates) {
            for (const game of gd.games || []) {
              if (
                game.homeTeam?.teamId === 1610612757 ||
                game.awayTeam?.teamId === 1610612757 ||
                game.homeTeam?.teamName
                  ?.toLowerCase()
                  .includes("trail blazers") ||
                game.homeTeam?.teamName?.toLowerCase().includes("blazers") ||
                game.awayTeam?.teamName
                  ?.toLowerCase()
                  .includes("trail blazers") ||
                game.awayTeam?.teamName?.toLowerCase().includes("blazers")
              ) {
                nbaGames.push(game);
              }
            }
          }
        }
      } catch (nbaError) {
        logger.warn(
          { err: nbaError },
          "[ViewBlazersTVCommand] NBA schedule fetch failed, continuing with Gracenote source",
        );
      }

      if (gnGames.length === 0 && nbaGames.length === 0) {
        return interaction.editReply({
          content:
            "🏀 No upcoming Portland Trail Blazers games found on the TV schedule.",
        });
      }

      // 3. Normalize and Merge/Deduplicate by Date (at most 1 game per day)
      const unifiedMap = new Map();

      function getOpponent(homeTeam, awayTeam) {
        const isHome =
          homeTeam?.teamId === 1610612757 ||
          homeTeam?.teamName?.toLowerCase().includes("blazers");
        const opp = isHome ? awayTeam : homeTeam;
        const name =
          `${opp?.teamCity || ""} ${opp?.teamName || ""}`.trim() ||
          opp?.teamName ||
          "Unknown Opponent";
        return { opponent: name, location: isHome ? "Home" : "Away" };
      }

      // Process NBA Games
      for (const game of nbaGames) {
        const dateStr = (
          game.gameDateTimeUTC ||
          game.gameTimeUTC ||
          game.gameDate ||
          ""
        ).split("T")[0];
        if (!dateStr) continue;
        const startTime = Math.floor(
          new Date(
            game.gameDateTimeUTC || game.gameTimeUTC || game.gameDate,
          ).getTime() / 1000,
        );
        const { opponent, location } = getOpponent(
          game.homeTeam,
          game.awayTeam,
        );

        const tvSet = new Set();
        const broadcasters = game.broadcasters || {};
        const broadcasterKeys = [
          "nationalBroadcasters",
          "homeTvBroadcasters",
          "awayTvBroadcasters",
          "homeOttBroadcasters",
          "awayOttBroadcasters",
        ];
        broadcasterKeys.forEach((key) => {
          if (Array.isArray(broadcasters[key])) {
            broadcasters[key].forEach((b) => {
              if (b.broadcasterDisplay) {
                // Map KATU ABC 2/KUNP to KUNP if present
                let disp = b.broadcasterDisplay;
                if (
                  disp.toLowerCase().includes("katu") &&
                  disp.toLowerCase().includes("kunp")
                ) {
                  disp = "KUNP";
                }
                tvSet.add(disp);
              }
            });
          }
        });

        unifiedMap.set(dateStr, {
          startTime,
          date: dateStr,
          opponent,
          location,
          tvNetworks: tvSet,
          listings: [],
          source: "NBA.com",
        });
      }

      // Process Gracenote Games (collecting all airings and mapping to KUNP for that date)
      for (const listing of gnGames) {
        const dateStr = listing.progDate;
        if (!dateStr) continue;
        const startTime = listing.startTime;
        const timeStr = new Date(startTime * 1000).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "America/Los_Angeles",
        });

        const program = listing.program || {};
        const title = program.title || "";
        const episodeTitle = program.episodeTitle || "";

        if (unifiedMap.has(dateStr)) {
          const entry = unifiedMap.get(dateStr);
          entry.tvNetworks.add("KUNP");
          entry.listings.push({ startTime, timeStr });
        } else {
          unifiedMap.set(dateStr, {
            startTime,
            date: dateStr,
            opponent: episodeTitle || title || "Portland Trail Blazers Game",
            location: "",
            tvNetworks: new Set(["KUNP"]),
            listings: [{ startTime, timeStr }],
            source: "Gracenote",
          });
        }
      }

      const allGames = Array.from(unifiedMap.values()).sort(
        (a, b) => a.startTime - b.startTime,
      );

      // Filter games matching the allowlist
      const filteredGames = allGames
        .filter((g) => {
          const networks = Array.from(g.tvNetworks);
          return networks.some((net) => {
            const lower = net.toLowerCase();
            return ALLOWLIST.some((allowed) => lower.includes(allowed));
          });
        })
        .filter((g) => g.startTime * 1000 > Date.now())
        .slice(0, 10);

      if (filteredGames.length === 0) {
        return interaction.editReply({
          content:
            "🏀 No upcoming Portland Trail Blazers games found on your allowed TV networks/services (KUNP, NBC, Peacock, Prime Video).",
        });
      }

      // 4. Build Discord Embed
      const embed = new EmbedBuilder()
        .setTitle("🏀 Upcoming Portland Trail Blazers Games (Filtered)")
        .setDescription(
          "Showing games available on: `KUNP, NBC, Peacock, Prime Video`",
        )
        .setURL("https://www.nba.com/schedule/blazers")
        .setColor("#E03A3E") // Blazers red
        .setFooter({ text: "Schedule via NBA.com & Gracenote" });

      filteredGames.forEach((game, index) => {
        const startTime = new Date(game.startTime * 1000);
        const dateStr = startTime.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "America/Los_Angeles",
        });

        let primaryTimeStr = startTime.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "America/Los_Angeles",
        });

        // Sort listings chronologically if from Gracenote
        let replays = [];
        if (game.listings && game.listings.length > 0) {
          game.listings.sort((a, b) => a.startTime - b.startTime);
          primaryTimeStr = game.listings[0].timeStr;
          replays = game.listings.slice(1).map((l) => l.timeStr);
        }

        const locationStr = game.location ? ` (${game.location})` : "";

        // Filter TV networks to only show those matching the allowlist and deduplicate
        const allowedNets = Array.from(
          new Set(
            Array.from(game.tvNetworks).map((net) => {
              let lower = net.toLowerCase();
              if (lower.includes("katu") && lower.includes("kunp"))
                return "KUNP";
              return net;
            }),
          ),
        ).filter((net) => {
          const lower = net.toLowerCase();
          return ALLOWLIST.some((allowed) => lower.includes(allowed));
        });
        const tvList = allowedNets.join(", ") || "Available on allowlist";

        const opponentWithLocation = `${game.opponent}${game.location ? ` (${game.location})` : ""}`;
        const nameStr = `📅  ${dateStr} vs ${opponentWithLocation}`;
        let valueStr = `📺  ${tvList} at ${primaryTimeStr}`;
        if (replays.length > 0) {
          valueStr += `\n🔁  ${replays.join(", ")}`;
        }

        embed.addFields({
          name: nameStr,
          value: valueStr,
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

      const errorMessage = `An error occurred while fetching the TV schedule: ${error?.message || "Unknown error"}`;

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
