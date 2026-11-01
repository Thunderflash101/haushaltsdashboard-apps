export function normalizeIban(value) {
  const iban=String(value||'').replace(/\s+/g,'').toUpperCase();
  if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban))throw new Error('Bitte eine gültige Haushaltskonto-IBAN eintragen.');
  const rearranged=(iban.slice(4)+iban.slice(0,4)).replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55));
  let rest=0;for(const digit of rearranged)rest=(rest*10+Number(digit))%97;
  if(rest!==1)throw new Error('Bitte die Prüfziffer der Haushaltskonto-IBAN kontrollieren.');
  return iban;
}
export function normalizeConnection(input) {
  const applicationId=String(input.applicationId||'').trim().toLowerCase();
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(applicationId))throw new Error('Bitte eine gültige Enable-Banking-Application-ID eintragen.');
  let url;try {url=new URL(String(input.redirectUrl||'').trim());}catch {throw new Error('Bitte eine gültige HTTPS-Rücksprungadresse eintragen.');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!/^\/api\/webhook\/[A-Za-z0-9_-]{16,128}$/.test(url.pathname))throw new Error('Bitte eine HTTPS-Rücksprungadresse mit /api/webhook/ und einer langen Webhook-ID eintragen. Ohne Benutzername, Passwort oder URL-Parameter.');
  return {applicationId,redirectUrl:url.href,webhook:url.pathname.split('/').at(-1),expectedAccount:normalizeIban(input.expectedAccount)};
}
export function publicConnection(connection) {
  return connection?{applicationId:connection.applicationId,redirectUrl:connection.redirectUrl,expectedAccount:connection.expectedAccount}:{applicationId:'',redirectUrl:'',expectedAccount:''};
}
