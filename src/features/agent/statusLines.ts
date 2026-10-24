/**
 * The short line said aloud while a voice question is still working (#370), in
 * the person's language. Pure mapping: a step kind plus a language gives a line.
 */
export type StatusKind = "trains" | "walk" | "roads" | "place" | "restroom" | "weather" | "elevators" | "map" | "wait";
export type StatusLang = "en" | "es" | "zh" | "ru" | "bn" | "ht" | "fr" | "ko";

/** Which kind of line each tool gets; unknown tools get "wait". */
const KIND: Record<string, StatusKind> = {
  transit_plan: "trains",
  route_walk: "walk",
  drive_plan: "roads",
  geocode: "place",
  nearest_restroom: "restroom",
  weather_forecast: "weather",
  hazards: "weather",
  elevator_status: "elevators",
  flyTo: "map",
  showRoute: "map",
  openPanel: "map",
  enterStreetView: "map",
  playFlythrough: "map",
  setTime: "map",
};

export const statusKind = (tool: string | undefined): StatusKind => (tool && KIND[tool]) || "wait";

const LINES: Record<StatusLang, Record<StatusKind, string>> = {
  en: { trains: "Checking the trains", walk: "Working out the walk", roads: "Checking the roads", place: "Finding the place", restroom: "Looking for restrooms nearby", weather: "Checking the weather", elevators: "Checking the elevators", map: "Getting the map ready", wait: "One moment, I'm working on it" },
  es: { trains: "Estoy revisando los trenes", walk: "Estoy calculando la caminata", roads: "Estoy revisando las carreteras", place: "Estoy buscando el lugar", restroom: "Estoy buscando baños cercanos", weather: "Estoy revisando el clima", elevators: "Estoy revisando los ascensores", map: "Estoy preparando el mapa", wait: "Un momento, estoy en ello" },
  zh: { trains: "正在查询列车", walk: "正在规划步行路线", roads: "正在查看路况", place: "正在查找地点", restroom: "正在查找附近的洗手间", weather: "正在查看天气", elevators: "正在查看电梯状况", map: "正在准备地图", wait: "请稍等，我正在处理" },
  ru: { trains: "Проверяю поезда", walk: "Прокладываю пешеходный маршрут", roads: "Проверяю дороги", place: "Ищу это место", restroom: "Ищу туалеты поблизости", weather: "Проверяю погоду", elevators: "Проверяю лифты", map: "Готовлю карту", wait: "Минутку, я работаю над этим" },
  bn: { trains: "ট্রেনের খবর দেখছি", walk: "হাঁটার পথ ঠিক করছি", roads: "রাস্তার অবস্থা দেখছি", place: "জায়গাটি খুঁজছি", restroom: "কাছাকাছি টয়লেট খুঁজছি", weather: "আবহাওয়া দেখছি", elevators: "লিফটের অবস্থা দেখছি", map: "মানচিত্র তৈরি করছি", wait: "এক মুহূর্ত, কাজ করছি" },
  ht: { trains: "M ap tcheke tren yo", walk: "M ap kalkile wout a pye a", roads: "M ap tcheke wout yo", place: "M ap chèche kote a", restroom: "M ap chèche twalèt toupre a", weather: "M ap tcheke tan an", elevators: "M ap tcheke asansè yo", map: "M ap prepare kat la", wait: "Yon ti moman, m ap travay sou li" },
  fr: { trains: "Je vérifie les trains", walk: "Je calcule l'itinéraire à pied", roads: "Je vérifie les routes", place: "Je cherche le lieu", restroom: "Je cherche des toilettes à proximité", weather: "Je vérifie la météo", elevators: "Je vérifie les ascenseurs", map: "Je prépare la carte", wait: "Un instant, je m'en occupe" },
  ko: { trains: "열차 운행을 확인하고 있어요", walk: "도보 경로를 찾고 있어요", roads: "도로 상황을 확인하고 있어요", place: "장소를 찾고 있어요", restroom: "근처 화장실을 찾고 있어요", weather: "날씨를 확인하고 있어요", elevators: "엘리베이터 상태를 확인하고 있어요", map: "지도를 준비하고 있어요", wait: "잠시만요, 처리하고 있어요" },
};

const SUPPORTED = new Set<string>(Object.keys(LINES));

/** Base language of a BCP 47 tag when we have lines for it ("es-US" → "es"), else null. */
function baseOf(tag: string | undefined): StatusLang | null {
  const b = tag?.split("-")[0].toLowerCase();
  return b && SUPPORTED.has(b) ? (b as StatusLang) : null;
}

/**
 * The language to speak in: the message's script when it is unambiguous
 * (Chinese, Cyrillic, Bengali, Hangul, or Spanish ¿¡ñ), else the browser
 * language, else English. Latin-script French and Haitian Creole follow the browser.
 */
export function statusLang(message: string, browserLang?: string): StatusLang {
  if (/[ㄱ-ㆎ가-힣]/.test(message)) return "ko";
  if (/[一-鿿]/.test(message)) return "zh";
  if (/[Ѐ-ӿ]/.test(message)) return "ru";
  if (/[ঀ-৿]/.test(message)) return "bn";
  const browser = baseOf(browserLang);
  if (/[¿¡ñÑ]/.test(message) && browser !== "es") return "es";
  return browser ?? "en";
}

/** The spoken status line for a step kind, English when the language has none. */
export function localStatus(kind: StatusKind, lang: string): string {
  const l = baseOf(lang) ?? "en";
  return `${LINES[l][kind] ?? LINES.en[kind]}…`;
}

/** A speech-synthesis tag: the browser's own when it is the same language (keeps its region), else the base. */
export const speechTag = (lang: StatusLang, browserLang?: string): string => (baseOf(browserLang) === lang && browserLang ? browserLang : lang);
