// Configuración de la aplicación Ultra Bingo

export const config = {
  // API Backend
  apiUrl: import.meta.env.VITE_API_URL || 'https://ultra-bingo-backend.onrender.com',

  // WebSocket
  wsUrl: import.meta.env.VITE_WS_URL || 'https://ultra-bingo-backend.onrender.com',

  // x402 Configuration - NO HARDCODED FALLBACKS FOR SECURITY
  x402: {
    facilitatorUrl: import.meta.env.VITE_X402_FACILITATOR_URL || 'https://facilitator.ultravioletadao.xyz',
    network: import.meta.env.VITE_X402_NETWORK || 'avalanche',
    // Receiver wallet - MUST match backend config, no fallback for security
    receiverAddress: import.meta.env.VITE_X402_RECEIVER,
  },

  // Legacy - kept for backwards compatibility
  facilitatorUrl: import.meta.env.VITE_FACILITATOR_URL || 'https://facilitator.ultravioletadao.xyz/',

  // Redes soportadas (uvd-x402-sdk compatible)
  networks: {
    'avalanche': {
      chainId: 43114,
      name: 'Avalanche C-Chain',
      currency: 'AVAX',
      rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
      usdcAddress: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    },
    'base': {
      chainId: 8453,
      name: 'Base',
      currency: 'ETH',
      rpcUrl: 'https://mainnet.base.org',
      usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
    'polygon': {
      chainId: 137,
      name: 'Polygon',
      currency: 'MATIC',
      rpcUrl: 'https://polygon-rpc.com',
      usdcAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    },
    'monad': {
      chainId: 143,
      name: 'Monad',
      currency: 'MON',
      rpcUrl: 'https://rpc.monad.xyz',
      usdcAddress: '0x0000000000000000000000000000000000000000', // TBD
    },
  },

  // Red por defecto
  defaultNetwork: 'avalanche',

  // Precio por cartón en USDC (Avalanche Mainnet)
  cardPrice: 5,

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
