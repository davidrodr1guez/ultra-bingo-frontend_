// Configuración de la aplicación Ultra Bingo

export const config = {
  // API Backend
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:5000',

  // WebSocket
  wsUrl: import.meta.env.VITE_WS_URL || 'http://localhost:5000',

  // x402 Configuration - NO HARDCODED FALLBACKS FOR SECURITY
  x402: {
    facilitatorUrl: import.meta.env.VITE_X402_FACILITATOR_URL || 'https://facilitator.ultravioletadao.xyz',
    network: import.meta.env.VITE_X402_NETWORK || 'avalanche',
    // Receiver wallet - MUST match backend config, no fallback for security
    receiverAddress: import.meta.env.VITE_X402_RECEIVER,
  },

  // Legacy - kept for backwards compatibility
  facilitatorUrl: import.meta.env.VITE_FACILITATOR_URL || 'https://facilitator.ultravioletadao.xyz/',

  // Redes soportadas
  networks: {
    'avalanche': {
      chainId: 43114,
      name: 'Avalanche C-Chain',
      currency: 'AVAX',
      rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    },
    'base': {
      chainId: 8453,
      name: 'Base',
      currency: 'ETH',
      rpcUrl: 'https://mainnet.base.org',
    },
  },

  // Red por defecto
  defaultNetwork: 'avalanche',

  // Precio por cartón en USDC (Avalanche Mainnet)
  cardPrice: 0.01,

  // Límites - Solo cantidades Fibonacci permitidas
  maxCardsPerPurchase: 34,

  // Cantidades Fibonacci válidas para compra
  fibonacciQuantities: [1, 2, 3, 5, 8, 13, 21, 34],

  // Bingo
  bingoColumns: {
    B: { min: 1, max: 15 },
    I: { min: 16, max: 30 },
    N: { min: 31, max: 45 },
    G: { min: 46, max: 60 },
    O: { min: 61, max: 75 },
  },
};

export default config;
