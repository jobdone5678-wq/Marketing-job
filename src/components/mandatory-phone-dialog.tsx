"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/client";
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
import { PhoneIcon, ShieldAlertIcon } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

export function MandatoryPhoneDialog() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function checkUserPhone() {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) return;

      setUser(data.user);

      // Check if phone was stored in localStorage during OAuth
      let pendingPhone = "";
      if (typeof window !== "undefined") {
        pendingPhone = localStorage.getItem("oauth_phone") || "";
      }

      // Check current profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", data.user.id)
        .single();

      if (profile?.phone && profile.phone.trim().length > 0) {
        // Already has phone number
        if (pendingPhone) {
          localStorage.removeItem("oauth_phone");
        }
        setOpen(false);
        return;
      }

      // If pending phone from OAuth is available, auto-save it!
      if (pendingPhone && pendingPhone.trim().length >= 8) {
        try {
          await supabase
            .from("profiles")
            .update({ phone: pendingPhone.trim() })
            .eq("id", data.user.id);
          await supabase.auth.updateUser({
            data: { phone: pendingPhone.trim() },
          });
          localStorage.removeItem("oauth_phone");
          toast.success("Phone number saved to your profile!");
          return;
        } catch {
          // Fall through to show dialog
        }
      }

      // Otherwise, mandatory prompt must be shown!
      setOpen(true);
    }

    checkUserPhone();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 8) {
      setErrorMsg("Please enter a valid phone number with country code (e.g. +1 314 357 5705).");
      return;
    }

    if (!user) return;

    setLoading(true);
    try {
      // 1. Update profiles table
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ phone: cleanPhone })
        .eq("id", user.id);

      if (profileError) {
        console.error("Profile phone update error:", profileError);
      }

      // 2. Update user metadata
      await supabase.auth.updateUser({
        data: { phone: cleanPhone },
      });

      if (typeof window !== "undefined") {
        localStorage.removeItem("oauth_phone");
      }

      toast.success("Phone number verified and saved!");
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update phone number.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md p-6 bg-card border border-border shadow-2xl"
      >
        <DialogHeader className="gap-2">
          <div className="flex items-center gap-2 text-amber-500">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <ShieldAlertIcon className="size-5" />
            </div>
            <DialogTitle className="text-base font-bold text-foreground">
              Phone Number Mandatory
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            Portal security policy requires a verified phone number for all recruiters and candidates.
            Please provide your direct contact or WhatsApp number to access bench candidates and job submissions.
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="p-2.5 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="mandatory-phone" className="text-xs font-semibold">
              Phone / WhatsApp Number <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <PhoneIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground pointer-events-none" />
              <Input
                id="mandatory-phone"
                type="tel"
                placeholder="+1 314 357 5705 or +91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="h-9 pl-8 text-xs font-medium"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Include your country code (e.g. +1 for US, +91 for India).
            </p>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground font-semibold h-9 text-xs cursor-pointer"
          >
            {loading ? "Saving Phone Number..." : "Save Phone & Continue"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
