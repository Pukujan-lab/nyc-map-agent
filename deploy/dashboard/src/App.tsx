import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";

/**
 * Single-page dashboard: no routes, no router. The app is served under
 * /deploy/ and talks only to /deploy/api/*.
 */
const App = () => (
  <TooltipProvider delayDuration={150}>
    <Index />
  </TooltipProvider>
);

export default App;
