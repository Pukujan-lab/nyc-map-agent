import { useSyncExternalStore } from "react";
import { APP_LANGS, readLang, useLangPref, type AppLang } from "@/lib/voice/langPref";

/**
 * The app's own text on the first screens (task buttons, the ask bar, the
 * answer card, the station prompt). A language picked in the menu wins;
 * otherwise the app follows the language the person last asked in, so someone
 * who asks in Chinese sees the buttons in Chinese too; before any question,
 * the browser's language. The asked language is kept on this device only.
 */
const ASKED_KEY = "nma.askedLang";
const SUPPORTED = new Set<string>(APP_LANGS);

/** Base language of a BCP 47 tag when the app has text for it ("es-US" → "es"), else null. */
export function appLangOf(tag: string | null | undefined): AppLang | null {
  const b = tag?.split("-")[0].toLowerCase();
  return b && SUPPORTED.has(b) ? (b as AppLang) : null;
}

let asked: AppLang | null = (() => {
  try { return appLangOf(globalThis.localStorage?.getItem(ASKED_KEY)); } catch { return null; }
})();
const listeners = new Set<() => void>();

/** Record the language of a question (only when it is clear from the text). */
export function setAskedLang(lang: AppLang): void {
  if (lang === asked) return;
  asked = lang;
  try { globalThis.localStorage?.setItem(ASKED_KEY, lang); } catch { /* storage blocked */ }
  for (const l of listeners) l();
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const browser = () => appLangOf(typeof navigator === "undefined" ? undefined : navigator.language);

/** Picked, else asked, else browser, else English. */
export function resolveAppLang(picked: AppLang | null, askedLang: AppLang | null, browserLang: AppLang | null): AppLang {
  return picked ?? askedLang ?? browserLang ?? "en";
}

export function getAppLang(): AppLang {
  return resolveAppLang(readLang(), asked, browser());
}

export function useAppLang(): AppLang {
  const picked = useLangPref();
  const askedLang = useSyncExternalStore(subscribe, () => asked, () => null);
  return resolveAppLang(picked, askedLang, browser());
}

type Key =
  | "restroom" | "myTrain" | "planTrip" | "findExit"
  | "askAnything" | "askFollowUp" | "askLabel" | "more" | "nearby" | "otherOptions" | "agentsWorking"
  | "walkMeThere" | "inStation" | "yes" | "no" | "listening" | "stopListening" | "closeAnswer" | "showAnswer"
  | "changeTo" | "skipped";

const T: Record<AppLang, Record<Key, string>> = {
  en: {
    restroom: "Restroom", myTrain: "My train", planTrip: "Plan trip", findExit: "Find exit",
    askAnything: "Ask anything…", askFollowUp: "Ask a follow-up…", askLabel: "Ask the assistant", more: "More", nearby: "What's nearby", otherOptions: "Other options", agentsWorking: "Agents working",
    walkMeThere: "Walk me there", inStation: "Are you in the station?", yes: "Yes", no: "No", listening: "Listening", stopListening: "Stop listening", closeAnswer: "Close answer", showAnswer: "Show the answer",
    changeTo: "Change to the {r}", skipped: "Skipped",
  },
  es: {
    restroom: "Baño", myTrain: "Mi tren", planTrip: "Planear viaje", findExit: "Buscar salida",
    askAnything: "Pregunta lo que quieras…", askFollowUp: "Haz otra pregunta…", askLabel: "Pregúntale al asistente", more: "Más", nearby: "Qué hay cerca", otherOptions: "Otras opciones", agentsWorking: "Trabajando",
    walkMeThere: "Llévame caminando", inStation: "¿Estás en la estación?", yes: "Sí", no: "No", listening: "Escuchando", stopListening: "Dejar de escuchar", closeAnswer: "Cerrar respuesta", showAnswer: "Ver la respuesta",
    changeTo: "Cambia al {r}", skipped: "No para aquí",
  },
  zh: {
    restroom: "厕所", myTrain: "我的列车", planTrip: "规划行程", findExit: "找出口",
    askAnything: "想问什么都可以…", askFollowUp: "继续提问…", askLabel: "问助手", more: "更多", nearby: "附近有什么", otherOptions: "其他选择", agentsWorking: "正在处理",
    walkMeThere: "带我走过去", inStation: "你在车站里吗？", yes: "是", no: "不是", listening: "正在听", stopListening: "停止听", closeAnswer: "关闭回答", showAnswer: "显示回答",
    changeTo: "换乘 {r} 线", skipped: "不停靠",
  },
  ru: {
    restroom: "Туалет", myTrain: "Мой поезд", planTrip: "Маршрут", findExit: "Найти выход",
    askAnything: "Спросите что угодно…", askFollowUp: "Задайте ещё вопрос…", askLabel: "Спросить помощника", more: "Ещё", nearby: "Что рядом", otherOptions: "Другие варианты", agentsWorking: "Работаю",
    walkMeThere: "Проводите меня", inStation: "Вы на станции?", yes: "Да", no: "Нет", listening: "Слушаю", stopListening: "Перестать слушать", closeAnswer: "Закрыть ответ", showAnswer: "Показать ответ",
    changeTo: "Пересадка на {r}", skipped: "Без остановки",
  },
  bn: {
    restroom: "টয়লেট", myTrain: "আমার ট্রেন", planTrip: "যাত্রা পরিকল্পনা", findExit: "বের হওয়ার পথ",
    askAnything: "যা খুশি জিজ্ঞেস করুন…", askFollowUp: "আরেকটি প্রশ্ন করুন…", askLabel: "সহকারীকে জিজ্ঞেস করুন", more: "আরও", nearby: "কাছে কী আছে", otherOptions: "অন্য উপায়", agentsWorking: "কাজ চলছে",
    walkMeThere: "হেঁটে নিয়ে চলুন", inStation: "আপনি কি স্টেশনের ভেতরে?", yes: "হ্যাঁ", no: "না", listening: "শুনছি", stopListening: "শোনা বন্ধ করুন", closeAnswer: "উত্তর বন্ধ করুন", showAnswer: "উত্তর দেখান",
    changeTo: "{r} ট্রেনে বদলান", skipped: "থামবে না",
  },
  ht: {
    restroom: "Twalèt", myTrain: "Tren mwen", planTrip: "Planifye vwayaj", findExit: "Jwenn sòti",
    askAnything: "Mande nenpòt bagay…", askFollowUp: "Poze yon lòt kesyon…", askLabel: "Mande asistan an", more: "Plis", nearby: "Sa ki toupre", otherOptions: "Lòt chwa", agentsWorking: "M ap travay",
    walkMeThere: "Mennen m a pye", inStation: "Èske ou nan estasyon an?", yes: "Wi", no: "Non", listening: "M ap koute", stopListening: "Sispann koute", closeAnswer: "Fèmen repons lan", showAnswer: "Montre repons lan",
    changeTo: "Chanje pou {r} la", skipped: "Pa kanpe la",
  },
  fr: {
    restroom: "Toilettes", myTrain: "Mon train", planTrip: "Itinéraire", findExit: "Trouver la sortie",
    askAnything: "Posez votre question…", askFollowUp: "Une autre question…", askLabel: "Demander à l'assistant", more: "Plus", nearby: "À proximité", otherOptions: "Autres options", agentsWorking: "En cours",
    walkMeThere: "Guidez-moi à pied", inStation: "Êtes-vous dans la station ?", yes: "Oui", no: "Non", listening: "J'écoute", stopListening: "Arrêter l'écoute", closeAnswer: "Fermer la réponse", showAnswer: "Voir la réponse",
    changeTo: "Changez pour le {r}", skipped: "Ne s'arrête pas",
  },
  ko: {
    restroom: "화장실", myTrain: "내 열차", planTrip: "경로 찾기", findExit: "출구 찾기",
    askAnything: "무엇이든 물어보세요…", askFollowUp: "이어서 물어보세요…", askLabel: "도우미에게 묻기", more: "더 보기", nearby: "근처 장소", otherOptions: "다른 방법", agentsWorking: "처리 중",
    walkMeThere: "걸어서 안내", inStation: "역 안에 계세요?", yes: "네", no: "아니요", listening: "듣고 있어요", stopListening: "듣기 중지", closeAnswer: "답변 닫기", showAnswer: "답변 보기",
    changeTo: "{r} 호선으로 환승", skipped: "정차 안 함",
  },
};

/** The app's text for a key in a language (English when missing). */
export function tr(lang: AppLang, key: Key): string {
  return T[lang][key] ?? T.en[key];
}

/** The app's text in the current language, re-rendering when it changes. */
export function useT(): (key: Key) => string {
  const lang = useAppLang();
  return (key) => tr(lang, key);
}
