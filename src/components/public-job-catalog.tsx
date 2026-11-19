'use client';

import { useState } from 'react';
import { PUBLIC_JOB_BOARDS } from '@/lib/public-directory';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

export function PublicJobCatalog({
  provider,
  canSave,
  onSelect,
  onSaved,
}: {
  provider?: string;
  canSave: boolean;
  onSelect: (board: (typeof PUBLIC_JOB_BOARDS)[number]) => void;
  onSaved: () => Promise<void>;
}) {
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const boards = PUBLIC_JOB_BOARDS.filter((b) => !provider || b.provider === provider);
  const board = boards.find((b) => `${b.provider}/${b.board_slug}` === selected);
  return (
    <section className="bg-card space-y-3 rounded-[12px] border p-4">
      <div>
        <h2 className="font-medium">Explore public company boards</h2>
        <p className="text-muted-foreground text-[13px]">
          Company selection is optional. Live ATS Fetch searches all available company boards for a
          provider unless you choose one here.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Public company board"
          className="bg-background max-w-full rounded-[8px] border p-2 text-[13px]"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setMessage('');
          }}
        >
          <option value="">Optional: choose one company</option>
          {boards.map((b) => (
            <option key={`${b.provider}/${b.board_slug}`} value={`${b.provider}/${b.board_slug}`}>
              {b.company} ({b.provider})
            </option>
          ))}
        </select>
        <Button size="sm" disabled={!board} onClick={() => board && onSelect(board)}>
          Fetch selected board
        </Button>
        {board && (
          <a
            className="text-[13px] underline"
            href={board.source_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Official board ↗
          </a>
        )}
        {canSave && (
          <Button
            size="sm"
            variant="outline"
            disabled={!board || saving}
            onClick={async () => {
              if (!board) return;
              setSaving(true);
              setMessage('');
              try {
                await api('/api/job-sources', {
                  method: 'POST',
                  body: JSON.stringify({
                    company: board.company,
                    provider: board.provider,
                    board_slug: board.board_slug,
                  }),
                });
                await onSaved();
                setMessage(
                  'Source saved. Existing source settings are preserved. Use Pull & Save Jobs to refresh enabled sources.'
                );
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : 'Save source to directory'}
          </Button>
        )}
      </div>
      {message && (
        <p role="status" className="text-[13px]">
          {message}
        </p>
      )}
    </section>
  );
}
