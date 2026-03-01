import { PaginatedMessage } from "@sapphire/discord.js-utilities";
import { ButtonStyle } from "discord.js";
import { ItemEmbed } from "./ItemEmbed.js";

export class ItemPaginatedMessage extends PaginatedMessage {
  constructor(items, options = {}) {
    super();
    this.customComponents = [];

    // Override button styles to use Secondary (gray) instead of Primary (blurple)
    this.setActions(
      PaginatedMessage.defaultActions.map((action) => ({
        ...action,
        style: action.customId.includes("stop")
          ? ButtonStyle.Danger // Keep stop button red
          : ButtonStyle.Secondary, // Make all other buttons gray
      })),
    );

    const {
      titlePrefix = "📀 ",
      color = "#0099FF",
      showAvailability = false,
      showLocation = false,
      showHoldStatus = false,
      showCheckoutStatus = false,
      accountId = null,
      branchId = null,
      showRenewButton = false,
    } = options;

    // ... rest of your code stays the same

    const selectMenuOptions = [];

    for (const item of items.slice(0, 25)) {
      if (!item.title) continue;

      const fullTitle = `${titlePrefix} ${item.title}${item.subtitle ? `: ${item.subtitle}` : ""}${item.edition ? ` ${item.edition}` : ""} (${item.format || "Unknown Format"} ${item.publicationYear || "Unknown Year"})`;
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

      const { embed, components } = ItemEmbed.createEmbed(item, {
        titlePrefix,
        color,
        accountId,
        branchId,
        checkoutId: item.checkoutId,
        holdId: item.holdInfo?.id ?? null,
        metadataId: item.id,
        hasExistingHold: !!item.holdInfo && item.canCancel,
        showAvailability,
        showLocation,
        showCheckoutStatus,
        showRenewButton: showRenewButton && !!item.canRenew,
        showHoldStatus,
        showPlaceHoldButton: !item.holdInfo,
        showCancelHoldButton: !!item.canCancel,
        showSuspendButton: !!item.canSuspend,
        showResumeButton: !!item.canResume,
      });
      this.customComponents.push(components);
      this.addPage({ embeds: [embed], components });
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

  async resolvePage(response, targetUser, index) {
    const resolved = await super.resolvePage(response, targetUser, index);

    const pageComponents = this.customComponents[index];
    if (pageComponents?.length > 0) {
      const existingCustomIds =
        resolved.components
          ?.flatMap((row) => row.components ?? [])
          ?.map((c) => c.custom_id) ?? [];

      const newComponents = pageComponents.filter((row) =>
        row.components.every((c) => !existingCustomIds.includes(c.custom_id)),
      );

      if (newComponents.length > 0) {
        resolved.components = [
          ...(resolved.components ?? []),
          ...newComponents,
        ];
      }
    }

    return resolved;
  }

  formatHoldStatusShort(item) {
    if (item.holdStatus === "READY_FOR_PICKUP") {
      if (item.materialType === "DIGITAL") {
        return "Ready to checkout on Libby";
      }
      return `Ready at ${item.pickupLocation}`;
    } else if (item.holdStatus === "IN_TRANSIT") {
      return `In transit to ${item.pickupLocation}`;
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
