import { HEADERS_JSON } from "./LibraryApiService.js";

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
