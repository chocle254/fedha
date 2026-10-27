import { useEffect } from 'react';
import { useRouter } from 'next/router';

// Binance Portfolio now lives in Trading → "Binance wallet" tab.
export default function BinancePage() {
  const router = useRouter();
  useEffect(() => { router.replace('/trading?tab=wallet'); }, [router]);
  return null;
}
