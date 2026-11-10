"use client";
import {Combobox} from '@base-ui/react/combobox';
import {Check,ChevronsUpDown} from 'lucide-react';

type Option={value:string;label:string};
export function CandidateCombobox({candidates,value,onChange}:{candidates:{id:string;full_name:string}[];value:string;onChange:(value:string)=>void}) {
 const options:Option[]=[{value:'all',label:'All candidates'},...candidates.map(c=>({value:c.id,label:c.full_name}))];
 return <Combobox.Root items={options} value={options.find(option=>option.value===value)||options[0]} onValueChange={item=>onChange(item?.value||'all')} isItemEqualToValue={(a,b)=>a.value===b.value}>
  <div className="relative w-full min-w-0 sm:w-48"><Combobox.Input aria-label="Filter by candidate" placeholder="Find a candidate…" className="h-8 w-full rounded-lg border border-input bg-card pl-3 pr-8 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/30"/><Combobox.Trigger aria-label="Choose candidate" className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted-foreground"><ChevronsUpDown className="size-3.5"/></Combobox.Trigger></div>
  <Combobox.Portal><Combobox.Positioner sideOffset={6} className="z-50"><Combobox.Popup className="max-h-72 w-[var(--anchor-width)] min-w-48 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"><Combobox.Empty className="p-3 text-xs text-muted-foreground">No candidates found</Combobox.Empty><Combobox.List>{(item:Option)=><Combobox.Item key={item.value} value={item} className="flex cursor-default items-center justify-between gap-3 rounded-md px-3 py-2 text-xs outline-none data-highlighted:bg-muted"><span>{item.label}</span><Combobox.ItemIndicator><Check className="size-3.5"/></Combobox.ItemIndicator></Combobox.Item>}</Combobox.List></Combobox.Popup></Combobox.Positioner></Combobox.Portal>
 </Combobox.Root>;
}
