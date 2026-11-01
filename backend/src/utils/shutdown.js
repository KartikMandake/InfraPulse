import {logger} from './logger.js';

export function createShutdown({stopWorkers=()=>Promise.resolve(),closeHttp=()=>Promise.resolve(),closeDatabase,timeoutMs=25000,exit=code=>process.exit(code)}){
  let closing;
  return signal=>{
    if(closing)return closing;
    closing=(async()=>{
      logger.info('Graceful shutdown started',{signal});
      const timer=setTimeout(()=>{logger.error('Graceful shutdown deadline exceeded');exit(1);},timeoutMs);timer.unref();
      try{const drained=stopWorkers();await Promise.all([closeHttp(),drained]);await closeDatabase();clearTimeout(timer);logger.info('Graceful shutdown completed');exit(0);}
      catch(error){clearTimeout(timer);logger.error('Graceful shutdown failed',{code:error.code});exit(1);}
    })();return closing;
  };
}
