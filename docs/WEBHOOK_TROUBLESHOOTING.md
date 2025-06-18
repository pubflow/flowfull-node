# Webhook Troubleshooting Guide

## 🔍 Common Webhook Issues and Solutions

### 1. **Invalid Signature Errors**

#### Symptoms:
- `❌ Invalid Stripe webhook signature` in logs
- HTTP 401 responses from webhook endpoints
- Webhooks not being processed

#### Causes & Solutions:

**Missing STRIPE_WEBHOOK_SECRET:**
```bash
# Check if environment variable is set
echo $STRIPE_WEBHOOK_SECRET

# Should output something like: whsec_1234567890abcdef...
# If empty, set it from your Stripe Dashboard
```

**Incorrect Webhook Secret:**
1. Go to Stripe Dashboard → Webhooks
2. Click on your webhook endpoint
3. Click "Reveal" next to "Signing secret"
4. Copy the secret (starts with `whsec_`)
5. Update your `.env` file:
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_your_actual_secret_here
   ```

**Timestamp Issues (Replay Attack Protection):**
- Stripe rejects webhooks older than 5 minutes
- Ensure your server time is synchronized
- Check if webhook is being retried multiple times

### 2. **Webhook Not Being Processed**

#### Symptoms:
- Webhook received but payment status not updated
- No logs showing webhook processing
- Database shows unprocessed webhooks

#### Solutions:

**Check Webhook Processing:**
```bash
# Run diagnostics script
bun run scripts/webhook-diagnostics.ts

# Check webhook stats
curl http://localhost:3001/bridge-payment/webhooks/stats

# Process unprocessed webhooks manually
curl -X POST http://localhost:3001/bridge-payment/webhooks/process
```

**Database Issues:**
```bash
# Check for unprocessed webhooks
curl http://localhost:3001/bridge-payment/webhooks/provider/stripe?limit=10
```

### 3. **Provider Configuration Issues**

#### Symptoms:
- `Provider 'stripe' is not configured` errors
- `Webhook secret not configured` errors

#### Solutions:

**Check Provider Configuration:**
```bash
# Verify environment variables
STRIPE_SECRET_KEY=sk_test_... # or sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_test_... # or pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
ENABLED_PROVIDERS=stripe,paypal
DEFAULT_PAYMENT_PROVIDER=stripe
```

**Verify Provider Initialization:**
```bash
# Use diagnostics endpoint
curl http://localhost:3001/bridge-payment/webhooks/diagnostics
```

### 4. **Webhook Endpoint Configuration**

#### Stripe Dashboard Setup:
1. **URL:** `https://yourdomain.com/bridge-payment/webhooks/stripe`
2. **Events to send:**
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`
   - `payment_intent.requires_action`
   - `customer.*`
   - `payment_method.*`

#### PayPal Dashboard Setup:
1. **URL:** `https://yourdomain.com/bridge-payment/webhooks/paypal`
2. **Events to send:**
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.DENIED`
   - `BILLING.SUBSCRIPTION.*`

### 5. **Testing Webhooks Locally**

#### Using Stripe CLI:
```bash
# Install Stripe CLI
# Login to your Stripe account
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3001/bridge-payment/webhooks/stripe

# In another terminal, trigger test events
stripe trigger payment_intent.succeeded
stripe trigger payment_intent.payment_failed
```

#### Using ngrok:
```bash
# Install ngrok
npm install -g ngrok

# Expose local server
ngrok http 3001

# Use the ngrok URL in Stripe Dashboard:
# https://abc123.ngrok.io/bridge-payment/webhooks/stripe
```

### 6. **Debugging Tools**

#### Diagnostics Script:
```bash
# Run comprehensive diagnostics
bun run scripts/webhook-diagnostics.ts
```

#### Webhook Diagnostics Endpoint:
```bash
# Get current webhook configuration
curl http://localhost:3001/bridge-payment/webhooks/diagnostics
```

#### Test Signature Validation:
```bash
# Test webhook signature validation
curl -X POST http://localhost:3001/bridge-payment/webhooks/test-signature \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "stripe",
    "payload": "{\"id\":\"evt_test\",\"type\":\"payment_intent.succeeded\"}",
    "signature": "t=1234567890,v1=test_signature"
  }'
```

### 7. **Log Analysis**

#### Key Log Messages:

**✅ Success:**
```
🔔 Received Stripe webhook: payment_intent.succeeded (evt_123)
🔐 Verifying Stripe webhook signature...
✅ Stripe webhook signature verified successfully
✅ Stripe webhook webhook_123 processed successfully
```

**❌ Errors:**
```
❌ Missing Stripe signature header
❌ Invalid Stripe webhook signature
❌ Webhook secret not configured
❌ Failed to process Stripe webhook webhook_123
```

### 8. **Environment-Specific Issues**

#### Development:
- Use Stripe test keys (`sk_test_`, `pk_test_`)
- Use Stripe CLI for local testing
- Webhook secret from test webhook endpoint

#### Production:
- Use Stripe live keys (`sk_live_`, `pk_live_`)
- Configure webhook endpoint with HTTPS
- Webhook secret from live webhook endpoint
- Ensure BASE_URL is set correctly

### 9. **Performance Optimization**

#### Webhook Processing:
- Webhooks are processed asynchronously using `process.nextTick()`
- Failed webhooks are marked as processed to avoid infinite retry
- Use webhook stats endpoint to monitor performance

#### Database Cleanup:
```bash
# Clean up old webhooks (older than 30 days)
curl -X DELETE "http://localhost:3001/bridge-payment/webhooks/cleanup?days=30"
```

### 10. **Security Best Practices**

#### Signature Verification:
- Always verify webhook signatures
- Use HTTPS in production
- Set appropriate timeout values
- Implement replay attack protection

#### Error Handling:
- Log webhook failures for debugging
- Return appropriate HTTP status codes
- Implement idempotency for webhook processing
- Monitor webhook failure rates

## 🚨 Emergency Procedures

### If Webhooks Stop Working:

1. **Check Service Status:**
   ```bash
   curl http://localhost:3001/health
   ```

2. **Verify Configuration:**
   ```bash
   bun run scripts/webhook-diagnostics.ts
   ```

3. **Process Backlog:**
   ```bash
   curl -X POST http://localhost:3001/bridge-payment/webhooks/process
   ```

4. **Check Provider Status:**
   - Stripe: https://status.stripe.com/
   - PayPal: https://www.paypal-status.com/

### Contact Information:
- For urgent issues, check the logs first
- Use diagnostics tools before escalating
- Document error messages and steps to reproduce
