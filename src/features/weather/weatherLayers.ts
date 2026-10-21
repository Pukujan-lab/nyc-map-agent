import type { CustomLayerInterface, Map as MapLibreMap } from "maplibre-gl";
import { getAmbient, setAmbient, subscribeAmbient, type WeatherKind } from "@/lib/ambient";

/**
 * Live weather: polls /api/weather for the map centre (server caches ~10 min
 * per ~5 km cell), publishes the condition to the shared ambient store (the
 * daylight feature blends sky, light and ground with it) and draws rain or
 * snow as a tiny raw-WebGL particle layer. Eco mode and Weather "Off" skip
 * the particles.
 */
const LAYER = "weather-particles";
const POLL_MS = 10 * 60_000;

interface Live {
  kind: WeatherKind;
  tempC: number | null;
}

export function mount(map: MapLibreMap): () => void {
  let live: Live = { kind: "clear", tempC: null };
  let cell = "";
  const forced = new URLSearchParams(location.search).get("weather") as WeatherKind | null;

  const publish = () => {
    const { weatherMode } = getAmbient();
    const kind = forced ?? (weatherMode === "live" ? live.kind : "clear");
    setAmbient({ weather: kind, tempC: weatherMode === "live" ? live.tempC : null });
    syncParticles();
  };

  const poll = async (force = false) => {
    const { lng, lat } = map.getCenter();
    const next = `${(lat * 20) | 0},${(lng * 20) | 0}`;
    if (!force && next === cell) return;
    cell = next;
    try {
      const q = new URLSearchParams({ lat: lat.toFixed(3), lon: lng.toFixed(3) });
      const res = await fetch(`/api/weather?${q}`);
      if (res.ok) live = (await res.json()) as Live;
    } catch {
      /* keep the last condition */
    }
    publish();
  };

  const syncParticles = () => {
    const { weather, eco, weatherMode } = getAmbient();
    const want = (weather === "rain" || weather === "snow") && !eco && weatherMode !== "off";
    if (want && !map.getLayer(LAYER)) map.addLayer(particles());
    if (!want && map.getLayer(LAYER)) map.removeLayer(LAYER);
  };

  void poll(true);
  const onMove = () => void poll();
  map.on("moveend", onMove);
  const timer = window.setInterval(() => void poll(true), POLL_MS);
  let last = getAmbient();
  const unsub = subscribeAmbient(() => {
    const a = getAmbient();
    if (a.weatherMode !== last.weatherMode) publish();
    else if (a.eco !== last.eco || a.weather !== last.weather) syncParticles();
    last = a;
  });
  return () => {
    unsub();
    window.clearInterval(timer);
    map.off("moveend", onMove);
    if (map.getLayer(LAYER)) map.removeLayer(LAYER);
    setAmbient({ weather: "clear", tempC: null });
  };
}

const VS = `
attribute vec3 seed; attribute float tip;
uniform float t; uniform float snow; uniform float aspect;
void main() {
  float speed = mix(1.1, 0.12, snow) * (0.7 + 0.6 * seed.z);
  float y = fract(seed.y - t * speed);
  float x = fract(seed.x + t * mix(0.08, 0.02, snow) + snow * 0.015 * sin(t * 2.0 + seed.z * 20.0));
  y += tip * mix(0.035, 0.0, snow);
  x += tip * 0.004;
  gl_Position = vec4(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 2.0 + 2.5 * seed.z;
}`;
const FS = `
precision highp float; uniform float snow;
void main() { gl_FragColor = mix(vec4(0.75, 0.8, 0.9, 0.35), vec4(1.0, 1.0, 1.0, 0.85), snow); }`;

/** Screen-space streaks (rain, GL_LINES) or flakes (snow, GL_POINTS): one buffer, one draw. */
function particles(): CustomLayerInterface {
  const N = 1400;
  let prog: WebGLProgram | null = null;
  let buf: WebGLBuffer | null = null;
  let map: MapLibreMap;
  const start = performance.now();
  return {
    id: LAYER,
    type: "custom",
    renderingMode: "2d",
    onAdd(m, gl: WebGLRenderingContext) {
      map = m;
      const sh = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      };
      prog = gl.createProgram()!;
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      const data = new Float32Array(N * 2 * 4);
      for (let i = 0; i < N; i++) {
        const s = [Math.random(), Math.random(), Math.random()];
        data.set([...s, 0, ...s, 1], i * 8);
      }
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    },
    onRemove(_m, gl: WebGLRenderingContext) {
      if (buf) gl.deleteBuffer(buf);
      if (prog) gl.deleteProgram(prog);
    },
    render(gl: WebGLRenderingContext) {
      if (!prog || !buf) return;
      const snow = getAmbient().weather === "snow" ? 1 : 0;
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const seed = gl.getAttribLocation(prog, "seed");
      const tip = gl.getAttribLocation(prog, "tip");
      gl.enableVertexAttribArray(seed);
      gl.vertexAttribPointer(seed, 3, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(tip);
      gl.vertexAttribPointer(tip, 1, gl.FLOAT, false, 16, 12);
      gl.uniform1f(gl.getUniformLocation(prog, "t"), (performance.now() - start) / 1000);
      gl.uniform1f(gl.getUniformLocation(prog, "snow"), snow);
      gl.uniform1f(gl.getUniformLocation(prog, "aspect"), gl.drawingBufferWidth / gl.drawingBufferHeight);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      if (snow) gl.drawArrays(gl.POINTS, 0, N * 2);
      else gl.drawArrays(gl.LINES, 0, N * 2);
      gl.disableVertexAttribArray(seed);
      gl.disableVertexAttribArray(tip);
      map.triggerRepaint();
    },
  };
}
