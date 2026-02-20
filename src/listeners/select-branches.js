import { Listener } from "@sapphire/framework";
import { InteractionType, MessageFlags } from "discord.js";
import { ALL_LOCATIONS } from "../lib/AvailabilityService.js";
import { saveUserBranches } from "../lib/database.js";
import logger from "../utils/logger.js";

export class SelectBranchesListener extends Listener {
  constructor(context, options) {
    super(context, {
      ...options,
      event: "interactionCreate",
    });
  }

  async run(interaction) {
    if (interaction.type !== InteractionType.MessageComponent) return;
    if (interaction.customId !== "selectBranches") return;

    try {
      const selectedCodes = interaction.values;

      await saveUserBranches(interaction.user.id, selectedCodes);

      const selectedNames = selectedCodes
        .map(
          (code) =>
            ALL_LOCATIONS.find((loc) => loc.code === code)?.name ?? code,
        )
        .join("\n");

      logger.info(
        `${interaction.user.username} updated branch preferences: ${selectedCodes.join(", ")}`,
      );

      return interaction.update({
        content: `✅ Your preferred branches have been saved:\n\n${selectedNames}`,
        components: [],
      });
    } catch (error) {
      logger.error({ err: error }, "[SelectBranches] Error saving branches");
      return interaction.update({
        content: "An error occurred while saving your branch preferences.",
        components: [],
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
