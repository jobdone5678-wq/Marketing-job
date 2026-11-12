"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  User,
  Cpu,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowUpRight,
  Save,
  Phone,
  Mail,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  WorkspaceHeading,
  WorkspaceSkeleton,
  WorkspaceError,
} from "@/components/workspace-ui";
import type { UserProfile } from "@/types/database";

type Settings = {
  company_name: string | null;
  ai_daily_limit: number;
  source_sync_minutes: number;
};

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [ai, setAi] = useState(false);
  const [aiSetup, setAiSetup] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void api<{
      profile: UserProfile;
      settings: Settings | null;
      ai: {
        configured: boolean;
        model: string | null;
        missing?: string[];
        issues?: string[];
      };
    }>("/api/settings")
      .then((result) => {
        if (!active) return;
        setProfile(result.profile);
        setSettings(result.settings);
        setAi(result.ai.configured);
        setModel(result.ai.model || "");
        setAiSetup([
          ...(result.ai.missing || []).map(
            (name) => "Set " + name + " in each service that executes AI tasks."
          ),
          ...(result.ai.issues || []),
        ]);
        setError("");
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [revision]);

  async function save() {
    setBusy("account");
    setError("");
    setMessage("");
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          profile: {
            full_name: profile?.full_name,
            phone: profile?.phone || null,
            company_name: profile?.company_name || null,
          },
        }),
      });
      setMessage("Account details saved successfully.");
      setTimeout(() => setMessage(""), 4000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="portal-page max-w-4xl space-y-6 animate-fade-rise">
      <WorkspaceHeading
        eyebrow="Preferences"
        title="Settings & Workspace Configuration"
        description="Manage your profile information, contact preferences, and server AI pipeline integration."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setRevision((v) => v + 1);
            }}
            className="gap-2 cursor-pointer"
          >
            <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
            <span>Refresh</span>
          </Button>
        }
      />

      {error && <WorkspaceError message={error} />}

      {message && (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2 animate-fade-in"
        >
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          <span>{message}</span>
        </div>
      )}

      {loading ? (
        <WorkspaceSkeleton rows={4} />
      ) : (
        profile && (
          <Tabs defaultValue="account" className="space-y-6">
            <TabsList variant="line" className="w-full justify-start border-b border-border/70 pb-px">
              <TabsTrigger value="account" className="cursor-pointer">My Account</TabsTrigger>
              <TabsTrigger value="ai" className="cursor-pointer">AI Engine</TabsTrigger>
            </TabsList>

            {/* Account Settings Tab */}
            <TabsContent value="account" className="space-y-6 pt-2">
              <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs">
                <form
                  className="space-y-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                  }}
                >
                  <div className="border-b border-border/60 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-bold text-foreground">
                        Profile & Identity
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Your identity displayed across candidate matches and application receipts
                      </p>
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/60">
                        {profile.email}
                      </span>
                      <span className="status-chip status-positive capitalize">
                        {profile.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <User className="size-3.5 text-muted-foreground" />
                        <span>Full Name</span>
                      </label>
                      <Input
                        autoComplete="name"
                        value={profile.full_name || ""}
                        onChange={(event) =>
                          setProfile({ ...profile, full_name: event.target.value })
                        }
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Phone className="size-3.5 text-muted-foreground" />
                        <span>Contact Phone</span>
                      </label>
                      <Input
                        type="tel"
                        autoComplete="tel"
                        value={profile.phone || ""}
                        onChange={(event) =>
                          setProfile({ ...profile, phone: event.target.value })
                        }
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-border/60">
                    <Link
                      href="/dashboard/integrations"
                      className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                    >
                      <span>View authorized integrations</span>
                      <ArrowUpRight className="size-3.5" />
                    </Link>

                    <Button
                      type="submit"
                      size="sm"
                      disabled={!!busy}
                      className="cursor-pointer gap-1.5"
                    >
                      <Save className="size-3.5" />
                      <span>{busy === "account" ? "Saving…" : "Save Changes"}</span>
                    </Button>
                  </div>
                </form>
              </div>
            </TabsContent>

            {/* AI Engine Tab */}
            <TabsContent value="ai" className="space-y-6 pt-2">
              <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs space-y-5">
                <div className="border-b border-border/60 pb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">
                      AI Application & Skills Extraction Engine
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Model weights powering resume parsing and ATS question autofill
                    </p>
                  </div>
                  <span
                    className={`status-chip ${
                      ai ? "status-positive" : "status-warning"
                    }`}
                  >
                    {ai ? "Configured & Active" : "Unconfigured"}
                  </span>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-xs text-muted-foreground font-medium">Engine Status</span>
                    <p className="text-sm font-bold text-foreground">
                      {ai ? "Online (API Key Authenticated)" : "Missing Configuration"}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-xs text-muted-foreground font-medium">Configured Model</span>
                    <p className="text-xs font-mono font-bold text-primary">
                      {model || "gpt-4o / gpt-4o-mini (Default)"}
                    </p>
                  </div>
                </div>

                {aiSetup.map((issue, index) => (
                  <WorkspaceError key={index} message={issue} />
                ))}

                <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                  Worker health is monitored continuously. Separate processing workers require independent API tokens for background OCR and email parsing.
                </p>

                <div className="pt-2 border-t border-border/60">
                  <Link
                    href="/dashboard/jobs"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <span>Manage Public Job Sources & Crawler</span>
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )
      )}
    </main>
  );
}
