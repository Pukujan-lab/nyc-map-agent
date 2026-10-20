import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMapState } from "@/lib/store/MapStateContext";
import type { WindowId } from "@/lib/windows";

export function WindowSelect() {
  const { window: windowId, setWindow } = useMapState();

  return (
    <Select
      value={windowId}
      onValueChange={(value) => setWindow(value as WindowId)}
    >
      <SelectTrigger aria-label="Time window" className="w-[136px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="90d">Last 90 days</SelectItem>
        <SelectItem value="12mo">Last 12 months</SelectItem>
      </SelectContent>
    </Select>
  );
}
