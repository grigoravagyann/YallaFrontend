import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { ConsoleGateway } from '../consoleGateway';
import type { PublicGateway } from '../publicGateway';
import type { YallaGateway } from '../gateway';
import type { StaffGateway } from '../staffGateway';

interface Gateways {
  readonly gateway: YallaGateway | null;
  readonly consoleGateway: ConsoleGateway | null;
  readonly staffGateway: StaffGateway | null;
  readonly publicGateway: PublicGateway | null;
}

const GatewayContext = createContext<Gateways>({
  gateway: null,
  consoleGateway: null,
  staffGateway: null,
  publicGateway: null,
});

export interface GatewayProviderProps {
  readonly gateway?: YallaGateway | undefined;
  readonly consoleGateway?: ConsoleGateway | undefined;
  readonly staffGateway?: StaffGateway | undefined;
  readonly publicGateway?: PublicGateway | undefined;
  readonly children: ReactNode;
}

export function GatewayProvider({
  gateway,
  consoleGateway,
  staffGateway,
  publicGateway,
  children,
}: GatewayProviderProps) {
  return createElement(
    GatewayContext.Provider,
    {
      value: {
        gateway: gateway ?? null,
        consoleGateway: consoleGateway ?? null,
        staffGateway: staffGateway ?? null,
        publicGateway: publicGateway ?? null,
      },
    },
    children,
  );
}

export function useGateway(): YallaGateway {
  const { gateway } = useContext(GatewayContext);
  if (!gateway) throw new Error('useGateway: wrap the tree in <GatewayProvider gateway={…}>.');
  return gateway;
}

export function useConsoleGateway(): ConsoleGateway {
  const { consoleGateway } = useContext(GatewayContext);
  if (!consoleGateway) {
    throw new Error('useConsoleGateway: wrap the tree in <GatewayProvider consoleGateway={…}>.');
  }
  return consoleGateway;
}

export function usePublicGateway(): PublicGateway {
  const { publicGateway } = useContext(GatewayContext);
  if (!publicGateway) {
    throw new Error('usePublicGateway: wrap the tree in <GatewayProvider publicGateway={…}>.');
  }
  return publicGateway;
}

export function useStaffGateway(): StaffGateway {
  const { staffGateway } = useContext(GatewayContext);
  if (!staffGateway) {
    throw new Error('useStaffGateway: wrap the tree in <GatewayProvider staffGateway={…}>.');
  }
  return staffGateway;
}
