import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import MetricsPage from "./pages/MetricsPage";
import DealsPage from "./pages/DealsPage";
import SummaryPage from "./pages/SummaryPage";
import { AeAuthProvider } from "./contexts/AeAuthContext";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LoginPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/metrics" component={MetricsPage} />
      <Route path="/deals" component={DealsPage} />
      <Route path="/summary" component={SummaryPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <AeAuthProvider>
            <Toaster richColors position="top-right" />
            <Router />
          </AeAuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
