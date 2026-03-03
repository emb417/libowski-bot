import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

export class ItemEmbed {
  static createEmbed(item, options = {}) {
    const {
      titlePrefix = "📀 ",
      color = "#0099FF",
      metadataId = null,
      accountId = null,
      branchId = null,
      checkoutId = null,
      holdId = null,
      showAvailability = false,
      showLocation = false,
      showHoldStatus = false,
      showCheckoutStatus = false,
      showRenewButton = false,
      showPlaceHoldButton = false,
      showCancelHoldButton = false,
      showSuspendButton = false,
      showResumeButton = false,
    } = options;

    const fullTitle = `${titlePrefix} ${item.title}${item.subtitle ? `: ${item.subtitle}` : ""} ${item.edition || ""} (${item.format || "Unknown Format"} ${item.publicationYear || "Unknown Year"})`;
    const description = item.description || "No Description.";
    const truncated =
      description.length > 1000
        ? description.substring(0, 597) + "..."
        : description;

    const embed = new EmbedBuilder()
      .setTitle(fullTitle)
      .setDescription(truncated)
      .setColor(color);

    if (item.url) {
      embed.setURL(item.url);
    }

    if (showCheckoutStatus && item.dueDate) {
      const statusText = this.formatCheckoutStatus(item);
      embed.addFields({
        name: "Checkout Status",
        value: statusText,
        inline: true,
      });
    } else if (showHoldStatus && (item.holdStatus || item.holdInfo)) {
      const statusText = this.formatHoldStatus(item);
      embed.addFields({
        name: "Hold Status",
        value: statusText,
        inline: true,
      });
    } else if (showAvailability && item.availability) {
      const availabilityText = this.formatAvailability(item.availability);
      const hasAvailability = availabilityText !== null;

      let fieldValue = hasAvailability ? availabilityText : "Not available.";

      embed.addFields({
        name: "Available At",
        value: fieldValue,
        inline: true,
      });
    }

    if (showLocation && item.location) {
      embed.addFields({
        name: "📍 Not Holdable Now At",
        value: item.location,
        inline: true,
      });
    }

    if (item.totalCopies > 0) {
      embed.addFields({
        name: "Holds",
        value: `${item.heldCopies} holds on ${item.totalCopies} copies`,
        inline: true,
      });
    }

    if (item.image) {
      embed.setThumbnail(item.image);
    }

    if (item.id) {
      embed.setFooter({ text: `ID: ${item.id}` });
    }

    const components = [];
    const rowButtons = [];

    if (showPlaceHoldButton && metadataId) {
      rowButtons.push(
        new ButtonBuilder()
          .setCustomId(`placeHold:${metadataId}`)
          .setLabel("Place Hold")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("📚"),
      );
    }

    if (showCancelHoldButton && metadataId && holdId && accountId) {
      rowButtons.push(
        new ButtonBuilder()
          .setCustomId(`cancelHold:${metadataId}:${holdId}:${accountId}`)
          .setLabel("Cancel Hold")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🗑️"),
      );
    }

    if (showSuspendButton && holdId && accountId) {
      rowButtons.push(
        new ButtonBuilder()
          .setCustomId(`suspendHold:${holdId}:${accountId}`)
          .setLabel("Pause Hold")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("⏸️"),
      );
    }

    if (showResumeButton && holdId && accountId) {
      rowButtons.push(
        new ButtonBuilder()
          .setCustomId(`resumeHold:${holdId}:${accountId}`)
          .setLabel("Resume Hold")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("▶️"),
      );
    }

    if (showRenewButton && checkoutId && accountId) {
      rowButtons.push(
        new ButtonBuilder()
          .setCustomId(`renewCheckout:${checkoutId}:${accountId}`)
          .setLabel("Renew")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🔄"),
      );
    }

    if (rowButtons.length > 0) {
      components.push(new ActionRowBuilder().addComponents(...rowButtons));
    }

    return { embed, components };
  }

  static formatHoldStatus(item) {
    let statusText = "";
    const hold = item.holdInfo || item;

    if (
      hold.status === "READY_FOR_PICKUP" ||
      hold.holdStatus === "READY_FOR_PICKUP"
    ) {
      if (hold.pickupLocation) {
        statusText = `📍 Ready for pickup at:\n${hold.pickupLocation}`;
      } else {
        statusText = `📱 Ready to checkout in Libby.`;
      }
      if (hold.pickupByDate) {
        statusText += `\nPick up by: ${hold.pickupByDate}`;
      }
    } else if (
      hold.status === "IN_TRANSIT" ||
      hold.holdStatus === "IN_TRANSIT"
    ) {
      statusText = `🚚 In transit to:\n${hold.pickupLocation}`;
    } else if (
      hold.status === "NOT_YET_AVAILABLE" ||
      hold.holdStatus === "NOT_YET_AVAILABLE"
    ) {
      statusText = "⏳ Not yet available";
      if (hold.position && hold.position > 0) {
        statusText += `\n#${hold.position} in queue`;
      } else if (hold.holdsPosition && hold.holdsPosition > 0) {
        statusText += `\n#${hold.holdsPosition} in queue`;
      }
      if (hold.pickupLocation) {
        statusText += `\nPickup at: ${hold.pickupLocation}`;
      }
      if (hold.expiryDate) {
        statusText += `\nExpires: ${hold.expiryDate}`;
      }
    } else {
      statusText = hold.status || hold.holdStatus || "Unknown status";
    }

    return statusText;
  }

  static formatAvailability(availability) {
    if (!availability || Object.keys(availability).length === 0) {
      return "Not available.";
    }

    const locations = Object.values(availability)
      .filter((loc) => loc.location && loc.lastAvailableTime)
      .map((loc) => {
        const date = new Date(loc.lastAvailableTime * 1000);
        const now = new Date();
        const hoursDiff = Math.floor((now - date) / (1000 * 60 * 60));

        let timeAgo;
        if (hoursDiff < 1) {
          timeAgo = "just now";
        } else if (hoursDiff < 24) {
          timeAgo = `${hoursDiff}h ago`;
        } else {
          const daysDiff = Math.floor(hoursDiff / 24);
          timeAgo = `${daysDiff}d ago`;
        }

        return `📍 ${loc.location} (${timeAgo})`;
      });

    return locations.length > 0 ? locations.join("\n") : "Not available.";
  }

  static formatCheckoutStatus(item) {
    let statusText = "";

    if (item.dueDate) {
      const dueDate = new Date(item.dueDate);
      const daysUntilDue = Math.ceil(
        (dueDate - new Date()) / (1000 * 60 * 60 * 24),
      );

      if (item.isOverdue) {
        statusText = `⚠️ **OVERDUE** - Due: ${item.dueDate}`;
      } else if (daysUntilDue === 0) {
        statusText = `⏰ Due **today** (${item.dueDate})`;
      } else if (daysUntilDue === 1) {
        statusText = `📅 Due **tomorrow** (${item.dueDate})`;
      } else {
        statusText = `📅 Due in ${daysUntilDue} days (${item.dueDate})`;
      }
    }

    if (item.timesRenewed > 0) {
      statusText += `\nRenewed: ${item.timesRenewed} time${item.timesRenewed > 1 ? "s" : ""}`;
    }

    if (item.branch) {
      statusText += `\nChecked out from: ${item.branch}`;
    }

    if (item.callNumber) {
      statusText += `\nCall number: ${item.callNumber}`;
    }

    if (item.fines > 0) {
      statusText += `\n⚠️ Fines: $${(item.fines / 100).toFixed(2)}`;
    }

    return statusText;
  }
}
