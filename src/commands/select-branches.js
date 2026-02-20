import { Command } from "@sapphire/framework";
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} from "discord.js";
import { ALL_LOCATIONS } from "../lib/AvailabilityService.js";
import { getUserBranches, saveUserBranches } from "../lib/database.js";
import logger from "../utils/logger.js";

export class SelectBranchesCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "select-branches",
      description:
        "Select your preferred library branches for availability notifications.",
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
      // Load the user's current preferences to pre-indicate selections
      const currentBranches = await getUserBranches(interaction.user.id);

      const options = ALL_LOCATIONS.map((location) => ({
        label: location.name,
        value: location.code,
        default: currentBranches?.includes(location.code) ?? false,
      }));

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("selectBranches")
          .setPlaceholder("Select your preferred branches...")
          .setMinValues(1)
          .setMaxValues(ALL_LOCATIONS.length)
          .addOptions(options),
      );

      return interaction.reply({
        content:
          "Select the library branches you want to receive availability notifications for. You can choose one or many.",
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error({ err: error }, "[SelectBranches] Error");
      return interaction.reply({
        content: "An error occurred while loading branch preferences.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
