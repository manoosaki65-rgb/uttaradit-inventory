export const columns:Record<string,string>={seq:'seq',item:'item',unit:'unit',inventory:'inventory_no',keyed:'keyed',day:'received_day',month:'received_month',year:'received_year',category:'category',fund:'fund',fundYear:'fund_year',amount:'amount',note:'note',officer:'officer'};
export function validateRecord(input:Record<string,unknown>, previous?:Record<string,unknown>){
  const record={...previous,...input};
  for(const field of ['seq','day','month','year','amount'])record[field]=Number(record[field]);
  for(const field of ['item','unit','inventory','keyed','category','fund','fundYear','note','officer'])record[field]=String(record[field]??'').trim();
  const year=Number(record.year),ce=year<100?year+1957:year>=2400?year-543:year;
  const date=new Date(Date.UTC(ce,Number(record.month)-1,Number(record.day)));
  if(!Number.isInteger(record.seq)||Number(record.seq)<1||!record.inventory)throw new Error('กรุณาระบุลำดับและเลข Inventory');
  if(!Number.isInteger(year)||ce<1900||date.getUTCFullYear()!==ce||date.getUTCMonth()+1!==record.month||date.getUTCDate()!==record.day)throw new Error('วันที่รับเอกสารไม่ถูกต้อง');
  if(!Number.isFinite(record.amount)||Number(record.amount)<0)throw new Error('วงเงินไม่ถูกต้อง');
  if(!['','68','69','70'].includes(String(record.fundYear)))throw new Error('ปีแหล่งเงินต้องเป็น 68, 69 หรือ 70');
  return record;
}
