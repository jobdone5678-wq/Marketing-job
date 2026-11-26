import type { Field, Fill, FormContext, PlanResult, UnresolvedDiagnostic } from './planner';
import type { TokenUsageTelemetry } from './provider-client';

export interface PlanApiRequest {
  candidateId: string;
  fields: Field[];
  context?: FormContext;
}

export interface ChooseApiRequest {
  candidateId: string;
  question: Field;
  options: string[];
  context?: FormContext;
}

export interface PlanApiResponse {
  ok: boolean;
  plan?: PlanResult;
  fills?: Fill[];
  executableFills?: Fill[];
  unmapped?: string[];
  unresolved?: UnresolvedDiagnostic[];
  deferred?: string[];
  deferredFieldIds?: string[];
  deferredPlans?: PlanResult['deferredPlans'];
  telemetry?: {
    usage?: TokenUsageTelemetry;
    durationMs?: number;
  };
  error?: string;
  code?: string;
}

export interface ChooseApiResponse {
  ok: boolean;
  choice?: string | null;
  evidenceIds?: string[];
  reason?: string;
  telemetry?: {
    usage?: TokenUsageTelemetry;
    durationMs?: number;
  };
  error?: string;
  code?: string;
}
