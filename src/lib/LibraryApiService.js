import { load as cheerioLoad } from "cheerio";
import logger from "../utils/logger.js";

const HEADERS_HTML = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const HEADERS_JSON = {
  "Content-Type": "application/json",
  Accept: "application/json",
};
const scriptValue = `script[type="application/json"][data-iso-key="_0"]`;
const searchUrl = "https://wccls.bibliocommons.com/v2/search";

function extractScriptData(html) {
  const $ = cheerioLoad(html);
  const script = $(scriptValue).text();
  if (!script) throw new Error("Could not find data script tag in response");
  try {
    return JSON.parse(script);
  } catch (error) {
    throw new Error(`Failed to parse script data: ${error.message}`);
  }
}

export async function fetchHours() {
  const url =
    "https://gateway.bibliocommons.com/v2/libraries/wccls/locations?limit=20";
  const response = await fetch(url, { headers: { ...HEADERS_JSON } });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  const data = await response.json();
  const locations = data.entities?.locations ?? {};
  return Object.values(locations).map(({ id, name, customUrl, hours }) => ({
    id,
    name,
    customUrl,
    hours,
  }));
}

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

  const url = `${searchUrl}?${config.queryString}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  const html = await response.text();
  return extractScriptData(html);
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

export async function fetchHolds(sessionCookies) {
  const url = "https://wccls.bibliocommons.com/v2/holds";
  try {
    const response = await fetch(url, {
      headers: {
        ...HEADERS_HTML,
        Cookie: sessionCookies,
      },
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const html = await response.text();
    const jsonData = extractScriptData(html);

    // Extract holds and bibs from the data
    const holds = jsonData.entities?.holds || {};
    const bibs = jsonData.entities?.bibs || {};
    const accountId = Object.keys(jsonData.entities?.accounts ?? {})[0];

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
          briefInfo.jacket?.small ||
          briefInfo.jacket?.medium ||
          briefInfo.jacket?.large ||
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

    logger.info(
      `The Dude retrieved ${transformedHolds.length} holds from library`,
    );
    return { holds: transformedHolds, accountId };
  } catch (error) {
    logger.error({ err: error }, "Failed to fetch holds");
    throw error;
  }
}

export async function placeHold(
  sessionCookies,
  metadataId,
  accountId,
  branchId,
) {
  const url = `https://gateway.bibliocommons.com/v2/libraries/wccls/holds?locale=en-US`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...HEADERS_JSON,
        Cookie: sessionCookies,
      },
      body: JSON.stringify({
        metadataId,
        accountId: Number(accountId),
        enableSingleClickHolds: false,
        materialType: "PHYSICAL",
        materialParams: {
          branchId,
          expiryDate: null,
          errorMessageLocale: "en-US",
        },
      }),
    });

    const data = await response.json();
    logger.debug(`placeHold response status: ${response.status}`);
    logger.debug(`placeHold response body: ${JSON.stringify(data)}`);

    if (!response.ok) {
      const errorMessage = data.error?.message || "Unknown error placing hold";
      logger.error(`Failed to place hold: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    const holdEntries = Object.values(data.entities?.holds || {});
    if (holdEntries.length === 0) {
      throw new Error("Hold placed but no hold information returned.");
    }

    const hold = holdEntries[0];
    logger.info(
      `Successfully placed hold ${hold.holdsId} for item ${metadataId}`,
    );

    return {
      success: true,
      holdId: hold.holdsId,
      position: hold.holdsPosition,
      title: hold.bibTitle,
      pickupLocation: hold.pickupLocation?.name,
    };
  } catch (error) {
    logger.error({ err: error }, `Error placing hold for item ${metadataId}`);
    throw error;
  }
}

export async function cancelHold(
  sessionCookies,
  metadataId,
  holdId,
  accountId,
) {
  const url = `https://gateway.bibliocommons.com/v2/libraries/wccls/holds?locale=en-US`;

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        ...HEADERS_JSON,
        Cookie: sessionCookies,
      },
      body: JSON.stringify({
        accountId: accountId,
        holdIds: [holdId],
        metadataIds: [metadataId],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage =
        data.error?.message || "Unknown error cancelling hold";
      logger.error(`Failed to cancel hold: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    logger.info(`Successfully cancelled hold ${holdId} for item ${metadataId}`);
    return { success: true };
  } catch (error) {
    logger.error({ err: error }, `Error cancelling hold ${holdId}`);
    throw error;
  }
}

export async function fetchCheckedOut(sessionCookies) {
  const url = "https://wccls.bibliocommons.com/v2/checkedout/out";

  try {
    const response = await fetch(url, {
      headers: {
        ...HEADERS_HTML,
        Cookie: sessionCookies,
      },
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const html = await response.text();
    const jsonData = extractScriptData(html);

    const checkouts = jsonData.entities?.checkouts || {};
    const bibs = jsonData.entities?.bibs || {};
    const accountId = Object.keys(jsonData.entities?.accounts ?? {})[0];

    // Transform checkout data
    const checkedOutItems = Object.values(checkouts).map((checkout) => {
      const bib = bibs[checkout.metadataId];
      const briefInfo = bib?.briefInfo || {};

      // Determine if item is overdue
      const dueDate = checkout.dueDate ? new Date(checkout.dueDate) : null;
      const isOverdue = dueDate && dueDate < new Date();

      // Get jacket image
      const jacket = briefInfo.jacket || {};
      const image = jacket.small || jacket.medium || jacket.large || null;

      return {
        id: checkout.metadataId,
        checkoutId: checkout.checkoutId,
        canRenew: checkout.actions?.includes("renew") ?? false,
        title: briefInfo.title || "Unknown Title",
        subtitle: briefInfo.subtitle || "",
        format: briefInfo.format || "Unknown Format",
        publicationYear: briefInfo.publicationDate || "",
        description: briefInfo.description || "No description available.",
        image,
        url: `https://wccls.bibliocommons.com/v2/record/${checkout.metadataId}`,
        type: "checkout",
        dueDate: checkout.dueDate,
        isOverdue,
        timesRenewed: checkout.timesRenewed || 0,
        branch: checkout.branch?.name || null,
        callNumber: checkout.callNumber || null,
        barcode: checkout.barcode || null,
        materialType: checkout.materialType || null,
        fines: checkout.fines || 0,
        actions: checkout.actions || [],
      };
    });

    logger.info(
      `The Dude retrieved ${checkedOutItems.length} checked out items.`,
    );
    return { items: checkedOutItems, accountId };
  } catch (error) {
    logger.error(
      { err: error },
      "[LibraryAPI] Error fetching checked out items:",
    );
    throw error;
  }
}

export async function renewCheckout(sessionCookies, checkoutId, accountId) {
  const url = `https://gateway.bibliocommons.com/v2/libraries/wccls/checkouts?locale=en-US`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      ...HEADERS_JSON,
      Cookie: sessionCookies,
    },
    body: JSON.stringify({
      accountId: Number(accountId),
      checkoutIds: [checkoutId],
      renew: true,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage =
      data.error?.message || "Unknown error renewing checkout";
    logger.error(`Failed to renew checkout: ${errorMessage}`);
    throw new Error(errorMessage);
  }

  logger.info(`Successfully renewed checkout ${checkoutId}`);
  return { success: true };
}
