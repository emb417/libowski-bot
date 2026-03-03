import { extractScriptData, HEADERS_HTML } from "./LibraryApiService.js";
import logger from "../utils/logger.js";

async function getAccountAndBranch(sessionCookies) {
  const url =
    "https://wccls.bibliocommons.com/v2/search?custom_edit=false&searchType=bl&suppress=true";
  const headers = { ...HEADERS_HTML, Cookie: sessionCookies };
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  const html = await response.text();
  const libraryData = extractScriptData(html);

  const accountId = Object.keys(libraryData.entities?.accounts ?? {})[0];
  const branchId =
    libraryData.entities?.accounts?.[accountId]?.singleClickHoldsSettings
      ?.branchId;

  return { accountId, branchId };
}
export async function loginToLibrary(cardNumber, pin, enhanced = false) {
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
    let accountId = null;
    let branchId = null;

    if (enhanced) {
      const accountAndBranch = await getAccountAndBranch(sessionCookies);
      accountId = accountAndBranch.accountId;
      branchId = accountAndBranch.branchId;
    }

    logger.info(
      `Successfully used card ${cardNumber} to log in to the library.`,
    );
    return { sessionCookies, accountId, branchId };
  } catch (error) {
    logger.error({ err: error }, "Failed to login to library");
    throw error;
  }
}
