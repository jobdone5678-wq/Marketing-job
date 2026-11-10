"use client";
import {Button} from '@/components/ui/button';
import {WorkspaceEmpty} from '@/components/workspace-ui';
export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}){return <main className="portal-page"><WorkspaceEmpty title="This workspace could not load" description="Try again to reload the page. Your saved records remain available in their existing workflows." action={<Button onClick={reset}>Try again</Button>}/></main>;}
