import type {ReactNode} from 'react';
import {Inbox, AlertCircle} from 'lucide-react';

export function WorkspaceHeading({eyebrow,title,description,actions}:{eyebrow?:string;title:string;description:string;actions?:ReactNode}) {
 return <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0">{eyebrow&&<p className="mb-1 text-xs font-medium text-muted-foreground">{eyebrow}</p>}<h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1><p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p></div>{actions&&<div className="flex flex-wrap items-center gap-2">{actions}</div>}</div>;
}
export function WorkspaceSkeleton({rows=5}:{rows?:number}) {
 return <div role="status" aria-label="Loading workspace" className="divide-y rounded-xl border border-border/60 bg-card"><span className="sr-only">Loading saved records…</span>{Array.from({length:rows},(_,i)=><div key={i} className="flex items-center gap-4 p-4"><div className="skeleton size-9 shrink-0 rounded-lg"/><div className="flex-1 space-y-2"><div className="skeleton h-3 w-1/3 rounded"/><div className="skeleton h-2.5 w-2/3 rounded"/></div><div className="skeleton hidden h-6 w-20 rounded sm:block"/></div>)}</div>;
}
export function WorkspaceEmpty({title,description,action}:{title:string;description:string;action?:ReactNode}) {
 return <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center"><div className="flex size-11 items-center justify-center rounded-xl border bg-muted/40"><Inbox className="size-5 text-muted-foreground"/></div><div><h2 className="text-sm font-semibold">{title}</h2><p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p></div>{action}</div>;
}
export function WorkspaceError({message,children}:{message:string;children?:ReactNode}) {
 return <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm"><AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive"/><div className="min-w-0 flex-1"><p className="text-destructive">{message}</p>{children}</div></div>;
}
