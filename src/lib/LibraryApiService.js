import { load as cheerioLoad } from "cheerio";
import logger from "../utils/logger.js";

const SEARCH_VIDEO_AVAILABILITY_CONFIG = {
  type: "search video availability",
  fetchUrl:
    "https://wccls.bibliocommons.com/v2/search?query=abbott&searchType=keyword&f_FORMAT=DVD%7CBLURAY%7CDVD_PBLURAY",
  scriptValue: 'script[type="application/json"][data-iso-key="_0"]',
};

const AVAILABLE_NOW_CONFIG = {
  type: "available now",
  fetchUrl:
    "https://wccls.bibliocommons.com/v2/search?custom_edit=false&query=collection%3A%22Best%20Sellers%22%20formatcode%3A(BLURAY%20)&searchType=bl&suppress=true&locked=true&f_STATUS=9%7C39%7C29%7C31&f_NEWLY_ACQUIRED=PAST_180_DAYS",
  scriptValue: 'script[type="application/json"][data-iso-key="_0"]',
};

const ON_ORDER_CONFIG = {
  type: "on order",
  fetchUrl:
    "https://wccls.bibliocommons.com/v2/search?query=nw%3A%5B0%20TO%20180%5D&searchType=bl&sort=NEWLY_ACQUIRED&suppress=true&title_key=all_newly_acquired&f_FORMAT=BLURAY&f_ON_ORDER=true&f_NEWLY_ACQUIRED=PAST_7_DAYS",
  scriptValue: 'script[type="application/json"][data-iso-key="_0"]',
};

export async function fetchLibraryData(type) {
  const config =
    type === "available now" ? AVAILABLE_NOW_CONFIG : ON_ORDER_CONFIG;

  const response = await fetch(config.fetchUrl);
  const data = await response.text();
  const $ = cheerioLoad(data);
  const script = $(config.scriptValue).text();

  let libraryData;
  try {
    libraryData = JSON.parse(script);
  } catch (error) {
    logger.error(`Failed to parse script data: ${error.message}`);
    return [];
  }

  return libraryData;
}

export function transformToTitles(libraryData, type) {
  const titles = [];
  if (!libraryData?.entities?.bibs) return [];

  for (const itemId in libraryData.entities.bibs) {
    const item = libraryData.entities.bibs[itemId];
    titles.push({
      id: item.id,
      type: type,
      title: item.briefInfo.title,
      subtitle: item.briefInfo.subtitle,
      publicationYear: item.briefInfo.publicationDate,
      format: item.briefInfo.format,
      edition: item.briefInfo.edition,
      description: item.briefInfo.description,
      image: item.briefInfo.jacket.large,
      url: `https://wccls.bibliocommons.com/v2/record/${item.id}`,
      updateDate: Math.floor(Date.now() / 1000),
    });
  }

  logger.debug(`${titles.length} ${type} titles transformed.`);
  return titles;
}

export function getConfigForType(type) {
  return type === "available now" ? AVAILABLE_NOW_CONFIG : ON_ORDER_CONFIG;
}

export async function searchMediaAvailability(query, mediaType = "") {
  logger.info(`Searching for "${query}" with media type "${mediaType}"`);

  const encodedQuery = encodeURIComponent(query);
  let formatQuery = "f_FORMAT=DVD%7CBLURAY%7CDVD_PBLURAY"; // Default to video formats

  if (mediaType) {
    const encodedMediaType = encodeURIComponent(mediaType.toUpperCase());
    formatQuery = `f_FORMAT=${encodedMediaType}`;
  }

  const searchUrl = `https://wccls.bibliocommons.com/v2/search?query=${encodedQuery}&searchType=keyword&${formatQuery}`;

  const response = await fetch(searchUrl);
  const data = await response.text();
  const $ = cheerioLoad(data);
  const script = $(SEARCH_VIDEO_AVAILABILITY_CONFIG.scriptValue).text();

  let libraryData;
  try {
    libraryData = JSON.parse(script);
  } catch (error) {
    logger.error(
      `Failed to parse script data for search query "${query}": ${error.message}`,
    );
    return [];
  }

  return libraryData;
}
