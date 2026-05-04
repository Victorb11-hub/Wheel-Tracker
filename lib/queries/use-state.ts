'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataClient } from './providers';
import { buildSeed } from '../data/seed';
import type { FullState } from '../data/client';

export const STATE_QUERY_KEY = ['wheel-state'] as const;

// initialData ensures both SSR and the first client render have data; mutations
// flow through queryFn → dataClient.getState() and replace the cached value.
// The seed is pure and cheap to evaluate; both server and client get the same
// snapshot on first render so hydration matches.
export function useFullState() {
  const dataClient = useDataClient();
  return useQuery<FullState>({
    queryKey: STATE_QUERY_KEY,
    queryFn: () => dataClient.getState(),
    initialData: () => buildSeed(),
  });
}

export function useInvalidateState() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: STATE_QUERY_KEY });
}
