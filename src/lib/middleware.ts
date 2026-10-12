import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // API routes handle authentication internally via protectedRoute.
  // Bypassing middleware auth check on /api saves 300ms-600ms of network overhead per API call.
  if (pathname.startsWith('/api')) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Unauthenticated user trying to access protected /dashboard routes
  if (!user && pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  let profile: {role:string;status:string}|null=null;
  if(user&&(pathname==='/'||pathname.startsWith('/dashboard'))){
    const result=await supabase.from('profiles').select('role,status').eq('id',user.id).single();
    profile=result.error?null:result.data;
    if(pathname.startsWith('/dashboard')&&profile?.status!=='active'){
      const url=request.nextUrl.clone();url.pathname='/';url.search='';
      return NextResponse.redirect(url);
    }
    const adminPage=pathname.startsWith('/dashboard/team');
    const staffPage=['/dashboard/payroll','/dashboard/commissions'].some(page=>pathname.startsWith(page));
    if(pathname.startsWith('/dashboard')&&((adminPage&&profile?.role!=='super_admin')||(staffPage&&profile?.role==='client'))){
      const url=request.nextUrl.clone();url.pathname='/dashboard';url.search='';return NextResponse.redirect(url);
    }
  }
  // Pending/suspended users stay on the sign-in/status page rather than redirecting in a loop.
  if (user && pathname === '/' && profile?.status==='active' && !request.nextUrl.searchParams.has('role_notice') && !request.nextUrl.searchParams.has('error')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
