export function parseIntegrationDraft(configText,credentialsText){
  let config,credentials;try{config=JSON.parse(configText);credentials=JSON.parse(credentialsText);}catch{throw new Error('Configuration and credentials must contain valid JSON.');}
  if(!config||Array.isArray(config)||typeof config!=='object'||!credentials||Array.isArray(credentials)||typeof credentials!=='object')throw new Error('Configuration and credentials must be JSON objects.');
  return {config,credentials};
}
export async function copyText(text,clipboard=globalThis.navigator?.clipboard){
  try{if(!clipboard?.writeText)throw new Error('Clipboard unavailable.');await clipboard.writeText(text);return {ok:true};}catch{return {ok:false,error:'Clipboard access was denied or is unavailable. Allow clipboard access and try again.'};}
}
