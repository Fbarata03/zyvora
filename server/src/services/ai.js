import { z } from 'zod';

const SYSTEM_PROMPT = `És o copiloto de operações da ZYVORA. Responde em português europeu, de forma clara e profissional. Ajuda a compreender objetivos empresariais, identifica lacunas e nunca afirmes que executaste uma ação que não foi realmente executada. Quando houver informação suficiente, propõe um plano estruturado. Todas as ações externas, envio de mensagens, alterações financeiras ou eliminação de dados exigem aprovação humana explícita.`;

const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 60000);

// Erro com status HTTP para o handler global (fornecedor de IA falhou ou devolveu dados inválidos).
export class AIProviderError extends Error {
  constructor(message, status = 502) { super(message); this.name = 'AIProviderError'; this.status = status; }
}

// Tipos de passo que exigem sempre aprovação humana, independentemente do que o modelo indicar.
const SENSITIVE_STEP_TYPES = new Set(['action', 'external', 'email', 'message', 'payment', 'delete', 'approval']);

const planSchema = z.object({
  title: z.string().trim().min(1).max(120),
  objective: z.string().trim().min(1).max(5000),
  rationale: z.string().trim().max(5000).optional().nullable(),
  steps: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    type: z.string().trim().min(1).max(40).transform((v) => v.toLowerCase()),
    description: z.string().trim().max(2000).optional(),
    requiresApproval: z.boolean().default(true),
  }).strip()).min(1).max(30),
  requiredIntegrations: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  questions: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
}).strip();

export function validatePlan(raw) {
  const result = planSchema.safeParse(raw);
  if (!result.success) throw new AIProviderError('O fornecedor de IA devolveu um plano em formato inválido.');
  const plan = result.data;
  plan.steps = plan.steps.map((step) => ({
    ...step,
    requiresApproval: step.requiresApproval || SENSITIVE_STEP_TYPES.has(step.type),
  }));
  return plan;
}

async function callProvider(body) {
  const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  let response;
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify({ model: process.env.AI_MODEL || 'gpt-4.1-mini', ...body }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AIProviderError(error?.name === 'TimeoutError' ? 'O fornecedor de IA não respondeu a tempo.' : 'Não foi possível contactar o fornecedor de IA.', error?.name === 'TimeoutError' ? 504 : 502);
  }
  if (!response.ok) throw new AIProviderError(`O fornecedor de IA devolveu o estado ${response.status}.`);
  return response.json();
}

export async function generateAssistantReply(messages, workspace) {
  if (!process.env.AI_API_KEY) {
    const last = messages.at(-1)?.content || '';
    return { content: `Compreendi o teu objetivo: “${last}”.\n\nPara desenhar uma automação segura para ${workspace.name}, preciso de perceber: qual é a ferramenta ou canal onde este processo acontece atualmente e qual seria o resultado ideal?\n\nPosso depois preparar um plano com os passos, agentes necessários, integrações e pontos que exigem a tua aprovação.`, provider: 'demo-fallback' };
  }
  const data = await callProvider({
    temperature: 0.35,
    messages: [
      { role: 'system', content: `${SYSTEM_PROMPT}\nWorkspace: ${workspace.name}. Setor: ${workspace.industry || 'não indicado'}. Objetivo: ${workspace.primaryGoal || 'não indicado'}.` },
      ...messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    ],
  });
  return { content: data.choices?.[0]?.message?.content || 'Não consegui gerar uma resposta.', provider: 'configured-ai' };
}

export async function createAutomationPlan(objective, workspace) {
  if (!process.env.AI_API_KEY) return validatePlan({ title: 'Plano inicial de automação', objective, rationale: 'Plano demonstrativo. Configura um fornecedor de IA para gerar planos personalizados.', steps: [{ name: 'Receber evento ou pedido', type: 'trigger', requiresApproval: false }, { name: 'Analisar e classificar informação', type: 'ai', requiresApproval: false }, { name: 'Preparar ação e validar dados', type: 'process', requiresApproval: false }, { name: 'Solicitar aprovação antes de ação externa', type: 'approval', requiresApproval: true }], requiredIntegrations: [], questions: ['Que ferramenta utilizas atualmente neste processo?', 'Que resultado deve ser considerado sucesso?'] });
  const prompt = `Cria um plano de automação para o workspace ${workspace.name}. Objetivo: ${objective}. Devolve apenas JSON válido com title, objective, rationale, steps (array de {name,type,description,requiresApproval}, onde type é um de: trigger, ai, process, action, approval), requiredIntegrations (array de strings), questions (array de strings). Não incluas ações perigosas sem aprovação humana.`;
  const data = await callProvider({
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'És um arquiteto de automações empresariais. Produz JSON seguro e executável por etapas.' },
      { role: 'user', content: prompt },
    ],
  });
  let raw;
  try { raw = JSON.parse(data.choices?.[0]?.message?.content ?? ''); } catch { throw new AIProviderError('O fornecedor de IA devolveu uma resposta que não é JSON válido.'); }
  return validatePlan(raw);
}
