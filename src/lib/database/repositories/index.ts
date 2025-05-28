import { getDatabase } from '../connection';
import { BaseRepository } from './base';
import { PaymentRepository } from './payments';
import { PaymentUserRepository } from './payment-users';
import { CustomerRepository } from './customers';
import { PaymentMethodRepository } from './payment-methods';
import { AddressRepository } from './addresses';
import { SubscriptionRepository } from './subscriptions';
import { ProductRepository } from './products';

// Repository factory to create repository instances with database connection
export class RepositoryFactory {
  private static repositories: Map<string, any> = new Map();

  static async getPaymentRepository(): Promise<PaymentRepository> {
    if (!this.repositories.has('payments')) {
      const db = await getDatabase();
      this.repositories.set('payments', new PaymentRepository(db));
    }
    return this.repositories.get('payments');
  }

  static async getPaymentUserRepository(): Promise<PaymentUserRepository> {
    if (!this.repositories.has('payment_users')) {
      const db = await getDatabase();
      this.repositories.set('payment_users', new PaymentUserRepository(db));
    }
    return this.repositories.get('payment_users');
  }

  static async getCustomerRepository(): Promise<CustomerRepository> {
    if (!this.repositories.has('customers')) {
      const db = await getDatabase();
      this.repositories.set('customers', new CustomerRepository(db));
    }
    return this.repositories.get('customers');
  }

  static async getPaymentMethodRepository(): Promise<PaymentMethodRepository> {
    if (!this.repositories.has('payment_methods')) {
      const db = await getDatabase();
      this.repositories.set('payment_methods', new PaymentMethodRepository(db));
    }
    return this.repositories.get('payment_methods');
  }

  static async getAddressRepository(): Promise<AddressRepository> {
    if (!this.repositories.has('addresses')) {
      const db = await getDatabase();
      this.repositories.set('addresses', new AddressRepository(db));
    }
    return this.repositories.get('addresses');
  }

  static async getSubscriptionRepository(): Promise<SubscriptionRepository> {
    if (!this.repositories.has('subscriptions')) {
      const db = await getDatabase();
      this.repositories.set('subscriptions', new SubscriptionRepository(db));
    }
    return this.repositories.get('subscriptions');
  }

  static async getProductRepository(): Promise<ProductRepository> {
    if (!this.repositories.has('products')) {
      const db = await getDatabase();
      this.repositories.set('products', new ProductRepository(db));
    }
    return this.repositories.get('products');
  }

  // Clear repository cache (useful for testing)
  static clearCache(): void {
    this.repositories.clear();
  }
}

// Convenience functions for direct access
export async function getPaymentRepository(): Promise<PaymentRepository> {
  return RepositoryFactory.getPaymentRepository();
}

export async function getPaymentUserRepository(): Promise<PaymentUserRepository> {
  return RepositoryFactory.getPaymentUserRepository();
}

export async function getCustomerRepository(): Promise<CustomerRepository> {
  return RepositoryFactory.getCustomerRepository();
}

export async function getPaymentMethodRepository(): Promise<PaymentMethodRepository> {
  return RepositoryFactory.getPaymentMethodRepository();
}

export async function getAddressRepository(): Promise<AddressRepository> {
  return RepositoryFactory.getAddressRepository();
}

export async function getSubscriptionRepository(): Promise<SubscriptionRepository> {
  return RepositoryFactory.getSubscriptionRepository();
}

export async function getProductRepository(): Promise<ProductRepository> {
  return RepositoryFactory.getProductRepository();
}

// Export repository classes
export { BaseRepository } from './base';
export { PaymentRepository } from './payments';
export { PaymentUserRepository } from './payment-users';
export { CustomerRepository } from './customers';
export { PaymentMethodRepository } from './payment-methods';
export { AddressRepository } from './addresses';
export { SubscriptionRepository } from './subscriptions';
export { ProductRepository } from './products';

// Export types
export type { Database } from '../types';
export * from '../types';
