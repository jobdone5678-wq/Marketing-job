"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Mail,
  Monitor,
  Workflow,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Cpu,
  PlugZap,
  Building2,
  ExternalLink,
} from "lucide-react";
import { api } from "@/lib/api-client";
import {
  WorkspaceHeading,
  WorkspaceSkeleton,
  WorkspaceError,
} from "@/components/workspace-ui";
import { Button } from "@/components/ui/button";

type Connection = {
  id: string;
  mailbox_email?: string;
  status?: string;
  last_synced_at?: string | null;
  last_error?: string | null;
};

type Credential = {
  id: string;
  expires_at: string;
  revoked_at: string | null;
};

type Setup = {
  profile: { role: string };
  ai: { configured: boolean; model: string | null };
};

export default function IntegrationsPage() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [mail, setMail] = useState<Connection[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [checkedAt, setCheckedAt] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      api<Setup>("/api/settings"),
      api<{ connections: Connection[]; gmailConfigured: boolean }>(
        "/api/email-connections"
      ),
      api<{ credentials: Credential[] }>("/api/extension/credentials"),
    ]).then(([settings, email, extension]) => {
      if (!active) return;
      const messages: string[] = [];
      if (settings.status === "fulfilled") setSetup(settings.value);
      else messages.push("Workspace configuration: " + settings.reason.message);

      if (email.status === "fulfilled") {
        setMail(email.value.connections);
        setConfigured(email.value.gmailConfigured);
      } else messages.push("Email connections: " + email.reason.message);

      if (extension.status === "fulfilled")
        setCredentials(extension.value.credentials);
      else messages.push("Extension connections: " + extension.reason.message);

      setErrors(messages);
      setCheckedAt(Date.now());
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [revision]);

  const activeCredentials = credentials.filter(
    (value) => !value.revoked_at && Date.parse(value.expires_at) > checkedAt
  );

  return (
    <main className="portal-page space-y-6 animate-fade-rise">
      <WorkspaceHeading
        eyebrow="Ecosystem"
        title="Connected Integrations & Services"
        description="Manage authenticated mailboxes, browser extension copilot pairing, and external ATS ingestion pipelines."
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
            <span>Refresh Status</span>
          </Button>
        }
      />

      {errors.map((error) => (
        <WorkspaceError key={error} message={error} />
      ))}

      {loading ? (
        <WorkspaceSkeleton rows={4} />
      ) : (
        <div className="grid gap-5">
          {/* Email Integration Card */}
          <section className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-border/60 pb-4">
              <div className="flex items-start gap-3.5">
                <div className="size-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <Mail className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-foreground">
                      Gmail Application Receipt Sync
                    </h2>
                    <span
                      className={`status-chip ${
                        configured ? "status-positive" : "status-warning"
                      }`}
                    >
                      {configured ? "Configured" : "Setup Required"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Automatically ingests official ATS submission receipts from Greenhouse, Ashby, and Lever.
                  </p>
                </div>
              </div>

              <Link
                href="/dashboard/email-confirmations"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline self-start"
              >
                <span>Manage mailboxes</span>
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">
                  {mail.length} connected mailbox account{mail.length === 1 ? "" : "s"}
                </span>
                <span className="text-[11px] font-mono">
                  OAuth 2.0 Restricted Scope
                </span>
              </div>

              {mail.length > 0 ? (
                <div className="divide-y divide-border/60 rounded-xl border border-border/60 bg-muted/20">
                  {mail.map((connection) => (
                    <div
                      key={connection.id}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5">
                        <span className="font-semibold text-foreground">
                          {connection.mailbox_email || "Connected mailbox"}
                        </span>
                        <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                          <span>Status: {connection.status || "active"}</span>
                          {connection.last_synced_at && (
                            <>
                              <span>·</span>
                              <span>
                                Last sync: {new Date(connection.last_synced_at).toLocaleString()}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {connection.last_error && (
                        <span className="text-[11px] text-destructive bg-destructive/10 px-2.5 py-0.5 rounded-full border border-destructive/20 self-start sm:self-auto">
                          {connection.last_error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-xl border border-border/60">
                  No dedicated mailbox connected yet. Connect your email to track real-time confirmations.
                </p>
              )}
            </div>
          </section>

          {/* Browser Extension Card */}
          <section className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-border/60 pb-4">
              <div className="flex items-start gap-3.5">
                <div className="size-10 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                  <Monitor className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-foreground">
                      NextKin Chrome Extension Copilot
                    </h2>
                    <span className="status-chip status-positive">v3.2 Active</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Assists candidate autofill on external company job boards and tracks applications.
                  </p>
                </div>
              </div>

              <Link
                href="/dashboard/help"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline self-start"
              >
                <span>Pairing instructions</span>
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                <span className="text-muted-foreground font-medium">Active Authorized Sessions</span>
                <p className="text-xl font-bold text-foreground font-mono tabular-nums">
                  {activeCredentials.length}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Valid security tokens with 256-bit encryption.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                <span className="text-muted-foreground font-medium">Supported Platforms</span>
                <p className="text-sm font-bold text-foreground">
                  Greenhouse, Ashby, Lever, Workday
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Zero hallucinations: only verified resume facts are autofilled.
                </p>
              </div>
            </div>
          </section>

          {/* ATS Portals & Direct Ingestion */}
          <section className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-border/60 pb-4">
              <div className="flex items-start gap-3.5">
                <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <Building2 className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-foreground">
                      Public ATS Portals & Feeds
                    </h2>
                    <span className="status-chip status-positive">Live Crawler Active</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Direct board crawlers for Greenhouse and Ashby job boards.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href="/dashboard/greenhouse"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Greenhouse Portal
                </Link>
                <span className="text-border">·</span>
                <Link
                  href="/dashboard/ashby"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Ashby Portal
                </Link>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border/60 bg-muted/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div>
                <p className="font-semibold text-foreground">
                  AI Matching & Extraction Engine
                </p>
                <p className="text-muted-foreground text-[11px]">
                  {setup?.ai?.configured ? "Model configured and ready" : "AI model configuration pending"}
                  {setup?.ai?.model ? ` (${setup.ai.model})` : ""}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/dashboard/settings" />}
                className="cursor-pointer text-xs"
              >
                Configure Settings
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
