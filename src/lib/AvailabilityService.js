import logger from "../utils/logger.js";
import { getUserBranches } from "./database.js";

export const ALL_LOCATIONS = [
  { code: "42", name: "Aloha Community Library" },
  { code: "7", name: "Banks Public Library" },
  { code: "9", name: "Beaverton City Library" },
  { code: "39", name: "Beaverton Murray Scholls" },
  { code: "34", name: "Bethany Library" },
  { code: "11", name: "Cedar Mill Library" },
  { code: "13", name: "Cornelius Public Library" },
  { code: "15", name: "Forest Grove City Library" },
  { code: "17", name: "Garden Home Community Library" },
  { code: "20", name: "Hillsboro Brookwood Library" },
  { code: "19", name: "Hillsboro Shute Park Library" },
  { code: "36", name: "North Plains Public Library" },
  { code: "25", name: "Sherwood Public Library" },
  { code: "29", name: "Tigard Public Library" },
  { code: "31", name: "Tualatin Public Library" },
  { code: "33", name: "West Slope Community Library" },
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
      const availabilitiesData = JSON.parse(data).entities.availabilities;
      const availability = availabilitiesData[item.id];
      const heldCopies = availability?.heldCopies ?? 0;
      const totalCopies = availability?.totalCopies ?? 0;

      const availableForItem = Object.values(bibItemsData)
        .filter((bibItem) => bibItem.availability.status === "AVAILABLE")
        .map((bibItem) => ({
          ...bibItem,
          id: item.id,
          heldCopies,
          totalCopies,
        }));

      logger.debug(
        `${counter}. ${availableForItem.length} of ${Object.values(bibItemsData).length} bibItems for ${item.title}. ${heldCopies}/${totalCopies} held.`,
      );

      availableBibItems.push(...availableForItem);
      counter++;
    } catch (error) {
      logger.error(
        `The Dude failed to parse bibItems for ${item.id}: ${error.message}`,
      );
    }
  }

  return availableBibItems;
}

export function getLocationByName(locationName) {
  return ALL_LOCATIONS.find((location) => location.name === locationName);
}

export function getLocationByCode(locationCode) {
  return ALL_LOCATIONS.find(
    (location) => location.code === String(locationCode),
  );
}

export function getAllLocations() {
  return ALL_LOCATIONS;
}

/**
 * Get a user's preferred branch locations from the DB.
 * Falls back to ALL_LOCATIONS if the user has no preferences set.
 */
export async function getUserLocations(userId) {
  const branches = await getUserBranches(userId);
  if (!branches || branches.length === 0) return ALL_LOCATIONS;
  return branches
    .map((code) => ALL_LOCATIONS.find((loc) => loc.code === String(code)))
    .filter(Boolean);
}
