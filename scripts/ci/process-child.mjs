process.on('message',message=>{if(message==='infrapulse-ci-owned-shutdown')process.emit('SIGTERM');});
await import('../../backend/src/entrypoint.js');
