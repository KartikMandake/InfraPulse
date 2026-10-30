import { MockAiProvider } from './mockProvider.js';
import { OpenAiProvider } from './openaiProvider.js';
import { GeminiAiProvider } from './geminiProvider.js';

let activeProviderInstance = null;
const registeredProviders = new Map();

export function registerAiProvider(name, providerInstance) {
  if (providerInstance) {
    registeredProviders.set(name.toLowerCase(), providerInstance);
  } else {
    registeredProviders.delete(name.toLowerCase());
  }
}

export function getAiProvider(customProviderName = null) {
  const providerName = customProviderName || process.env.AI_PROVIDER || 'mock';

  if (registeredProviders.has(providerName.toLowerCase())) {
    return registeredProviders.get(providerName.toLowerCase());
  }

  if (activeProviderInstance && activeProviderInstance.name === providerName) {
    return activeProviderInstance;
  }

  switch (providerName.toLowerCase()) {
    case 'openai':
      activeProviderInstance = new OpenAiProvider();
      break;
    case 'gemini':
      activeProviderInstance = new GeminiAiProvider();
      break;
    case 'mock':
    default:
      activeProviderInstance = new MockAiProvider();
      break;
  }

  return activeProviderInstance;
}
