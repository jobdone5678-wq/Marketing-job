import React from 'react';
import Layout from '../../src/app/dashboard/layout';
import {ThemeProvider} from '../../src/components/theme-provider';
import {TooltipProvider} from '../../src/components/ui/tooltip';
import {DashboardOverview} from '../../src/components/dashboard-overview';
import Candidates from '../../src/app/dashboard/candidates/page';
import {CandidateProfileWorkspace} from '../../src/components/candidate-profile-workspace';
import Submissions from '../../src/app/dashboard/submissions/page';
import Capture from '../../src/app/dashboard/application-capture/page';
import Analytics from '../../src/app/dashboard/analytics/page';
import Settings from '../../src/app/dashboard/settings/page';
import Resumes from '../../src/app/dashboard/resumes/page';
import Integrations from '../../src/app/dashboard/integrations/page';
import Billing from '../../src/app/dashboard/billing/page';
import {JobsBrowser} from '../../src/components/jobs-browser';
import {JobBriefsWorkspace} from '../../src/components/job-briefs-workspace';
import JobDetail from '../../src/app/dashboard/jobs/[id]/page';

const jobParams=Promise.resolve({id:'job-1'});
const jobSearch=Promise.resolve({candidateId:'candidate-1'});

export default function PhasePreview(){
 const path=window.location.pathname;
 const page=path==='/dashboard/candidates/profile'?<CandidateProfileWorkspace candidateId="candidate-1"/>:path==='/dashboard/candidates'?<Candidates/>:path==='/dashboard/submissions'?<Submissions/>:path==='/dashboard/application-capture'?<Capture/>:path==='/dashboard/analytics'?<Analytics/>:path==='/dashboard/settings'?<Settings/>:path==='/dashboard/resumes'?<Resumes/>:path==='/dashboard/integrations'?<Integrations/>:path==='/dashboard/billing'?<Billing/>:path==='/dashboard/jobs'?<JobsBrowser/>:path.startsWith('/dashboard/jobs/')?<JobDetail params={jobParams} searchParams={jobSearch}/>:path==='/dashboard/job-matching'?<main className="portal-page"><JobBriefsWorkspace/></main>:<DashboardOverview initialRole="recruiter"/>;
 return <ThemeProvider><TooltipProvider><Layout>{page}</Layout><div className="pointer-events-none fixed right-3 bottom-2 rounded border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground">Synthetic UI fixture · no live candidate data</div></TooltipProvider></ThemeProvider>;
}
