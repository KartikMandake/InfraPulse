// ==============================================================================
// InfraPulse - Cloud Resource Inventory Service
// Manages resource querying, health check probing, and baseline seeding
// ==============================================================================

import { cloudLifecycleRepository } from '../../../repositories/cloudLifecycle.repository.js';
import { INITIAL_CLOUD_RESOURCES, INITIAL_CLOUD_SCHEDULES } from '../../../data/cloudResources.js';
import { AwsCloudProvider } from '../providers/aws.provider.js';
import { DockerCloudProvider } from '../providers/docker.provider.js';
import { KubernetesCloudProvider } from '../providers/kubernetes.provider.js';
import { MockCloudProvider } from '../providers/mock.provider.js';

const providers = {
  aws: new AwsCloudProvider(),
  docker: new DockerCloudProvider(),
  kubernetes: new KubernetesCloudProvider(),
  mock: new MockCloudProvider()
};

export const resourceService = {
  getProvider(providerName) {
    return providers[providerName] || providers.mock;
  },

  async getAllResources(filters = {}) {
    return cloudLifecycleRepository.getAllResources(filters);
  },

  async getResourceById(id) {
    const res = await cloudLifecycleRepository.getResourceById(id);
    if (!res) throw new Error(`Cloud resource with ID '${id}' not found.`);
    return res;
  },

  async probeHealth(id) {
    const resource = await this.getResourceById(id);
    const provider = this.getProvider(resource.provider);
    const healthResult = await provider.healthCheck(resource);

    await cloudLifecycleRepository.updateResourceHealth(id, healthResult.status);
    return {
      resourceId: id,
      ...healthResult
    };
  },

  async seedBaselineInventory() {
    for (const r of INITIAL_CLOUD_RESOURCES) {
      await cloudLifecycleRepository.upsertResource(r);
    }
    for (const s of INITIAL_CLOUD_SCHEDULES) {
      await cloudLifecycleRepository.upsertSchedule(s);
    }
    return {
      resourcesSeeded: INITIAL_CLOUD_RESOURCES.length,
      schedulesSeeded: INITIAL_CLOUD_SCHEDULES.length
    };
  }
};

