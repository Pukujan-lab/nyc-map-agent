import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ActionChip({ label }: { label: string }) {
  return (
    <Badge variant="secondary" className="gap-1 font-normal">
      <MapPin className="h-2.5 w-2.5" aria-hidden />
      {label}
    </Badge>
  );
}
