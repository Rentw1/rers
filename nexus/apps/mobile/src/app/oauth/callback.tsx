import { router } from 'expo-router';
import { useEffect } from 'react';
import { Loading } from '@/components/ui';

/** Landing route for nexus://oauth/callback; the auth session itself consumes the code. */
export default function OAuthCallback() {
  useEffect(() => {
    const t = setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/settings/mcp')), 300);
    return () => clearTimeout(t);
  }, []);
  return <Loading />;
}
