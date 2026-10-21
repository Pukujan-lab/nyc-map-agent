import { aggregateRows, socrataRowSource } from "./aggregateCore";
import type { AggregateWorkerRequest, AggregateWorkerResponse } from "./types";

const scope = self as unknown as {
  postMessage: (message: AggregateWorkerResponse) => void;
  onmessage: ((event: MessageEvent<AggregateWorkerRequest>) => void) | null;
};

scope.onmessage = (event: MessageEvent<AggregateWorkerRequest>) => {
  const request = event.data;
  aggregateRows(request, socrataRowSource(request), (progress) =>
    scope.postMessage({ type: "progress", ...progress }),
  )
    .then((result) => scope.postMessage({ type: "done", result }))
    .catch((error: unknown) => {
      scope.postMessage({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not aggregate the Socrata data.",
      });
    });
};
