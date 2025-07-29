import { getDatabase } from '../connection';
import { BaseRepository } from './base';

// Repository factory to create repository instances with database connection
export class RepositoryFactory {
  private static repositories: Map<string, any> = new Map();

  // Generic method to get any repository
  static async getRepository<T extends BaseRepository>(
    key: string,
    RepositoryClass: new (db: any) => T
  ): Promise<T> {
    if (!this.repositories.has(key)) {
      const db = await getDatabase();
      this.repositories.set(key, new RepositoryClass(db));
    }
    return this.repositories.get(key);
  }

  // Clear repository cache (useful for testing)
  static clearCache(): void {
    this.repositories.clear();
  }
}

// Export repository classes
export { BaseRepository } from './base';

// Export types
export type { Database } from '../types';
export * from '../types';
