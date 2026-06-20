import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PlanRequest, RecoverRequest, CheckGoalRequest } from '@flowly/shared';
import { config } from './config.js';
import { generateActionPlan, generateRecoveryPlan, generateGoalCompletionCheck } from './agent/planner.js';

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

// Recovery loop endpoint
server.post<{ Body: RecoverRequest }>('/api/recover', async (request, reply) => {
  const payload = request.body;
  
  if (!payload.goal || !payload.originalPlan || !payload.failureContext || !payload.pageState) {
    reply.code(400);
    return { error: 'Missing required parameters: goal, originalPlan, failureContext, or pageState' };
  }

  server.log.info({
    msg: 'Received recover request',
    goal: payload.goal,
    failedStepIndex: payload.failureContext.failedStepIndex,
    error: payload.failureContext.error
  });

  try {
    const recoveryPlan = await generateRecoveryPlan(payload);
    
    server.log.info({
      msg: 'Successfully generated recovery plan',
      stepsCount: recoveryPlan.steps.length,
      recoveryPlanId: recoveryPlan.id
    });

    return recoveryPlan;
  } catch (error: any) {
    server.log.error({
      msg: 'Error handling recover request',
      error: error.message || error,
    });
    reply.code(500);
    return { error: 'Internal Server Error', details: error.message || error };
  }
});

// Goal completion check endpoint
server.post<{ Body: CheckGoalRequest }>('/api/check-goal', async (request, reply) => {
  const payload = request.body;

  if (!payload.goal || !payload.url || !payload.elements) {
    reply.code(400);
    return { error: 'Missing required parameters: goal, url, or elements' };
  }

  server.log.info({
    msg: 'Received check-goal request',
    goal: payload.goal,
    url: payload.url,
    elementsCount: payload.elements.length,
  });

  try {
    const checkResult = await generateGoalCompletionCheck(payload);

    server.log.info({
      msg: 'Successfully processed goal completion check',
      completed: checkResult.completed,
      confidence: checkResult.confidence,
      reason: checkResult.reason
    });

    return checkResult;
  } catch (error: any) {
    server.log.error({
      msg: 'Error handling check-goal request',
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
