import { requireUser } from '../../../lib/require-user';
import { getNestLinkBalance, isNestLinkConfigured, isSweepEnabled } from '../../../lib/nestlink';
export default async function handler(req,res) {
  if (req.method !== 'GET') { res.setHeader('Allow','GET'); return res.status(405).json({error:'Method not allowed.'}); }
  const user = await requireUser(req,res); if (!user) return;
  if (!isNestLinkConfigured()) return res.status(200).json({configured:false,autoSweepEnabled:false,message:'NestLink server environment variables are not configured.'});
  try { const balance = await getNestLinkBalance(); return res.status(200).json({configured:true,autoSweepEnabled:isSweepEnabled(),balance,checkedAt:new Date().toISOString()}); }
  catch(e) { console.error('[fedha] NestLink balance error:',e.message); return res.status(502).json({error:'Could not retrieve live NestLink balance.',detail:e.message}); }
}
