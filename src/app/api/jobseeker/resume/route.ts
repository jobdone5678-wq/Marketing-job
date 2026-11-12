import { extensionProfile, cors } from "@/lib/capture/server";
import { database, checkDb, CaptureError } from "@/lib/db/admin";
import { createServerClient } from "@supabase/ssr";
import { cookies as getNextCookies } from "next/headers";

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

async function getAuthenticatedUserId(request: Request): Promise<{ id: string; role: string }> {
  // 1. Try Extension Bearer token
  try {
    const profile = await extensionProfile(request);
    if (profile && profile.id) {
      return { id: profile.id, role: profile.role };
    }
  } catch {}

  // 2. Try Supabase Cookie Session
  const nextCookieStore = await getNextCookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return nextCookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await database()
      .from("profiles")
      .select("id, role, status")
      .eq("id", user.id)
      .maybeSingle();

    return {
      id: user.id,
      role: profile?.role || "candidate",
    };
  }

  throw new CaptureError("Unauthorized. Please sign in to save your resume.", 401);
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUserId(request);
    const body = await request.json();

    const filename = String(body.filename || "Resume.pdf");
    const raw_text = String(body.raw_text || body.source_text || "");
    const fullName = String(body.fullName || body.full_name || "Applicant").trim();
    const email = String(body.email || "");
    const phone = String(body.phone || "");
    const skills = Array.isArray(body.skills) ? body.skills.join(", ") : String(body.skills || "");

    // Check if candidate record already exists for this user
    const { data: existingCandidate } = await database()
      .from("candidates")
      .select("id, version")
      .eq("user_id", user.id)
      .maybeSingle();

    let savedCandidate;

    if (existingCandidate) {
      const { data, error } = await database()
        .from("candidates")
        .update({
          full_name: fullName,
          email: email || undefined,
          phone: phone || undefined,
          primary_skills: skills || undefined,
          confirmed_facts: {
            raw_text,
            filename,
            uploadedAt: new Date().toISOString(),
          },
          provenance_status: "confirmed",
          version: (existingCandidate.version || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingCandidate.id)
        .select()
        .single();

      checkDb(error);
      savedCandidate = data;
    } else {
      const { data, error } = await database()
        .from("candidates")
        .insert({
          user_id: user.id,
          full_name: fullName,
          email,
          phone,
          primary_skills: skills,
          confirmed_facts: {
            raw_text,
            filename,
            uploadedAt: new Date().toISOString(),
          },
          provenance_status: "confirmed",
          is_active_bench: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      checkDb(error);
      savedCandidate = data;
    }

    return cors(
      request,
      Response.json({
        success: true,
        candidate: savedCandidate,
      })
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to save resume.";
    const status = error instanceof CaptureError ? error.status : 500;
    return cors(request, Response.json({ error: msg }, { status }));
  }
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUserId(request);

    const { data: candidate, error } = await database()
      .from("candidates")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    checkDb(error);

    return cors(
      request,
      Response.json({
        success: true,
        candidate: candidate || null,
      })
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load resume.";
    const status = error instanceof CaptureError ? error.status : 500;
    return cors(request, Response.json({ error: msg }, { status }));
  }
}
