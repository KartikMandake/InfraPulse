import {AsyncLocalStorage} from 'node:async_hooks';
import {ApiError} from '../utils/ApiError.js';
const storage=new AsyncLocalStorage();
export function tenantContext(){return storage.getStore()||null;}
export function withTenant(tenantId,callback){
  if(typeof tenantId!=='string'||!tenantId||tenantId.length>64)throw ApiError.forbidden('A trusted tenant identity is required.');
  const current=tenantContext();
  if(current&&current.tenantId!==tenantId)throw ApiError.forbidden('Cross-tenant context switching is prohibited.');
  return storage.run({tenantId},callback);
}
export function tenantBoundary(req,res,next){
  if(!req.user?.tenantId)return res.status(401).json({error:'Unauthorized',message:'Authentication with tenant membership is required.'});
  const tenantId=req.user.tenantId;
  if([req.query?.tenantId,req.query?.organizationId,req.body?.tenantId,req.body?.organizationId].some(value=>value!==undefined&&value!==tenantId))return res.status(403).json({error:'Forbidden',message:'Tenant identity is derived from authenticated membership.'});
  req.tenantId=tenantId;
  withTenant(tenantId,next);
}
