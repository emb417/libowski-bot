import { Command } from "@sapphire/framework";
import { MessageFlags } from "discord.js";
import { getBestSellers, getLibraryCard } from "../lib/database.js";
import { loginToLibrary } from "../lib/AuthService.js";
import { getAvailableBibItems } from "../lib/AvailabilityService.js";
import { fetchHolds } from "../lib/HoldsService.js";
import { ItemPaginatedMessage } from "../lib/ItemPaginatedMessage.js";
import logger from "../utils/logger.js";

export class ViewBestSellersCommand extends Command {
  constructor(context, options) {
    super(context, {
      ...options,
      name: "view-bestsellers",
      description: "Get best seller (available now) library items",
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

      const items = await getBestSellers();

      if (!items || items.length === 0) {
        return interaction.editReply(
          `So look, man, there just aren't any available right now, okay, man.`,
        );
      }

      let holds = [];
      let accountId = null;
      const libraryCard = await getLibraryCard(interaction.user.id);

      if (libraryCard) {
        try {
          const { sessionCookies } = await loginToLibrary(
            libraryCard.cardNumber,
            libraryCard.pin,
          );
          const holdData = await fetchHolds(sessionCookies);
          holds = holdData.holds;
          accountId = holdData.accountId;
        } catch (error) {
          logger.warn(
            `[ViewBestSellers] Login or holds fetch failed for ${interaction.user.username}: ${error.message || "Unknown error"}`,
            error.stack,
          );
        }
      }

      // Fetch hold counts using the same service as find-item
      const bibResults = await getAvailableBibItems(items);

      // Enrich items with hold information
      const enrichedItems = items.map((item) => {
        const bibResult = bibResults.find((res) => res.id === item.id);
        const hold = holds.find((h) => h.id === item.id);

        return {
          ...item,
          heldCopies: bibResult?.heldCopies ?? 0,
          totalCopies: bibResult?.totalCopies ?? 0,
          // Root level action flags to match view-holds and ItemPaginatedMessage expectations
          canCancel: hold?.canCancel ?? false,
          canSuspend: hold?.canSuspend ?? false,
          canResume: hold?.canResume ?? false,
          holdInfo: hold
            ? {
                id: hold.holdId,
                status: hold.holdStatus,
                position: hold.holdsPosition,
                pickupLocation: hold.pickupLocation,
                expiryDate: hold.expiryDate,
              }
            : null,
        };
      });

      const paginatedMessage = new ItemPaginatedMessage(enrichedItems, {
        titlePrefix: "📀 ",
        color: "#0099FF",
        showAvailability: true,
        showLocation: false,
        showPlaceHoldButton: true,
        showCancelHoldButton: true,
        showSuspendButton: true,
        showResumeButton: true,
        accountId,
      });

      return paginatedMessage.run(interaction, interaction.user);
    } catch (error) {
      logger.error({ err: error }, "Dude! [BestSellers Command] Error");

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: `Dude, an error occurred while fetching library items: ${error?.message || "Unknown error"}`,
        });
      } else {
        return interaction.reply({
          content: `Dude, an error occurred while fetching library items: ${error?.message || "Unknown error"}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }
}
