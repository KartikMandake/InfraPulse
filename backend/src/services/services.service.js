import {tenantContext} from '../security/tenantContext.js';
import * as servicesRepo from '../repositories/services.repository.js';
import { getServices as unsafe_getMemServices, getServiceById as unsafe_getMemServiceById, updateService as unsafe_updateMemService } from '../data/services.js';
import { ApiError } from '../utils/ApiError.js';

export async function listServices() {
  try {
    const data = await servicesRepo.findAllServices();
    if (data && (data.length > 0 || tenantContext())) return data;
  } catch (err) {
    if(tenantContext())throw err;
    console.warn('[ServicesService] DB fallback to memory:', err.message);
  }
  return getMemServices();
}

export async function findServiceById(id) {
  try {
    const service = await servicesRepo.findServiceById(id);
    if (service) return service;
  } catch (err) {
    if(tenantContext())throw err;
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
    if(tenantContext())throw err;
    console.warn('[ServicesService] DB fallback to memory:', err.message);
  }

  const updatedMem = updateMemService(id, updates);
  if (!updatedMem) {
    throw ApiError.notFound(`Service with ID "${id}" was not found.`);
  }
  return updatedMem;
}

const getMemServices=(...args)=>tenantContext()?[]:unsafe_getMemServices(...args);

const getMemServiceById=(...args)=>tenantContext()?null:unsafe_getMemServiceById(...args);

const updateMemService=(...args)=>tenantContext()?null:unsafe_updateMemService(...args);
