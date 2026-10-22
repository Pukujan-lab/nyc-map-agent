-- migrate:up
-- Brand logos for storefront sign bands: Wikidata P154 (logo image) of a
-- brand:wikidata id, a 96 px Commons thumbnail re-hosted once through Octo
-- files (R2). Only freely licensed Commons files are kept; license and
-- attribution travel with the row. url is null when the brand has no usable logo.
CREATE TABLE core.brand_logos (
  qid          text PRIMARY KEY,
  url          text,
  file         text,
  license      text,
  artist       text,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE core.brand_logos;
