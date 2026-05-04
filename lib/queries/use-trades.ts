'use client';

import { useMutation } from '@tanstack/react-query';
import { useDataClient } from './providers';
import { useInvalidateState } from './use-state';
import type { EditTradeInput } from '../data/client';

export function useEditTrade() {
  const dataClient = useDataClient();
  const invalidate = useInvalidateState();

  return useMutation({
    mutationFn: async (input: EditTradeInput) => dataClient.editTrade(input),
    onSettled: () => invalidate(),
  });
}
