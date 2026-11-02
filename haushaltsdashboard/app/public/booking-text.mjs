export function isPayPal(booking){return /paypal/i.test(String(booking.payee||''));}
export function purposePreview(booking){
  const raw=String(booking.purpose||booking.booking||'');
  if(!isPayPal(booking))return raw;
  const merchant=raw.replace(/^\s*\d{6,}\s*\/PP\.\d+\.PP\/[.\s]*/i,'').trim();
  return merchant||raw;
}
export function genericPayPalKeyword(contract,booking){
  if(!isPayPal(booking))return false;
  const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const keyword=norm(contract.matchKeyword),payee=norm(booking.payee);
  return !keyword||keyword==='paypal'||keyword===payee||/^paypal(?:europe|sarl|ciesca|europeetsciesca)*$/.test(keyword);
}
