import { useEffect, useState } from "react";
import { wikiSummaryUrl, type CityLandmark, type WikiSummary } from "@/lib/map/cityLandmarks";

/**
 * The landmark's picture and one paragraph, in the details sheet.
 * Wikipedia is fetched when the sheet opens, not with the map.
 */
export function LandmarkSheet({ mark }: { mark: CityLandmark }) {
  const [page, setPage] = useState<WikiSummary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setPage(null);
    setFailed(false);
    fetch(wikiSummaryUrl(mark.wiki))
      .then((r) => (r.ok ? (r.json() as Promise<WikiSummary>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (alive) setPage(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [mark.wiki]);
  const href = page?.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(mark.wiki)}`;
  const photo = page?.thumbnail?.source ?? page?.originalimage?.source;
  return (
    <div className="space-y-3 text-sm" data-testid="landmark-sheet">
      {photo ? (
        <a href={href} target="_blank" rel="noreferrer">
          <img src={photo} alt={mark.name} className="max-h-52 w-full rounded-xl object-cover" />
        </a>
      ) : null}
      {failed ? <p className="text-muted-foreground">The picture did not load.</p> : null}
      {!page && !failed ? <p className="text-muted-foreground">Loading the picture…</p> : null}
      {page?.extract ? <p>{page.extract}</p> : null}
      <a href={href} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center font-semibold underline underline-offset-2">
        Read on Wikipedia
      </a>
      <p className="text-[12px] text-muted-foreground">Text and photo from Wikipedia, CC BY-SA.</p>
    </div>
  );
}
