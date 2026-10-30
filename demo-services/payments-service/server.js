import { initTracing } from '../shared/tracing.js';
initTracing('payments-service', '1.0.0');

import express from 'express';
import cors from 'cors';
import { ServiceFaultControls } from '../shared/faultControls.js';

const app = express();
const port = process.env.PORT || 4003;
const faultControls = new ServiceFaultControls('payments-service');

app.use(cors());
app.use(express.json());
app.use(faultControls.middleware());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'payments-service', port });
});

// Process Payment Endpoint
app.post('/api/payments/charge', async (req, res) => {
  const { orderId, amount, customerId } = req.body || {};
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Valid payment amount required' });
  }

  // Simulate transactional processing time
  await new Promise(r => setTimeout(r, 40));

  res.json({
    success: true,
    paymentId: `pay-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
    orderId: orderId || 'ord-unknown',
    customerId: customerId || 'cust-demo',
    amount,
    currency: 'USD',
    status: 'AUTHORIZED',
    processedAt: new Date().toISOString()
  });
});

// Fault control endpoints
app.get('/api/faults', (req, res) => res.json(faultControls.getFaults()));
app.post('/api/faults', (req, res) => res.json(faultControls.setFaults(req.body)));
app.post('/api/faults/reset', (req, res) => res.json(faultControls.reset()));

app.listen(port, () => {
  console.log(`[Demo Service] payments-service listening on http://localhost:${port}`);
});

export default app;

