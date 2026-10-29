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
//   fuliza    a payment topped up by Fuliza carries it inside the normal text:
//             "... Ksh500.00 sent to ... New M-PESA balance is Ksh0.00 ... Fuliza M-PESA amount is Ksh 300.00. Access Fee
//              charged Ksh 3.00. Total Fuliza M-PESA outstanding amount is Ksh 303.00 due on 28/11/26."
//             -> the normal kind (sent/paid/...) plus p.fuliza = { borrowed, fee, owed, due }
//   repay     "Ksh 303.00 from your M-PESA has been used to fully pay your outstanding Fuliza M-PESA. Available Fuliza
//              M-PESA limit is Ksh 1000.00." -> kind 'fuliza_repay' (fully: true/false)
// Fuliza is tracked as a 'borrowed' loan per M-Pesa account ("Fuliza · <wallet>"): its balance is set from the
// outstanding amount Safaricom states, and a full repayment settles it.
// Anything mentioning Ziidi is marked kind 'ziidi' with the amounts found, for review.

// "Ksh500.00", "Ksh 500.00", "Ksh. 800.00", "KSh 2929.0", "Ksh. 939.4000000000001" (Ziidi writes long decimals).
const MONEY = '(?:Ksh|KES)\\.?\\s?([\\d,]+(?:\\.\\d+)?)';
// A phone number, full (0712345678 / 254712345678) or partly hidden by Safaricom (0712***678, 2547****5678).
const PHONE = '(?:\\+?254|0)\\d{9}|(?:\\+?254|0)\\d{1,5}[*xX]+\\d{2,4}';
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

// Ziidi's own texts (sender ZIIDI). Seen wordings:
//   invest   "You have successfully invested Ksh. 800.00 of transaction code UJTC0BKT8G. Your ZIIDI balance is ..."
//   withdraw "You have successfully withdrawn Ksh. 1,500.00 of transaction code UJTC0BKL1V. ..."
//   lock     "You have successfully locked Ksh.162.00. Locked Balance is Ksh. 1257.4. Accessible balance is Ksh 6094.84."
//   echo     "You have succesfully topped up your locked funds. Your new locked balance is Ksh 1257.40" (same lock again)
//   unlock   "You have successfully unlocked all your funds. Your KSh 2929.0 will be available in 72 hours."
//   balance  "Your ZIIDI investment balance is Ksh 2,352.24 on ..."            (information)
// invest/withdraw carry the M-Pesa code, so they pair with the M-Pesa text that already records the move.
function parseZiidi(t) {
  const amounts = [...t.matchAll(new RegExp(MONEY, 'gi'))].map((m) => num(m[1]));
  const amount = amounts[0] ?? null;
  const mpesaCode = first(/transaction code ([A-Z0-9]{10})/i, t);
  const base = { code: null, kind: 'ziidi', amount, amounts, mpesaCode, balance: null, cost: 0 };
  if (/successfully invested/i.test(t)) return { ...base, action: 'invest', direction: 'in' };
  if (/successfully withdrawn/i.test(t)) return { ...base, action: 'withdraw', direction: 'out' };
  if (/successfully locked/i.test(t)) return { ...base, action: 'lock', lockedAfter: num(first(new RegExp(`Locked Balance is\\s*${MONEY}`, 'i'), t)), accessible: num(first(new RegExp(`Accessible balance is\\s*${MONEY}`, 'i'), t)) };
  if (/topped up your locked funds/i.test(t)) return { ...base, action: 'lock_echo', lockedAfter: amount };
  if (/successfully unlocked/i.test(t)) return { ...base, action: 'unlock', all: /all your funds/i.test(t) };
  if (/investment balance is/i.test(t)) return { ...base, action: 'balance' };
  if (/^failed|cannot be completed|insufficient/i.test(t)) return { ...base, action: 'failed' };
  return { ...base, action: 'info' };
}

function parseMpesa(t) {
  const code = first(/^([A-Z0-9]{10})\b/, t);
  const amount = num(first(new RegExp(MONEY, 'i'), t));
  const balance = num(first(new RegExp(`(?:New M-?PESA balance is|account balance is now|M-?PESA balance is)\\s*${MONEY}`, 'i'), t));
  const cost = num(first(new RegExp(`Transaction cost,?\\s*${MONEY}`, 'i'), t));
  const base = { code, amount, balance, cost: cost || 0 };

  // Nothing moved: "Failed. Insufficient funds ...", "Dear customer, you do not have sufficient funds ...".
  if (/^Failed\b|do not have sufficient funds|insufficient funds/i.test(t)) {
    const to = first(/to pay (?:Ksh|KES)\.?\s?[\d,.]+ to (.+?)\.\s*Your M-?PESA/i, t);
    return { ...base, code: null, kind: 'failed', party: clean(to) };
  }
  if (!amount) return null;
  // "UJNC0ATQSU Confirmed. Your account balance was: M-PESA Account : Ksh268.00 ... Transaction cost, Ksh0.00."
  if (/Your account balance was/i.test(t)) return { ...base, kind: 'balance_check', amount: base.cost || 0, balance: num(first(new RegExp(`M-?PESA Account\\s*:\\s*${MONEY}`, 'i'), t)) };

  if (/has been reversed/i.test(t)) return { ...base, kind: 'reversal' };
  if (/used to (?:fully |partially )?pay (?:your )?outstanding Fuliza/i.test(t)) {
    return { ...base, kind: 'fuliza_repay', fully: /fully pay/i.test(t), limit: num(first(new RegExp(`Fuliza M-?PESA limit is\\s*${MONEY}`, 'i'), t)), owed: num(first(new RegExp(`outstanding amount is\\s*${MONEY}`, 'i'), t)) };
  }
  const borrowed = num(first(new RegExp(`Fuliza M-?PESA amount is\\s*${MONEY}`, 'i'), t));
  if (borrowed != null) {
    base.fuliza = {
      borrowed,
      fee: num(first(new RegExp(`Access Fee charged\\s*${MONEY}`, 'i'), t)) || 0,
      owed: num(first(new RegExp(`outstanding amount is\\s*${MONEY}`, 'i'), t)),
      due: first(/due on (\d{1,2}\/\d{1,2}\/\d{2,4})/i, t),
    };
  }
  if (/You have received/i.test(t)) {
    const m = t.match(new RegExp(`received ${MONEY} from (.+?)(?:\\s+(${PHONE}))? on `, 'i'));
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
    const m = t.match(new RegExp(`${MONEY} sent to (.+?)(?:\\s+(${PHONE}))? on `, 'i'));
    return { ...base, kind: 'sent', party: clean(m?.[2]), phone: m?.[3] || null };
  }
  // Fuliza on its own text, right after the payment it topped up:
  // "UJRF50ACCZ Confirmed. Fuliza M-PESA amount is Ksh 100.00. Access Fee charged Ksh 1.00. Total Fuliza M-PESA
  //  outstanding amount is Ksh139.87 due on 26/11/26."
  if (base.fuliza) return { ...base, kind: 'fuliza_draw', amount: base.fuliza.borrowed };
  return null;
}

// Money in (+) or out (-) of the M-Pesa wallet, including the fee.
export function signedAmount(p) {
  if (!p || p.amount == null) return null;
  if (['received', 'deposit', 'reversal'].includes(p.kind)) return p.amount;
  if (['sent', 'paybill', 'paid', 'withdraw', 'airtime', 'fuliza_repay'].includes(p.kind)) return -(p.amount + (p.cost || 0));
  return null;
}

export const KIND_LABEL = {
  sent: 'Sent', paybill: 'Pay Bill', paid: 'Buy Goods', received: 'Received', withdraw: 'Withdrawn', deposit: 'Deposited',
  airtime: 'Airtime', reversal: 'Reversal', fuliza_repay: 'Fuliza repaid', fuliza_draw: 'Fuliza borrowed', failed: 'Failed (nothing moved)', balance_check: 'Balance check', ziidi: 'Ziidi',
};

// ── Categories learned per name ─────────────────────────────────────────────
// The first time someone appears you pick a category; every later message from them (same direction) uses it.
// Who "someone" is, most exact first (people share names, never numbers):
//   full phone number          "in|tel:0712345678"
//   hidden number + name       "in|tel:0712***678|JANE DOE"   (Safaricom masks some digits on received money)
//   Pay Bill + account         "out|KPLC PREPAID|acct:37123456789" (each meter / account on its own)
//   name (tills, businesses)   "out|NAIVAS SUPERMARKET"
// Rules live in settings 'sms_categories' as { "<key>": "<category or loan choice>" }.
const NEEDS_CATEGORY = { sent: 'out', paybill: 'out', paid: 'out', received: 'in' };
export const FIXED_CATEGORY = { airtime: 'airtime' };

export function partyKey(p) {
  const dir = p && !p.ziidiMove ? NEEDS_CATEGORY[p.kind] : null;
  if (!dir || !p.party) return null;
  const name = String(p.party).toUpperCase().replace(/\b(0|254)\d{8,9}\b/g, '').replace(/[^A-Z0-9&' -]/g, ' ').replace(/\s+/g, ' ').trim();
  const tel = normPhone(p.phone);
  if (tel && !/[*X]/.test(tel)) return `${dir}|tel:${tel}`;
  if (tel) return `${dir}|tel:${tel}|${name}`;
  if (p.kind === 'paybill' && p.account) return `${dir}|${name}|acct:${String(p.account).toUpperCase().replace(/\s+/g, '')}`;
  return name ? `${dir}|${name}` : null;
}

// 254712345678 / +254712345678 -> 0712345678; hidden digits kept as '*'.
export function normPhone(s) {
  if (!s) return null;
  const x = String(s).toUpperCase().replace(/X/g, '*').replace(/[^0-9*]/g, '');
  const local = x.startsWith('254') ? `0${x.slice(3)}` : x;
  return local.length >= 7 ? local.replace(/\*+/g, '***') : null;
}

// Besides normal categories, a name can be tied to a loan (lib/finance-actions.js payLoan / addToLoan):
//   'loan:<id>'      a payment on that loan (repayment to you if you lent, by you if you borrowed)
//   'loanadd:<id>'   more on top of that loan (lent more to them / borrowed more from them)
//   'loan_new'       a new loan: money out = you lent it, money in = you borrowed it
// A rule pointing at a loan that is settled or deleted is dropped, so Luxe asks again.
// A name set to ASK is never guessed: every message from it waits for you (e.g. someone you sometimes help and
// sometimes lend to).
export const ASK = 'ask';

export const isLoanChoice = (c) => typeof c === 'string' && (c.startsWith('loan:') || c.startsWith('loanadd:') || c === 'loan_new');
export const loanIdOf = (c) => (typeof c === 'string' && /^loan(add)?:/.test(c) ? c.slice(c.indexOf(':') + 1) : null);

// The category for a message: fixed ones (airtime), else the learned rule, else null (= ask).
// activeLoanIds: ids of loans still open (rules for closed loans no longer apply).
export function categoryFor(p, rules = {}, activeLoanIds = null) {
  if (!p) return null;
  if (FIXED_CATEGORY[p.kind]) return FIXED_CATEGORY[p.kind];
  const k = partyKey(p);
  let c = k ? rules[k] || null : null;
  // A hidden number (0722***222) can still match a rule made from that person's full number (0722111222).
  if (!c && k && /^(in|out)\|tel:[0-9]+\*+[0-9]+\|/.test(k)) {
    const [dir, tel] = k.split('|');
    const [head, tail] = tel.slice(4).split('***');
    const hits = Object.keys(rules).filter((r) => { const [d, t, extra] = r.split('|'); return d === dir && !extra && /^tel:\d+$/.test(t) && t.slice(4).startsWith(head) && t.endsWith(tail); });
    if (hits.length === 1) c = rules[hits[0]];
  }
  if (c === ASK) return null;
  if (c && loanIdOf(c) && activeLoanIds && !activeLoanIds.includes(loanIdOf(c))) return null;
  return c;
}
