/**
 * Operational Intelligence Controller — InfraPulse Phase 18
 */

import { operationalIntelligenceService } from '../services/operationalIntelligence.service.js';
import { preventiveRecommendationService } from '../services/preventiveRecommendation.service.js';
import { operationalTrendsService } from '../services/operationalTrends.service.js';

export const operationalIntelligenceController = {
  async getOverview(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const summary = await operationalIntelligenceService.getDashboardSummary(tenantId);
      res.status(200).json({ success: true, data: summary });
    } catch (err) {
      next(err);
    }
  },

  async getPatterns(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const { category, serviceId } = req.query;
      const patterns = await operationalIntelligenceService.getPatterns({ category, serviceId }, tenantId);
      res.status(200).json({ success: true, count: patterns.length, data: patterns });
    } catch (err) {
      next(err);
    }
  },

  async getPatternById(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const pattern = await operationalIntelligenceService.getPatternById(req.params.id, tenantId);
      res.status(200).json({ success: true, data: pattern });
    } catch (err) {
      next(err);
    }
  },

  async syncPatterns(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const patterns = await operationalIntelligenceService.analyzeAndSyncPatterns(tenantId);
      res.status(200).json({ success: true, count: patterns.length, data: patterns });
    } catch (err) {
      next(err);
    }
  },

  async getServiceRiskProfiles(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const profiles = await operationalIntelligenceService.getServiceRiskProfiles(tenantId);
      res.status(200).json({ success: true, count: profiles.length, data: profiles });
    } catch (err) {
      next(err);
    }
  },

  async getServiceRiskProfile(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const profile = await operationalIntelligenceService.getServiceRiskProfile(req.params.serviceId, tenantId);
      res.status(200).json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  },

  async evaluateServiceRiskProfiles(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const profiles = await operationalIntelligenceService.evaluateAndSyncServiceRiskProfiles(tenantId);
      res.status(200).json({ success: true, count: profiles.length, data: profiles });
    } catch (err) {
      next(err);
    }
  },

  async getEarlyWarnings(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const { serviceId, severity } = req.query;
      const warnings = await operationalIntelligenceService.getEarlyWarnings({ serviceId, severity }, tenantId);
      res.status(200).json({ success: true, count: warnings.length, data: warnings });
    } catch (err) {
      next(err);
    }
  },

  async syncEarlyWarnings(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const warnings = await operationalIntelligenceService.evaluateAndSyncEarlyWarnings(tenantId);
      res.status(200).json({ success: true, count: warnings.length, data: warnings });
    } catch (err) {
      next(err);
    }
  },

  async getRecommendations(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const { serviceId, status, priority } = req.query;
      const recs = await preventiveRecommendationService.listRecommendations({ serviceId, status, priority }, tenantId);
      res.status(200).json({ success: true, count: recs.length, data: recs });
    } catch (err) {
      next(err);
    }
  },

  async getRecommendationById(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const rec = await preventiveRecommendationService.getRecommendation(req.params.id, tenantId);
      res.status(200).json({ success: true, data: rec });
    } catch (err) {
      next(err);
    }
  },

  async createRecommendation(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const rec = await preventiveRecommendationService.createRecommendation(req.body, req.user, tenantId);
      res.status(201).json({ success: true, data: rec });
    } catch (err) {
      next(err);
    }
  },

  async transitionRecommendationStatus(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const updated = await preventiveRecommendationService.transitionStatus(
        req.params.id,
        req.body,
        req.user,
        tenantId
      );
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  async getTrends(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const days = parseInt(req.query.days, 10) || 30;
      const trends = await operationalTrendsService.computeTrends({ days, tenantId });
      res.status(200).json({ success: true, data: trends });
    } catch (err) {
      next(err);
    }
  },

  async captureTrendSnapshot(req, res, next) {
    try {
      const tenantId = req.user?.tenantId || 'default_tenant';
      const days = parseInt(req.body.days, 10) || 30;
      const snapshot = await operationalTrendsService.captureSnapshot({ days, tenantId });
      res.status(201).json({ success: true, data: snapshot });
    } catch (err) {
      next(err);
    }
  }
};

