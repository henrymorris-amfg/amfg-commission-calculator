import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { MONTH_NAMES } from "../../../shared/commission";

interface ChurnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (churnYear: number, churnMonth: number, churnReason?: string) => void;
  isLoading: boolean;
}

export function ChurnModal({ isOpen, onClose, onConfirm, isLoading }: ChurnModalProps) {
  const [churnYear, setChurnYear] = useState(new Date().getFullYear());
  const [churnMonth, setChurnMonth] = useState(new Date().getMonth() + 1);
  const [churnReason, setChurnReason] = useState("");

  const handleConfirm = () => {
    onConfirm(churnYear, churnMonth, churnReason || undefined);
    setChurnReason("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Deal as Churned</DialogTitle>
          <DialogDescription>
            Select the month when the customer churned. Payouts after this month will be removed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="churn-year">Year</Label>
              <Input
                id="churn-year"
                type="number"
                value={churnYear}
                onChange={(e) => setChurnYear(parseInt(e.target.value))}
                min={2020}
                max={2030}
              />
            </div>
            <div>
              <Label htmlFor="churn-month">Month</Label>
              <select
                id="churn-month"
                value={churnMonth}
                onChange={(e) => setChurnMonth(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="churn-reason">Reason (optional)</Label>
            <Input
              id="churn-reason"
              placeholder="e.g., Budget cuts, switched vendors, bankruptcy"
              value={churnReason}
              onChange={(e) => setChurnReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? "Marking..." : "Mark as Churned"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
