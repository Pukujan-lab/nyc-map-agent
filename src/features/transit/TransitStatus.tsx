import { Accessibility, Bell, Star, Wrench } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { arrivalsAt, minutesUntil, SYSTEM_LABELS, RAIL_SYSTEMS, type SystemId } from "./model";
import { useAlerts, useNow, useStarred, useTransitData } from "./hooks";
import { OutageRow, RouteBullet } from "./TransitCard";

const AGENCY: Record<string, SystemId> = { MTASBWY: "subway", LI: "lirr", MNR: "mnr" };

/** Service status (panel body): starred countdowns ticking each second, planned work, accessibility. */
export function TransitStatusDetails() {
  const data = useTransitData(RAIL_SYSTEMS);
  const alerts = useAlerts(true).data;
  const now = useNow();
  const { starred, notify, setNotify } = useStarred();
  const stations = starred.map((k) => k.split(":")).filter((p) => p[1] === "station");
  const lines = new Set(starred.filter((k) => k.includes(":line:")));
  const planned = (alerts?.alerts ?? []).filter((a) => a.kind === "planned");
  const enableNotify = async (on: boolean) => {
    if (on && "Notification" in window && Notification.permission !== "granted") await Notification.requestPermission();
    setNotify(on);
  };
  return (
        <Tabs defaultValue="starred" className="flex flex-col">
          <TabsList className="grid h-auto grid-cols-3">
            <TabsTrigger value="starred"><Star className="mr-1.5 h-3.5 w-3.5" />Starred</TabsTrigger>
            <TabsTrigger value="planned"><Wrench className="mr-1.5 h-3.5 w-3.5" />Planned work</TabsTrigger>
            <TabsTrigger value="access"><Accessibility className="mr-1.5 h-3.5 w-3.5" />Accessibility</TabsTrigger>
          </TabsList>
          <TabsContent value="starred" className="min-h-0 flex-1 space-y-3 overflow-y-auto text-sm">
            <div className="flex items-center justify-between rounded-md border p-2">
              <Label htmlFor="transit-notify" className="flex items-center gap-1.5"><Bell className="h-4 w-4" />Browser notifications</Label>
              <Switch id="transit-notify" checked={notify} onCheckedChange={(on) => void enableNotify(on)} />
            </div>
            {stations.length === 0 ? <p className="text-muted-foreground">Star a station from its card to see countdowns here.</p> : null}
            {stations.map(([sys, , id]) => {
              const system = sys as SystemId;
              const name = data[system]?.stat?.stations.features.find((f) => f.properties.id === id)?.properties.name ?? id;
              const rows = arrivalsAt(system, data[system]?.live, id, now);
              const shown = rows.some((r) => lines.has(`${system}:line:${r.route}`)) ? rows.filter((r) => lines.has(`${system}:line:${r.route}`)) : rows;
              return (
                <div key={`${sys}:${id}`}>
                  <div className="font-medium">{name} <span className="text-xs text-muted-foreground">{SYSTEM_LABELS[system]}</span></div>
                  
                  <ul className="mt-1 space-y-1">
                    {shown.map((a) => (
                      <li key={`${a.route}|${a.direction}`} className="flex items-center gap-2">
                        <RouteBullet system={system} route={a.route} data={data} />
                        <span className="flex-1 text-muted-foreground">{a.direction}</span>
                        <span className="tabular-nums">
                          {a.times.map((t) => { const s = Math.max(0, Math.round(t - now)); return s < 60 ? `${s}s` : `${minutesUntil(t, now)} min`; }).join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </TabsContent>
          <TabsContent value="planned" className="min-h-0 flex-1 space-y-3 overflow-y-auto text-sm">
            {planned.length === 0 ? <p className="text-muted-foreground">No planned work reported right now.</p> : null}
            {planned.map((a) => (
              <div key={a.id} className="flex gap-2">
                <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  <div className="flex flex-wrap gap-1">
                    {a.routes.slice(0, 8).map((r) => <RouteBullet key={r} system={AGENCY[a.agency] ?? "bus"} route={r} data={data} />)}
                    <span className="text-xs text-muted-foreground">{a.type}</span>
                  </div>
                  <p className="mt-0.5">{a.text}</p>
                </div>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="access" className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            {alerts?.outages.length ? null : <p className="text-sm text-muted-foreground">No elevator or escalator outages reported.</p>}
            {alerts?.outages.map((o) => (
              <div key={o.id}>
                <div className="text-sm font-medium">{o.station} <span className="text-xs text-muted-foreground">{o.routes.join(" ")}</span></div>
                <OutageRow o={o} />
              </div>
            ))}
          </TabsContent>
        </Tabs>
  );
}
