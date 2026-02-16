import { PaginatedMessage } from "@sapphire/discord.js-utilities";
import { VideoEmbed } from "./VideoEmbed.js";

export class VideoPaginatedMessage extends PaginatedMessage {
  constructor(items, options = {}) {
    super();

    const {
      titlePrefix = "📀 ",
      color = "#0099FF",
      showAvailability = false,
      showLocation = false,
    } = options;

    const selectMenuOptions = [];

    for (const item of items) {
      if (!item.title) continue;

      const fullTitle = `${titlePrefix} ${item.title} ${item.subtitle || ""} (${item.format || "Unknown Format"} ${item.publicationYear || "Unknown Year"})`;
      const label = fullTitle.substring(0, 100);

      let description = "";

      if (showAvailability && item.availability) {
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

      const embed = VideoEmbed.createEmbed(item, {
        titlePrefix,
        color,
        showAvailability,
        showLocation,
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
}
