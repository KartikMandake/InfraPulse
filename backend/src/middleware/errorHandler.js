import {config} from '../config/env.js';
import {logger,redact} from '../utils/logger.js';
export function errorHandler(err, req, res, next) {
  if(res.headersSent)return next(err);
  const databaseUnavailable=['ECONNREFUSED','ECONNRESET','57P01','57P02','57P03','53300'].includes(err.code);
  const suggested=Number(err.statusCode)||(err.code==='42501'?403:err.code==='23505'?409:databaseUnavailable?503:500);
  const statusCode=Number.isInteger(suggested)&&suggested>=400&&suggested<=599?suggested:500;
  const message = databaseUnavailable?'Database unavailable. Retry when readiness is restored.':config.productionLike&&(statusCode>=500||!err.statusCode)?(statusCode===403?'Access denied.':statusCode===409?'Operation conflict.':'Internal server error.'):redact(err.message || 'Internal Server Error');

  logger.error('HTTP request failed',{correlationId:req.correlationId,method:req.method,route:req.path,statusCode,code:err.code,...(!config.productionLike?{message:err.message}:{})});

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      statusCode,
      details: config.productionLike?null:redact(err.details || null),
      correlationId:req.correlationId||null
    }
  });
}

