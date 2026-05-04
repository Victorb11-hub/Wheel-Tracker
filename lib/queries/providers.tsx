'use client';

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { createContext, useContext, useState } from 'react';
import type { DataClient } from '../data/client';
import { MockDataClient } from '../data/mock-client';

// =============================================================================
// Provider plumbing for option (a): only client-flipped tabs (currently just
// Closed Groups) consume these hooks. Server-rendered tabs keep building fresh
// seed via buildSeed() in their own pages — they are not affected by client
// mutations. Documented limitation: stat-strip / tabs-nav counts in the
// server-rendered chrome may go stale after a client mutation until a hard
// nav. This will lift when Open Positions gets flipped (separate task).
// =============================================================================

const DataClientContext = createContext<DataClient | null>(null);

export function useDataClient(): DataClient {
  const client = useContext(DataClientContext);
  if (!client) {
    throw new Error('useDataClient must be used within <Providers>');
  }
  return client;
}

// One MockDataClient per browser session. A module-level singleton keeps state
// across React re-renders and tab nav within a single session so mutations on
// Closed Groups persist until reload.
let _mock: MockDataClient | null = null;
function getMockClient(): MockDataClient {
  if (!_mock) _mock = new MockDataClient();
  return _mock;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  const [dataClient] = useState<DataClient>(() => getMockClient());

  return (
    <QueryClientProvider client={queryClient}>
      <DataClientContext.Provider value={dataClient}>
        {children}
      </DataClientContext.Provider>
    </QueryClientProvider>
  );
}
