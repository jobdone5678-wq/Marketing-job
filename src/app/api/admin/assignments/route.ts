import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { z } from 'zod';

const assignmentInput = z.object({
  candidateId: z.uuid(),
  profileId: z.uuid(),
  assignmentRole: z.enum(['recruiter', 'technical_recruiter']),
});

export async function POST(request: Request) {
  return protectedRoute(request, 'admin', async actor => {
    const input = assignmentInput.parse(await request.json());
    const { data, error } = await database().rpc('set_candidate_staff_assignment', {
      p_actor: actor.id,
      p_candidate: input.candidateId,
      p_profile: input.profileId,
      p_assignment_role: input.assignmentRole,
      p_assigned: true,
    });
    if (error?.message.includes('Select an active')) throw new CaptureError('Choose an active staff member with this role.', 400);
    if (error?.message.includes('Candidate not found')) throw new CaptureError('Candidate not found.', 404);
    checkDb(error);
    return { assignmentId: data, candidateId: input.candidateId, profileId: input.profileId, assignmentRole: input.assignmentRole };
  });
}

export async function DELETE(request: Request) {
  return protectedRoute(request, 'admin', async actor => {
    const input = assignmentInput.parse(await request.json());
    const { data, error } = await database().rpc('set_candidate_staff_assignment', {
      p_actor: actor.id,
      p_candidate: input.candidateId,
      p_profile: input.profileId,
      p_assignment_role: input.assignmentRole,
      p_assigned: false,
    });
    if (error?.message.includes('Assignment changed')) throw new CaptureError('Assignment changed. Reload and try again.', 409);
    checkDb(error);
    return { removed: Boolean(data), candidateId: input.candidateId, profileId: input.profileId, assignmentRole: input.assignmentRole };
  });
}
