import { Command } from "@sapphire/framework";
import { MessageFlags, EmbedBuilder, ButtonStyle } from "discord.js";
import { PaginatedMessage } from "@sapphire/discord.js-utilities";
import { fetchHours } from "../lib/HoursService.js";
import logger from "../utils/logger.js";

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export class ViewHoursCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "view-hours",
      description: "View library branch hours.",
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

      const branches = (await fetchHours())
        .filter((b) => b.name)
        .sort((a, b) => a.name.localeCompare(b.name));

      if (!branches.length) {
        return interaction.editReply("No branch hours available.");
      }

      const todayRef = DAYS[new Date().getDay()];
      const actions = PaginatedMessage.defaultActions.map((action) => ({
        ...action,
        style: action.customId.includes("stop")
          ? ButtonStyle.Danger
          : ButtonStyle.Secondary,
      }));
      const paginatedMessage = new PaginatedMessage({
        actions,
      });
      const selectMenuOptions = [];

      for (const branch of branches) {
        const embed = new EmbedBuilder()
          .setTitle(`🕐 ${branch.name}`)
          .setColor("#3498DB")
          .setURL(branch.customUrl || null);

        if (branch.hours?.length) {
          const sorted = [...branch.hours].sort(
            (a, b) => DAYS.indexOf(a.timeRef) - DAYS.indexOf(b.timeRef),
          );

          const hoursText = sorted
            .map((h) => {
              const day =
                h.timeRef.charAt(0).toUpperCase() + h.timeRef.slice(1);
              return `**${day}:** ${this.formatTime(h.openTime)} – ${this.formatTime(h.closeTime)}`;
            })
            .join("\n");

          embed.addFields({ name: "Hours", value: hoursText });
        } else {
          embed.addFields({ name: "Hours", value: "No hours listed." });
        }

        const todayHours = branch.hours?.find((h) => h.timeRef === todayRef);
        const todayDescription = todayHours
          ? `Today: ${this.formatTime(todayHours.openTime)} – ${this.formatTime(todayHours.closeTime)}`
          : "Today: Closed";

        selectMenuOptions.push({
          label: branch.name.substring(0, 100),
          description: todayDescription,
          value: selectMenuOptions.length.toString(),
        });

        paginatedMessage.addPage({ embeds: [embed] });
      }

      paginatedMessage.setSelectMenuOptions((pageIndex) => ({
        label: selectMenuOptions[pageIndex - 1].label,
        description: selectMenuOptions[pageIndex - 1].description,
        value: selectMenuOptions[pageIndex - 1].value,
      }));

      return paginatedMessage.run(interaction, interaction.user);
    } catch (error) {
      logger.error({ err: error }, "[ViewHours Command] Error");
      return interaction.editReply("Failed to fetch library hours.");
    }
  }

  formatTime(timeStr) {
    const [hours, minutes] = timeStr.replace("T", "").split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  }
}
