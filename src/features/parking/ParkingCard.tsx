import { Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDataView } from "@/lib/store/DataViewContext";

export interface GarageProps {
  name: string;
  address: string | null;
  capacity: number | null;
  kind: string;
  source: string;
  lon: number;
  lat: number;
}

/** A tapped garage / lot: address, capacity if known, Directions. No live occupancy. */
export function ParkingCard({ garage }: { garage: GarageProps }) {
  const { setRoutePoint, setRoutePicking } = useDataView();
  return (
    <div className="space-y-2 text-xs">
      {garage.address ? <div className="text-foreground">{garage.address}</div> : null}
      <div className="text-muted-foreground">
        {garage.capacity ? `${garage.capacity} spaces · ` : ""}
        {garage.source === "dcwp" ? "Licensed by NYC DCWP" : "OpenStreetMap"}
      </div>
      <Button
        type="button"
        size="sm"
        className="h-8 text-[11px]"
        onClick={() => {
          setRoutePoint("end", { lon: garage.lon, lat: garage.lat });
          setRoutePicking("start");
        }}
      >
        <Navigation className="h-3.5 w-3.5" />
        Directions
      </Button>
    </div>
  );
}
