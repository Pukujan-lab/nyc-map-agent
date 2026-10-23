/**
 * Recognizable places across the five boroughs, so a zoomed-out map still
 * says where you are. These are orientation landmarks, not the Landmarks
 * Preservation Commission list. The four ids that match the hero models
 * (empire-state, chrysler, one-wtc, liberty) open the same picture.
 * Photos and the short text come from the Wikipedia summary for `wiki`.
 */
export interface CityLandmark {
  id: string;
  name: string;
  borough: "Manhattan" | "Brooklyn" | "Queens" | "Bronx" | "Staten Island";
  lon: number;
  lat: number;
  /** English Wikipedia title, underscores, used by the summary API. */
  wiki: string;
}

export const CITY_LANDMARKS: CityLandmark[] = [
  { id: "empire-state", name: "Empire State Building", borough: "Manhattan", lon: -73.98566, lat: 40.74844, wiki: "Empire_State_Building" },
  { id: "chrysler", name: "Chrysler Building", borough: "Manhattan", lon: -73.97545, lat: 40.75162, wiki: "Chrysler_Building" },
  { id: "one-wtc", name: "One World Trade Center", borough: "Manhattan", lon: -74.01338, lat: 40.71299, wiki: "One_World_Trade_Center" },
  { id: "liberty", name: "Statue of Liberty", borough: "Manhattan", lon: -74.04452, lat: 40.68925, wiki: "Statue_of_Liberty" },
  { id: "flatiron", name: "Flatiron Building", borough: "Manhattan", lon: -73.98964, lat: 40.74106, wiki: "Flatiron_Building" },
  { id: "woolworth", name: "Woolworth Building", borough: "Manhattan", lon: -74.00828, lat: 40.71244, wiki: "Woolworth_Building" },
  { id: "rockefeller", name: "30 Rockefeller Plaza", borough: "Manhattan", lon: -73.97867, lat: 40.75874, wiki: "30_Rockefeller_Plaza" },
  { id: "grand-central", name: "Grand Central", borough: "Manhattan", lon: -73.97723, lat: 40.75273, wiki: "Grand_Central_Terminal" },
  { id: "met", name: "The Met", borough: "Manhattan", lon: -73.96324, lat: 40.77944, wiki: "Metropolitan_Museum_of_Art" },
  { id: "nypl", name: "New York Public Library", borough: "Manhattan", lon: -73.98225, lat: 40.75318, wiki: "New_York_Public_Library_Main_Branch" },
  { id: "washington-arch", name: "Washington Square Arch", borough: "Manhattan", lon: -73.99733, lat: 40.73122, wiki: "Washington_Square_Arch" },
  { id: "city-hall", name: "City Hall", borough: "Manhattan", lon: -74.00602, lat: 40.71278, wiki: "New_York_City_Hall" },
  { id: "msg", name: "Madison Square Garden", borough: "Manhattan", lon: -73.99345, lat: 40.75050, wiki: "Madison_Square_Garden" },
  { id: "apollo", name: "Apollo Theater", borough: "Manhattan", lon: -73.95005, lat: 40.81002, wiki: "Apollo_Theater" },
  { id: "st-patricks", name: "St. Patrick's Cathedral", borough: "Manhattan", lon: -73.97601, lat: 40.75847, wiki: "St._Patrick's_Cathedral_(Manhattan)" },
  { id: "brooklyn-bridge", name: "Brooklyn Bridge", borough: "Brooklyn", lon: -73.99686, lat: 40.70609, wiki: "Brooklyn_Bridge" },
  { id: "barclays", name: "Barclays Center", borough: "Brooklyn", lon: -73.97537, lat: 40.68265, wiki: "Barclays_Center" },
  { id: "brooklyn-museum", name: "Brooklyn Museum", borough: "Brooklyn", lon: -73.96363, lat: 40.67121, wiki: "Brooklyn_Museum" },
  { id: "williamsburgh-tower", name: "Williamsburgh Savings Bank Tower", borough: "Brooklyn", lon: -73.97814, lat: 40.68566, wiki: "Williamsburgh_Savings_Bank_Tower" },
  { id: "grand-army", name: "Grand Army Plaza", borough: "Brooklyn", lon: -73.96980, lat: 40.67280, wiki: "Grand_Army_Plaza_(Brooklyn)" },
  { id: "wonder-wheel", name: "Wonder Wheel", borough: "Brooklyn", lon: -73.97876, lat: 40.57468, wiki: "Wonder_Wheel" },
  { id: "parachute-jump", name: "Parachute Jump", borough: "Brooklyn", lon: -73.98421, lat: 40.57331, wiki: "Parachute_Jump" },
  { id: "brooklyn-hall", name: "Brooklyn Borough Hall", borough: "Brooklyn", lon: -73.99021, lat: 40.69252, wiki: "Brooklyn_Borough_Hall" },
  { id: "kings-theatre", name: "Kings Theatre", borough: "Brooklyn", lon: -73.95755, lat: 40.64615, wiki: "Kings_Theatre_(Brooklyn)" },
  { id: "unisphere", name: "Unisphere", borough: "Queens", lon: -73.84503, lat: 40.74640, wiki: "Unisphere" },
  { id: "citi-field", name: "Citi Field", borough: "Queens", lon: -73.84582, lat: 40.75709, wiki: "Citi_Field" },
  { id: "arthur-ashe", name: "Arthur Ashe Stadium", borough: "Queens", lon: -73.84690, lat: 40.74990, wiki: "Arthur_Ashe_Stadium" },
  { id: "twa", name: "TWA Hotel", borough: "Queens", lon: -73.77840, lat: 40.64470, wiki: "TWA_Flight_Center" },
  { id: "moma-ps1", name: "MoMA PS1", borough: "Queens", lon: -73.94722, lat: 40.74549, wiki: "MoMA_PS1" },
  { id: "queens-museum", name: "Queens Museum", borough: "Queens", lon: -73.84670, lat: 40.74570, wiki: "Queens_Museum" },
  { id: "state-pavilion", name: "New York State Pavilion", borough: "Queens", lon: -73.84480, lat: 40.74440, wiki: "New_York_State_Pavilion" },
  { id: "king-manor", name: "King Manor", borough: "Queens", lon: -73.80340, lat: 40.70360, wiki: "King_Manor" },
  { id: "yankee", name: "Yankee Stadium", borough: "Bronx", lon: -73.92618, lat: 40.82964, wiki: "Yankee_Stadium" },
  { id: "bronx-zoo", name: "Bronx Zoo", borough: "Bronx", lon: -73.87750, lat: 40.85060, wiki: "Bronx_Zoo" },
  { id: "nybg", name: "New York Botanical Garden", borough: "Bronx", lon: -73.88030, lat: 40.86230, wiki: "New_York_Botanical_Garden" },
  { id: "bronx-courthouse", name: "Bronx County Courthouse", borough: "Bronx", lon: -73.92320, lat: 40.82630, wiki: "Bronx_County_Courthouse" },
  { id: "poe-cottage", name: "Edgar Allan Poe Cottage", borough: "Bronx", lon: -73.89420, lat: 40.86510, wiki: "Edgar_Allan_Poe_Cottage" },
  { id: "kingsbridge-armory", name: "Kingsbridge Armory", borough: "Bronx", lon: -73.89770, lat: 40.86810, wiki: "Kingsbridge_Armory" },
  { id: "wave-hill", name: "Wave Hill", borough: "Bronx", lon: -73.91240, lat: 40.89770, wiki: "Wave_Hill" },
  { id: "woodlawn", name: "Woodlawn Cemetery", borough: "Bronx", lon: -73.87270, lat: 40.88900, wiki: "Woodlawn_Cemetery_(Bronx)" },
  { id: "si-hall", name: "Staten Island Borough Hall", borough: "Staten Island", lon: -74.07640, lat: 40.64230, wiki: "Staten_Island_Borough_Hall" },
  { id: "snug-harbor", name: "Snug Harbor", borough: "Staten Island", lon: -74.10180, lat: 40.64320, wiki: "Snug_Harbor_Cultural_Center_and_Botanical_Garden" },
  { id: "st-george", name: "St. George Ferry Terminal", borough: "Staten Island", lon: -74.07260, lat: 40.64370, wiki: "St._George_Terminal" },
  { id: "alice-austen", name: "Alice Austen House", borough: "Staten Island", lon: -74.06340, lat: 40.61520, wiki: "Alice_Austen_House" },
  { id: "richmond-town", name: "Historic Richmond Town", borough: "Staten Island", lon: -74.14550, lat: 40.57040, wiki: "Historic_Richmond_Town" },
  { id: "fort-wadsworth", name: "Fort Wadsworth", borough: "Staten Island", lon: -74.05470, lat: 40.60540, wiki: "Fort_Wadsworth" },
  { id: "conference-house", name: "Conference House", borough: "Staten Island", lon: -74.25180, lat: 40.50290, wiki: "Conference_House" },
];

const BY_ID = new Map(CITY_LANDMARKS.map((m) => [m.id, m]));

export function cityLandmarkById(id: string): CityLandmark | undefined {
  return BY_ID.get(id);
}

export function landmarkCollection(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: CITY_LANDMARKS.map((m) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [m.lon, m.lat] },
      properties: { id: m.id, name: m.name, borough: m.borough },
    })),
  };
}

/** Wikipedia summary for one landmark. The browser follows redirects. */
export function wikiSummaryUrl(wiki: string): string {
  return `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wiki)}`;
}

export interface WikiSummary {
  extract?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}
