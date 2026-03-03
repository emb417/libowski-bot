import {
  extractScriptData,
  HEADERS_HTML,
  HEADERS_JSON,
} from "./LibraryApiService.js";

import logger from "../utils/logger.js";

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
