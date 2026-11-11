import 'server-only';
import { database, checkDb } from '@/lib/db/admin';
import {refreshPlacementPeriods} from '@/lib/db/refresh-periods';

export function syncPlacementMonthsBatch(placements:PlacementPeriodSource[]) {return refreshPlacementPeriods(placements.map(row=>row.id));}

type PlacementPeriodSource = { id:string };

export async function syncPlacementMonths(placement: PlacementPeriodSource) {
  const {error}=await database().rpc('sync_placement_months',{p_placement:placement.id});
  checkDb(error);
}

export function isoMonthStart(date:string) { return `${date.slice(0,7)}-01`; }
