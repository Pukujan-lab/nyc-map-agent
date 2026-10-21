let added = false;
/** Registers the pmtiles:// protocol once; loaded on first use so pmtiles stays out of the main chunk. */
export async function ensurePmtilesProtocol(): Promise<void> {
  if (added) return;
  const [{ default: maplibregl }, { Protocol }] = await Promise.all([import("maplibre-gl"), import("pmtiles")]);
  if (!added) maplibregl.addProtocol("pmtiles", new Protocol().tile);
  added = true;
}
