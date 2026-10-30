import { initTracing } from '../shared/tracing.js';
initTracing('orders-service', '1.0.0');

import express from 'express';
import cors from 'cors';
import { ServiceFaultControls } from '../shared/faultControls.js';

const app = express();
const port = process.env.PORT || 4002;
const paymentsServiceUrl = process.env.PAYMENTS_SERVICE_URL || 'http://localhost:4003';
const faultControls = new ServiceFaultControls('orders-service');

app.use(cors());
app.use(express.json());
app.use(faultControls.middleware());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'orders-service', port });
});

// Orders creation (Calls downstream payments-service)
app.post('/api/orders', async (req, res) => {
  const { customerId = 'cust-101', items = [{ id: 'sku-1', price: 99.0 }] } = req.body || {};
  const totalAmount = items.reduce((sum, item) => sum + (item.price || 0), 0);
  const orderId = `ord-${Date.now().toString().slice(-6)}`;

  try {
    // Timeout handling
    const controller = new AbortController();
    const timeoutMs = faultControls.getFaults().downstreamTimeout ? 100 : 5000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Call downstream payments-service with trace context automatically propagated by OTel
    const paymentRes = await fetch(`${paymentsServiceUrl}/api/payments/charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, amount: totalAmount, customerId }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!paymentRes.ok) {
      const errData = await paymentRes.json().catch(() => ({}));
      return res.status(502).json({
        error: 'Downstream payment authorization failed',
        downstreamStatus: paymentRes.status,
        details: errData
      });
    }

    const paymentData = await paymentRes.json();

    res.status(201).json({
      success: true,
      orderId,
      customerId,
      totalAmount,
      items,
      payment: paymentData,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({
        error: 'Downstream timeout awaiting payments-service (504 Gateway Timeout)',
        service: 'orders-service'
      });
    }
    res.status(500).json({ error: err.message, service: 'orders-service' });
  }
});

// Fault control endpoints
app.get('/api/faults', (req, res) => res.json(faultControls.getFaults()));
app.post('/api/faults', (req, res) => res.json(faultControls.setFaults(req.body)));
app.post('/api/faults/reset', (req, res) => res.json(faultControls.reset()));

app.listen(port, () => {
  console.log(`[Demo Service] orders-service listening on http://localhost:${port}`);
});

export default app;

