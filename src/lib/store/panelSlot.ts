/**
 * The primary panel slot: one owner for the Layers & filters drawer and the
 * details sheet. Pure state so the rules are unit-tested without a DOM.
 *
 * Rules (UI plan, "Panel rules"):
 * - One panel at a time. Opening a details sheet closes the drawer.
 * - Opening the drawer hides the sheet until the drawer closes.
 * - A minimized sheet becomes a labelled peek chip; tapping it restores.
 * - An empty-map tap leaves the layers drawer open and closes a details sheet.
 *   A train or bus tap closes the drawer.
 * - Esc and Back close the top panel first, then stop the active mode.
 */
export interface SlotState {
  drawerOpen: boolean;
  /** A details sheet is in the slot (its content lives beside this state). */
  sheet: boolean;
  /** The sheet is folded down to its peek chip. */
  minimized: boolean;
}

export const EMPTY_SLOT: SlotState = { drawerOpen: false, sheet: false, minimized: false };

type SlotAction =
  | { type: "showSheet" }
  | { type: "closeSheet" }
  | { type: "openDrawer" }
  | { type: "closeDrawer" }
  | { type: "toggleDrawer" }
  | { type: "minimize" }
  | { type: "restore" }
  | { type: "emptyTap" }
  | { type: "dismissTop" };

export function slotReducer(s: SlotState, a: SlotAction): SlotState {
  switch (a.type) {
    case "showSheet":
      return { drawerOpen: false, sheet: true, minimized: false };
    case "closeSheet":
      return s.sheet ? { ...s, sheet: false, minimized: false } : s;
    case "openDrawer":
      return s.drawerOpen ? s : { ...s, drawerOpen: true };
    case "closeDrawer":
      return s.drawerOpen ? { ...s, drawerOpen: false } : s;
    case "toggleDrawer":
      return { ...s, drawerOpen: !s.drawerOpen };
    case "minimize":
      return s.sheet ? { ...s, minimized: true } : s;
    case "restore":
      return s.sheet ? { drawerOpen: false, sheet: true, minimized: false } : s;
    case "emptyTap":
      if (s.drawerOpen) return s;
      return s.sheet ? { ...s, sheet: false, minimized: false } : s;
    case "dismissTop":
      if (s.drawerOpen) return { ...s, drawerOpen: false };
      if (s.sheet) return { ...s, sheet: false, minimized: false };
      return s;
  }
}

/** What Esc / Back acts on next: the top panel, then the active mode. */
export function escapeTarget(s: SlotState, modeActive: boolean): "drawer" | "sheet" | "mode" | null {
  if (s.drawerOpen) return "drawer";
  if (s.sheet) return "sheet";
  return modeActive ? "mode" : null;
}

/** The label on a minimized sheet's chip, e.g. "Q · 2 min". */
export function peekChipLabel(title: string, peek?: string): string {
  return peek?.trim() || title;
}

/**
 * Phone sheet height. Lines need the half drawer so the list is readable.
 * Follow keeps the peek so the camera controls stay on screen. Other sheets
 * stay at the peek showPanel already set.
 */
export function sheetSnapFor(contentId: string | null, modeActive: boolean): "half" | "peek" | null {
  if (contentId === "transit:lines") return "half";
  if (modeActive) return "peek";
  return null;
}
