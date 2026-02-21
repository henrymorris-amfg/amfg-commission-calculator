import { useAeAuth } from "@/contexts/AeAuthContext";
import { trpc } from "@/lib/trpc";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  DollarSign,
  LayoutDashboard,
  LogOut,
  Medal,
  Settings2,
  TrendingUp,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { path: "/metrics", label: "Activity Metrics", icon: BarChart3, adminOnly: false },
  { path: "/deals", label: "Deals", icon: DollarSign, adminOnly: false },
  { path: "/summary", label: "Commission Summary", icon: TrendingUp, adminOnly: false },
  { path: "/commission-structure", label: "Commission Structure", icon: Settings2, adminOnly: true },
];

const TIER_COLORS = {
  bronze: "text-amber-600",
  silver: "text-slate-300",
  gold: "text-yellow-400",
};

const TIER_LABELS = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ae, refetch } = useAeAuth();
  const [location, navigate] = useLocation();
  const logoutMutation = trpc.ae.logout.useMutation({
    onSuccess: () => {
      refetch();
      navigate("/");
    },
    onError: () => toast.error("Logout failed"),
  });

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-border bg-[oklch(0.14_0.016_250)]">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Medal className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium tracking-widest uppercase">AMFG</p>
              <p className="text-sm font-semibold text-foreground leading-tight">Commission</p>
            </div>
          </div>
        </div>

        {/* AE Profile */}
        {ae && (
          <div className="px-4 py-4 border-b border-border">
            <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-accent/30">
              <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-primary">
                  {ae.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{ae.name}</p>
                {ae.isTeamLeader && (
                  <p className="text-xs text-primary">Team Leader</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.filter((item) => !item.adminOnly || ae?.isTeamLeader).map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-primary/15 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="w-3 h-3 ml-auto" />}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-border">
          <button
            onClick={() => logoutMutation.mutate()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
