export async function startProPayment(user_id, phone, amount) {
  const res = await fetch('/api/payments/stk', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id, phone, amount }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Payment failed to start');
  return data.reference;
}

export function pollPaymentStatus(reference, { onUpdate, timeoutMs = 90000 } = {}) {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      const res = await fetch(`/api/payments/status?reference=${reference}`);
      const { status } = await res.json();
      onUpdate?.(status);
      if (status === 'success' || status === 'failed') return resolve(status);
      if (Date.now() - start > timeoutMs) return resolve('timeout');
      setTimeout(tick, 3000);
    };
    tick();
  });
}
