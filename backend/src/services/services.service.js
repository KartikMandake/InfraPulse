import * as servicesRepo from '../repositories/services.repository.js';
import { getServices as getMemServices, getServiceById as getMemServiceById, updateService as updateMemService } from '../data/services.js';
import { ApiError } from '../utils/ApiError.js';

export async function listServices() {
  try {
    const data = await servicesRepo.findAllServices();
    if (data && data.length > 0) return data;
  } catch (err) {
    console.warn('[ServicesService] DB fallback to memory:', err.message);
  }
  return getMemServices();
}

export async function findServiceById(id) {
  try {
    const service = await servicesRepo.findServiceById(id);
    if (service) return service;
  } catch (err) {
    console.warn('[ServicesService] DB fallback to memory:', err.message);
  }

  const memService = getMemServiceById(id);
  if (!memService) {
    throw ApiError.notFound(`Service with ID "${id}" was not found.`);
  }
  return memService;
}

export async function modifyService(id, updates) {
  try {
    const updated = await servicesRepo.updateServiceRecord(id, updates);
    if (updated) {
      updateMemService(id, updates);
      return updated;
    }
  } catch (err) {
    console.warn('[ServicesService] DB fallback to memory:', err.message);
  }

  const updatedMem = updateMemService(id, updates);
  if (!updatedMem) {
    throw ApiError.notFound(`Service with ID "${id}" was not found.`);
  }
  return updatedMem;
}
