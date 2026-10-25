import createClient from "openapi-fetch";
import type { paths } from "./schema";

/**
 * The app's typed client for its own API. Paths, query parameters and
 * response bodies come from openapi.json (`pnpm openapi` regenerates
 * schema.d.ts), so a renamed parameter or a changed response fails typecheck
 * instead of failing on the street. Same origin, so no base URL.
 */
export const api = createClient<paths>();
