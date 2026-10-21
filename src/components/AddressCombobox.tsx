import { useCombobox } from "downshift";
import { useEffect, useRef, useState } from "react";
import { type AddressHit, useAddressSuggestions } from "@/lib/api/geosearch";
import { cn } from "@/lib/utils";

/** Typed-address input with a GeoSearch autocomplete dropdown (downshift `useCombobox`). */
export function AddressCombobox({
  label,
  placeholder,
  onSelect,
  resetKey,
}: {
  label: string;
  placeholder: string;
  onSelect: (hit: AddressHit) => void;
  /** The current point as "lon,lat" ("" when unset); a change from elsewhere (map click, clear) drops stale text. */
  resetKey: string;
}) {
  const [text, setText] = useState("");
  const chosen = useRef("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(text), 250);
    return () => window.clearTimeout(id);
  }, [text]);
  const { data } = useAddressSuggestions(debounced);
  const items: AddressHit[] = text.trim().length >= 3 ? (data ?? []) : [];

  const { isOpen, getInputProps, getMenuProps, getItemProps, highlightedIndex, getLabelProps, reset } =
    useCombobox<AddressHit>({
      items,
      inputValue: text,
      itemToString: (item) => item?.label ?? "",
      onInputValueChange: ({ inputValue }) => setText(inputValue ?? ""),
      onSelectedItemChange: ({ selectedItem }) => {
        if (!selectedItem) return;
        chosen.current = `${selectedItem.lon},${selectedItem.lat}`;
        onSelect(selectedItem);
      },
    });

  useEffect(() => {
    if (resetKey !== chosen.current) {
      chosen.current = "";
      setText("");
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  return (
    <div className="relative min-w-0 flex-1">
      <label {...getLabelProps()} className="sr-only">
        {label}
      </label>
      <input
        {...getInputProps()}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <ul
        {...getMenuProps()}
        className={cn(
          "absolute inset-x-0 top-9 z-40 max-h-56 overflow-auto rounded-md border bg-popover p-1 text-[11px] shadow-lg",
          !(isOpen && items.length) && "hidden",
        )}
      >
        {isOpen &&
          items.map((item, index) => (
            <li
              key={item.id}
              {...getItemProps({ item, index })}
              className={cn("cursor-pointer rounded px-2 py-1.5", highlightedIndex === index && "bg-accent")}
            >
              {item.label}
            </li>
          ))}
      </ul>
    </div>
  );
}
