import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
export const hashToken = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const createAccessToken = (user) => jwt.sign({ sub:user.id, email:user.email }, process.env.JWT_ACCESS_SECRET, { expiresIn: process.env.ACCESS_TOKEN_TTL || '15m' });
export const createRefreshToken = (user) => jwt.sign({ sub:user.id, type:'refresh', nonce:crypto.randomUUID() }, process.env.JWT_REFRESH_SECRET, { expiresIn:`${process.env.REFRESH_TOKEN_TTL_DAYS || 30}d` });
