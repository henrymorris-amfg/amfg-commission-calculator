import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil } from "lucide-react";

interface Deal {
  id: number;
  customerName: string;
  startYear: number;
  startMonth: number;
  startDay: number;
  arrUsd: string;
}

interface AdminEditContractStartDateProps {
  deal: Deal;
  onSuccess?: () => void;
}

export function AdminEditContractStartDate({ deal, onSuccess }: AdminEditContractStartDateProps) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(deal.startYear.toString());
  const [month, setMonth] = useState(deal.startMonth.toString().padStart(2, "0"));
  const [day, setDay] = useState(deal.startDay.toString().padStart(2, "0"));

  const updateMutation = trpc.deals.updateContractStartDate.useMutation();

  const handleSave = async () => {
    try {
      const yearNum = parseInt(year);
      const monthNum = parseInt(month);
      const dayNum = parseInt(day);

      if (isNaN(yearNum) || isNaN(monthNum) || isNaN(dayNum)) {
        alert("Please enter valid numbers for year, month, and day");
        return;
      }

      if (monthNum < 1 || monthNum > 12) {
        alert("Month must be between 1 and 12");
        return;
      }

      if (dayNum < 1 || dayNum > 31) {
        alert("Day must be between 1 and 31");
        return;
      }

      await updateMutation.mutateAsync({
        dealId: deal.id,
        startYear: yearNum,
        startMonth: monthNum,
        startDay: dayNum,
      });

      alert(`Contract start date updated to ${yearNum}-${monthNum.toString().padStart(2, "0")}-${dayNum.toString().padStart(2, "0")}. Payouts recalculated.`);

      setOpen(false);
      onSuccess?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update contract start date");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Contract Start Date</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p className="font-semibold">{deal.customerName}</p>
            <p>Current: {deal.startYear}-{deal.startMonth.toString().padStart(2, "0")}-{deal.startDay.toString().padStart(2, "0")}</p>
            <p>ARR: ${Number(deal.arrUsd).toLocaleString()}</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="YYYY"
              />
            </div>
            <div>
              <Label htmlFor="month">Month</Label>
              <Input
                id="month"
                type="number"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                placeholder="MM"
                min="1"
                max="12"
              />
            </div>
            <div>
              <Label htmlFor="day">Day</Label>
              <Input
                id="day"
                type="number"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                placeholder="DD"
                min="1"
                max="31"
              />
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            ⚠️ Changing the contract start date will recalculate all commission payouts for this deal.
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Updating..." : "Update"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
