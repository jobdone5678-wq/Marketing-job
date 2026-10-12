function parseDate(value: string): { year:number; month:number; day:number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError('Date must use YYYY-MM-DD.');
  const [,y,m,d] = match;
  const year=Number(y), month=Number(m), day=Number(d);
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw new RangeError('Invalid calendar date.');
  return {year,month,day};
}
function iso(year:number,month:number,day:number):string {
  return `${year.toString().padStart(4,'0')}-${month.toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}`;
}
function anchoredMonthDate(anchor:string,index:number):string {
  const {year,month,day}=parseDate(anchor);
  const absolute=year*12+(month-1)+index;
  const targetYear=Math.floor(absolute/12),targetMonth=absolute%12+1;
  const lastDay=new Date(Date.UTC(targetYear,targetMonth,0)).getUTCDate();
  return iso(targetYear,targetMonth,Math.min(day,lastDay));
}

export function generateSalaryPeriod(hireDate:string,periodIndex:number):{startDate:string;endDateExclusive:string} {
  parseDate(hireDate);
  if(!Number.isSafeInteger(periodIndex)||periodIndex<0)throw new RangeError('Period index must be a non-negative integer.');
  return {startDate:anchoredMonthDate(hireDate,periodIndex),endDateExclusive:anchoredMonthDate(hireDate,periodIndex+1)};
}

export function generateCandidateCalendarPeriod(joinDate:string,monthStart:string,employmentEndDate?:string|null):{startDate:string;endDate:string} {
  const join=parseDate(joinDate),month=parseDate(monthStart);
  if(month.day!==1)throw new RangeError('Calendar month must begin on day 1.');
  const next=new Date(Date.UTC(month.year,month.month,0));
  const first=iso(month.year,month.month,1),last=iso(month.year,month.month,next.getUTCDate());
  const start=joinDate>first?joinDate:first;
  const end=employmentEndDate&&employmentEndDate<last?employmentEndDate:last;
  if(employmentEndDate)parseDate(employmentEndDate);
  if(start>end || (join.year*12+join.month-1)>(month.year*12+month.month-1))throw new RangeError('Employment does not overlap this calendar month.');
  return {startDate:start,endDate:end};
}
