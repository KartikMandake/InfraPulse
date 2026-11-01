import crypto from 'node:crypto';
import {query} from '../db/connection.js';
import {decryptCredentials} from '../integrations/core/crypto.js';
import {ApiError} from '../utils/ApiError.js';
import {withTenant} from './tenantContext.js';
function equal(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length>0&&x.length===y.length&&crypto.timingSafeEqual(x,y);}
// Credential discovery happens before a tenant context exists. No caller-selected
// tenant determines authorization; the verified credential owns the scope.
export async function otlpIdentity(req){
  const key=req.headers['x-otlp-key']||req.headers.authorization?.replace(/^Bearer /,'');
  if(!key)throw ApiError.unauthorized('An OTLP ingestion credential is required.');
  const {rows}=await query("SELECT i.id,i.tenant_id,i.environment,i.config,i.enabled,c.encrypted_data,c.iv,c.auth_tag FROM integrations i JOIN integration_credentials c ON c.integration_id=i.id AND c.tenant_id=i.tenant_id WHERE i.provider='opentelemetry'");
  const matches=rows.filter(row=>{if(req.headers['x-integration-id']&&row.id!==req.headers['x-integration-id'])return false;const creds=decryptCredentials({encryptedData:row.encrypted_data,iv:row.iv,authTag:row.auth_tag});return equal(key,creds.ingestionKey||creds.apiKey);});
  if(matches.length!==1||!matches[0].enabled)throw ApiError.unauthorized('Invalid, disabled or ambiguous OTLP ingestion credential.');
  const identity=matches[0];
  if(req.query.tenantId&&req.query.tenantId!==identity.tenant_id)throw ApiError.forbidden('Ingestion tenant must match credential ownership.');
  return identity;
}
export function inIngestionTenant(identity,callback){return withTenant(identity.tenant_id,callback);}
export async function signedIntegrationIdentity(req,provider){
  const signature=req.headers[provider==='github'?'x-hub-signature-256':'x-signature-256'];
  if(!signature)throw ApiError.unauthorized('A signed webhook credential is required.');
  const {rows}=await query('SELECT i.id,i.tenant_id,i.enabled,c.encrypted_data,c.iv,c.auth_tag FROM integrations i JOIN integration_credentials c ON c.integration_id=i.id AND c.tenant_id=i.tenant_id WHERE i.provider=$1',[provider]);
  const matches=rows.filter(row=>{if(req.headers['x-integration-id']&&req.headers['x-integration-id']!==row.id)return false;const credentials=decryptCredentials({encryptedData:row.encrypted_data,iv:row.iv,authTag:row.auth_tag});const secret=credentials.webhookSecret||credentials.signingSecret;if(!secret)return false;return equal(signature,'sha256='+crypto.createHmac('sha256',secret).update(req.rawBody||JSON.stringify(req.body)).digest('hex'));});
  if(matches.length!==1||!matches[0].enabled)throw ApiError.unauthorized('Invalid or ambiguous webhook signature.');
  if(req.query.tenantId&&req.query.tenantId!==matches[0].tenant_id)throw ApiError.forbidden('Webhook tenant must match credential ownership.');
  return matches[0];
}
