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

const LOGIN_URL =
  "https://wccls.bibliocommons.com/user/login?destination=https%3A%2F%2Fwccls.bibliocommons.com%2F";
const HOLDS_URL = "https://wccls.bibliocommons.com/v2/holds";

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

/**
 * Login to library website and return session cookies
 */
export async function loginToLibrary(cardNumber, pin) {
  try {
    // First, get the login page to extract CSRF token
    const loginPageResponse = await fetch(LOGIN_URL.split("?")[0]);
    const loginPageHtml = await loginPageResponse.text();

    // Extract CSRF token from the HTML (it's in a meta tag or form)
    const csrfMatch = loginPageHtml.match(
      /name="authenticity_token"[^>]*value="([^"]+)"/,
    );
    const csrfToken = csrfMatch ? csrfMatch[1] : "";

    // Get cookies from the initial request
    const setCookieHeaders = loginPageResponse.headers.getSetCookie();
    const initialCookies = setCookieHeaders
      .map((cookie) => cookie.split(";")[0])
      .join("; ");

    // Prepare login request body
    const loginBody = new URLSearchParams({
      utf8: "✓",
      authenticity_token: csrfToken,
      name: cardNumber,
      user_pin: pin,
      local: "false",
    });

    // Perform login
    const loginResponse = await fetch(LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRF-Token": csrfToken,
        Cookie: initialCookies,
      },
      body: loginBody.toString(),
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed with status: ${loginResponse.status}`);
    }

    // Collect all session cookies
    const loginSetCookies = loginResponse.headers.getSetCookie();
    const sessionCookies = [...setCookieHeaders, ...loginSetCookies]
      .map((cookie) => cookie.split(";")[0])
      .join("; ");

    logger.info("Successfully logged in to library");
    return sessionCookies;
  } catch (error) {
    logger.error({ err: error }, "Failed to login to library");
    throw error;
  }
}

/**
 * Fetch user's holds from library website
 */
/**
 * Fetch user's holds from library website
 */
export async function fetchHolds(sessionCookies) {
  try {
    const response = await fetch(HOLDS_URL, {
      method: "GET",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Cookie: sessionCookies,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch holds: ${response.status}`);
    }

    const html = await response.text();

    // Extract the JSON data from the script tag
    const jsonMatch = html.match(
      /<script type="application\/json" data-iso-key="_0">([\s\S]*?)<\/script>/,
    );

    if (!jsonMatch) {
      logger.error("Could not find holds data in HTML");
      return [];
    }

    const data = JSON.parse(jsonMatch[1]);

    // Extract holds and bibs from the data
    const holds = data.entities?.holds || {};
    const bibs = data.entities?.bibs || {};

    // Transform holds into our format
    const transformedHolds = Object.values(holds).map((hold) => {
      const bib = bibs[hold.metadataId] || {};
      const briefInfo = bib.briefInfo || {};

      return {
        id: hold.metadataId,
        title: briefInfo.title || "Unknown Title",
        subtitle: briefInfo.subtitle || "",
        format: briefInfo.format || "UNKNOWN",
        publicationYear: briefInfo.publicationDate || "",
        description: briefInfo.description || "",
        image:
          briefInfo.jacket?.large ||
          briefInfo.jacket?.medium ||
          briefInfo.jacket?.small ||
          null,
        url: `https://wccls.bibliocommons.com/v2/record/${hold.metadataId}`,
        type: "hold",
        holdStatus: hold.status,
        pickupLocation: hold.pickupLocation?.name || "",
        holdsPosition: hold.holdsPosition,
        expiryDate: hold.expiryDate,
        pickupByDate: hold.pickupByDate,
      };
    });

    logger.info(`Retrieved ${transformedHolds.length} holds from library`);
    return transformedHolds;
  } catch (error) {
    logger.error({ err: error }, "Failed to fetch holds");
    throw error;
  }
}

/**
 * Parse holds from HTML response
 */
function parseHoldsFromHtml(html) {
  const holds = [];

  // Look for the holds data - BiblioCommons often includes JSON data in the page
  // Try to find JSON data embedded in the page
  const jsonMatch = html.match(/var\s+holdsData\s*=\s*(\{[\s\S]*?\});/);

  if (jsonMatch) {
    try {
      const holdsData = JSON.parse(jsonMatch[1]);
      // Transform to our format
      return transformHoldsData(holdsData);
    } catch (e) {
      logger.error({ err: e }, "Failed to parse holds JSON");
    }
  }

  // Fallback: parse HTML structure
  // BiblioCommons uses specific class names for holds
  const titleMatches = html.matchAll(
    /<div[^>]*class="[^"]*cp-bib-title[^"]*"[^>]*>.*?<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/g,
  );
  const formatMatches = html.matchAll(
    /<div[^>]*class="[^"]*cp-format[^"]*"[^>]*>([^<]+)<\/div>/g,
  );

  const titles = Array.from(titleMatches);
  const formats = Array.from(formatMatches);

  for (let i = 0; i < titles.length; i++) {
    const [, url, title] = titles[i];
    const format = formats[i] ? formats[i][1].trim() : "Unknown";

    // Extract ID from URL
    const idMatch = url.match(/\/item\/show\/(\d+)/);
    const id = idMatch ? idMatch[1] : `hold_${i}`;

    holds.push({
      id: `S143C${id}`,
      title: title.trim(),
      subtitle: "",
      format: format.toUpperCase().replace(/\s+/g, "_"),
      url: url.startsWith("http")
        ? url
        : `https://wccls.bibliocommons.com${url}`,
      type: "hold",
    });
  }

  return holds;
}

/**
 * Transform BiblioCommons holds data to our format
 */
function transformHoldsData(holdsData) {
  // This will depend on the actual structure of the JSON data
  // Adjust based on what we find in the actual response
  return (
    holdsData.items?.map((item) => ({
      id: item.id || item.bibId,
      title: item.title,
      subtitle: item.subtitle || "",
      format: item.format || "UNKNOWN",
      publicationYear: item.publicationYear,
      description: item.description || "",
      image: item.coverImage,
      url: item.url || `https://wccls.bibliocommons.com/v2/record/${item.id}`,
      type: "hold",
      holdStatus: item.status,
      pickupLocation: item.pickupLocation,
      position: item.queuePosition,
    })) || []
  );
}
