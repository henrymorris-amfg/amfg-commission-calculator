import { useState } from "react";
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
      // Clear old token and set new one
      clearAeToken();
      setAeToken(data.token);
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
    onSuccess: async (data) => {
      setLoginError(null);
      // Clear old token and set new one
      clearAeToken();
      setAeToken(data.token);
      await refetch();
      navigate("/dashboard");
    },
    onError: (err) => {
      setLoginError(err.message);
    },
  });

  const handleLogin = async () => {
    if (!selectedName || !pin) {
      setLoginError("Please select an AE and enter your PIN");
      return;
    }
    loginMutation.mutate({ name: selectedName, pin });
  };

  const handleRegister = async () => {
    if (!regName || !regPin || !regConfirmPin) {
      setLoginError("All fields are required");
      return;
    }
    if (regPin !== regConfirmPin) {
      setLoginError("PINs do not match");
      return;
    }
    registerMutation.mutate({
      name: regName,
      pin: regPin,
      joinDate: regJoinDate,
      isTeamLeader: regIsTeamLeader,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (ae) {
    navigate("/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Left side - Branding */}
      <div className="lg:w-1/2 bg-gradient-to-br from-amber-900/20 to-amber-950/40 flex flex-col justify-between p-8 lg:p-12">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <Medal className="w-8 h-8 text-amber-500" />
            <h1 className="text-2xl font-bold text-foreground">AMFG</h1>
          </div>
          <h2 className="text-4xl lg:text-5xl font-serif text-foreground mb-6">
            Track your <span className="text-amber-500">commission</span> with precision.
          </h2>
          <p className="text-lg text-muted-foreground max-w-md">
            Know your tier, track your deals, and see exactly what you'll earn — all in one place.
          </p>
        </div>

        <div className="flex gap-8">
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-500 mb-1">13%</div>
            <div className="text-sm text-muted-foreground">Bronze</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-400 mb-1">16%</div>
            <div className="text-sm text-muted-foreground">Silver</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-300 mb-1">19%</div>
            <div className="text-sm text-muted-foreground">Gold</div>
          </div>
        </div>
      </div>

      {/* Right side - Auth Form */}
      <div className="lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {mode === "select" && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-foreground mb-2">Welcome back</h3>
                <p className="text-muted-foreground">Select your profile to continue.</p>
              </div>

              <div className="space-y-3">
                {aeNames.map((name) => (
                  <button
                    key={name}
                    onClick={() => {
                      setSelectedName(name);
                      setMode("login");
                      setLoginError(null);
                      setPin("");
                    }}
                    className="w-full p-4 border border-border rounded-lg hover:bg-accent transition-colors text-left flex items-center justify-between group"
                  >
                    <span className="font-medium text-foreground">{name}</span>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </button>
                ))}
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-background text-muted-foreground">or</span>
                </div>
              </div>

              <Button
                onClick={() => {
                  setMode("register");
                  setLoginError(null);
                }}
                variant="outline"
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Register New AE
              </Button>
            </div>
          )}

          {mode === "login" && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-foreground mb-2">Enter your PIN</h3>
                <p className="text-muted-foreground">Signing in as {selectedName}</p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="pin" className="text-sm font-medium text-foreground">
                    4-Digit PIN
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      id="pin"
                      type={showPin ? "text" : "password"}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.slice(0, 4))}
                      placeholder="••••"
                      maxLength={4}
                      className="text-center text-2xl tracking-widest font-mono"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleLogin();
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPin ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {loginError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                    {loginError}
                  </div>
                )}

                <Button
                  onClick={handleLogin}
                  disabled={loginMutation.isPending || isLocked || pin.length !== 4}
                  className="w-full"
                  size="lg"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign In
                </Button>

                <Button
                  onClick={() => {
                    setMode("select");
                    setPin("");
                    setLoginError(null);
                  }}
                  variant="ghost"
                  className="w-full"
                >
                  ← Back
                </Button>
              </div>
            </div>
          )}

          {mode === "register" && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-foreground mb-2">Register New AE</h3>
                <p className="text-muted-foreground">Create a new account</p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="regName" className="text-sm font-medium text-foreground">
                    Name
                  </Label>
                  <Input
                    id="regName"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Full name"
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="regPin" className="text-sm font-medium text-foreground">
                    4-Digit PIN
                  </Label>
                  <Input
                    id="regPin"
                    type="password"
                    value={regPin}
                    onChange={(e) => setRegPin(e.target.value.slice(0, 4))}
                    placeholder="••••"
                    maxLength={4}
                    className="mt-2 text-center text-2xl tracking-widest font-mono"
                  />
                </div>

                <div>
                  <Label htmlFor="regConfirmPin" className="text-sm font-medium text-foreground">
                    Confirm PIN
                  </Label>
                  <Input
                    id="regConfirmPin"
                    type="password"
                    value={regConfirmPin}
                    onChange={(e) => setRegConfirmPin(e.target.value.slice(0, 4))}
                    placeholder="••••"
                    maxLength={4}
                    className="mt-2 text-center text-2xl tracking-widest font-mono"
                  />
                </div>

                <div>
                  <Label htmlFor="regJoinDate" className="text-sm font-medium text-foreground">
                    Join Date
                  </Label>
                  <Input
                    id="regJoinDate"
                    type="date"
                    value={regJoinDate}
                    onChange={(e) => setRegJoinDate(e.target.value)}
                    className="mt-2"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="teamLeader"
                    checked={regIsTeamLeader}
                    onChange={(e) => setRegIsTeamLeader(e.target.checked)}
                    className="rounded border-border"
                  />
                  <Label htmlFor="teamLeader" className="text-sm font-medium text-foreground cursor-pointer">
                    Team Leader
                  </Label>
                </div>

                {loginError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                    {loginError}
                  </div>
                )}

                <Button
                  onClick={handleRegister}
                  disabled={registerMutation.isPending}
                  className="w-full"
                  size="lg"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Account
                </Button>

                <Button
                  onClick={() => {
                    setMode("select");
                    setLoginError(null);
                  }}
                  variant="ghost"
                  className="w-full"
                >
                  ← Back
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
