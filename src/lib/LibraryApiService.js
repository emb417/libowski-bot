import { load as cheerioLoad } from "cheerio";

export const HEADERS_HTML = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export const HEADERS_JSON = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

const scriptValue = `script[type="application/json"][data-iso-key="_0"]`;

export function extractScriptData(html) {
  const $ = cheerioLoad(html);
  const script = $(scriptValue).text();
  if (!script) throw new Error("Could not find data script tag in response");
  try {
    return JSON.parse(script);
  } catch (error) {
    throw new Error(`Failed to parse script data: ${error.message}`);
  }
}
