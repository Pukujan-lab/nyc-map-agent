-- Pre-migration baseline for CI. In production these public.nyc_* tables
-- predate db/migrations (scripts/ingest.ts lands them); the first migration
-- builds raw.* views on top. CI creates empty copies so migrations can run
-- against a throwaway Postgres. Columns mirror scripts/ingest.ts.
CREATE TABLE IF NOT EXISTS public.nyc_311_noise (
  unique_key bigint PRIMARY KEY, created_date timestamp, closed_date timestamp,
  complaint_type text, descriptor text, location_type text, incident_address text,
  street_name text, incident_zip text, borough text, community_board text,
  agency text, status text, latitude double precision, longitude double precision,
  nta2020 text
);
CREATE TABLE IF NOT EXISTS public.nyc_crashes (
  collision_id bigint PRIMARY KEY, crash_date timestamp, crash_hour integer,
  borough text, zip_code text, on_street_name text, cross_street_name text,
  latitude double precision, longitude double precision,
  contributing_factor_vehicle_1 text, vehicle_type_code1 text,
  number_of_persons_injured integer, number_of_persons_killed integer,
  number_of_pedestrians_injured integer, number_of_pedestrians_killed integer,
  number_of_cyclist_injured integer, number_of_cyclist_killed integer,
  number_of_motorist_injured integer, number_of_motorist_killed integer,
  nta2020 text
);
CREATE TABLE IF NOT EXISTS public.nyc_311_rollup_hourly (
  hour timestamp, complaint_type text, borough text, n integer
);
