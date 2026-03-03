import {
  extractScriptData,
  HEADERS_HTML,
  HEADERS_JSON,
} from "./LibraryApiService.js";
import logger from "../utils/logger.js";

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
    const user = Object.values(jsonData.entities?.users ?? {})[0];
    const userName = user?.name;

    // Transform holds into our format
    const transformedHolds = Object.values(holds).map((hold) => {
      const bib = bibs[hold.metadataId] || {};
      const briefInfo = bib.briefInfo || {};
      const bibAvailability = bib.availability || {};

      return {
        id: hold.metadataId,
        holdId: hold.holdsId,
        title: briefInfo.title || "Unknown Title",
        subtitle: briefInfo.subtitle || "",
        edition: briefInfo.edition || "",
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
        materialType: hold.materialType || "",
        holdStatus: hold.status,
        heldCopies: bibAvailability.heldCopies ?? 0,
        totalCopies: bibAvailability.totalCopies ?? 0,
        canCancel: hold.actions?.includes("cancel") ?? false,
        canSuspend: hold.actions?.includes("suspend") ?? false,
        canResume: hold.actions?.includes("activate") ?? false,
        pickupLocation: hold.pickupLocation?.name || "",
        holdsPosition: hold.holdsPosition,
        expiryDate: hold.expiryDate,
        pickupByDate: hold.pickupByDate,
      };
    });

    logger.info(
      `The Dude retrieved ${transformedHolds.length} holds from library for ${userName}.`,
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

export async function suspendHold(sessionCookies, holdId, accountId) {
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);

  const url = `https://gateway.bibliocommons.com/v2/libraries/wccls/holds?locale=en-US`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { ...HEADERS_JSON, Cookie: sessionCookies },
    body: JSON.stringify({
      holdIds: [holdId],
      accountId: Number(accountId),
      suspended: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString().slice(0, 10),
        status: true,
      },
    }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message || "Unknown error suspending hold");
  logger.info(`Successfully suspended hold ${holdId}`);
  return { success: true };
}

export async function resumeHold(sessionCookies, holdId, accountId) {
  const url = `https://gateway.bibliocommons.com/v2/libraries/wccls/holds?locale=en-US`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { ...HEADERS_JSON, Cookie: sessionCookies },
    body: JSON.stringify({
      accountId: Number(accountId),
      holdIds: [holdId],
      suspended: { status: false },
    }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message || "Unknown error resuming hold");
  logger.info(`Successfully resumed hold ${holdId}`);
  return { success: true };
}
