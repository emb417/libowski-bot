import { EmbedBuilder } from "discord.js";

export class VideoEmbed {
  static createEmbed(item, options = {}) {
    const {
      titlePrefix = "📀 ",
      color = "#0099FF",
      showAvailability = false,
      showLocation = false,
    } = options;

    const fullTitle = `${titlePrefix} ${item.title}${item.subtitle ? ` ${item.subtitle}` : ""} (${item.format || "Unknown Format"} ${item.publicationYear || "Unknown Year"})`;

    const embed = new EmbedBuilder()
      .setTitle(fullTitle)
      .setDescription(item.description || "No description available.")
      .setColor(color);

    if (item.url) {
      embed.setURL(item.url);
    }

    if (showAvailability && item.availability) {
      const availabilityText = this.formatAvailability(item.availability);
      embed.addFields({
        name: "Available At",
        value: availabilityText,
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
