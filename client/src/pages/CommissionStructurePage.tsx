import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAeAuth } from "@/contexts/AeAuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CheckCircle2,
  Plus,
  Settings2,
  Zap,
  Clock,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_COLORS = {
  bronze: { label: "Bronze", color: "oklch(0.65 0.12 55)", bg: "oklch(0.65 0.12 55 / 0.12)", border: "oklch(0.65 0.12 55 / 0.35)" },
  silver: { label: "Silver", color: "oklch(0.82 0.02 250)", bg: "oklch(0.75 0.02 250 / 0.12)", border: "oklch(0.75 0.02 250 / 0.35)" },
  gold:   { label: "Gold",   color: "oklch(0.88 0.14 75)",  bg: "oklch(0.82 0.14 75 / 0.12)",  border: "oklch(0.82 0.14 75 / 0.4)"  },
};

// ─── Form schema ──────────────────────────────────────────────────────────────

const tierTargetSchema = z.object({
  arrUsd:       z.number().min(0),
  demosPw:      z.number().min(0),
  dialsPw:      z.number().min(0),
  retentionMin: z.number().min(0).max(100),
});

const formSchema = z.object({
  versionLabel:             z.string().min(1, "Label required").max(128),
  effectiveFrom:            z.string().min(1, "Date required"),
  bronzeRate:               z.number().min(0).max(100),
  silverRate:               z.number().min(0).max(100),
  goldRate:                 z.number().min(0).max(100),
  silverStdArr:             z.number().min(0),
  silverStdDemos:           z.number().min(0),
  silverStdDials:           z.number().min(0),
  silverStdRetention:       z.number().min(0).max(100),
  goldStdArr:               z.number().min(0),
  goldStdDemos:             z.number().min(0),
  goldStdDials:             z.number().min(0),
  goldStdRetention:         z.number().min(0).max(100),
  silverTlArr:              z.number().min(0),
  silverTlDemos:            z.number().min(0),
  silverTlDials:            z.number().min(0),
  silverTlRetention:        z.number().min(0).max(100),
  goldTlArr:                z.number().min(0),
  goldTlDemos:              z.number().min(0),
  goldTlDials:              z.number().min(0),
  goldTlRetention:          z.number().min(0).max(100),
  monthlyPayoutMonths:      z.number().int().min(1).max(60),
  onboardingDeductionGbp:   z.number().min(0),
  onboardingArrReductionUsd:z.number().min(0),
  notes:                    z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(rate: number) {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
}

// ─── Version Card ─────────────────────────────────────────────────────────────

type Structure = {
  id: number;
  versionLabel: string;
  effectiveFrom: Date;
  isActive: boolean;
  bronzeRate: number;
  silverRate: number;
  goldRate: number;
  standardTargets: { silver: { arrUsd: number; demosPw: number; dialsPw: number; retentionMin: number }; gold: { arrUsd: number; demosPw: number; dialsPw: number; retentionMin: number } };
  teamLeaderTargets: { silver: { arrUsd: number; demosPw: number; dialsPw: number; retentionMin: number }; gold: { arrUsd: number; demosPw: number; dialsPw: number; retentionMin: number } };
  monthlyPayoutMonths: number;
  onboardingDeductionGbp: number;
  onboardingArrReductionUsd: number;
  createdBy: string;
  notes: string | null;
  createdAt: Date;
};

function VersionCard({
  structure,
  onActivate,
  activating,
}: {
  structure: Structure;
  onActivate: (id: number) => void;
  activating: boolean;
}) {
  const st = structure.standardTargets;
  const tl = structure.teamLeaderTargets;

  return (
    <Card
      className="relative overflow-hidden transition-all duration-200"
      style={{
        borderColor: structure.isActive ? "oklch(0.82 0.14 75 / 0.5)" : undefined,
        background: structure.isActive ? "oklch(0.82 0.14 75 / 0.04)" : undefined,
      }}
    >
      {structure.isActive && (
        <div
          className="absolute top-0 left-0 right-0 h-0.5"
          style={{ background: "oklch(0.82 0.14 75)" }}
        />
      )}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{structure.versionLabel}</CardTitle>
              {structure.isActive ? (
                <Badge className="text-xs gap-1" style={{ background: "oklch(0.82 0.14 75 / 0.15)", color: "oklch(0.88 0.14 75)", border: "1px solid oklch(0.82 0.14 75 / 0.4)" }}>
                  <CheckCircle2 className="w-3 h-3" /> Active
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
                  <Clock className="w-3 h-3" /> Draft
                </Badge>
              )}
            </div>
            <CardDescription className="mt-1 text-xs">
              Effective {formatDate(structure.effectiveFrom)} · Created by {structure.createdBy} on {formatDate(structure.createdAt)}
            </CardDescription>
          </div>
          {!structure.isActive && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5 text-xs"
              style={{ borderColor: "oklch(0.82 0.14 75 / 0.4)", color: "oklch(0.88 0.14 75)" }}
              onClick={() => onActivate(structure.id)}
              disabled={activating}
            >
              <Zap className="w-3 h-3" />
              Activate
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Commission rates */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Commission Rates</p>
          <div className="flex gap-3">
            {(["bronze", "silver", "gold"] as const).map((tier) => (
              <div
                key={tier}
                className="flex-1 rounded-lg p-2.5 text-center"
                style={{ background: TIER_COLORS[tier].bg, border: `1px solid ${TIER_COLORS[tier].border}` }}
              >
                <p className="text-lg font-bold" style={{ color: TIER_COLORS[tier].color }}>
                  {pct(structure[`${tier}Rate`])}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{TIER_COLORS[tier].label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Targets accordion */}
        <Accordion type="single" collapsible>
          <AccordionItem value="targets" className="border-0">
            <AccordionTrigger className="text-xs font-semibold text-muted-foreground uppercase tracking-wider py-1 hover:no-underline">
              Tier Targets
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 pt-1">
                {/* Standard targets */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Standard AE</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left pb-1 font-medium">Tier</th>
                          <th className="text-right pb-1 font-medium">Min ARR</th>
                          <th className="text-right pb-1 font-medium">Demos/wk</th>
                          <th className="text-right pb-1 font-medium">Dials/wk</th>
                          <th className="text-right pb-1 font-medium">Retention</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {(["silver", "gold"] as const).map((tier) => (
                          <tr key={tier}>
                            <td className="py-1 font-medium" style={{ color: TIER_COLORS[tier].color }}>{TIER_COLORS[tier].label}</td>
                            <td className="text-right py-1">${st[tier].arrUsd.toLocaleString()}</td>
                            <td className="text-right py-1">{st[tier].demosPw}</td>
                            <td className="text-right py-1">{st[tier].dialsPw}</td>
                            <td className="text-right py-1">{st[tier].retentionMin}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {/* Team leader targets */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Team Leader (halved)</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left pb-1 font-medium">Tier</th>
                          <th className="text-right pb-1 font-medium">Min ARR</th>
                          <th className="text-right pb-1 font-medium">Demos/wk</th>
                          <th className="text-right pb-1 font-medium">Dials/wk</th>
                          <th className="text-right pb-1 font-medium">Retention</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {(["silver", "gold"] as const).map((tier) => (
                          <tr key={tier}>
                            <td className="py-1 font-medium" style={{ color: TIER_COLORS[tier].color }}>{TIER_COLORS[tier].label}</td>
                            <td className="text-right py-1">${tl[tier].arrUsd.toLocaleString()}</td>
                            <td className="text-right py-1">{tl[tier].demosPw}</td>
                            <td className="text-right py-1">{tl[tier].dialsPw}</td>
                            <td className="text-right py-1">{tl[tier].retentionMin}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="rules" className="border-0">
            <AccordionTrigger className="text-xs font-semibold text-muted-foreground uppercase tracking-wider py-1 hover:no-underline">
              Payout Rules
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="rounded-lg p-2 bg-muted/40 text-center">
                  <p className="text-sm font-bold">{structure.monthlyPayoutMonths}</p>
                  <p className="text-xs text-muted-foreground">Monthly payout months</p>
                </div>
                <div className="rounded-lg p-2 bg-muted/40 text-center">
                  <p className="text-sm font-bold">£{structure.onboardingDeductionGbp.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Onboarding deduction</p>
                </div>
                <div className="rounded-lg p-2 bg-muted/40 text-center">
                  <p className="text-sm font-bold">${structure.onboardingArrReductionUsd.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">ARR reduction (no fee)</p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {structure.notes && (
          <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-3">{structure.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Create Form Dialog ───────────────────────────────────────────────────────

function CreateStructureDialog({
  open,
  onClose,
  activeStructure,
}: {
  open: boolean;
  onClose: () => void;
  activeStructure: Structure | null | undefined;
}) {
  const utils = trpc.useUtils();
  const createMutation = trpc.commissionStructure.create.useMutation({
    onSuccess: () => {
      toast.success("New commission structure version created as draft.");
      utils.commissionStructure.list.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const defaultValues: FormValues = {
    versionLabel: "",
    effectiveFrom: new Date().toISOString().split("T")[0],
    bronzeRate: activeStructure ? +(activeStructure.bronzeRate * 100).toFixed(2) : 13,
    silverRate: activeStructure ? +(activeStructure.silverRate * 100).toFixed(2) : 16,
    goldRate:   activeStructure ? +(activeStructure.goldRate * 100).toFixed(2) : 19,
    silverStdArr:       activeStructure?.standardTargets.silver.arrUsd ?? 20000,
    silverStdDemos:     activeStructure?.standardTargets.silver.demosPw ?? 3,
    silverStdDials:     activeStructure?.standardTargets.silver.dialsPw ?? 100,
    silverStdRetention: activeStructure?.standardTargets.silver.retentionMin ?? 61,
    goldStdArr:         activeStructure?.standardTargets.gold.arrUsd ?? 25000,
    goldStdDemos:       activeStructure?.standardTargets.gold.demosPw ?? 4,
    goldStdDials:       activeStructure?.standardTargets.gold.dialsPw ?? 200,
    goldStdRetention:   activeStructure?.standardTargets.gold.retentionMin ?? 71,
    silverTlArr:        activeStructure?.teamLeaderTargets.silver.arrUsd ?? 10000,
    silverTlDemos:      activeStructure?.teamLeaderTargets.silver.demosPw ?? 2,
    silverTlDials:      activeStructure?.teamLeaderTargets.silver.dialsPw ?? 50,
    silverTlRetention:  activeStructure?.teamLeaderTargets.silver.retentionMin ?? 61,
    goldTlArr:          activeStructure?.teamLeaderTargets.gold.arrUsd ?? 12500,
    goldTlDemos:        activeStructure?.teamLeaderTargets.gold.demosPw ?? 2,
    goldTlDials:        activeStructure?.teamLeaderTargets.gold.dialsPw ?? 100,
    goldTlRetention:    activeStructure?.teamLeaderTargets.gold.retentionMin ?? 71,
    monthlyPayoutMonths:       activeStructure?.monthlyPayoutMonths ?? 13,
    onboardingDeductionGbp:    activeStructure?.onboardingDeductionGbp ?? 500,
    onboardingArrReductionUsd: activeStructure?.onboardingArrReductionUsd ?? 5000,
    notes: "",
  };

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  useEffect(() => {
    if (open) reset(defaultValues);
  }, [open]);

  const onSubmit = (data: FormValues) => {
    createMutation.mutate({
      versionLabel: data.versionLabel,
      effectiveFrom: data.effectiveFrom,
      bronzeRate: data.bronzeRate / 100,
      silverRate: data.silverRate / 100,
      goldRate:   data.goldRate / 100,
      standardTargets: {
        silver: { arrUsd: data.silverStdArr, demosPw: data.silverStdDemos, dialsPw: data.silverStdDials, retentionMin: data.silverStdRetention },
        gold:   { arrUsd: data.goldStdArr,   demosPw: data.goldStdDemos,   dialsPw: data.goldStdDials,   retentionMin: data.goldStdRetention },
      },
      teamLeaderTargets: {
        silver: { arrUsd: data.silverTlArr, demosPw: data.silverTlDemos, dialsPw: data.silverTlDials, retentionMin: data.silverTlRetention },
        gold:   { arrUsd: data.goldTlArr,   demosPw: data.goldTlDemos,   dialsPw: data.goldTlDials,   retentionMin: data.goldTlRetention },
      },
      monthlyPayoutMonths:       data.monthlyPayoutMonths,
      onboardingDeductionGbp:    data.onboardingDeductionGbp,
      onboardingArrReductionUsd: data.onboardingArrReductionUsd,
      notes: data.notes || undefined,
      createdBy: "admin",
    });
  };

  function NumField({ id, label, unit, ...props }: { id: keyof FormValues; label: string; unit?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs">{label}{unit ? <span className="text-muted-foreground ml-1">({unit})</span> : ""}</Label>
        <Input
          id={id}
          type="number"
          step="any"
          className="h-8 text-sm"
          {...register(id, { valueAsNumber: true })}
          {...props}
        />
        {errors[id] && <p className="text-xs text-destructive">{errors[id]?.message as string}</p>}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Commission Structure Version</DialogTitle>
          <DialogDescription>
            This creates a draft version. It will not affect any deals until you activate it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-2">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="versionLabel" className="text-xs">Version Label</Label>
              <Input id="versionLabel" placeholder="e.g. Q2 2026" className="h-8 text-sm" {...register("versionLabel")} />
              {errors.versionLabel && <p className="text-xs text-destructive">{errors.versionLabel.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="effectiveFrom" className="text-xs">Effective From</Label>
              <Input id="effectiveFrom" type="date" className="h-8 text-sm" {...register("effectiveFrom")} />
              {errors.effectiveFrom && <p className="text-xs text-destructive">{errors.effectiveFrom.message}</p>}
            </div>
          </div>

          <Separator />

          {/* Commission rates */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Commission Rates (%)</p>
            <div className="grid grid-cols-3 gap-3">
              <NumField id="bronzeRate" label="Bronze" unit="%" />
              <NumField id="silverRate" label="Silver" unit="%" />
              <NumField id="goldRate"   label="Gold"   unit="%" />
            </div>
          </div>

          <Separator />

          {/* Standard targets */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Standard AE Targets</p>
            <div className="space-y-3">
              {(["silver", "gold"] as const).map((tier) => (
                <div key={tier}>
                  <p className="text-xs font-medium mb-1.5" style={{ color: TIER_COLORS[tier].color }}>{TIER_COLORS[tier].label} Tier</p>
                  <div className="grid grid-cols-4 gap-2">
                    <NumField id={`${tier}StdArr` as keyof FormValues}       label="Min ARR" unit="USD" />
                    <NumField id={`${tier}StdDemos` as keyof FormValues}     label="Demos/wk" />
                    <NumField id={`${tier}StdDials` as keyof FormValues}     label="Dials/wk" />
                    <NumField id={`${tier}StdRetention` as keyof FormValues} label="Retention" unit="%" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Team leader targets */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Team Leader Targets</p>
            <div className="space-y-3">
              {(["silver", "gold"] as const).map((tier) => (
                <div key={tier}>
                  <p className="text-xs font-medium mb-1.5" style={{ color: TIER_COLORS[tier].color }}>{TIER_COLORS[tier].label} Tier</p>
                  <div className="grid grid-cols-4 gap-2">
                    <NumField id={`${tier}TlArr` as keyof FormValues}       label="Min ARR" unit="USD" />
                    <NumField id={`${tier}TlDemos` as keyof FormValues}     label="Demos/wk" />
                    <NumField id={`${tier}TlDials` as keyof FormValues}     label="Dials/wk" />
                    <NumField id={`${tier}TlRetention` as keyof FormValues} label="Retention" unit="%" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Payout rules */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Payout Rules</p>
            <div className="grid grid-cols-3 gap-3">
              <NumField id="monthlyPayoutMonths"       label="Monthly payout months" />
              <NumField id="onboardingDeductionGbp"    label="Onboarding deduction" unit="GBP" />
              <NumField id="onboardingArrReductionUsd" label="ARR reduction (no fee)" unit="USD" />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="notes" className="text-xs">Notes (optional)</Label>
            <Input id="notes" placeholder="e.g. Updated targets for Q2 growth push" className="h-8 text-sm" {...register("notes")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={createMutation.isPending}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create Draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Activate Confirm Dialog ──────────────────────────────────────────────────

function ActivateDialog({
  structure,
  onClose,
}: {
  structure: Structure | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const activateMutation = trpc.commissionStructure.activate.useMutation({
    onSuccess: () => {
      toast.success(`"${structure?.versionLabel}" is now the active commission structure.`);
      utils.commissionStructure.list.invalidate();
      utils.commissionStructure.getActive.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={!!structure} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Activate Commission Structure
          </DialogTitle>
          <DialogDescription>
            You are about to activate <strong>"{structure?.versionLabel}"</strong>. This will immediately apply to all new deals. Existing deals are unaffected — they retain the structure version that was active when they were created.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={activateMutation.isPending}>Cancel</Button>
          <Button
            onClick={() => structure && activateMutation.mutate({ id: structure.id })}
            disabled={activateMutation.isPending}
            style={{ background: "oklch(0.82 0.14 75)", color: "oklch(0.12 0.02 260)" }}
          >
            {activateMutation.isPending ? "Activating…" : "Confirm Activation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CommissionStructurePage() {
  const [, navigate] = useLocation();
  const { ae, isLoading } = useAeAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [activateTarget, setActivateTarget] = useState<Structure | null>(null);

  useEffect(() => {
    if (!isLoading && !ae) navigate("/");
  }, [ae, isLoading]);

  const { data: structures = [], isLoading: structuresLoading } = trpc.commissionStructure.list.useQuery(
    undefined,
    { enabled: !!ae }
  );

  const { data: activeStructure } = trpc.commissionStructure.getActive.useQuery(
    undefined,
    { enabled: !!ae }
  );

  if (isLoading || !ae) return null;

  const activeVersion = structures.find((s) => s.isActive);
  const draftVersions = structures.filter((s) => !s.isActive);

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "Cormorant Garamond, serif" }}>
              Commission Structure
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage tier thresholds, commission rates, and payout rules. New deals always use the active version.
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="gap-2"
            style={{ background: "oklch(0.82 0.14 75)", color: "oklch(0.12 0.02 260)" }}
          >
            <Plus className="w-4 h-4" />
            New Version
          </Button>
        </div>

        {/* Active version */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4" style={{ color: "oklch(0.82 0.14 75)" }} />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Active Version</h2>
          </div>
          {structuresLoading ? (
            <Card className="h-32 animate-pulse bg-muted/30" />
          ) : activeVersion ? (
            <VersionCard structure={activeVersion} onActivate={() => {}} activating={false} />
          ) : (
            <Card className="p-6 text-center text-muted-foreground text-sm">
              No active commission structure. Create one and activate it.
            </Card>
          )}
        </div>

        {/* Draft versions */}
        {draftVersions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Draft Versions</h2>
              <Badge variant="outline" className="text-xs">{draftVersions.length}</Badge>
            </div>
            <div className="space-y-3">
              {draftVersions.map((s) => (
                <VersionCard
                  key={s.id}
                  structure={s}
                  onActivate={(id) => setActivateTarget(structures.find((x) => x.id === id) ?? null)}
                  activating={false}
                />
              ))}
            </div>
          </div>
        )}

        {/* How it works */}
        <Card className="bg-muted/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Settings2 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">How version control works</p>
                <p>When you create a new deal, it is permanently linked to the <em>currently active</em> version. Activating a new version does not retroactively change any existing deals or their payout schedules.</p>
                <p>To update the structure, create a new draft version, review it, then activate it. The previous version is preserved as a historical record.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <CreateStructureDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        activeStructure={activeStructure}
      />

      <ActivateDialog
        structure={activateTarget}
        onClose={() => setActivateTarget(null)}
      />
    </AppLayout>
  );
}
