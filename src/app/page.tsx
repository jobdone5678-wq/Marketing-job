"use client";
import {useEffect,useMemo,useState} from 'react';
import {AuthPanel} from '@/components/auth-panel';
import {MotionHero} from '@/components/motion-hero';
import {createClient} from '@/lib/client';

export default function Page(){
 const [loading,setLoading]=useState(true);
 const supabase=useMemo(()=>createClient(),[]);
 useEffect(()=>{
  let active=true;
  const params=new URLSearchParams(window.location.search);
  if(params.get('code')||(params.get('token_hash')&&params.get('type'))){
   window.location.href=`/auth/callback${window.location.search}`;return;
  }
  if(params.get('error')||params.get('error_description')){
   void supabase.auth.signOut().then(()=>{if(active)setLoading(false);},()=>{if(active)setLoading(false);});
   return()=>{active=false;};
  }
  // Middleware handles existing-session redirects. SignupForm and the server callback
  // decide the destination after login, preserving stored-role notices and approvals.
  void supabase.auth.getUser().then(()=>{if(active)setLoading(false);},()=>{if(active)setLoading(false);});
  const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>{if(active)setLoading(false);});
  return()=>{active=false;subscription.unsubscribe();};
 },[supabase]);
 if(loading)return <div className="flex h-screen items-center justify-center bg-background text-foreground"><div className="flex flex-col items-center gap-3"><div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent"/><span className="text-xs text-muted-foreground">Loading NextKinHR…</span></div></div>;
 return <div className="grid h-screen max-h-screen w-full overflow-hidden bg-background text-foreground lg:grid-cols-2"><AuthPanel/><MotionHero/></div>;
}
