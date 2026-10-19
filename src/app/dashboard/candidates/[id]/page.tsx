import {CandidateProfileWorkspace} from '@/components/candidate-profile-workspace';
export default async function CandidateProfilePage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <CandidateProfileWorkspace key={id} candidateId={id}/>;}
