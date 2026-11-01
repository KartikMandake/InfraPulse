import {tenantContext} from '../security/tenantContext.js';
import * as deploymentsRepo from '../repositories/deployments.repository.js';
import { getDeployments as unsafe_getMemDeployments, updateDeployment as unsafe_updateMemDeployment } from '../data/deployments.js';
import { ApiError } from '../utils/ApiError.js';

export async function getAllDeployments(req, res, next) {
  try {
    let data = [];
    try {
      data = await deploymentsRepo.findAllDeployments();
      if (!data || data.length === 0) data = getMemDeployments();
    } catch (err) {
    if(tenantContext())throw err;
      console.warn('[DeploymentsController] DB read fallback:', err.message);
      data = getMemDeployments();
    }
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
}

export async function updateDeploymentRecord(req, res, next) {
  try {
    let updated = null;
    try {
      updated = await deploymentsRepo.updateDeploymentRecord(req.params.deploymentId, req.body);
    } catch (err) {
    if(tenantContext())throw err;
      console.warn('[DeploymentsController] DB update fallback:', err.message);
    }

    const memUpdated = updateMemDeployment(req.params.deploymentId, req.body);
    const finalResult = updated || memUpdated;

    if (!finalResult) {
      throw ApiError.notFound(`Deployment "${req.params.deploymentId}" not found.`);
    }
    res.json({ success: true, data: finalResult });
  } catch (error) {
    next(error);
  }
}

const getMemDeployments=(...args)=>tenantContext()?[]:unsafe_getMemDeployments(...args);

const updateMemDeployment=(...args)=>tenantContext()?null:unsafe_updateMemDeployment(...args);
