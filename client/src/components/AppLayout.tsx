import React, { useState } from "react";
import { useAeAuth } from "@/contexts/AeAuthContext";
import { clearAeToken } from "@/lib/aeToken";
import { trpc } from "@/lib/trpc";
import {
  BarChart3,
  Calendar,
  ChevronRight,
  DollarSign,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Medal,
  Menu,
  Settings2,
  Sheet,
  TrendingUp,
  Users,
  X,
  Zap,
  Phone,
  ShieldAlert,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { path: "/metrics", label: "Activity Metrics", icon: BarChart3, adminOnly: false },
  { path: "/deals", label: "Deals", icon: DollarSign, adminOnly: false },
  { path: "/summary", label: "Commission Summary", icon: TrendingUp, adminOnly: false },
  { path: "/payout-calendar", label: "Payout Calendar", icon: Calendar, adminOnly: false },
  { path: "/forecast", label: "Commission Forecast", icon: TrendingUp, adminOnly: false },
  { path: "/team-commissions", label: "Team Commissions", icon: Users, adminOnly: true },
  { path: "/commission-structure", label: "Commission Structure", icon: Settings2, adminOnly: true },
  { path: "/spreadsheet-sync", label: "Spreadsheet Sync", icon: Sheet, adminOnly: true },
  { path: "/pipedrive-sync", label: "Pipedrive Sync", icon: Zap, adminOnly: true },
  { path: "/voip-sync", label: "VOIP Studio", icon: Phone, adminOnly: true },
  { path: "/data-audit", label: "Data Audit", icon: ShieldAlert, adminOnly: true },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ae, refetch } = useAeAuth();
  const [location, navigate] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const changePinMutation = trpc.ae.changePin.useMutation({
    onSuccess: () => {
      toast.success("PIN changed successfully.");
      setChangePinOpen(false);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleChangePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin !== confirmPin) {
      toast.error("New PINs do not match.");
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      toast.error("PIN must be exactly 4 digits.");
      return;
    }
    changePinMutation.mutate({ currentPin, newPin });
  };

  const logoutMutation = trpc.ae.logout.useMutation({
    onSuccess: () => {
      clearAeToken();
      refetch();
      navigate("/");
    },
    onError: () => toast.error("Logout failed"),
  });

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || ae?.isTeamLeader);

  const handleNav = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Desktop Sidebar ─────────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-64 flex-shrink-0 flex-col border-r border-border bg-[oklch(0.14_0.016_250)]">
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
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            return (
              <button
                key={item.path}
                onClick={() => handleNav(item.path)}
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

        {/* Profile Actions */}
        <div className="px-3 py-4 border-t border-border space-y-1">
          <button
            onClick={() => setChangePinOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-150"
          >
            <KeyRound className="w-4 h-4" />
            <span>Change PIN</span>
          </button>
          <button
            onClick={() => logoutMutation.mutate()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile Header ────────────────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 border-b border-border bg-[oklch(0.14_0.016_250)]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Medal className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium tracking-widest uppercase leading-none">AMFG</p>
            <p className="text-sm font-semibold text-foreground leading-tight">Commission</p>
          </div>
        </div>
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* ── Mobile Slide-over Menu ───────────────────────────────────────────── */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Drawer */}
          <div className="md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 flex flex-col bg-[oklch(0.14_0.016_250)] border-r border-border">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                  <Medal className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
                <p className="text-sm font-semibold text-foreground">AMFG Commission</p>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
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

            {/* Nav */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => handleNav(item.path)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-150 ${
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

            {/* Profile Actions */}
            <div className="px-3 py-4 border-t border-border space-y-1">
              <button
                onClick={() => { setChangePinOpen(true); setMobileMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-150"
              >
                <KeyRound className="w-4 h-4" />
                <span>Change PIN</span>
              </button>
              <button
                onClick={() => logoutMutation.mutate()}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto md:pt-0 pt-[57px]">
        {children}
      </main>

      {/* ── Change PIN Dialog ────────────────────────────────────────────────── */}
      <Dialog open={changePinOpen} onOpenChange={(open) => {
        setChangePinOpen(open);
        if (!open) { setCurrentPin(""); setNewPin(""); setConfirmPin(""); }
      }}>
        <DialogContent className="sm:max-w-md bg-[oklch(0.16_0.016_250)] border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Change PIN
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Enter your current PIN and choose a new 4-digit PIN.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePinSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="current-pin" className="text-foreground text-sm">Current PIN</Label>
              <Input
                id="current-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="bg-background border-border text-foreground tracking-widest text-center text-xl"
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pin" className="text-foreground text-sm">New PIN</Label>
              <Input
                id="new-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="bg-background border-border text-foreground tracking-widest text-center text-xl"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pin" className="text-foreground text-sm">Confirm New PIN</Label>
              <Input
                id="confirm-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="bg-background border-border text-foreground tracking-widest text-center text-xl"
                autoComplete="new-password"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setChangePinOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={changePinMutation.isPending || currentPin.length !== 4 || newPin.length !== 4 || confirmPin.length !== 4}
              >
                {changePinMutation.isPending ? "Saving..." : "Change PIN"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Mobile Bottom Navigation ─────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-[oklch(0.14_0.016_250)] flex">
        {visibleNavItems.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path;
          return (
            <button
              key={item.path}
              onClick={() => handleNav(item.path)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">
                {item.label.split(" ")[0]}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
