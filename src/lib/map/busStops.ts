/**
 * Basemap bus-stop icons live on the style's poi_transit layer (class "bus").
 * Shown: icons from zoom 15, names from zoom 17. Hidden: nothing at any zoom.
 * Subway and rail icons on that same layer stay.
 */
export function busStopIconOpacity(show: boolean): number | unknown[] {
  if (!show) return 0;
  return ["step", ["zoom"], ["case", ["==", ["get", "class"], "bus"], 0, 1], 15, 1];
}

export function busStopTextOpacity(show: boolean): number | unknown[] {
  if (!show) return 0;
  return ["step", ["zoom"], ["case", ["==", ["get", "class"], "bus"], 0, 1], 17, 1];
}
