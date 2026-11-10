'use client';

import {useState} from 'react';
import {PUBLIC_VENDORS} from '@/lib/public-directory';
import {api} from '@/lib/api-client';
import {Button} from '@/components/ui/button';

export function PublicVendorImport({onImported}: {onImported:()=>Promise<void>}) {
  const [selected, setSelected] = useState<string[]>(PUBLIC_VENDORS.map(v => v.id));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return <section className="rounded-xl border bg-card p-4 space-y-3">
    <div><h2 className="font-semibold">Import public staffing companies</h2>
      <p className="text-sm text-muted-foreground">Company websites and careers links checked October 14, 2026. Contacts, partner eligibility and commercial terms require your verification. Existing companies are skipped.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {PUBLIC_VENDORS.map(v => <div key={v.id} className="rounded-lg border p-3 text-sm space-y-1">
        <label className="flex items-center gap-2"><input type="checkbox" checked={selected.includes(v.id)} onChange={e => setSelected(current => e.target.checked ? [...current,v.id] : current.filter(id => id !== v.id))}/>{v.name}</label>
        <div className="flex gap-3 text-xs"><a href={v.source_url} target="_blank" rel="noopener noreferrer" className="underline">Official source ↗</a><a href={v.careers_url} target="_blank" rel="noopener noreferrer" className="underline">Careers ↗</a></div>
      </div>)}
    </div>
    <Button size="sm" disabled={busy || !selected.length} onClick={async () => {
      setBusy(true); setMessage('');
      try {
        const result = await api<{imported:number; skipped:number}>('/api/vendors/import-public', {method:'POST', body:JSON.stringify({ids:selected})});
        setMessage(`Imported ${result.imported} companies; skipped ${result.skipped} existing companies.`);
        await onImported();
      } catch (error) {setMessage((error as Error).message);} finally {setBusy(false);}
    }}>{busy ? 'Importing…' : `Import selected companies (${selected.length})`}</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
