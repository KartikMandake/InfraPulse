import {config} from '../config/env.js';
const ingestion=/^\/api\/integrations\/(?:otlp\/v1\/(?:metrics|traces|logs)|webhooks\/(?:github|grafana)|deployments\/webhook)\/?$/;
export function csrfProtection(req,res,next){
  if(['GET','HEAD','OPTIONS'].includes(req.method)||/^\/api\/auth\/(?:login|register)\/?$/.test(req.path)||ingestion.test(req.path))return next();
  if(!req.cookies?.infrapulse_session)return next();
  let origin;try{origin=req.headers.origin?new URL(req.headers.origin).origin:req.headers.referer?new URL(req.headers.referer).origin:null;}catch{return res.status(403).json({error:'Forbidden',message:'Invalid CSRF origin.'});}
  const allowed=new Set(config.corsOrigins.map(value=>{try{return new URL(value).origin;}catch{return null;}}));
  if(origin&&allowed.has(origin))return next();
  if(!origin&&req.headers['x-requested-with']==='XMLHttpRequest')return next();
  return res.status(403).json({error:'Forbidden',message:'Cross-Site Request Forgery (CSRF) validation failed.'});
}
