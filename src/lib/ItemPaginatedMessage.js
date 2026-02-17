import { PaginatedMessage } from "@sapphire/discord.js-utilities";
import { ItemEmbed } from "./ItemEmbed.js";

export class ItemPaginatedMessage extends PaginatedMessage {
  constructor(items, options = {}) {
    super();

    const {
      titlePrefix = "📀 ",
      color = "#0099FF",
      showAvailability = false,
      showLocation = false,
      showReserveLink = false,
      showHoldStatus = false,
      showCheckoutStatus = false,
    } = options;

    const selectMenuOptions = [];

    for (const item of items.slice(0, 25)) {
      if (!item.title) continue;

      const fullTitle = `${titlePrefix} ${item.title} ${item.subtitle || ""} (${item.format || "Unknown Format"} ${item.publicationYear || "Unknown Year"})`;
      const label = fullTitle.substring(0, 100);

      let description = "";

      if (showCheckoutStatus && item.dueDate) {
        // Show checkout status in dropdown
        const statusText = this.formatCheckoutStatusShort(item);
        description = statusText.substring(0, 100);
      } else if (showHoldStatus && item.holdStatus) {
        const statusText = this.formatHoldStatusShort(item);
        description = statusText.substring(0, 100);
      } else if (showAvailability && item.availability) {
        const locations = Object.values(item.availability)
          .filter((loc) => loc.location)
          .map((loc) => loc.location);

        if (locations.length > 0) {
          description = `${locations.join(", ")}`.substring(0, 100);
        } else {
          description = "Not Available.";
        }
      } else if (showLocation && item.location) {
        description = `Location: ${item.location}`.substring(0, 100);
      } else {
        description = `ID: ${item.id}`;
      }

      selectMenuOptions.push({
        label,
        description: description.substring(0, 100),
        value: selectMenuOptions.length.toString(),
      });

      const embed = ItemEmbed.createEmbed(item, {
        titlePrefix,
        color,
        showAvailability,
        showLocation,
        showReserveLink,
        showHoldStatus,
        showCheckoutStatus,
      });

      this.addPage({ embeds: [embed] });
    }

    if (selectMenuOptions.length > 0) {
      this.setSelectMenuOptions((pageIndex) => {
        const option = selectMenuOptions[pageIndex - 1];
        return {
          label: option.label,
          description: option.description,
          value: option.value,
        };
      });
    }
  }

  formatHoldStatusShort(item) {
    if (item.holdStatus === "READY_FOR_PICKUP") {
      return `Ready at ${item.pickupLocation}`;
    } else if (item.holdStatus === "NOT_YET_AVAILABLE") {
      if (item.holdsPosition && item.holdsPosition > 0) {
        return `Position ${item.holdsPosition}`;
      }
      return "Not ready";
    }
    return item.holdStatus || "Unknown status";
  }

  formatCheckoutStatusShort(item) {
    if (item.isOverdue) {
      return `⚠️ OVERDUE`;
    }
    if (item.dueDate) {
      const daysUntilDue = Math.ceil(
        (new Date(item.dueDate) - new Date()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntilDue === 0) {
        return `Due today`;
      } else if (daysUntilDue === 1) {
        return `Due tomorrow`;
      } else {
        return `Due in ${daysUntilDue} days`;
      }
    }
    return "Checked out";
  }
}
