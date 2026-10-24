import { DirectionsFromHere } from "@/components/DirectionsFromHere";

export interface GarageProps {
  name: string;
  address: string | null;
  capacity: number | null;
  kind: string;
  source: string;
  lon: number;
  lat: number;
}

/** A tapped garage / lot: address, capacity if known, directions from here. No live occupancy. */
export function ParkingCard({ garage }: { garage: GarageProps }) {
  return (
    <div className="space-y-2 text-xs">
      {garage.address ? <div className="text-foreground">{garage.address}</div> : null}
      <div className="text-muted-foreground">
        {garage.capacity ? `${garage.capacity} spaces · ` : ""}
        {garage.source === "dcwp" ? "Licensed by NYC DCWP" : "OpenStreetMap"}
      </div>
      <DirectionsFromHere lon={garage.lon} lat={garage.lat} />
    </div>
  );
}
