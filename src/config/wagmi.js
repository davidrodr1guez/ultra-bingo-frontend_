import { http, createConfig } from 'wagmi';
import { avalanche, base, polygon, mainnet, arbitrum, optimism, celo } from 'wagmi/chains';
import { defineChain } from 'viem';
import { injected, walletConnect } from 'wagmi/connectors';

// WalletConnect project ID
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo';

// Define custom chains not in wagmi
export const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'Monad Explorer', url: 'https://explorer.monad.xyz' } },
});

export const hyperevm = defineChain({
  id: 999,
  name: 'HyperEVM',
  nativeCurrency: { name: 'Hyper', symbol: 'HYPER', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.hyperevm.xyz'] } },
  blockExplorers: { default: { name: 'HyperEVM Explorer', url: 'https://explorer.hyperevm.xyz' } },
});

export const unichain = defineChain({
  id: 130,
  name: 'Unichain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.unichain.org'] } },
  blockExplorers: { default: { name: 'Unichain Explorer', url: 'https://explorer.unichain.org' } },
});

export const wagmiConfig = createConfig({
  chains: [avalanche, base, polygon, mainnet, arbitrum, optimism, celo, monad, hyperevm, unichain],
  connectors: [
    injected(),
    walletConnect({ projectId }),
  ],
  transports: {
    [avalanche.id]: http(),
    [base.id]: http(),
    [polygon.id]: http(),
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [celo.id]: http(),
    [monad.id]: http(),
    [hyperevm.id]: http(),
    [unichain.id]: http(),
  },
});
