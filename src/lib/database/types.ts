// Database table type definitions for Kysely - Template System

// This is a template file. When creating specific systems:
// 1. Import your specific database types (e.g., EducationDatabase, EcommerceDatabase, etc.)
// 2. Replace DatabaseSchema with your specific database type
// 3. Remove any unused table definitions

// Example for educational system:
// import type { EducationDatabase } from './education-types';
// export type DatabaseSchema = EducationDatabase;

// Example for e-commerce system:
// import type { EcommerceDatabase } from './ecommerce-types';
// export type DatabaseSchema = EcommerceDatabase;

// Default placeholder - replace with your specific database schema
export interface DatabaseSchema {
  // Add your specific tables here
  users: {
    id: string;
    email: string;
    name: string;
    created_at: string;
    updated_at: string;
  };
}




