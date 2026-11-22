const SYSTEM_PROMPT = `És o copiloto de operações da ZYVORA. Responde em português europeu, de forma clara e profissional. Ajuda a compreender objetivos empresariais, identifica lacunas e nunca afirmes que executaste uma ação que não foi realmente executada. Quando houver informação suficiente, propõe um plano estruturado. Todas as ações externas, envio de mensagens, alterações financeiras ou eliminação de dados exigem aprovação humana explícita.`;
export async function generateAssistantReply(messages, workspace) {
  if (!process.env.AI_API_KEY) {
    const last = messages.at(-1)?.content || '';
    return { content:`Compreendi o teu objetivo: “${last}”.\n\nPara desenhar uma automação segura para ${workspace.name}, preciso de perceber: qual é a ferramenta ou canal onde este processo acontece atualmente e qual seria o resultado ideal?\n\nPosso depois preparar um plano com os passos, agentes necessários, integrações e pontos que exigem a tua aprovação.`, provider:'demo-fallback' };
  }
  const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/,'');
  const response = await fetch(`${base}/chat/completions`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${process.env.AI_API_KEY}` }, body:JSON.stringify({ model:process.env.AI_MODEL || 'gpt-4.1-mini', temperature:0.35, messages:[{role:'system',content:`${SYSTEM_PROMPT}\nWorkspace: ${workspace.name}. Setor: ${workspace.industry || 'não indicado'}. Objetivo: ${workspace.primaryGoal || 'não indicado'}.`},...messages.map(m=>({role:m.role==='assistant'?'assistant':'user',content:m.content}))] }) });
  if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
  const data = await response.json(); return { content:data.choices?.[0]?.message?.content || 'Não consegui gerar uma resposta.', provider:'configured-ai' };
}
export async function createAutomationPlan(objective, workspace) {
  if (!process.env.AI_API_KEY) return { title:'Plano inicial de automação', objective, rationale:'Plano demonstrativo. Configura um fornecedor de IA para gerar planos personalizados.', steps:[{name:'Receber evento ou pedido',type:'trigger',requiresApproval:false},{name:'Analisar e classificar informação',type:'ai',requiresApproval:false},{name:'Preparar ação e validar dados',type:'process',requiresApproval:false},{name:'Solicitar aprovação antes de ação externa',type:'approval',requiresApproval:true}], requiredIntegrations:[], questions:['Que ferramenta utilizas atualmente neste processo?','Que resultado deve ser considerado sucesso?'] };
  const base=(process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/,'');
  const prompt=`Cria um plano de automação para o workspace ${workspace.name}. Objetivo: ${objective}. Devolve apenas JSON válido com title, objective, rationale, steps (array de {name,type,description,requiresApproval}), requiredIntegrations (array de strings), questions (array de strings). Não incluas ações perigosas sem aprovação humana.`;
  const response=await fetch(`${base}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.AI_API_KEY}`},body:JSON.stringify({model:process.env.AI_MODEL||'gpt-4.1-mini',temperature:0.2,response_format:{type:'json_object'},messages:[{role:'system',content:'És um arquiteto de automações empresariais. Produz JSON seguro e executável por etapas.'},{role:'user',content:prompt}]})});
  if(!response.ok) throw new Error(`AI provider returned ${response.status}`);
  const data=await response.json(); return JSON.parse(data.choices[0].message.content);
}
