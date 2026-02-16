import logger from "../utils/logger.js";

const LOCATIONS = [
  { code: 9, name: "Beaverton City Library" },
  { code: 29, name: "Tigard Public Library" },
  { code: 31, name: "Tualatin Public Library" },
  { code: 39, name: "Beaverton Murray Scholls" },
];

const AVAILABILITY_URL = (itemId) =>
  `https://gateway.bibliocommons.com/v2/libraries/wccls/bibs/${itemId}/availability?locale=en-US`;

export async function getAvailableBibItems(items) {
  logger.info(`${items.length} items >> getting detailed availability data...`);

  const availableBibItems = [];
  let counter = 1;

  for (const item of items) {
    try {
      const response = await fetch(AVAILABILITY_URL(item.id));
      const data = await response.text();
      const bibItemsData = JSON.parse(data).entities.bibItems;

      const availableForItem = Object.values(bibItemsData)
        .filter((bibItem) => bibItem.availability.status === "AVAILABLE")
        .map((bibItem) => ({ ...bibItem, id: item.id }));

      logger.debug(
        `${counter}. ${availableForItem.length} of ${
          Object.values(bibItemsData).length
        } bibItems found for ${item.title}.`,
      );

      availableBibItems.push(...availableForItem);
      counter++;
    } catch (error) {
      logger.error(`Failed to parse bibItems for ${item.id}: ${error.message}`);
    }
  }

  return availableBibItems;
}

export function getLocationByName(locationName) {
  return LOCATIONS.find((location) => location.name === locationName);
}

export function getAllLocations() {
  return LOCATIONS;
}
