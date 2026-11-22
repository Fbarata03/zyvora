import {Router} from 'express';import {z} from 'zod';import {prisma} from '../lib/prisma.js';import {authenticate,workspaceAccess,requireRole} from '../middleware/auth.js';
const router=Router();router.use(authenticate);
router.get('/',async(req,res)=>{const rows=await prisma.membership.findMany({where:{userId:req.user.id},include:{workspace:true}});res.json(rows.map(x=>({...x.workspace,role:x.role})));});
router.get('/:workspaceId',workspaceAccess,async(req,res)=>res.json(req.workspace));
router.patch('/:workspaceId',workspaceAccess,requireRole('OWNER','ADMIN'),async(req,res,next)=>{try{const data=z.object({name:z.string().min(2).max(100).optional(),industry:z.string().max(100).optional(),teamSize:z.string().max(50).optional(),primaryGoal:z.string().max(500).optional()}).parse(req.body);const workspace=await prisma.workspace.update({where:{id:req.workspace.id},data});res.json(workspace);}catch(e){next(e);}});
export default router;
