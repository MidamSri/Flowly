import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PlanRequest } from '@flowly/shared';
import { config } from './config.js';
import { generateActionPlan } from './agent/planner.js';

// Setup Fastify with standard pino logs
const server = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

// Configure CORS for local development and chrome extension compatibility
await server.register(cors, {
  origin: '*', // Allow all origins for dev/extension sandbox
  methods: ['GET', 'POST', 'OPTIONS'],
});

// Health check endpoint
server.get('/health', async () => {
  return { status: 'healthy', timestamp: new Date().toISOString() };
});

// Planning loop endpoint
server.post<{ Body: PlanRequest }>('/api/plan', async (request, reply) => {
  const payload = request.body;
  
  if (!payload.goal || !payload.url || !payload.elements) {
    reply.code(400);
    return { error: 'Missing required parameters: goal, url, or elements' };
  }

  server.log.info({
    msg: 'Received plan request',
    goal: payload.goal,
    url: payload.url,
    elementsCount: payload.elements.length,
  });

  try {
    const plan = await generateActionPlan(payload);
    
    server.log.info({
      msg: 'Successfully generated action plan',
      stepsCount: plan.steps.length,
      confidence: plan.confidence,
      isGoalAchieved: plan.isGoalAchieved,
    });

    return plan;
  } catch (error: any) {
    server.log.error({
      msg: 'Error handling plan request',
      error: error.message || error,
    });
    reply.code(500);
    return { error: 'Internal Server Error', details: error.message || error };
  }
});

// Start the server
const start = async () => {
  try {
    await server.listen({ port: config.port, host: '0.0.0.0' });
    server.log.info(`Flowly Backend running on port ${config.port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
