import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import { setAeToken, clearAeToken } from "@/lib/aeToken";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Medal, Eye, EyeOff, Plus, LogIn, ChevronRight } from "lucide-react";
import { format } from "date-fns";

type Mode = "select" | "login" | "register";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { ae, isLoading, refetch } = useAeAuth();
  const [mode, setMode] = useState<Mode>("select");
  const [selectedName, setSelectedName] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  // Register form state
  const [regName, setRegName] = useState("");
  const [regPin, setRegPin] = useState("");
  const [regConfirmPin, setRegConfirmPin] = useState("");
  const [regJoinDate, setRegJoinDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [regIsTeamLeader, setRegIsTeamLeader] = useState(false);

  const { data: aeNames = [] } = trpc.ae.listNames.useQuery();

  const loginMutation = trpc.ae.login.useMutation({
    onSuccess: async (data) => {
      setLoginError(null);
      setIsLocked(false);
      clearAeToken(); // Clear old token first
      setAeToken(data.token); // Then set new token
      await refetch();
      navigate("/dashboard");
    },
    onError: (err) => {
      const msg = err.message;
      const locked = msg.toLowerCase().includes("locked");
      setIsLocked(locked);
      setLoginError(msg);
      setPin("");
    },
  });

  const registerMutation = trpc.ae.register.useMutation({
    onSuccess: (data) => {
      toast.success(`Welcome, ${data.name}! Your profile has been created.`);
      setMode("login");
      setSelectedName(data.name);
      setPin("");
    },
    onError: (err) => toast.error(err.message),
  });

  // If already logged in, redirect — must be in useEffect to avoid setState-during-render
  useEffect(() => {
    if (!isLoading && ae) {
      navigate("/dashboard");
    }
  }, [ae, isLoading]);

  if (!isLoading && ae) return null;

  const handleLogin = () => {
    if (!selectedName) return toast.error("Please select your name.");
    if (pin.length !== 4) return toast.error("PIN must be 4 digits.");
    loginMutation.mutate({ name: selectedName, pin });
  };

  const handleRegister = () => {
    if (regName.trim().length < 2) return toast.error("Name must be at least 2 characters.");
    if (!/^\d{4}$/.test(regPin)) return toast.error("PIN must be exactly 4 digits.");
    if (regPin !== regConfirmPin) return toast.error("PINs do not match.");
    registerMutation.mutate({
      name: regName.trim(),
      pin: regPin,
      joinDate: regJoinDate,
      isTeamLeader: regIsTeamLeader,
    });
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, oklch(0.14 0.016 250) 0%, oklch(0.10 0.02 260) 100%)",
          borderRight: "1px solid oklch(0.22 0.02 250)"
        }}
      >
        {/* Decorative circles */}
        <div className="absolute top-[-100px] right-[-100px] w-[400px] h-[400px] rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, oklch(0.78 0.12 75), transparent)" }} />
        <div className="absolute bottom-[-80px] left-[-80px] w-[300px] h-[300px] rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, oklch(0.78 0.12 75), transparent)" }} />

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Medal className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground tracking-widest uppercase font-medium">AMFG</p>
            <p className="text-base font-semibold text-foreground">Commission Calculator</p>
          </div>
        </div>

        {/* Hero text */}
        <div className="space-y-6">
          <h1 className="text-5xl text-foreground leading-tight">
            Track your<br />
            <span style={{
              background: "linear-gradient(135deg, oklch(0.88 0.14 75), oklch(0.70 0.10 55))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              commission
            </span>
            <br />with precision.
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-sm">
            Know your tier, track your deals, and see exactly what you'll earn — all in one place.
          </p>

          {/* Tier badges */}
          <div className="flex gap-3 pt-2">
            {[
              { label: "Bronze", pct: "13%", color: "oklch(0.65 0.12 55)" },
              { label: "Silver", pct: "16%", color: "oklch(0.75 0.02 250)" },
              { label: "Gold", pct: "19%", color: "oklch(0.82 0.14 75)" },
            ].map((t) => (
              <div key={t.label} className="flex flex-col items-center px-4 py-3 rounded-xl border"
                style={{
                  borderColor: `${t.color}40`,
                  background: `${t.color}10`,
                }}>
                <span className="text-lg font-bold" style={{ color: t.color }}>{t.pct}</span>
                <span className="text-xs text-muted-foreground mt-0.5">{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">© 2026 AMFG · Q1 Commission Model</p>
      </div>

      {/* Right Panel — Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <Medal className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground tracking-widest uppercase">AMFG</p>
              <p className="text-sm font-semibold">Commission Calculator</p>
            </div>
          </div>

          {mode === "select" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-3xl text-foreground">Welcome back</h2>
                <p className="text-muted-foreground mt-1">Select your profile to continue.</p>
              </div>

              {aeNames.length > 0 ? (
                <div className="space-y-2">
                  {aeNames.map((ae) => (
                    <button
                      key={ae.id}
                      onClick={() => { setSelectedName(ae.name); setMode("login"); }}
                      className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-accent/20 transition-all duration-150 text-left group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-semibold text-primary">
                            {ae.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="font-medium text-foreground">{ae.name}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No profiles yet. Create yours below.</p>
                </div>
              )}

              {aeNames.length === 0 && (
                <button
                  onClick={() => setMode("register")}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-all duration-150 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Create new profile
                </button>
              )}
            </div>
          )}

          {mode === "login" && (
            <div className="space-y-6">
              <div>
                <button onClick={() => { setMode("select"); setLoginError(null); setIsLocked(false); setPin(""); }} className="text-xs text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 transition-colors">
                  ← Back
                </button>
                <h2 className="text-3xl text-foreground">Enter your PIN</h2>
                <p className="text-muted-foreground mt-1">Signing in as <span className="text-foreground font-medium">{selectedName}</span></p>
              </div>

              {/* Error / Lockout Banner */}
              {loginError && (
                <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
                  isLocked
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                }`}>
                  <span className="text-base leading-none mt-0.5">{isLocked ? "🔒" : "⚠️"}</span>
                  <span>{loginError}</span>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">4-Digit PIN</Label>
                  <div className="relative">
                    <Input
                      type={showPin ? "text" : "password"}
                      inputMode="numeric"
                      maxLength={4}
                      value={pin}
                      onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); if (loginError && !isLocked) setLoginError(null); }}
                      onKeyDown={(e) => e.key === "Enter" && !isLocked && handleLogin()}
                      placeholder="••••"
                      disabled={isLocked}
                      className={`text-center text-2xl tracking-[0.5em] h-14 bg-input border-border focus:border-primary pr-12 ${
                        isLocked ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  onClick={handleLogin}
                  disabled={pin.length !== 4 || loginMutation.isPending || isLocked}
                  className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold disabled:opacity-50"
                >
                  {loginMutation.isPending ? (
                    <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Signing in...</span>
                  ) : isLocked ? (
                    <span className="flex items-center gap-2">🔒 Account Locked</span>
                  ) : (
                    <span className="flex items-center gap-2"><LogIn className="w-4 h-4" />Sign In</span>
                  )}
                </Button>
              </div>
            </div>
          )}

          {mode === "register" && (
            <div className="space-y-6">
              <div>
                <button onClick={() => setMode("select")} className="text-xs text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 transition-colors">
                  ← Back
                </button>
                <h2 className="text-3xl text-foreground">Create profile</h2>
                <p className="text-muted-foreground mt-1">Set up your AE account.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Full Name</Label>
                  <Input
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="e.g. Alex Johnson"
                    className="bg-input border-border focus:border-primary h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Join Date</Label>
                  <Input
                    type="date"
                    value={regJoinDate}
                    onChange={(e) => setRegJoinDate(e.target.value)}
                    className="bg-input border-border focus:border-primary h-11"
                  />
                  <p className="text-xs text-muted-foreground">Used to determine new joiner grace period (first 6 months).</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">PIN (4 digits)</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={regPin}
                      onChange={(e) => setRegPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="••••"
                      className="text-center tracking-widest bg-input border-border focus:border-primary h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Confirm PIN</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={regConfirmPin}
                      onChange={(e) => setRegConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="••••"
                      className="text-center tracking-widest bg-input border-border focus:border-primary h-11"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card">
                  <input
                    type="checkbox"
                    id="teamLeader"
                    checked={regIsTeamLeader}
                    onChange={(e) => setRegIsTeamLeader(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  <div>
                    <label htmlFor="teamLeader" className="text-sm font-medium text-foreground cursor-pointer">Team Leader</label>
                    <p className="text-xs text-muted-foreground">Halved targets (rounded up)</p>
                  </div>
                </div>

                <Button
                  onClick={handleRegister}
                  disabled={registerMutation.isPending}
                  className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                >
                  {registerMutation.isPending ? (
                    <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Creating...</span>
                  ) : (
                    <span className="flex items-center gap-2"><Plus className="w-4 h-4" />Create Profile</span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
