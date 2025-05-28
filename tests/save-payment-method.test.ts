import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { testClient } from 'hono/testing';
import { payments } from '../src/routes/payments';

// Mock the database and payment adapter
const mockPaymentRepo = {
  findById: jest.fn(),
  updateStatus: jest.fn(),
};

const mockCustomerRepo = {
  findByUserAndProvider: jest.fn(),
  create: jest.fn(),
};

const mockPaymentMethodRepo = {
  create: jest.fn(),
};

const mockAdapter = {
  confirmPaymentIntent: jest.fn(),
  createCustomer: jest.fn(),
  getPaymentMethod: jest.fn(),
};

// Mock the repository factory functions
jest.mock('../src/lib/database/repositories', () => ({
  getPaymentRepository: () => Promise.resolve(mockPaymentRepo),
  getCustomerRepository: () => Promise.resolve(mockCustomerRepo),
  getPaymentMethodRepository: () => Promise.resolve(mockPaymentMethodRepo),
}));

jest.mock('../src/lib/providers/factory', () => ({
  getPaymentAdapterWithFailover: () => Promise.resolve(mockAdapter),
}));

describe('Save Payment Method During Confirmation', () => {
  const app = new Hono();
  app.route('/', payments);
  const client = testClient(app);

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock responses
    mockPaymentRepo.findById.mockResolvedValue({
      id: 'pay_123',
      user_id: 'user_123',
      provider_id: 'stripe',
      provider_intent_id: 'pi_123',
      is_guest_payment: false,
      guest_email: null,
      guest_data: null,
    });

    mockPaymentRepo.updateStatus.mockResolvedValue({
      id: 'pay_123',
      status: 'succeeded',
      updated_at: new Date().toISOString(),
    });

    mockAdapter.confirmPaymentIntent.mockResolvedValue({
      id: 'pi_123',
      status: 'succeeded',
      payment_method_id: 'pm_123',
    });

    mockAdapter.getPaymentMethod.mockResolvedValue({
      id: 'pm_123',
      type: 'card',
      card: {
        last_four: '4242',
        exp_month: 12,
        exp_year: 2025,
        brand: 'visa',
      },
      provider_data: {},
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should confirm payment without saving payment method', async () => {
    const response = await client.payments.intents[':id'].confirm.$post({
      param: { id: 'pay_123' },
      json: {
        payment_method_id: 'pm_123',
        return_url: 'https://example.com/success',
        save_payment_method: false,
      },
      header: {
        'Authorization': 'Bearer valid_token',
      },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.payment_method_saved).toBe(false);
    expect(mockPaymentMethodRepo.create).not.toHaveBeenCalled();
  });

  it('should confirm payment and save payment method for authenticated user', async () => {
    // Mock existing customer
    mockCustomerRepo.findByUserAndProvider.mockResolvedValue({
      provider_customer_id: 'cus_123',
    });

    const response = await client.payments.intents[':id'].confirm.$post({
      param: { id: 'pay_123' },
      json: {
        payment_method_id: 'pm_123',
        return_url: 'https://example.com/success',
        save_payment_method: true,
      },
      header: {
        'Authorization': 'Bearer valid_token',
      },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.payment_method_saved).toBe(true);

    // Verify payment method was saved
    expect(mockPaymentMethodRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user_123',
        provider_id: 'stripe',
        provider_payment_method_id: 'pm_123',
        payment_type: 'card',
        last_four: '4242',
        card_brand: 'visa',
      })
    );
  });

  it('should create customer if not exists and save payment method', async () => {
    // Mock no existing customer
    mockCustomerRepo.findByUserAndProvider.mockResolvedValue(null);

    // Mock customer creation
    mockAdapter.createCustomer.mockResolvedValue({
      id: 'cus_new_123',
      email: 'user-user_123@example.com',
      name: 'User',
      provider_data: {},
    });

    const response = await client.payments.intents[':id'].confirm.$post({
      param: { id: 'pay_123' },
      json: {
        payment_method_id: 'pm_123',
        save_payment_method: true,
      },
      header: {
        'Authorization': 'Bearer valid_token',
      },
    });

    expect(response.status).toBe(200);

    // Verify customer was created
    expect(mockAdapter.createCustomer).toHaveBeenCalledWith({
      email: 'user-user_123@example.com',
      name: 'User',
      metadata: { user_id: 'user_123' },
    });

    // Verify customer was saved to database
    expect(mockCustomerRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user_123',
        provider_id: 'stripe',
        provider_customer_id: 'cus_new_123',
        is_guest: false,
      })
    );
  });

  it('should handle guest payment with save_payment_method', async () => {
    // Setup guest payment
    mockPaymentRepo.findById.mockResolvedValue({
      id: 'pay_guest_123',
      user_id: null,
      provider_id: 'stripe',
      provider_intent_id: 'pi_guest_123',
      is_guest_payment: true,
      guest_email: 'guest@example.com',
      guest_data: '{"name": "Guest User"}',
    });

    mockAdapter.createCustomer.mockResolvedValue({
      id: 'cus_guest_123',
      email: 'guest@example.com',
      name: 'Guest User',
      provider_data: {},
    });

    const response = await client.payments.intents[':id'].confirm.$post({
      param: { id: 'pay_guest_123' },
      json: {
        payment_method_id: 'pm_guest_123',
        save_payment_method: true,
      },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.payment_method_saved).toBe(true);

    // Verify guest customer was created
    expect(mockAdapter.createCustomer).toHaveBeenCalledWith({
      email: 'guest@example.com',
      name: 'Guest User',
      metadata: {
        is_guest: 'true',
        guest_email: 'guest@example.com',
      },
    });

    // Verify guest payment method was saved
    expect(mockPaymentMethodRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: null,
        provider_id: 'stripe',
        provider_payment_method_id: 'pm_123',
        is_guest: true,
        guest_email: 'guest@example.com',
        guest_name: 'Guest User',
      })
    );
  });

  it('should handle payment method saving failure gracefully', async () => {
    // Mock existing customer
    mockCustomerRepo.findByUserAndProvider.mockResolvedValue({
      provider_customer_id: 'cus_123',
    });

    // Mock payment method saving failure
    mockPaymentMethodRepo.create.mockRejectedValue(new Error('Database error'));

    const response = await client.payments.intents[':id'].confirm.$post({
      param: { id: 'pay_123' },
      json: {
        payment_method_id: 'pm_123',
        save_payment_method: true,
      },
      header: {
        'Authorization': 'Bearer valid_token',
      },
    });

    // Payment should still succeed even if saving fails
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('succeeded');
    // payment_method_saved should be false due to the error
    expect(data.payment_method_saved).toBe(false);
  });
});
