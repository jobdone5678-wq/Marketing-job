import 'server-only';
import { database } from '@/lib/db/admin';
import { checkPayrollError } from '@/lib/payroll/repository';

type PlacementPeriodSource = { id:string };

export async function syncPlacementMonths(placement:PlacementPeriodSource) {
  const {error}=await database().rpc('sync_placement_months',{p_placement:placement.id});
  checkPayrollError(error);
}

export function isoMonthStart(date:string) { return `${date.slice(0,7)}-01`; }
