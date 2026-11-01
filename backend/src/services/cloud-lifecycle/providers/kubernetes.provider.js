// ==============================================================================
// InfraPulse - Kubernetes Lifecycle Provider (Deterministic Simulation)
// Manages Deployments and StatefulSets via replica scaling & PVC preservation
// ==============================================================================

import { MockCloudProvider } from './mock.provider.js';

export class KubernetesCloudProvider extends MockCloudProvider {
  constructor() {
    super('kubernetes');
  }

  async stop(resource) {
    // For Kubernetes workloads, 'stop' scales replicas to 0 while keeping the Deployment/StatefulSet & PVC
    const res = await this.scale(resource, { replicas: 0 });
    res.kubernetesDetails = {
      workloadType: resource.resource_type === 'k8s_statefulset' ? 'StatefulSet' : 'Deployment',
      namespace: resource.metadata?.namespace || 'infrapulse',
      pvcRetained: resource.persistence_requirements?.has_pvc || false
    };
    return res;
  }

  async start(resource) {
    const targetReplicas = resource.metadata?.replicas || 1;
    const res = await this.scale(resource, { replicas: targetReplicas });
    res.kubernetesDetails = {
      workloadType: resource.resource_type === 'k8s_statefulset' ? 'StatefulSet' : 'Deployment',
      namespace: resource.metadata?.namespace || 'infrapulse',
      podsReady: `${targetReplicas}/${targetReplicas}`
    };
    return res;
  }
}

