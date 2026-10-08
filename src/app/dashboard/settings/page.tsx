"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2Icon, ShieldCheckIcon, Settings2Icon, BellIcon, KeyIcon } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const [syncInterval, setSyncInterval] = React.useState("5");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Settings Saved", {
      description: "Preferences updated successfully across the marketing portal.",
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Portal Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your marketing portal configuration, connected public feeds, and account preferences.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Account Settings */}
        <div className="rounded-xl border bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 font-semibold text-base">
            <Settings2Icon className="size-4 text-primary" />
            General Information
          </div>
          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="account-name">Account Name</Label>
              <Input id="account-name" defaultValue="Bhargav Reddy" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-email">Email Address</Label>
              <Input id="account-email" defaultValue="bhargav.reddy@gmail.com" readOnly className="bg-muted/50" />
            </div>
          </div>
        </div>

        {/* ATS Integrations */}
        <div className="rounded-xl border bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-base">
              <ShieldCheckIcon className="size-4 text-emerald-600" />
              Connected ATS Integrations
            </div>
            <Badge variant="outline" className="text-emerald-600 border-emerald-500/20 bg-emerald-500/10">
              Keyless Public APIs
            </Badge>
          </div>
          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
              <div>
                <div className="font-medium text-sm">Greenhouse Public Boards API</div>
                <div className="text-xs text-muted-foreground">
                  Endpoint: <code>https://boards-api.greenhouse.io/v1/boards/{`{company}`}/jobs</code>
                </div>
              </div>
              <Badge variant="secondary">Connected</Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
              <div>
                <div className="font-medium text-sm">Ashby Public Posting API</div>
                <div className="text-xs text-muted-foreground">
                  Endpoint: <code>https://api.ashbyhq.com/posting-api/job-board/{`{company}`}</code>
                </div>
              </div>
              <Badge variant="secondary">Connected</Badge>
            </div>
          </div>
        </div>

        {/* Sync Frequency */}
        <div className="rounded-xl border bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 font-semibold text-base">
            <BellIcon className="size-4 text-primary" />
            Live Sync Frequency
          </div>
          <Separator />

          <div className="space-y-2">
            <Label htmlFor="sync-frequency">Auto-refresh interval for public job boards</Label>
            <div className="flex items-center gap-3">
              {["1", "5", "15", "60"].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setSyncInterval(mins)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                    syncInterval === mins
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 hover:bg-muted text-foreground border-transparent"
                  }`}
                >
                  Every {mins} {mins === "1" ? "minute" : "minutes"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" className="cursor-pointer">
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
