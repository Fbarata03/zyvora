import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { authenticate, workspaceAccess, canWrite, canManage } from '../middleware/auth.js';
import { generateAssistantReply, createAutomationPlan } from '../services/ai.js';

const router = Router();
router.use(authenticate, workspaceAccess);

// Os pedidos que chamam o fornecedor de IA têm custo: limitar por utilizador (não por IP).
// Nota: o store em memória é por processo; com várias instâncias da API usar um store Redis.
const aiLimiter = (windowMs, limit) => rateLimit({
  windowMs,
  limit,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: { error: 'Limite de pedidos à IA atingido. Tenta novamente mais tarde.' },
});
const aiLimits = [
  aiLimiter(60 * 1000, Number(process.env.AI_RATE_LIMIT_PER_MINUTE || 20)),
  aiLimiter(24 * 60 * 60 * 1000, Number(process.env.AI_RATE_LIMIT_PER_DAY || 500)),
];

const HISTORY_LIMIT = 30;

router.post('/conversations', canWrite, async (req, res, next) => {
  try {
    const { title } = z.object({ title: z.string().min(1).max(120).optional() }).parse(req.body);
    const conversation = await prisma.conversation.create({
      data: { workspaceId: req.workspace.id, userId: req.user.id, title: title || 'Nova conversa' },
    });
    res.status(201).json(conversation);
  } catch (e) { next(e); }
});

router.get('/conversations', async (req, res) => {
  const items = await prisma.conversation.findMany({
    where: { workspaceId: req.workspace.id },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: { _count: { select: { messages: true } } },
  });
  res.json(items);
});

router.get('/conversations/:id/messages', async (req, res) => {
  const c = await prisma.conversation.findFirst({ where: { id: req.params.id, workspaceId: req.workspace.id } });
  if (!c) return res.status(404).json({ error: 'Conversa não encontrada.' });
  res.json(await prisma.message.findMany({ where: { conversationId: c.id }, orderBy: { createdAt: 'asc' } }));
});

router.post('/conversations/:id/messages', canWrite, ...aiLimits, async (req, res, next) => {
  try {
    const { content } = z.object({ content: z.string().min(1).max(12000) }).parse(req.body);
    const conversation = await prisma.conversation.findFirst({ where: { id: req.params.id, workspaceId: req.workspace.id } });
    if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada.' });
    const userMessage = await prisma.message.create({ data: { conversationId: conversation.id, role: 'user', content } });
    // Buscar as ÚLTIMAS mensagens (desc + take) e repor a ordem cronológica para o modelo.
    const history = (await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    })).reverse();
    const answer = await generateAssistantReply(history, req.workspace);
    const assistantMessage = await prisma.message.create({
      data: { conversationId: conversation.id, role: 'assistant', content: answer.content, metadata: { provider: answer.provider } },
    });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    res.json({ userMessage, assistantMessage });
  } catch (e) { next(e); }
});

router.post('/plans', canWrite, ...aiLimits, async (req, res, next) => {
  try {
    const { objective, conversationId } = z.object({
      objective: z.string().min(8).max(5000),
      conversationId: z.string().optional(),
    }).parse(req.body);
    if (conversationId) {
      const c = await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId: req.workspace.id } });
      if (!c) return res.status(404).json({ error: 'Conversa não encontrada.' });
    }
    const plan = await createAutomationPlan(objective, req.workspace);
    const saved = await prisma.automationPlan.create({
      data: {
        workspaceId: req.workspace.id,
        conversationId,
        title: plan.title,
        objective: plan.objective,
        rationale: plan.rationale,
        steps: plan.steps,
        requiredIntegrations: plan.requiredIntegrations,
        questions: plan.questions,
      },
    });
    res.status(201).json(saved);
  } catch (e) { next(e); }
});

router.get('/plans', async (req, res) => res.json(await prisma.automationPlan.findMany({
  where: { workspaceId: req.workspace.id },
  orderBy: { createdAt: 'desc' },
})));

// A aprovação humana de um plano (que cria um workflow ACTIVE) é reservada a OWNER/ADMIN.
router.post('/plans/:id/approve', canManage, async (req, res, next) => {
  try {
    const plan = await prisma.automationPlan.findFirst({ where: { id: req.params.id, workspaceId: req.workspace.id } });
    if (!plan) return res.status(404).json({ error: 'Plano não encontrado.' });
    if (plan.status !== 'PROPOSED') return res.status(409).json({ error: 'Este plano já foi processado.' });
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.automationPlan.update({ where: { id: plan.id }, data: { status: 'APPROVED' } });
      const workflow = await tx.workflow.create({
        data: {
          workspaceId: req.workspace.id,
          planId: plan.id,
          name: plan.title,
          description: plan.objective,
          status: 'ACTIVE',
          definition: { steps: plan.steps, requiredIntegrations: plan.requiredIntegrations },
        },
      });
      await tx.activityLog.create({
        data: {
          workspaceId: req.workspace.id,
          userId: req.user.id,
          action: 'PLAN_APPROVED',
          resourceType: 'AutomationPlan',
          resourceId: plan.id,
          details: { workflowId: workflow.id },
          ipAddress: req.ip,
        },
      });
      return { plan: updated, workflow };
    });
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
