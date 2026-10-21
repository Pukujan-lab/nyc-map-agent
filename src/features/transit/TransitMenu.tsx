import { DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useFlag } from "@/lib/flags";
import { useTransitMeta, useTransitToggles, type TransitLayerId } from "./hooks";
import { SYSTEM_LABELS } from "./model";

/** "Transit" group in the Layers dropdown: one toggle per system, Buses only when the server has a key. */
export default function TransitMenu() {
  const enabled = useFlag("transit");
  const transit = useTransitToggles();
  const busAvailable = useTransitMeta().data?.bus === true;
  if (!enabled) return null;
  const ids: TransitLayerId[] = busAvailable ? ["subway", "lirr", "mnr", "bus"] : ["subway", "lirr", "mnr"];
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-[11px] text-muted-foreground">Transit</DropdownMenuLabel>
      {ids.map((id) => (
        <DropdownMenuCheckboxItem key={id} checked={transit.on.has(id)} onCheckedChange={(on) => transit.set(id, on === true)} onSelect={(e) => e.preventDefault()}>
          {SYSTEM_LABELS[id]}
        </DropdownMenuCheckboxItem>
      ))}
      <DropdownMenuItem onSelect={() => transit.setPanelOpen(true)}>Service status…</DropdownMenuItem>
    </>
  );
}
