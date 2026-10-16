import { createMockGateway } from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { useSession } from '../stores/session';
import { useLoginDiner } from './accountQueries';

/**
 * A password sign-in proves nothing about the phone, so it starts a session
 * with no phone proof — whatever an earlier code sign-in on this phone left.
 * Otherwise Edit profile would hide the current password from a session the
 * server will ask it of.
 */
describe('signing in with a password', () => {
  it('forgets an earlier phone proof', async () => {
    const gateway = createMockGateway({ latencyMs: 0 });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <GatewayProvider gateway={gateway}>{children}</GatewayProvider>
      </QueryClientProvider>
    );
    useSession.getState().markPhoneProved(Date.now());

    const { result } = renderHook(() => useLoginDiner(), { wrapper });
    await act(() => result.current.mutateAsync({ identifier: 'ani', password: 'password123' }));

    expect(useSession.getState().phoneProvedAtMs).toBeNull();
  });
});
