import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DataViewProvider } from "@/lib/store/DataViewContext";
import { MapStateProvider } from "@/lib/store/MapStateContext";
import { PanelProvider } from "@/lib/store/PanelContext";
import { keepLastData } from "@/lib/queryKeep";
import { removeShell } from "@/lib/shellDraft";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
// The previous visit's line shapes and stations show at once; fresh data replaces them (#368).
keepLastData(queryClient);

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
// The real chat bar removes the static one from index.html; this covers the agent being off.
window.setTimeout(removeShell, 30_000);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <MapStateProvider>
          <DataViewProvider>
            <PanelProvider>
              <TooltipProvider delayDuration={200}>
                <App />
                <Toaster />
              </TooltipProvider>
            </PanelProvider>
          </DataViewProvider>
        </MapStateProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
