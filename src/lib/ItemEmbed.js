import { EmbedBuilder } from "discord.js";

export class ItemEmbed {
  static createEmbed(item, options = {}) {
    const {
      titlePrefix = "📀 ",
      color = "#0099FF",
      showAvailability = false,
      showLocation = false,
      showReserveLink = false,
      showHoldStatus = false, // Add new option
    } = options;

    const fullTitle = `${titlePrefix} ${item.title}${item.subtitle ? ` ${item.subtitle}` : ""} (${item.format || "Unknown Format"} ${item.publicationYear || "Unknown Year"})`;

    const embed = new EmbedBuilder()
      .setTitle(fullTitle)
      .setDescription(item.description || "No description available.")
      .setColor(color);

    if (item.url) {
      embed.setURL(item.url);
    }

    // Show hold status instead of availability for holds
    if (showHoldStatus && item.holdStatus) {
      const statusText = this.formatHoldStatus(item);
      embed.addFields({
        name: "Hold Status",
        value: statusText,
        inline: false,
      });
    } else if (showAvailability && item.availability) {
      const availabilityText = this.formatAvailability(item.availability);
      const hasAvailability = availabilityText !== null;

      let fieldValue = hasAvailability ? availabilityText : "Not available.";

      // Add reserve link if requested and we have a URL
      if (showReserveLink && item.url) {
        fieldValue += `\n\n[Reserve or check other locations](${item.url})`;
      }

      embed.addFields({
        name: "Available At",
        value: fieldValue,
        inline: false,
      });
    }

    if (showLocation && item.location) {
      embed.addFields({
        name: "📍 Location",
        value: item.location,
        inline: true,
      });
    }

    if (item.image) {
      embed.setThumbnail(item.image);
    }

    if (item.id) {
      embed.setFooter({ text: `ID: ${item.id}` });
    }

    return embed;
  }

  static formatHoldStatus(item) {
    let statusText = "";

    if (item.holdStatus === "READY_FOR_PICKUP") {
      statusText = `✅ Ready for pickup at ${item.pickupLocation}`;
      if (item.pickupByDate) {
        statusText += `\nPick up by: ${item.pickupByDate}`;
      }
    } else if (item.holdStatus === "NOT_YET_AVAILABLE") {
      statusText = "⏳ Not yet available";
      if (item.holdsPosition && item.holdsPosition > 0) {
        statusText += `\nPosition in queue: #${item.holdsPosition}`;
      }
      if (item.pickupLocation) {
        statusText += `\nPickup location: ${item.pickupLocation}`;
      }
    } else {
      statusText = item.holdStatus || "Unknown status";
    }

    if (item.expiryDate) {
      statusText += `\nExpires: ${item.expiryDate}`;
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

    return locations.length > 0 ? locations.join("\n") : "Not available."; // Changed from "Location information not available"
  }
}
