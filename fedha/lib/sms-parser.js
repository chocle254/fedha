// Reads M-Pesa and Ziidi SMS (forwarded by the Android app, see android/.../SmsReceiver.java) into plain facts.
// Returns null when the message is not understood; the raw text is kept either way so the parser can be tuned.
//
// Standard Safaricom wordings handled:
//   sent      "QK12ABC3DE Confirmed. Ksh500.00 sent to JOHN DOE 0712345678 on 29/10/26 at 7:15 PM. New M-PESA balance is Ksh1,234.00. Transaction cost, Ksh7.00."
//   paybill   "... Ksh500.00 sent to KPLC PREPAID for account 1234567 on ..."
//   paid      "... Ksh500.00 paid to NAIVAS SUPERMARKET. on ..."            (Buy Goods / till)
//   received  "... Confirmed.You have received Ksh500.00 from JOHN DOE 0712345678 on ..."
//   withdraw  "... Confirmed.on 29/10/26 at 7:15 PMWithdraw Ksh500.00 from 123456 - AGENT NAME New M-PESA balance is ..."
//   deposit   "... Confirmed. On 29/10/26 at 7:15 PM Give Ksh500.00 cash to AGENT NAME New M-PESA balance is ..."
//   airtime   "... confirmed.You bought Ksh50.00 of airtime on ..."
//   reversal  "... Confirmed. Transaction ... has been reversed. Your account balance is now Ksh..."
//   fuliza    "Ksh... from your M-PESA has been used to fully pay your outstanding Fuliza M-PESA" / "Fuliza M-PESA amount is Ksh..."
// Anything mentioning Ziidi is marked kind 'ziidi' with the amounts found, for review.

const MONEY = '(?:Ksh|KES)\\s?([\\d,]+(?:\\.\\d{1,2})?)';
const num = (s) => (s == null ? null : Number(String(s).replace(/,/g, '')));
const first = (re, t) => { const m = t.match(re); return m ? m[1] : null; };
const clean = (s) => (s ? s.replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim() : null);

export function isMoneySender(sender, body = '') {
  const s = String(sender || '').toUpperCase();
  return /M-?PESA|ZIIDI/.test(s) || (/SAFARICOM/.test(s) && /ZIIDI/i.test(body));
}

// sender: the SMS sender ("MPESA", "ZIIDI", ...). Ziidi texts come from their own sender; M-Pesa texts that move
// money to or from Ziidi name it as the other party. (Plain M-Pesa texts often end with a Ziidi advert, which is
// ignored.)
export function parseSms(body, sender = '') {
  const t = String(body || '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const std = parseMpesa(t);
  if (std && /ziidi/i.test(`${std.party || ''} ${std.account || ''}`)) {
    return { ...std, ziidiMove: ['sent', 'paybill', 'paid'].includes(std.kind) ? 'in' : std.kind === 'received' ? 'out' : null };
  }
  if (std) return std;
  if (/ZIIDI/i.test(sender) || /ziidi/i.test(t.replace(/(earn|get|grow)[^.]{0,60}ziidi[^.]*\.?/gi, ''))) return parseZiidi(t);
  return null;
}

function parseZiidi(t) {
  const code = first(/^([A-Z0-9]{10})\b/, t);
  const amounts = [...t.matchAll(new RegExp(MONEY, 'gi'))].map((m) => num(m[1]));
  const dir = /from (?:your )?ziidi|withdr[ae]w.{0,40}ziidi|ziidi.{0,40}to (?:your )?m-?pesa/i.test(t) ? 'out'
    : /to (?:your )?ziidi|invest(?:ed|ment)|deposit(?:ed)? .{0,30}ziidi|sent to ziidi/i.test(t) ? 'in' : null;
  return { code, kind: 'ziidi', amount: amounts[0] ?? null, direction: dir, amounts, balance: null, cost: 0, review: true, phoneTail: first(/(?:07|01|2547|2541)\d{2}\**x*\**(\d{3})\b/i, t) };
}

function parseMpesa(t) {
  const code = first(/^([A-Z0-9]{10})\b/, t);
  const amount = num(first(new RegExp(MONEY, 'i'), t));
  const balance = num(first(new RegExp(`(?:New M-?PESA balance is|account balance is now|M-?PESA balance is)\\s*${MONEY}`, 'i'), t));
  const cost = num(first(new RegExp(`Transaction cost,?\\s*${MONEY}`, 'i'), t));
  const base = { code, amount, balance, cost: cost || 0 };

  if (!amount) return null;

  if (/has been reversed/i.test(t)) return { ...base, kind: 'reversal' };
  if (/fuliza/i.test(t)) return { ...base, kind: /used to (?:fully |partially )?pay/i.test(t) ? 'fuliza_repay' : 'fuliza_loan' };
  if (/You have received/i.test(t)) {
    const m = t.match(new RegExp(`received ${MONEY} from (.+?)(?:\\s+(0\\d{9}|254\\d{9}|\\d{2,4}\\*+\\d+))? on `, 'i'));
    return { ...base, kind: 'received', party: clean(m?.[2]), phone: m?.[3] || null };
  }
  if (/Withdraw\s*(?:Ksh|KES)/i.test(t)) {
    const m = t.match(new RegExp(`Withdraw ${MONEY} from (.+?) New M-?PESA`, 'i'));
    return { ...base, kind: 'withdraw', party: clean(m?.[2]) };
  }
  if (/Give\s*(?:Ksh|KES).*\bcash to\b/i.test(t)) {
    const m = t.match(new RegExp(`Give ${MONEY} cash to (.+?) New M-?PESA`, 'i'));
    return { ...base, kind: 'deposit', party: clean(m?.[2]) };
  }
  if (/of airtime/i.test(t)) return { ...base, kind: 'airtime', party: /for (0\d{9}|254\d{9})/i.test(t) ? first(/for (0\d{9}|254\d{9})/i, t) : 'Self' };
  if (/\bpaid to\b/i.test(t)) {
    const m = t.match(new RegExp(`${MONEY} paid to (.+?)\\.? on `, 'i'));
    return { ...base, kind: 'paid', party: clean(m?.[2]) };
  }
  if (/\bsent to\b/i.test(t)) {
    const pay = t.match(new RegExp(`${MONEY} sent to (.+?) for account (.+?) on `, 'i'));
    if (pay) return { ...base, kind: 'paybill', party: clean(pay[2]), account: clean(pay[3]) };
    const m = t.match(new RegExp(`${MONEY} sent to (.+?)(?:\\s+(0\\d{9}|254\\d{9}))? on `, 'i'));
    return { ...base, kind: 'sent', party: clean(m?.[2]), phone: m?.[3] || null };
  }
  return null;
}

// Money in (+) or out (-) of the M-Pesa wallet, including the fee.
export function signedAmount(p) {
  if (!p || p.amount == null) return null;
  if (['received', 'deposit', 'reversal', 'fuliza_loan'].includes(p.kind)) return p.amount;
  if (['sent', 'paybill', 'paid', 'withdraw', 'airtime', 'fuliza_repay'].includes(p.kind)) return -(p.amount + (p.cost || 0));
  return null;
}

export const KIND_LABEL = {
  sent: 'Sent', paybill: 'Pay Bill', paid: 'Buy Goods', received: 'Received', withdraw: 'Withdrawn', deposit: 'Deposited',
  airtime: 'Airtime', reversal: 'Reversal', fuliza_loan: 'Fuliza loan', fuliza_repay: 'Fuliza repaid', ziidi: 'Ziidi',
};

// ── Categories learned per name ─────────────────────────────────────────────
// The first time a name appears you pick a category; every later message with that name (same direction) uses it.
// Rules live in settings 'sms_categories' as { "in|JOHN DOE": "business", "out|NAIVAS SUPERMARKET": "food" }.
const NEEDS_CATEGORY = { sent: 'out', paybill: 'out', paid: 'out', received: 'in' };
export const FIXED_CATEGORY = { airtime: 'airtime' };

export function partyKey(p) {
  const dir = p && !p.ziidiMove ? NEEDS_CATEGORY[p.kind] : null;
  if (!dir || !p.party) return null;
  const name = String(p.party).toUpperCase().replace(/\b(0|254)\d{8,9}\b/g, '').replace(/[^A-Z0-9&' -]/g, ' ').replace(/\s+/g, ' ').trim();
  return name ? `${dir}|${name}` : null;
}

// Besides normal categories, a name can be tied to a loan (lib/finance-actions.js payLoan / addToLoan):
//   'loan:<id>'      a payment on that loan (repayment to you if you lent, by you if you borrowed)
//   'loanadd:<id>'   more on top of that loan (lent more to them / borrowed more from them)
//   'loan_new'       a new loan: money out = you lent it, money in = you borrowed it
// A rule pointing at a loan that is settled or deleted is dropped, so Luxe asks again.
export const isLoanChoice = (c) => typeof c === 'string' && (c.startsWith('loan:') || c.startsWith('loanadd:') || c === 'loan_new');
export const loanIdOf = (c) => (typeof c === 'string' && /^loan(add)?:/.test(c) ? c.slice(c.indexOf(':') + 1) : null);

// The category for a message: fixed ones (airtime), else the learned rule, else null (= ask).
// activeLoanIds: ids of loans still open (rules for closed loans no longer apply).
export function categoryFor(p, rules = {}, activeLoanIds = null) {
  if (!p) return null;
  if (FIXED_CATEGORY[p.kind]) return FIXED_CATEGORY[p.kind];
  const k = partyKey(p);
  const c = k ? rules[k] || null : null;
  if (c && loanIdOf(c) && activeLoanIds && !activeLoanIds.includes(loanIdOf(c))) return null;
  return c;
}
