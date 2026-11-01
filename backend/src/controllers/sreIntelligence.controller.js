/**
 * SRE Intelligence Controller — InfraPulse Phase 23K
 */

import { infrastructureHealthService } from '../services/sre-intelligence/infrastructureHealth.service.js';
import { predictiveRiskService } from '../services/sre-intelligence/predictiveRisk.service.js';
import { sloBudgetService } from '../services/sre-intelligence/sloBudget.service.js';
import { capacityOptimizationService } from '../services/sre-intelligence/capacityOptimization.service.js';
import { sreRecommendationService } from '../services/sre-intelligence/sreRecommendation.service.js';
import { sreIntelligenceRepository } from '../repositories/sreIntelligence.repository.js';
import { ApiError } from '../utils/ApiError.js';

export const sreIntelligenceController = {
  /**
   * GET /api/sre-intelligence/overview
   */
  async getOverview(req, res, next) {
    try {
      const tenantId = req.query.tenantId || req.user?.organizationId || 'default_tenant';
      const environment = req.query.environment || 'staging';

      const [health, sloOverview, risks, capacity, recommendations] = await Promise.all([
        infrastructureHealthService.evaluateHealth({ tenantId, environment, persistSnapshot: false }),
        sloBudgetService.getSloOverview({ tenantId, environment }),
        sreIntelligenceRepository.listRiskPredictions({ tenantId, environment, status: 'ACTIVE', limit: 10 }),
        sreIntelligenceRepository.listCapacityInsights({ tenantId, environment, status: 'OPEN', limit: 10 }),
        sreIntelligenceRepository.listOperationalRecommendations({ tenantId, environment, status: 'OPEN', limit: 10 })
      ]);

      res.json({
        success: true,
        data: {
          health,
          sloOverview,
          risks,
          capacity,
          recommendations,
          meta: {
            tenantId,
            environment,
            timestamp: new Date().toISOString()
          }
        }
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/sre-intelligence/health
   */
  async getHealth(req, res, next) {
    try {
      const tenantId = req.query.tenantId || req.user?.organizationId || 'default_tenant';
      const environment = req.query.environment || 'staging';

      const health = await infrastructureHealthService.evaluateHealth({
        tenantId,
        environment,
        persistSnapshot: true
      });

      res.json({
        success: true,
        data: health
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/sre-intelligence/predictive-risks
   */
  async getPredictiveRisks(req, res, next) {
    try {
      const tenantId = req.query.tenantId || req.user?.organizationId || 'default_tenant';
      const environment = req.query.environment || 'staging';
      const status = req.query.status || 'ACTIVE';
      const riskLevel = req.query.riskLevel || null;

      const risks = await sreIntelligenceRepository.listRiskPredictions({
        tenantId,
        environment,
        status,
        riskLevel,
        limit: 50
      });

      res.json({
        success: true,
        data: risks
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/sre-intelligence/slo-summary
   */
  async getSloSummary(req, res, next) {
    try {
      const tenantId = req.query.tenantId || req.user?.organizationId || 'default_tenant';
      const environment = req.query.environment || 'staging';

      const summary = await sloBudgetService.getSloOverview({ tenantId, environment });

      res.json({
        success: true,
        data: summary
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/sre-intelligence/capacity-optimization
   */
  async getCapacityOptimization(req, res, next) {
    try {
      const tenantId = req.query.tenantId || req.user?.organizationId || 'default_tenant';
      const environment = req.query.environment || 'staging';

      const capacity = await capacityOptimizationService.analyzeCapacityAndCost({
        tenantId,
        environment,
        persist: true
      });

      res.json({
        success: true,
        data: capacity
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/sre-intelligence/recommendations
   */
  async getRecommendations(req, res, next) {
    try {
      const tenantId = req.query.tenantId || req.user?.organizationId || 'default_tenant';
      const environment = req.query.environment || 'staging';
      const status = req.query.status || null;
      const priority = req.query.priority || null;

      const recs = await sreRecommendationService.listRecommendations({
        tenantId,
        environment,
        status,
        priority,
        limit: 50
      });

      res.json({
        success: true,
        data: recs
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/sre-intelligence/recommendations/:id/status
   */
  async updateRecommendationStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, resolutionNotes } = req.body;
      const tenantId = req.user?.organizationId || 'default_tenant';
      const assignedTo = req.user?.id || req.user?.email || 'sre_engineer';

      if (!status || !['OPEN', 'IN_REVIEW', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'].includes(status)) {
        throw ApiError.badRequest(`Invalid status: ${status}. Must be one of OPEN, IN_REVIEW, ACKNOWLEDGED, RESOLVED, DISMISSED.`);
      }

      const updated = await sreRecommendationService.updateRecommendationStatus(id, {
        status,
        resolutionNotes,
        assignedTo
      }, tenantId);

      if (!updated) {
        throw ApiError.notFound(`Recommendation "${id}" not found.`);
      }

      res.json({
        success: true,
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }
};

