import { initTracing } from '../shared/tracing.js';
initTracing('api-gateway', '1.0.0');

import express from 'express';
import cors from 'cors';
import { ServiceFaultControls } from '../shared/faultControls.js';

const app = express();
const port = process.env.PORT || 4001;
const ordersServiceUrl = process.env.ORDERS_SERVICE_URL || 'http://localhost:4002';
const faultControls = new ServiceFaultControls('api-gateway');

app.use(cors());
app.use(express.json());
app.use(faultControls.middleware());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'api-gateway', port });
});

// Gateway Checkout Ingress (Calls orders-service which calls payments-service)
app.post('/api/checkout', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeoutMs = faultControls.getFaults().downstreamTimeout ? 150 : 7000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const orderRes = await fetch(`${ordersServiceUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const orderData = await orderRes.json().catch(() => ({}));
    if (!orderRes.ok) {
      return res.status(orderRes.status).json({
        error: 'Checkout processing failed in downstream mesh',
        gatewayStatus: orderRes.status,
        details: orderData
      });
    }

    res.status(200).json({
      success: true,
      message: 'Checkout succeeded through distributed mesh',
      checkoutData: orderData
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({
        error: 'Gateway Timeout awaiting orders-service',
        service: 'api-gateway'
      });
    }
    res.status(500).json({ error: err.message, service: 'api-gateway' });
  }
});

// Fault control endpoints
app.get('/api/faults', (req, res) => res.json(faultControls.getFaults()));
app.post('/api/faults', (req, res) => res.json(faultControls.setFaults(req.body)));
app.post('/api/faults/reset', (req, res) => res.json(faultControls.reset()));

app.listen(port, () => {
  console.log(`[Demo Service] api-gateway listening on http://localhost:${port}`);
});

export default app;

