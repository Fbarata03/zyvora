import { Queue } from 'bullmq';
import { redis } from './redis.js';
export const executionQueue = new Queue('zyvora-executions', { connection: redis, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1500 }, removeOnComplete: 500, removeOnFail: 1000 } });
