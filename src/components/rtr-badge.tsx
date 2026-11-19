'use client';

import { useState } from 'react';
import { FileText, Download, Eye, Copy, Check, AlertCircle, Calendar, Loader2 } from 'lucide-react';
import type { RTRDocumentReference } from '@/types/database';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { WorkspaceError } from '@/components/workspace-ui';

type Props = {
  rtrDocument?: RTRDocumentReference | null;
  candidateName?: string;
  companyName?: string;
  jobTitle?: string;
};

export function RTRBadge(props: Props) {
  return (
    <RTRBadgeView
      key={`${props.rtrDocument?.id || 'none'}:${props.rtrDocument?.filename || ''}:${props.rtrDocument?.rtr_status || ''}`}
      {...props}
    />
  );
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
          <Badge className="gap-1 rounded-[6px] border-primary/20 bg-primary/15 px-2 py-1 font-medium text-primary">
            <Check className="size-2.5 text-primary" />
            Signed
          </Badge>
        );
      case 'expired':
        return (
          <Badge
            variant="destructive"
            className="gap-1 rounded-[6px] px-2 py-1 font-medium"
          >
            <AlertCircle className="size-2.5" />
            Expired
          </Badge>
        );
      case 'rejected':
        return (
          <Badge
            variant="secondary"
            className="text-destructive border-destructive/30 gap-1 rounded-[6px] px-2 py-1 font-medium"
          >
            <AlertCircle className="size-2.5" />
            Rejected
          </Badge>
        );
      case 'received':
      default:
        return (
          <Badge className="gap-1 rounded-[6px] border-amber-500/30 bg-amber-500/15 px-2 py-1 font-medium text-amber-700 dark:text-amber-400">
            <AlertCircle className="size-2.5 text-amber-500" />
            Received
          </Badge>
        );
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'vendor_rtr':
        return 'Vendor RTR';
      case 'client_rtr':
        return 'Client RTR';
      case 'direct_rtr':
        return 'Direct RTR';
      default:
        return 'RTR';
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
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => void preview()}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-[8px] border px-2 py-1.5 text-[11px] font-medium transition-shadow hover:shadow-sm ${rtr.rtr_status ==='signed' ? 'border-primary/20 bg-primary/10 text-primary ' : 'border-border bg-background text-foreground'}`}
              >
                <FileText className="size-3 shrink-0" />
                <span>{getTypeLabel(rtr.rtr_type)}</span>
              </button>
              {getStatusBadge(rtr.rtr_status)}
            </div>
            <p
              className="text-muted-foreground max-w-full truncate text-[11px]"
              title={rtr.filename}
            >
              {rtr.filename}
            </p>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="h-4 px-1.5 py-0 text-[11px] font-medium">
                {rtr.vendor_name || 'No vendor'}
              </Badge>
              {rtr.expiration_date && (
                <Badge variant="outline" className="h-4 px-1.5 py-0 text-[11px] font-medium">
                  <Calendar className="size-2.5" />
                  Expires {rtr.expiration_date}
                </Badge>
              )}
              {rtr.hourly_rate && (
                <Badge className="h-4 gap-0.5 border-border bg-muted px-1.5 py-0 text-[11px] font-medium text-muted-foreground">
                  ${rtr.hourly_rate}/hr
                </Badge>
              )}
              {rtr.daily_rate && (
                <Badge className="h-4 gap-0.5 border-border bg-muted px-1.5 py-0 text-[11px] font-medium text-muted-foreground">
                  ${rtr.daily_rate}/day
                </Badge>
              )}
              {rtr.monthly_rate && (
                <Badge className="h-4 gap-0.5 border-border bg-muted px-1.5 py-0 text-[11px] font-medium text-muted-foreground">
                  ${rtr.monthly_rate}/mo
                </Badge>
              )}
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => void preview()}
                  aria-label="Preview RTR document"
                >
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
                  {opening ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Download className="size-3" />
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void preview()}
            className="text-muted-foreground"
          >
            <FileText className="size-3" />
            No RTR recorded
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <p className="text-muted-foreground mb-1 text-[11px] font-medium">
              Right to Represent
            </p>
            <DialogTitle>RTR Document</DialogTitle>
            <DialogDescription>
              {rtr
                ? `The RTR document for ${candidateName || 'this candidate'} · ${jobTitle || 'the role'} at ${companyName || 'the company'}.`
                : 'No RTR document is available for this application.'}
            </DialogDescription>
          </DialogHeader>

          {error && <WorkspaceError message={error} />}

          {rtr && (
            <>
              <div className="border-border/60 bg-muted/30 flex flex-wrap items-center justify-between gap-2 rounded-[10px] border p-3 text-[13px]">
                <span className="min-w-0 font-medium break-all">{rtr.filename}</span>
                <span className="text-muted-foreground">
                  {getTypeLabel(rtr.rtr_type)} · {rtr.vendor_name || 'Direct'}
                </span>
              </div>

              <div className="border-border/60 bg-card min-h-0 flex-1 space-y-3 overflow-y-auto rounded-[10px] border p-4">
                <div className="grid grid-cols-2 gap-3 text-[13px]">
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
                      <p className="font-medium text-amber-700 dark:text-amber-400">
                        {rtr.expiration_date}
                      </p>
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

              <div className="border-border/60 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
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
