import {JobBriefsWorkspace} from '@/components/job-briefs-workspace';
import {requireProfile} from '@/lib/auth/require-profile';
export default async function JobMatchingPage(){
 await requireProfile('admin');
 return <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6"><JobBriefsWorkspace/></main>;
}
