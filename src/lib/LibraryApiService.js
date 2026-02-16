import { load as cheerioLoad } from "cheerio";
import logger from "../utils/logger.js";

const scriptValue = `script[type="application/json"][data-iso-key="_0"]`;
const searchUrl = "https://wccls.bibliocommons.com/v2/search";

export async function fetchLibraryData(type) {
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

  const response = await fetch(`${searchUrl}?${config.queryString}`);
  const data = await response.text();
  const $ = cheerioLoad(data);
  const script = $(scriptValue).text();

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

  const queryString = `query=${encodedQuery}&searchType=keyword&${formatQuery}`;

  const response = await fetch(`${searchUrl}?${queryString}`);
  const data = await response.text();
  const $ = cheerioLoad(data);
  const script = $(scriptValue).text();

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
  const url = "https://wccls.bibliocommons.com/user/login";
  try {
    // First, get the login page to extract CSRF token
    const loginPageResponse = await fetch(url);
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
    const loginResponse = await fetch(url, {
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
  const url = "https://wccls.bibliocommons.com/v2/holds";
  try {
    const response = await fetch(url, {
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

export async function fetchCheckedOut(sessionCookies) {
  const url = "https://wccls.bibliocommons.com/v2/checkedout/out";

  try {
    const response = await fetch(url, {
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Cookie: sessionCookies,
      },
    });

    if (!response.ok) {
      logger.error(
        `[LibraryAPI] Failed to fetch checked out items: ${response.status}`,
      );
      return null;
    }

    const html = await response.text();

    // Extract JSON data from script tag
    const scriptMatch = html.match(
      /<script type="application\/json" data-iso-key="_0">([\s\S]*?)<\/script>/,
    );

    if (!scriptMatch) {
      logger.error("[LibraryAPI] Could not find checkout data in response");
      return null;
    }

    const jsonData = JSON.parse(scriptMatch[1]);
    const checkouts = jsonData.entities?.checkouts || {};
    const bibs = jsonData.entities?.bibs || {};

    // Transform checkout data
    const checkedOutItems = Object.values(checkouts).map((checkout) => {
      const bib = bibs[checkout.metadataId];
      const briefInfo = bib?.briefInfo || {};

      // Determine if item is overdue
      const dueDate = checkout.dueDate ? new Date(checkout.dueDate) : null;
      const isOverdue = dueDate && dueDate < new Date();

      // Get jacket image
      const jacket = briefInfo.jacket || {};
      const image = jacket.large || jacket.medium || jacket.small || null;

      return {
        id: checkout.checkoutId,
        title: briefInfo.title || "Unknown Title",
        subtitle: briefInfo.subtitle || "",
        format: briefInfo.format || "Unknown Format",
        publicationYear: briefInfo.publicationDate || "",
        description: briefInfo.description || "No description available.",
        image: image,
        url: `https://wccls.bibliocommons.com/v2/record/${checkout.metadataId}`,
        type: "checkout",
        dueDate: checkout.dueDate,
        isOverdue: isOverdue,
        timesRenewed: checkout.timesRenewed || 0,
        branch: checkout.branch?.name || null,
        callNumber: checkout.callNumber || null,
        barcode: checkout.barcode || null,
        materialType: checkout.materialType || null,
        fines: checkout.fines || 0,
        actions: checkout.actions || [],
      };
    });

    logger.debug(
      `[LibraryAPI] Found ${checkedOutItems.length} checked out items`,
    );
    return checkedOutItems;
  } catch (error) {
    logger.error("[LibraryAPI] Error fetching checked out items:", error);
    return null;
  }
}
