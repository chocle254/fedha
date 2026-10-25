import crypto from 'crypto';
import { runNestLinkSweep } from '../../../lib/nestlink';
export const config = { api: { bodyParser:false } };
async function rawBody(req) { const chunks=[]; for await (const c of req) chunks.push(Buffer.isBuffer(c)?c:Buffer.from(c)); return Buffer.concat(chunks); }
function valid(raw, header, secret) {
  if (!header || !secret) return false;
  const supplied=String(header).replace(/^sha256=/i,'').trim(), expected=crypto.createHmac('sha256',secret).update(raw).digest('hex');
  const a=Buffer.from(supplied,'hex'), b=Buffer.from(expected,'hex');
  return a.length===b.length && a.length>0 && crypto.timingSafeEqual(a,b);
}
export default async function handler(req,res) {
  if (req.method!=='POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  const secret=process.env.NESTLINK_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({error:'Webhook is not configured.'});
  try {
    const raw=await rawBody(req);
    if (!valid(raw,req.headers['x-nestlink-signature'],secret)) return res.status(401).json({error:'Invalid webhook signature.'});
    let event; try { event=JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({error:'Invalid JSON payload.'}); }
    const id=event.id || event.event_id || event.reference || crypto.createHash('sha256').update(raw).digest('hex');
    const result=await runNestLinkSweep(String(id));
    return res.status(200).json({ok:true,sweep:result.status});
  } catch(e) { console.error('[fedha] NestLink webhook failed:',e.message); return res.status(500).json({error:'Webhook processing failed.'}); }
}
