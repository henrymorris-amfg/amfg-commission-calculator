import React, { createContext, useContext, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

interface AeProfile {
  id: number;
  name: string;
  joinDate: Date;
  isTeamLeader: boolean;
}

interface AeAuthContextValue {
  ae: AeProfile | null;
  isLoading: boolean;
  refetch: () => void;
}

const AeAuthContext = createContext<AeAuthContextValue>({
  ae: null,
  isLoading: true,
  refetch: () => {},
});

export function AeAuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, refetch } = trpc.ae.me.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <AeAuthContext.Provider
      value={{
        ae: data ?? null,
        isLoading,
        refetch,
      }}
    >
      {children}
    </AeAuthContext.Provider>
  );
}

export function useAeAuth() {
  return useContext(AeAuthContext);
}
