import net from 'node:net';
import dns from 'node:dns';
const metadata=new Set(['169.254.169.254','100.100.100.200','instance-data','metadata.google.internal','fd00:ec2::254']);
const privateAllowed=()=>process.env.ALLOW_PRIVATE_INTEGRATION_ENDPOINTS==='true'||process.env.NODE_ENV==='test';
function normalizeHost(host){return host.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');}
function mappedV4(ip){if(!ip.startsWith('::ffff:'))return ip;const value=ip.slice(7);if(net.isIP(value)===4)return value;const parts=value.split(':');if(parts.length===2){const n=parseInt(parts[0],16)*65536+parseInt(parts[1],16);return [24,16,8,0].map(bits=>(n>>>bits)&255).join('.');}return ip;}
export function checkAddress(address,{allowPrivate=privateAllowed()}={}){
 const ip=mappedV4(normalizeHost(address));
 if(metadata.has(ip)||ip.startsWith('169.254.')||/^fe[89ab][0-9a-f]:/i.test(ip))return {safe:false,error:'Cloud metadata and link-local addresses are prohibited.'};
 const isPrivate=ip==='localhost'||ip.endsWith('.localhost')||ip==='::'||ip==='::1'||/^f[cd][0-9a-f]{2}:/.test(ip)||/^(?:0|10|127)\./.test(ip)||/^192\.168\./.test(ip)||/^172\.(?:1[6-9]|2\d|3[01])\./.test(ip)||/^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip);
 if(isPrivate&&!allowPrivate)return {safe:false,error:'Private or loopback integration endpoints require explicit opt-in.'};
 if(ip.startsWith('ff')&&net.isIP(ip)===6)return {safe:false,error:'Multicast endpoints are prohibited.'};
 return {safe:true};
}
export function validateEndpointUrl(endpointUrl,{allowPrivate=privateAllowed()}={}){
 let parsed;try{parsed=new URL(endpointUrl);}catch{return {safe:false,error:'A valid HTTP(S) integration endpoint is required.'};}
 if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)return {safe:false,error:'Endpoint protocol must be HTTP(S), without embedded credentials.'};
 const host=normalizeHost(parsed.hostname);
 if(metadata.has(host))return {safe:false,error:'Access to cloud metadata endpoints is prohibited.'};
 const checked=checkAddress(host,{allowPrivate});return {...checked,...(checked.safe?{parsedUrl:parsed}:{})};
}
// Validate every resolved address and give the transport that exact result. This
// prevents validation/use DNS races. Redirects are rejected by provider transports.
export function secureLookup(hostname,options,callback){
 if(typeof options==='function'){callback=options;options={};}
 dns.lookup(hostname,{all:true,verbatim:true},(error,records)=>{
  if(error)return callback(error);
  if(!records.length||records.some(r=>!checkAddress(r.address).safe))return callback(new Error('SSRF policy rejected resolved integration address.'));
  const eligible=options?.family?records.filter(r=>r.family===Number(options.family)):records;
  if(!eligible.length)return callback(new Error('No permitted address for requested family.'));
  if(options?.all)return callback(null,eligible);
  callback(null,eligible[0].address,eligible[0].family);
 });
}
