import { Listener } from "@sapphire/framework";
import logger from "../utils/logger.js";

export class UnifiedLogger extends Listener {
  constructor(context, options) {
    super(context, {
      ...options,
      event: "interactionCreate",
    });
  }

  async run(interaction) {
    // Determine the context (guild channel or DM)
    const context = interaction.inGuild()
      ? `#${interaction.channel.name}`
      : `DM with ${interaction.user.username}`;

    if (interaction.isChatInputCommand()) {
      logger.info(
        `${interaction.user.username} used /${interaction.commandName} in ${context}`,
      );
      return;
    }

    if (interaction.isMessageComponent()) {
      logger.info(
        `${interaction.user.username} used ${interaction.customId} button in ${context}`,
      );
      return;
    }

    if (interaction.isModalSubmit()) {
      logger.info(
        `${interaction.user.username} used ${interaction.customId} modal in ${context}`,
      );
      return;
    }
  }
}
