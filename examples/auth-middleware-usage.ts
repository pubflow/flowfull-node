/**
 * Auth Middleware Usage Examples
 * 
 * This file demonstrates how to use the flexible authentication middleware
 * in your Flowfull backend API.
 * 
 * Flowfull is a configurable starter kit for developers to build backends.
 * You can define ANY user types that match your business logic.
 */

import { Hono } from 'hono';
import { 
  requireAuth, 
  optionalAuth, 
  requireUserType, 
  requirePermission 
} from '../src/lib/auth/middleware';

const app = new Hono();

// ============================================================================
// EXAMPLE 1: Public Routes (No Authentication)
// ============================================================================

app.get('/api/public/stats', async (c) => {
  return c.json({ 
    stats: { users: 1000, posts: 5000 } 
  });
});

// ============================================================================
// EXAMPLE 2: Protected Routes (Any Authenticated User)
// ============================================================================

app.get('/api/profile', requireAuth(), async (c) => {
  const userId = c.get('user_id');
  const session = c.get('session');
  
  return c.json({ 
    userId, 
    email: session.email,
    name: session.name 
  });
});

// ============================================================================
// EXAMPLE 3: Optional Authentication (Personalized Content)
// ============================================================================

app.get('/api/posts', optionalAuth(), async (c) => {
  const userId = c.get('user_id');
  
  if (userId) {
    // Show personalized posts for authenticated users
    return c.json({ 
      posts: [
        { id: 1, title: 'Your personalized post', author: 'You' }
      ]
    });
  } else {
    // Show public posts for guests
    return c.json({ 
      posts: [
        { id: 1, title: 'Public post', author: 'Admin' }
      ]
    });
  }
});

// ============================================================================
// EXAMPLE 4: Single User Type (Admin Only)
// ============================================================================

app.get('/api/admin/users', requireUserType('admin'), async (c) => {
  return c.json({ 
    users: [
      { id: 1, email: 'user1@example.com' },
      { id: 2, email: 'user2@example.com' }
    ]
  });
});

// ============================================================================
// EXAMPLE 5: Multiple User Types (Admin OR Manager)
// ============================================================================

app.get('/api/manager/dashboard', requireUserType(['admin', 'manager']), async (c) => {
  const session = c.get('session');
  const userType = session.user_type;
  
  return c.json({ 
    dashboard: {
      userType,
      stats: { sales: 10000, orders: 500 }
    }
  });
});

// ============================================================================
// EXAMPLE 6: Custom User Types (Your Business Logic)
// ============================================================================

// Educational platform
app.get('/api/teacher/classes', requireUserType('teacher'), async (c) => {
  return c.json({ 
    classes: [
      { id: 1, name: 'Math 101', students: 30 },
      { id: 2, name: 'Science 201', students: 25 }
    ]
  });
});

// E-commerce platform
app.get('/api/seller/products', requireUserType(['seller', 'admin']), async (c) => {
  return c.json({ 
    products: [
      { id: 1, name: 'Product 1', price: 99.99 },
      { id: 2, name: 'Product 2', price: 149.99 }
    ]
  });
});

// Subscription tiers
app.get('/api/premium/analytics', requireUserType(['premium', 'enterprise', 'admin']), async (c) => {
  return c.json({ 
    analytics: {
      views: 10000,
      conversions: 500,
      revenue: 50000
    }
  });
});

// ============================================================================
// EXAMPLE 7: Permission-Based Access
// ============================================================================

app.delete('/api/posts/:id', requirePermission('posts.delete'), async (c) => {
  const postId = c.req.param('id');
  
  return c.json({ 
    success: true, 
    message: `Post ${postId} deleted` 
  });
});

// ============================================================================
// EXAMPLE 8: Chaining Multiple Middleware
// ============================================================================

app.post(
  '/api/admin/users',
  requireAuth(),                    // First: Ensure user is authenticated
  requireUserType('admin'),         // Second: Ensure user is admin
  requirePermission('users.create'), // Third: Ensure user has permission
  async (c) => {
    const body = await c.req.json();

    return c.json({
      success: true,
      user: { id: 123, email: body.email }
    });
  }
);

// ============================================================================
// EXAMPLE 9: Dynamic Role-Based Behavior
// ============================================================================

app.get('/api/dashboard', requireAuth(), async (c) => {
  const session = c.get('session');
  const userType = session.user_type;

  // Different dashboard based on user type
  switch (userType) {
    case 'admin':
      return c.json({
        dashboard: 'admin',
        stats: { users: 1000, revenue: 50000 }
      });

    case 'manager':
      return c.json({
        dashboard: 'manager',
        stats: { team: 10, sales: 10000 }
      });

    case 'teacher':
      return c.json({
        dashboard: 'teacher',
        stats: { classes: 5, students: 150 }
      });

    case 'student':
      return c.json({
        dashboard: 'student',
        stats: { courses: 4, grade: 'A' }
      });

    default:
      return c.json({
        error: 'Invalid user type'
      }, 403);
  }
});

// ============================================================================
// EXAMPLE 10: Custom User Types for Different Industries
// ============================================================================

// Define your custom user types
const USER_TYPES = {
  // Basic
  ADMIN: 'admin',
  USER: 'user',

  // Business
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
  CONTRACTOR: 'contractor',

  // Education
  TEACHER: 'teacher',
  STUDENT: 'student',
  PARENT: 'parent',
  PRINCIPAL: 'principal',

  // E-commerce
  SELLER: 'seller',
  BUYER: 'buyer',
  AFFILIATE: 'affiliate',

  // Healthcare
  DOCTOR: 'doctor',
  NURSE: 'nurse',
  PATIENT: 'patient',

  // Subscription
  FREE: 'free',
  PREMIUM: 'premium',
  ENTERPRISE: 'enterprise'
};

// Use them in routes
app.get('/api/warehouse/inventory',
  requireUserType([USER_TYPES.MANAGER, USER_TYPES.ADMIN]),
  async (c) => {
    return c.json({ inventory: [] });
  }
);

app.get('/api/medical/records',
  requireUserType([USER_TYPES.DOCTOR, USER_TYPES.NURSE]),
  async (c) => {
    return c.json({ records: [] });
  }
);

app.get('/api/school/grades',
  requireUserType([USER_TYPES.TEACHER, USER_TYPES.PRINCIPAL, USER_TYPES.ADMIN]),
  async (c) => {
    return c.json({ grades: [] });
  }
);

export default app;

