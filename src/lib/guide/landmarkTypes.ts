/** Shapes of the generated guide landmark list (src/lib/guide/landmarks.json). */

export type GuideBorough = "Manhattan" | "Brooklyn" | "Queens" | "Bronx" | "Staten Island";

/** Short kind, also the map icon. */
export type GuideCategory =
  | "bridge"
  | "tower"
  | "station"
  | "monument"
  | "venue"
  | "museum"
  | "store"
  | "square"
  | "park"
  | "worship"
  | "civic";

/** A Wikimedia Commons picture with the licence metadata needed to show it. */
export interface GuidePicture {
  /** Commons file name, spaces not underscores. */
  file: string;
  /** 320 px wide thumbnail via Special:FilePath. */
  url: string;
  /** Commons file page: full size, author, licence. */
  page: string;
  /** Commons LicenseShortName, e.g. "CC BY-SA 4.0" or "Public domain". */
  license: string;
  /** Author credit, HTML stripped. */
  artist: string;
  licenseUrl?: string;
}

export interface GuideLandmark {
  /** Wikidata QID. */
  id: string;
  name: string;
  category: GuideCategory;
  borough: GuideBorough;
  lon: number;
  lat: number;
  /** 1 = shown citywide, 2 = from mid zoom, 3 = neighbourhood zoom only. */
  tier: 1 | 2 | 3;
  /** Wikipedia language editions: how well known the place is. */
  sitelinks: number;
  picture?: GuidePicture;
}

export interface GuideLandmarkFile {
  source: string;
  license: string;
  pictures: string;
  generated: string;
  landmarks: GuideLandmark[];
}
