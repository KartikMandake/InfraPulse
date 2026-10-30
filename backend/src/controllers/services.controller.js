import * as servicesService from '../services/services.service.js';

export async function getAllServices(req, res, next) {
  try {
    const data = await servicesService.listServices();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
}

export async function getServiceById(req, res, next) {
  try {
    const data = await servicesService.findServiceById(req.params.serviceId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateService(req, res, next) {
  try {
    const data = await servicesService.modifyService(req.params.serviceId, req.body);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
