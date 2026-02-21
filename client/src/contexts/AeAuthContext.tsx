import React, { createContext, useContext } from "react";
import { trpc } from "@/lib/trpc";
import { getAeToken } from "../main";

interface AeProfile {
  id: number;
  name: string;
  joinDate: Date;
  isTeamLeader: boolean;
}

interface AeAuthContextValue {
  ae: AeProfile | null;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
}

const AeAuthContext = createContext<AeAuthContextValue>({
  ae: null,
  isLoading: true,
  refetch: async () => {},
});

export function AeAuthProvider({ children }: { children: React.ReactNode }) {
  // Only query ae.me if we have a token in localStorage — avoids unnecessary
  // UNAUTHORIZED errors on first load when no session exists.
  const hasToken = !!getAeToken();

  const { data, isLoading, refetch } = trpc.ae.me.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
    enabled: hasToken,
  });

  return (
    <AeAuthContext.Provider
      value={{
        ae: data ?? null,
        // If no token, we're not loading — we know the user is logged out
        isLoading: hasToken ? isLoading : false,
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
