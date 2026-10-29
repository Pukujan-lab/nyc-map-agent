import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

/**
 * MapLibre 6 ships its tile worker as a separate file and looks for it next to
 * its own module. Bundled, that guess points at a file Vite never emitted, so
 * the worker is emitted as an asset here and its URL handed over before any map
 * is created. Imported for its side effect by MapView and StreetMiniMap.
 */
setWorkerUrl(workerUrl);
