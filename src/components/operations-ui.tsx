"use client";
import type {ReactNode} from 'react';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {Sheet,SheetTrigger,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';

export function formatMoney(amount:number|string,currency:string){
 return `${currency} ${Number(amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}
export function StatusLabel({value}:{value:string}){
 const tone=['active','paid','approved','submitted'].includes(value)?'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300':['rejected','cancelled','failed','overdue','suspended'].includes(value)?'bg-red-500/10 text-red-700 dark:text-red-300':'bg-amber-500/10 text-amber-800 dark:text-amber-300';
 return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${tone}`}>{value.replaceAll('_',' ')}</span>;
}
export function OperationsCard({title,count,action,onAction,href,children}:{title:string;count?:number;action?:string;onAction?:()=>void;href?:string;children:ReactNode}){
 return <article className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-xs"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{title}{count!==undefined&&<span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{count}</span>}</h3>{action&&(href?<Link className="text-xs font-medium text-primary hover:underline" href={href}>{action}</Link>:<button className="text-xs font-medium text-primary hover:underline" onClick={onAction}>{action}</button>)}</div>{children}</article>;
}
export function ActionSheet({title,description,children}:{title:string;description?:string;children:ReactNode}){
 return <Sheet><SheetTrigger render={<Button/>}>{title}</SheetTrigger><SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-3xl"><SheetHeader className="border-b border-border pr-12"><SheetTitle>{title}</SheetTitle><SheetDescription>{description||'Review the details before saving. Changes refresh the dashboard.'}</SheetDescription></SheetHeader><div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div></SheetContent></Sheet>;
}
export function RecordSheet({title,open,onOpenChange,children}:{title:string;open:boolean;onOpenChange:(open:boolean)=>void;children:ReactNode}){
 return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-3xl"><SheetHeader className="border-b border-border pr-12"><SheetTitle>{title}</SheetTitle><SheetDescription>Employment dates, agreed amounts, external payments and history.</SheetDescription></SheetHeader><div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">{children}</div></SheetContent></Sheet>;
}
