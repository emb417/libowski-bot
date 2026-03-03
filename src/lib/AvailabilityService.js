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

  const results = [];
  let counter = 1;

  for (const item of items) {
    try {
      const response = await fetch(AVAILABILITY_URL(item.id));
      if (!response.ok) {
        throw new Error(`Failed to fetch availability: ${response.status}`);
      }
      const data = await response.json();
      const bibItemsData = data.entities.bibItems || {};
      const availabilitiesData = data.entities.availabilities || {};
      const availability = availabilitiesData[item.id];
      const heldCopies = availability?.heldCopies ?? 0;
      const totalCopies = availability?.totalCopies ?? 0;

      const availableCopies = Object.values(bibItemsData).filter(
        (bibItem) =>
          bibItem.availability.status === "AVAILABLE" ||
          bibItem.availability.status === "ON_ORDER",
      );

      logger.debug(
        `${counter}. ${availableCopies.length} available copies for ${item.title}. ${heldCopies}/${totalCopies} held.`,
      );

      results.push({
        id: item.id,
        heldCopies,
        totalCopies,
        availableCopies,
      });
      counter++;
    } catch (error) {
      logger.error(
        `The Dude failed to parse bibItems for ${item.id}: ${error.message}`,
      );
      // Still push an entry so callers can find it, even if empty
      results.push({
        id: item.id,
        heldCopies: 0,
        totalCopies: 0,
        availableCopies: [],
      });
    }
  }

  return results;
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
