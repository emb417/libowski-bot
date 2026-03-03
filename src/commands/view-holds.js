import { Command } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import { getLibraryCard } from "../lib/database.js";
import { loginToLibrary } from "../lib/AuthService.js";
import { fetchHolds } from "../lib/HoldsService.js";
import { ItemPaginatedMessage } from "../lib/ItemPaginatedMessage.js";
import logger from "../utils/logger.js";

export class ViewHoldsCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "view-holds",
      description: "View your library holds (requires linked account)",
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
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const libraryCard = await getLibraryCard(interaction.user.id);

      if (!libraryCard) {
        return interaction.editReply({
          content:
            "Yeah, well, you know, that's just like, uh, you don't even have a library card linked. Use `/link-account` to link your card first.",
        });
      }
      const { sessionCookies } = await loginToLibrary(
        libraryCard.cardNumber,
        libraryCard.pin,
      );

      const { holds, accountId } = await fetchHolds(sessionCookies);

      if (!holds || holds.length === 0) {
        return interaction.editReply({
          content: "You don't have any items on hold.",
        });
      }

      const STATUS_ORDER = {
        READY_FOR_PICKUP: 0,
        IN_TRANSIT: 1,
        NOT_YET_AVAILABLE: 2,
      };

      const sortedHolds = holds.sort((a, b) => {
        const statusA = STATUS_ORDER[a.holdStatus] ?? 99;
        const statusB = STATUS_ORDER[b.holdStatus] ?? 99;
        if (statusA !== statusB) return statusA - statusB;

        if (
          a.holdStatus === "READY_FOR_PICKUP" &&
          a.pickupByDate &&
          b.pickupByDate
        ) {
          return new Date(a.pickupByDate) - new Date(b.pickupByDate);
        }
        if (a.holdStatus === "NOT_YET_AVAILABLE") {
          return (a.holdsPosition ?? 999999) - (b.holdsPosition ?? 999999);
        }

        return 0;
      });

      const mappedHolds = sortedHolds.map((hold) => ({
        ...hold,
        holdInfo: {
          id: hold.holdId,
          status: hold.holdStatus,
          position: hold.holdsPosition,
          pickupLocation: hold.pickupLocation,
          pickupByDate: hold.pickupByDate,
          expiryDate: hold.expiryDate,
        },
      }));

      const paginatedMessage = new ItemPaginatedMessage(mappedHolds, {
        titlePrefix: "⏳ ",
        color: "#9B59B6",
        showAvailability: false,
        showLocation: false,
        showHoldStatus: true,
        showCancelHoldButton: true,
        showSuspendButton: true,
        showResumeButton: true,
        accountId,
      });

      return paginatedMessage.run(interaction, interaction.user);
    } catch (error) {
      logger.error({ err: error }, "[ViewHolds Command] Error");

      const errorMessage = error?.message?.includes("Login failed")
        ? "Failed to login to the library. Please check your card number and PIN using `/link-account`."
        : `An error occurred while fetching your holds: ${error?.message || "Unknown error"}`;

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
