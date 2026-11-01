export function securityHeaders(req,res,next){
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Permitted-Cross-Domain-Policies','none');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('X-Download-Options','noopen');
  next();
}

export function requireHttps(config){return (req,res,next)=>{
  if(!config.productionLike||/^\/(?:api\/health\/(?:live|ready)|metrics|api\/self-monitoring\/(?:metrics|overview|alerts|slos))\/?$/.test(req.path))return next();
  if(!req.secure)return res.status(400).json({success:false,error:{message:'HTTPS is required.',correlationId:req.correlationId}});
  res.setHeader('Strict-Transport-Security','max-age=31536000');next();
};}

export function createAuthRateLimiter({limit=10,windowMs=60000,maxEntries=10000,now=Date.now}={}){
  const buckets=new Map();
  return (req,res,next)=>{
    if(req.method!=='POST'||!/^\/api\/auth\/(login|register)\/?$/.test(req.path))return next();
    const time=now();for(const [key,bucket] of buckets)if(bucket.expires<=time)buckets.delete(key);
    const key=req.ip||req.socket?.remoteAddress||'unknown';let bucket=buckets.get(key);
    if(!bucket){if(buckets.size>=maxEntries){res.setHeader('Retry-After',String(Math.ceil(windowMs/1000)));return res.status(429).json({success:false,error:{message:'Authentication rate limit reached.'}});}bucket={count:0,expires:time+windowMs};buckets.set(key,bucket);}
    bucket.count++;if(bucket.count>limit){res.setHeader('Retry-After',String(Math.max(1,Math.ceil((bucket.expires-time)/1000))));return res.status(429).json({success:false,error:{message:'Too many authentication attempts.'}});}next();
  };
}

export function createGeneralApiRateLimiter({limit=300,windowMs=60000,maxEntries=50000,now=Date.now}={}){
  const buckets=new Map();
  return (req,res,next)=>{
    if(/^\/(?:api\/health\/(?:live|ready)|metrics|api\/self-monitoring\/(?:metrics|overview|alerts|slos))\/?$/.test(req.path))return next();
    const time=now();
    for(const [key,bucket] of buckets)if(bucket.expires<=time)buckets.delete(key);
    const key=req.ip||req.socket?.remoteAddress||'unknown';
    let bucket=buckets.get(key);
    if(!bucket){
      if(buckets.size>=maxEntries){
        res.setHeader('Retry-After',String(Math.ceil(windowMs/1000)));
        return res.status(429).json({success:false,error:{message:'API rate limit reached.'}});
      }
      bucket={count:0,expires:time+windowMs};
      buckets.set(key,bucket);
    }
    bucket.count++;
    if(bucket.count>limit){
      res.setHeader('Retry-After',String(Math.max(1,Math.ceil((bucket.expires-time)/1000))));
      return res.status(429).json({success:false,error:{message:'Too many API requests. Please slow down.'}});
    }
    next();
  };
}
