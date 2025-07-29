import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '@/lib/auth/auth-middleware';

const app = new Hono();

// Example protected route
app.get('/protected', authMiddleware, async (c) => {
  const user = c.get('user');
  
  return c.json({
    message: 'This is a protected route',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      userType: user.userType
    },
    timestamp: new Date().toISOString()
  });
});

// Example public route
app.get('/public', async (c) => {
  return c.json({
    message: 'This is a public route',
    timestamp: new Date().toISOString(),
    features: [
      'Session validation with Bridge Validator',
      'Multi-database support (libsql, MySQL, PostgreSQL)',
      'LFU cache for session optimization',
      'Zod validation and sanitization',
      'Email system with i18n templates',
      'Croner cron job integration'
    ]
  });
});

// Example POST route with validation
const createItemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  category: z.string().min(1).max(50),
  metadata: z.record(z.any()).optional()
});

app.post('/items', authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = createItemSchema.parse(body);
    
    // Here you would typically save to database
    const item = {
      id: crypto.randomUUID(),
      ...validatedData,
      createdAt: new Date().toISOString(),
      createdBy: c.get('user').id
    };
    
    return c.json({
      success: true,
      data: item
    }, 201);
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({
        error: 'Validation failed',
        details: error.errors
      }, 400);
    }
    
    return c.json({
      error: 'Internal server error'
    }, 500);
  }
});

// Example GET route with query parameters
const listItemsSchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 10),
  category: z.string().optional(),
  search: z.string().optional()
});

app.get('/items', authMiddleware, async (c) => {
  try {
    const query = listItemsSchema.parse(c.req.query());
    
    // Here you would typically query database
    const items = [
      {
        id: '1',
        name: 'Example Item',
        description: 'This is an example item',
        category: 'example',
        createdAt: new Date().toISOString()
      }
    ];
    
    return c.json({
      success: true,
      data: items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: items.length
      }
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({
        error: 'Invalid query parameters',
        details: error.errors
      }, 400);
    }
    
    return c.json({
      error: 'Internal server error'
    }, 500);
  }
});

export default app;
