import 'dotenv/config';
import {Worker} from 'bullmq';
import {redis} from '../lib/redis.js';
import {prisma} from '../lib/prisma.js';
const worker=new Worker('zyvora-executions',async job=>{
  const {executionId,workspaceId}=job.data;
  const execution=await prisma.execution.findFirst({where:{id:executionId,workspaceId}});
  if(!execution)throw new Error('Execution not found');
  await prisma.execution.update({where:{id:executionId},data:{status:'RUNNING',startedAt:new Date()}});
  try {
    // Safe starter executor: never performs external side effects. Add provider-specific
    // adapters only after OAuth credentials, scopes and approval checks are implemented.
    const output={message:'Execução de teste concluída pelo worker ZYVORA.',mode:'safe-simulation',executionId,processedAt:new Date().toISOString(),input:execution.input||{}};
    await prisma.execution.update({where:{id:executionId},data:{status:'SUCCEEDED',output,finishedAt:new Date()}});
    await prisma.activityLog.create({data:{workspaceId,action:'EXECUTION_SUCCEEDED',resourceType:'Execution',resourceId:executionId,details:output}});
    return output;
  } catch(error) {
    await prisma.execution.update({where:{id:executionId},data:{status:'FAILED',error:error.message,finishedAt:new Date()}});
    await prisma.activityLog.create({data:{workspaceId,action:'EXECUTION_FAILED',resourceType:'Execution',resourceId:executionId,details:{error:error.message}}});
    throw error;
  }
},{connection:redis,concurrency:5});
worker.on('completed',job=>process.stdout.write(`Execution ${job.id} completed\n`));worker.on('failed',(job,error)=>process.stderr.write(`Execution ${job?.id} failed: ${error.message}\n`));
process.on('SIGTERM',async()=>{await worker.close();await prisma.$disconnect();process.exit(0);});
