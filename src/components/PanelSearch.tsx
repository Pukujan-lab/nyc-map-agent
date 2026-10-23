import { formatStreetText } from "@/lib/streetName";
import { useCombobox } from "downshift";
import { Search } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState, type KeyboardEvent } from "react";
import { useAddressSuggestions } from "@/lib/api/geosearch";
import type { NtaBoundary } from "@/lib/api/nta";
import { neighborhoodCameraTarget } from "@/lib/map/neighborhoodJump";
import { useMapState } from "@/lib/store/MapStateContext";
import { usePanel, type SearchHit } from "@/lib/store/PanelContext";
import { cn } from "@/lib/utils";

/** The Ask button lives beside the field, so it calls in through this handle. */
export type PanelSearchHandle = { ask: () => void };

/**
 * One search bar for neighborhoods, addresses (NYC GeoSearch) and anything a
 * feature registers with `usePanelSearch` (e.g. transit stations).
 * Enter picks a highlighted place. Enter with nothing highlighted, and the
 * Ask button, send the typed text into Ask the map.
 */
export const PanelSearch = forwardRef<PanelSearchHandle, { boundaries: NtaBoundary[] | null }>(function PanelSearch({ boundaries }, ref) {
  const { selectNta, flyTo, seedChat, setChatOpen } = useMapState();
  const { searchProviders, closePanel } = usePanel();
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(text), 250);
    return () => window.clearTimeout(id);
  }, [text]);
  const { data: addresses } = useAddressSuggestions(debounced);

  const items = useMemo<SearchHit[]>(() => {
    const q = text.trim().toLowerCase();
    if (q.length < 2) return [];
    const hoods: SearchHit[] = (boundaries ?? [])
      .filter((b) => b.ntaName.toLowerCase().includes(q))
      .slice(0, 5)
      .map((b) => ({
        id: `nta:${b.ntaCode}`,
        label: `${b.ntaName}, ${b.borough}`,
        kind: "Neighborhood",
        onSelect: () => {
          selectNta(b.ntaCode);
          flyTo(neighborhoodCameraTarget(b.bbox));
        },
      }));
    const extra = searchProviders.flatMap((provider) => provider(q)).slice(0, 5);
    const addr: SearchHit[] =
      q.length >= 3
        ? (addresses ?? []).slice(0, 5).map((a) => ({
            id: `addr:${a.id}`,
            label: formatStreetText(a.label),
            kind: "Address",
            onSelect: () => {
              closePanel();
              flyTo({ lon: a.lon, lat: a.lat, zoom: 16.5 });
            },
          }))
        : [];
    return [...hoods, ...extra, ...addr];
  }, [text, boundaries, searchProviders, addresses, selectNta, flyTo, closePanel]);

  const ask = useCallback(() => {
    const q = text.trim();
    if (!q) {
      setChatOpen(true);
      return;
    }
    seedChat(q);
    setText("");
  }, [text, seedChat, setChatOpen]);
  useImperativeHandle(ref, () => ({ ask }), [ask]);

  const { isOpen, getInputProps, getMenuProps, getItemProps, getLabelProps, highlightedIndex } =
    useCombobox<SearchHit>({
      items,
      inputValue: text,
      itemToString: (item) => item?.label ?? "",
      onInputValueChange: ({ inputValue }) => setText(inputValue ?? ""),
      onSelectedItemChange: ({ selectedItem }) => {
        selectedItem?.onSelect();
        setText("");
      },
    });

  return (
    <div className="relative">
      <label {...getLabelProps()} className="sr-only">
        Search neighborhoods, addresses and stations
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        {...getInputProps({
          onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            // A highlighted row is a place. Anything else is a question.
            if (isOpen && items.length > 0 && highlightedIndex >= 0) return;
            event.preventDefault();
            (event.nativeEvent as globalThis.KeyboardEvent & { preventDownshiftDefault?: boolean }).preventDownshiftDefault = true;
            ask();
          },
        })}
        placeholder="Search neighborhoods, addresses, stations"
        className="h-10 w-full rounded-full border border-input bg-card pl-9 pr-3 text-sm shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <ul
        {...getMenuProps()}
        className={cn(
          "absolute inset-x-0 top-11 z-50 max-h-72 overflow-auto rounded-lg border bg-popover p-1 text-xs shadow-lg",
          !(isOpen && items.length) && "hidden",
        )}
      >
        {isOpen &&
          items.map((item, index) => (
            <li
              key={item.id}
              {...getItemProps({ item, index })}
              className={cn(
                "flex cursor-pointer items-baseline justify-between gap-2 rounded px-2 py-1.5",
                highlightedIndex === index && "bg-accent",
              )}
            >
              <span className="truncate">{item.label}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{item.kind}</span>
            </li>
          ))}
      </ul>
    </div>
  );
});
