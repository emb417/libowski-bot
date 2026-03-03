import { extractScriptData, HEADERS_HTML } from "./LibraryApiService.js";
import logger from "../utils/logger.js";

const searchUrl = "https://wccls.bibliocommons.com/v2/search";

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

  return titles;
}

export async function searchMediaAvailability(
  query,
  mediaType = "",
  auth = null,
) {
  logger.info(`Searching for "${query}" with media type "${mediaType}"`);

  const encodedQuery = encodeURIComponent(query);
  let formatQuery = "f_FORMAT=DVD%7CBLURAY%7CDVD_PBLURAY";

  if (mediaType) {
    const encodedMediaType = encodeURIComponent(mediaType.toUpperCase());
    formatQuery = `f_FORMAT=${encodedMediaType}`;
  }

  const queryString = `query=${encodedQuery}&searchType=keyword&${formatQuery}`;

  const url = `${searchUrl}?${queryString}`;
  const headers = auth?.sessionCookies
    ? { ...HEADERS_HTML, Cookie: auth.sessionCookies }
    : { ...HEADERS_HTML };
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  const html = await response.text();
  return extractScriptData(html);
}

export async function searchNotificationItems(type) {
  const AVAILABLE_NOW_CONFIG = {
    type: "available now",
    queryString:
      "custom_edit=false&query=collection%3A%22Best%20Sellers%22%20formatcode%3A(BLURAY%20)&searchType=bl&suppress=true&locked=true&f_STATUS=9%7C39%7C29%7C31&f_NEWLY_ACQUIRED=PAST_180_DAYS",
  };

  const ON_ORDER_CONFIG = {
    type: "on order",
    queryString:
      "query=nw%3A%5B0%20TO%20180%5D&searchType=bl&sort=NEWLY_ACQUIRED&suppress=true&title_key=all_newly_acquired&f_FORMAT=BLURAY&f_ON_ORDER=true&f_NEWLY_ACQUIRED=PAST_7_DAYS",
  };
  const config =
    type === "available now" ? AVAILABLE_NOW_CONFIG : ON_ORDER_CONFIG;

  const url = `${searchUrl}?${config.queryString}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  const html = await response.text();
  return extractScriptData(html);
}
