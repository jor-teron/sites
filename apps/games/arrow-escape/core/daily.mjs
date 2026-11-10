import {generate} from './levels.mjs';
// A single worldwide date boundary: midnight India Standard Time.
export function dayStamp(date=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get=t=>parts.find(p=>p.type===t).value;return `${get('year')}-${get('month')}-${get('day')}`;
}
export function dayNumber(stamp) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(stamp))return NaN;
  const value=Date.parse(`${stamp}T00:00:00Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0,10)===stamp?value/86400000:NaN;
}
export function dailyLevel(stamp) {
  if(!Number.isFinite(dayNumber(stamp)))throw new Error('Invalid daily date');
  let hash=2166136261;for(const c of stamp)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
  return {...generate(300+hash%201,hash),date:stamp};
}
export function cleanDaily(value) {
  const out={last:'',streak:0,completed:{}};
  if(!value||typeof value!=='object')return out;
  if(Number.isFinite(dayNumber(value.last)))out.last=value.last;
  if(Number.isInteger(value.streak)&&value.streak>=0&&value.streak<=100000)out.streak=value.streak;
  for(const [date,s] of Object.entries(value.completed||{}))
    if(Number.isFinite(dayNumber(date))&&[1,2,3].includes(s))out.completed[date]=s;
  return out;
}
export function completeDaily(value,date,stars) {
  const record=cleanDaily(value);if(!Number.isFinite(dayNumber(date)))return record;
  const already=record.completed[date];
  record.completed[date]=Math.max(already||0,Math.max(1,Math.min(3,stars)));
  if(!already && (!record.last||date>record.last)) {
    record.streak=dayNumber(date)-dayNumber(record.last)===1?record.streak+1:1;record.last=date;
  }
  const dates=Object.keys(record.completed).sort().slice(-60);
  record.completed=Object.fromEntries(dates.map(d=>[d,record.completed[d]]));return record;
}
export function visibleStreak(record,today=dayStamp()) {
  const r=cleanDaily(record),gap=dayNumber(today)-dayNumber(r.last);
  return gap>=0&&gap<=1?r.streak:0;
}
