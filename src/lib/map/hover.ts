/**
 * Whether the map's hover card must stay hidden (#6): a details sheet (pushed
 * content or a picked place) or the Layers drawer is open. A minimized sheet
 * gives the map back, so hover returns. Pure, for tests.
 */
export function hoverBlocked(s: { drawerOpen: boolean; content: boolean; minimized: boolean; selected: boolean }): boolean {
  return s.drawerOpen || ((s.content || s.selected) && !s.minimized);
}
