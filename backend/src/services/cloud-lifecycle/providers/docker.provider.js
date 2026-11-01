// ==============================================================================
// InfraPulse - Docker Compose Lifecycle Provider (Deterministic Simulation)
// Manages container state transitions while preserving persistent volumes
// ==============================================================================

import { MockCloudProvider } from './mock.provider.js';

export class DockerCloudProvider extends MockCloudProvider {
  constructor() {
    super('docker');
  }

  async stop(resource) {
    const res = await super.stop(resource);
    res.dockerDetails = {
      containerName: resource.metadata?.container_name || resource.name,
      namedVolumePreserved: resource.persistence_requirements?.volume_name || null,
      signal: 'SIGTERM'
    };
    return res;
  }

  async start(resource) {
    const res = await super.start(resource);
    res.dockerDetails = {
      containerName: resource.metadata?.container_name || resource.name,
      network: 'infrapulse-staging-net',
      status: 'Up (healthy)'
    };
    return res;
  }
}

