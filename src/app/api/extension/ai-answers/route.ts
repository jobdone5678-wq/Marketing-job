import { extensionRoute, extensionProfile, cors } from '@/lib/capture/server';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { requireAIConfiguration } from '@/lib/ai/config';
import OpenAI from 'openai';
import { z } from 'zod';

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

const requestSchema = z.object({
  candidateId: z.string().uuid(),
  jobTitle: z.string().optional().default(''),
  companyName: z.string().optional().default(''),
  jobDescription: z.string().optional().default(''),
  questions: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      type: z.string().optional().default('text'),
      options: z.array(z.string()).optional()
    })
  ).min(1).max(30)
});

export async function POST(request: Request) {
  return extensionRoute(request, async () => {
    await extensionProfile(request);
    const body = await request.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      throw new CaptureError('Invalid question payload', 400);
    }

    const { candidateId, jobTitle, companyName, jobDescription, questions } = parsed.data;

    const db = database();
    const { data: candidate, error: cErr } = await db
      .from('candidates')
      .select('*')
      .eq('id', candidateId)
      .single();
    checkDb(cErr);
    if (!candidate) throw new CaptureError('Candidate not found', 404);

    let config;
    try {
      config = requireAIConfiguration();
    } catch (err: any) {
      // AI configuration not present; return empty answers gracefully
      return { success: false, warning: err.message, answers: {} };
    }

    const openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL
    });

    const candidateSummary = {
      name: candidate.full_name,
      email: candidate.email,
      phone: candidate.phone,
      location: [candidate.current_city, candidate.current_state].filter(Boolean).join(', ') || candidate.full_address,
      currentTitle: candidate.current_job_title,
      currentEmployer: candidate.current_employer,
      totalExperienceYears: candidate.total_experience_years,
      primarySkills: candidate.primary_skills,
      secondarySkills: candidate.secondary_skills,
      education: candidate.highest_qualification ? `${candidate.highest_qualification} from ${candidate.university_name || 'University'}` : '',
      usWorkAuthorized: candidate.authorized_in_usa ? 'Yes' : 'No',
      requiresSponsorship: candidate.need_sponsorship_now || candidate.need_sponsorship_future ? 'Yes' : 'No',
      openToRelocation: candidate.open_to_relocation ? 'Yes' : 'No',
      noticePeriod: candidate.notice_period || candidate.available_to_join,
      employmentHistory: candidate.employment_history || [],
      educationHistory: candidate.education_history || [],
      confirmedFacts: candidate.confirmed_facts || {}
    };

    const prompt = `
You are an expert AI job application copilot (similar to Jobright.ai).
Your task is to answer application and screening questions on behalf of the applicant based on their verified profile and resume data.

Applicant Profile:
${JSON.stringify(candidateSummary, null, 2)}

Target Job:
Title: ${jobTitle || 'Not specified'}
Company: ${companyName || 'Not specified'}
Job Summary: ${(jobDescription || '').slice(0, 1500)}

Questions to Answer:
${JSON.stringify(questions, null, 2)}

Instructions:
1. Provide a professional, concise, truthful response for each question matching the applicant's experience.
2. For multiple choice or dropdown questions with 'options', you MUST pick the single closest option string from the provided options array.
3. For numeric or years-of-experience questions, output only the integer or clean number unless asked otherwise.
4. For behavioral/motivation questions (e.g., "Why do you want to work here?", "Describe a challenging project"), write a concise 2-3 sentence answer highlighting the applicant's relevant skills and enthusiasm.
5. Return a JSON object with this exact schema:
{
  "answers": {
    "<question_id>": "<answer string>"
  }
}
`;

    const completion = await openai.chat.completions.create({
      model: config.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are an accurate, helpful job application autofill assistant. Always return valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    });

    const responseContent = completion.choices[0]?.message?.content || '{}';
    let resultJson = { answers: {} as Record<string, string> };
    try {
      resultJson = JSON.parse(responseContent);
    } catch {}

    return {
      success: true,
      answers: resultJson.answers || {}
    };
  });
}
