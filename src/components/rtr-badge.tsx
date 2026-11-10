"use client";

import { useState } from 'react';
import { FileText, Download, Eye, Copy, Check, AlertCircle, Calendar, Loader2 } from 'lucide-react';
import type { RTRDocumentReference } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { WorkspaceError } from '@/components/workspace-ui';

type Props = {
  rtrDocument?: RTRDocumentReference | null;
  candidateName?: string;
  companyName?: string;
  jobTitle?: string;
};

export function RTRBadge(props: Props) {
  return <RTRBadgeView key={`${props.rtrDocument?.id || 'none'}:${props.rtrDocument?.filename || ''}:${props.rtrDocument?.rtr_status || ''}`} {...props} />;
}

function RTRBadgeView({ candidateName, companyName, jobTitle, rtrDocument }: Props) {
  const rtr = rtrDocument || null;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'signed':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1 font-medium shadow-2xs py-1 px-2 rounded-full">
            <Check className="size-2.5 text-emerald-500" />
            Signed
          </Badge>
        );
      case 'expired':
        return (
          <Badge variant="destructive" className="gap-1 font-medium shadow-2xs py-1 px-2 rounded-full">
            <AlertCircle className="size-2.5" />
            Expired
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="secondary" className="gap-1 font-medium shadow-2xs py-1 px-2 rounded-full text-destructive border-destructive/30">
            <AlertCircle className="size-2.5" />
            Rejected
          </Badge>
        );
      case 'received':
      default:
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1 font-medium shadow-2xs py-1 px-2 rounded-full">
            <AlertCircle className="size-2.5 text-amber-500" />
            Received
          </Badge>
        );
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'vendor_rtr': return 'Vendor RTR';
      case 'client_rtr': return 'Client RTR';
      case 'direct_rtr': return 'Direct RTR';
      default: return 'RTR';
    }
  };

  async function preview() {
    setOpen(true);
    setError(rtr ? '' : 'No RTR document recorded for this application.');
  }

  // The stored file is fetched on demand so listing applications never downloads the documents.
  async function openDocument() {
    if (!rtr?.id) return;
    setOpening(true);
    setError('');
    try {
      const res = await fetch(`/api/rtr/${encodeURIComponent(rtr.id)}/document`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The agreement file is not available.');
      const url =
        data.url ||
        (data.base64 ? `data:${data.mime_type || 'application/pdf'};base64,${data.base64}` : null);
      if (!url) throw new Error('The agreement file is not available.');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'The agreement file is not available.');
      setOpen(true);
    } finally {
      setOpening(false);
    }
  }

  return (
    <>
      <div className="flex max-w-[300px] flex-col items-start gap-1.5">
        {rtr ? (
          <>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => void preview()}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] font-medium transition-shadow hover:shadow-sm ${rtr.rtr_status === 'signed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'border-border bg-background text-foreground'}`}
              >
                <FileText className="size-3 shrink-0" />
                <span>{getTypeLabel(rtr.rtr_type)}</span>
              </button>
              {getStatusBadge(rtr.rtr_status)}
            </div>
            <p className="max-w-full truncate text-[10px] text-muted-foreground" title={rtr.filename}>
              {rtr.filename}
            </p>
            <div className="flex gap-1 flex-wrap">
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-medium">
                {rtr.vendor_name || 'No vendor'}
              </Badge>
              {rtr.expiration_date && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-medium">
                  <Calendar className="size-2.5" />
                  Expires {rtr.expiration_date}
                </Badge>
              )}
              {rtr.hourly_rate && (
                <Badge className="text-[9px] px-1.5 py-0 h-4 font-medium gap-0.5 bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30">
                  ${rtr.hourly_rate}/hr
                </Badge>
              )}
              {rtr.daily_rate && (
                <Badge className="text-[9px] px-1.5 py-0 h-4 font-medium gap-0.5 bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30">
                  ${rtr.daily_rate}/day
                </Badge>
              )}
              {rtr.monthly_rate && (
                <Badge className="text-[9px] px-1.5 py-0 h-4 font-medium gap-0.5 bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30">
                  ${rtr.monthly_rate}/mo
                </Badge>
              )}
              <div className="flex gap-1">
                <Button variant="ghost" size="icon-xs" onClick={() => void preview()} aria-label="Preview RTR document">
                  <Eye className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => void openDocument()}
                  disabled={opening}
                  aria-label="Open RTR document"
                  title="Open the stored agreement file"
                >
                  {opening ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <Button variant="ghost" size="xs" onClick={() => void preview()} className="text-muted-foreground">
            <FileText className="size-3" />
            No RTR recorded
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Right to Represent</p>
            <DialogTitle>RTR Document</DialogTitle>
            <DialogDescription>
              {rtr ? `The RTR document for ${candidateName || 'this candidate'} · ${jobTitle || 'the role'} at ${companyName || 'the company'}.` : 'No RTR document is available for this application.'}
            </DialogDescription>
          </DialogHeader>

          {error && <WorkspaceError message={error} />}

          {rtr && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
                <span className="min-w-0 break-all font-medium">{rtr.filename}</span>
                <span className="text-muted-foreground">
                  {getTypeLabel(rtr.rtr_type)} · {rtr.vendor_name || 'Direct'}
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60 bg-card p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-medium">{getStatusBadge(rtr.rtr_status)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">RTR Type</p>
                    <p className="font-medium">{getTypeLabel(rtr.rtr_type)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Vendor</p>
                    <p className="font-medium">{rtr.vendor_name || 'Direct application'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">RTR Date</p>
                    <p className="font-medium">{rtr.rtr_date}</p>
                  </div>
                  {rtr.expiration_date && (
                    <div>
                      <p className="text-muted-foreground">Expiration Date</p>
                      <p className="font-medium text-amber-600 dark:text-amber-400">{rtr.expiration_date}</p>
                    </div>
                  )}
                  {rtr.vendor_contact_name && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Vendor Contact</p>
                      <p className="font-medium">{rtr.vendor_contact_name}</p>
                    </div>
                  )}
                  {rtr.vendor_contact_email && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Vendor Email</p>
                      <p className="font-medium">{rtr.vendor_contact_email}</p>
                    </div>
                  )}
                  {rtr.vendor_contact_phone && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Vendor Phone</p>
                      <p className="font-medium">{rtr.vendor_contact_phone}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}