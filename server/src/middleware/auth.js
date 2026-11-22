import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
export async function authenticate(req,res,next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i,'');
    if (!token) return res.status(401).json({ error:'Autenticação necessária.' });
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await prisma.user.findUnique({ where:{ id:payload.sub }, select:{ id:true,email:true,name:true } });
    if (!user) return res.status(401).json({ error:'Sessão inválida.' });
    req.user = user; next();
  } catch { return res.status(401).json({ error:'Token inválido ou expirado.' }); }
}
export async function workspaceAccess(req,res,next) {
  try {
    const workspaceId = req.params.workspaceId || req.body.workspaceId || req.query.workspaceId;
    if (!workspaceId) return res.status(400).json({ error:'workspaceId é obrigatório.' });
    const membership = await prisma.membership.findUnique({ where:{ userId_workspaceId:{ userId:req.user.id, workspaceId } }, include:{ workspace:true } });
    if (!membership) return res.status(403).json({ error:'Sem acesso a este workspace.' });
    req.workspace = membership.workspace; req.membership = membership; next();
  } catch(nextError) { next(nextError); }
}
export const requireRole = (...roles) => (req,res,next) => roles.includes(req.membership?.role) ? next() : res.status(403).json({ error:'Permissões insuficientes.' });
