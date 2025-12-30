/**
 * Servicio x402 para manejar pagos con el protocolo x402
 *
 * Basado en la implementación funcional de UltrapayX402
 * Usa viem directamente con window.ethereum para máxima compatibilidad
 */

import { createWalletClient, custom, toHex, defineChain } from 'viem';
import { avalanche, base, polygon, mainnet, arbitrum, optimism, celo } from 'viem/chains';
import { config } from '../config';

// Define custom chains for viem
const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'Monad Explorer', url: 'https://explorer.monad.xyz' } },
});

const hyperevm = defineChain({
  id: 999,
  name: 'HyperEVM',
  nativeCurrency: { name: 'Hyper', symbol: 'HYPER', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.hyperevm.xyz'] } },
  blockExplorers: { default: { name: 'HyperEVM Explorer', url: 'https://explorer.hyperevm.xyz' } },
});

const unichain = defineChain({
  id: 130,
  name: 'Unichain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.unichain.org'] } },
  blockExplorers: { default: { name: 'Unichain Explorer', url: 'https://explorer.unichain.org' } },
});

// All supported EVM chains (uvd-x402-sdk compatible)
const SUPPORTED_CHAINS = {
  avalanche,
  base,
  polygon,
  ethereum: mainnet,
  arbitrum,
  optimism,
  celo,
  monad,
  hyperevm,
  unichain,
};

// Estado global de la wallet
let walletClient = null;

// Selected network (can be changed by user)
let selectedNetwork = 'avalanche';

/**
 * Set the selected network for payments
 */
export function setSelectedNetwork(network) {
  if (SUPPORTED_CHAINS[network]) {
    selectedNetwork = network;
    console.log(`[x402] Network changed to: ${network}`);
  }
}

/**
 * Get the current selected network
 */
export function getSelectedNetwork() {
  return selectedNetwork;
}

/**
 * Verifica si hay una wallet instalada (MetaMask, etc.)
 */
export function hasWalletProvider() {
  return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
}

/**
 * Obtiene la chain correcta según la red seleccionada
 */
function getChain() {
  return SUPPORTED_CHAINS[selectedNetwork] || avalanche;
}

/**
 * Conecta con la wallet del usuario
 */
export async function connectWallet(forceNewConnection = true) {
  if (!hasWalletProvider()) {
    throw new Error('No se encontró una wallet. Instala MetaMask.');
  }

  try {
    if (forceNewConnection) {
      try {
        await window.ethereum.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        });
      } catch (permError) {
        console.log('Permission request failed, falling back to eth_requestAccounts');
      }
    }

    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts',
    });

    if (!accounts || accounts.length === 0) {
      throw new Error('No se pudo conectar con la wallet');
    }

    const address = accounts[0];

    // Crear wallet client con viem
    walletClient = createWalletClient({
      account: address,
      chain: getChain(),
      transport: custom(window.ethereum),
    });

    const chainId = await window.ethereum.request({
      method: 'eth_chainId',
    });

    return {
      isConnected: true,
      address,
      chainId: parseInt(chainId, 16),
    };
  } catch (error) {
    console.error('Error connecting wallet:', error);
    throw error;
  }
}

/**
 * Obtiene el estado actual de la wallet
 */
export async function getWalletState() {
  if (!hasWalletProvider()) {
    return {
      isConnected: false,
      address: null,
      chainId: null,
      balance: null,
    };
  }

  try {
    const accounts = await window.ethereum.request({
      method: 'eth_accounts',
    });

    if (!accounts || accounts.length === 0) {
      return {
        isConnected: false,
        address: null,
        chainId: null,
        balance: null,
      };
    }

    const address = accounts[0];
    const chainId = await window.ethereum.request({
      method: 'eth_chainId',
    });

    return {
      isConnected: true,
      address,
      chainId: parseInt(chainId, 16),
      balance: null,
    };
  } catch {
    return {
      isConnected: false,
      address: null,
      chainId: null,
      balance: null,
    };
  }
}

/**
 * Obtiene el balance de USDC del usuario
 * @returns {Promise<{balance: string, balanceFormatted: string, hasEnough: function, skipped: boolean}>}
 */
export async function getUSDCBalance() {
  if (!hasWalletProvider()) {
    // No wallet - skip check, let payment process handle it
    return { balance: '0', balanceFormatted: '0.00', hasEnough: () => true, skipped: true };
  }

  try {
    const accounts = await window.ethereum.request({
      method: 'eth_accounts',
    });

    if (!accounts || accounts.length === 0) {
      return { balance: '0', balanceFormatted: '0.00', hasEnough: () => true, skipped: true };
    }

    const address = accounts[0];
    const targetChain = getChain();

    // Check if on correct network
    const currentChainId = await window.ethereum.request({
      method: 'eth_chainId',
    });
    const currentChainIdNum = parseInt(currentChainId, 16);

    // If on wrong network, skip balance check - payment process will switch network
    if (currentChainIdNum !== targetChain.id) {
      console.log(`[x402] On chain ${currentChainIdNum}, target is ${targetChain.id} - skipping balance check`);
      return { balance: '0', balanceFormatted: '0.00', hasEnough: () => true, skipped: true };
    }

    // USDC contract addresses (from uvd-x402-sdk)
    const usdcAddresses = {
      43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // Avalanche
      8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base
      137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Polygon
      1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum
      42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum
      10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Optimism
      42220: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', // Celo
      143: '0x754704bc059f8c67012fed69bc8a327a5aafb603', // Monad
      999: '0xb88339CB7199b77E23DB6E890353E22632Ba630f', // HyperEVM
      130: '0x078d782b760474a361dda0af3839290b0ef57ad6', // Unichain
    };
    const usdcAddress = usdcAddresses[targetChain.id] || usdcAddresses[43114];

    // ERC20 balanceOf call
    const balanceOfData = '0x70a08231' + address.slice(2).padStart(64, '0');

    const result = await window.ethereum.request({
      method: 'eth_call',
      params: [
        {
          to: usdcAddress,
          data: balanceOfData,
        },
        'latest',
      ],
    });

    const balanceWei = BigInt(result || '0x0');
    const balanceFormatted = (Number(balanceWei) / 1_000_000).toFixed(2);

    return {
      balance: balanceWei.toString(),
      balanceFormatted,
      hasEnough: (amountUSDC) => balanceWei >= BigInt(Math.round(amountUSDC * 1_000_000)),
      skipped: false,
    };
  } catch (error) {
    console.error('Error getting USDC balance:', error);
    // On error, skip check and let payment process handle it
    return { balance: '0', balanceFormatted: '0.00', hasEnough: () => true, skipped: true };
  }
}

/**
 * Cambia a la red correcta para x402
 * @param {number} maxRetries - Número máximo de intentos
 */
export async function switchToCorrectNetwork(maxRetries = 3) {
  if (!hasWalletProvider()) {
    throw new Error('No wallet provider found');
  }

  const targetChain = getChain();
  const targetChainIdHex = `0x${targetChain.id.toString(16)}`;

  console.log(`[x402] Requesting network switch to ${targetChain.name} (${targetChain.id})`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainIdHex }],
      });

      // Esperar un momento para que la wallet procese el cambio
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verificar que el cambio fue exitoso
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChainIdNum = parseInt(currentChainId, 16);

      if (currentChainIdNum === targetChain.id) {
        console.log(`[x402] Successfully switched to ${targetChain.name}`);
        return true;
      }

      console.warn(`[x402] Network switch attempt ${attempt} - still on chain ${currentChainIdNum}`);
    } catch (switchError) {
      console.error(`[x402] Network switch error:`, switchError);

      // Si la chain no está añadida, intentar añadirla
      if (switchError?.code === 4902) {
        try {
          console.log(`[x402] Adding ${targetChain.name} to wallet...`);
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: targetChainIdHex,
                chainName: targetChain.name,
                nativeCurrency: targetChain.nativeCurrency,
                rpcUrls: [targetChain.rpcUrls.default.http[0]],
                blockExplorerUrls: [targetChain.blockExplorers?.default.url],
              },
            ],
          });
          // Después de añadir, intentar cambiar de nuevo
          continue;
        } catch (addError) {
          console.error(`[x402] Failed to add network:`, addError);
          throw new Error(`No se pudo añadir la red ${targetChain.name}. Por favor añádela manualmente.`);
        }
      }

      // Si el usuario rechazó, lanzar error
      if (switchError?.code === 4001) {
        throw new Error(`Por favor cambia a ${targetChain.name} en tu wallet para continuar.`);
      }

      throw switchError;
    }
  }

  throw new Error(`No se pudo cambiar a ${targetChain.name}. Por favor cambia manualmente en tu wallet.`);
}

/**
 * Asegura que el walletClient esté inicializado con account
 */
async function ensureWalletClient() {
  if (!hasWalletProvider()) {
    throw new Error('No wallet provider found');
  }

  const accounts = await window.ethereum.request({
    method: 'eth_accounts',
  });

  if (!accounts || accounts.length === 0) {
    throw new Error('Wallet not connected');
  }

  const address = accounts[0];

  // Siempre recrear walletClient con el account actual
  walletClient = createWalletClient({
    account: address,
    chain: getChain(),
    transport: custom(window.ethereum),
  });

  return walletClient;
}

/**
 * Genera un nonce aleatorio para la autorización
 */
function generateNonce() {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return toHex(randomBytes);
}

/**
 * Firma una autorización de pago usando EIP-3009 (TransferWithAuthorization)
 */
export async function signPaymentAuthorization(paymentInfo, amount) {
  console.log('[x402] ====== STARTING PAYMENT SIGNATURE ======');
  console.log('[x402] Payment info:', JSON.stringify(paymentInfo, null, 2));
  console.log('[x402] Amount:', amount.toString());

  const client = await ensureWalletClient();

  if (!client.account) {
    throw new Error('Wallet account not available');
  }

  const address = client.account.address;
  const chain = getChain();

  console.log(`[x402] Target chain: ${chain.name} (chainId: ${chain.id})`);
  console.log(`[x402] Wallet address: ${address}`);

  // Verificar que la wallet esté en la red correcta antes de firmar
  let currentChainId = await window.ethereum.request({
    method: 'eth_chainId',
  });
  let currentChainIdNum = parseInt(currentChainId, 16);

  console.log(`[x402] Current wallet chainId: ${currentChainIdNum}`);

  if (currentChainIdNum !== chain.id) {
    console.log(`[x402] NEED TO SWITCH: from ${currentChainIdNum} to ${chain.id} (${chain.name})`);

    // Usar la función mejorada de cambio de red
    await switchToCorrectNetwork();

    // Verificar que el cambio fue exitoso
    currentChainId = await window.ethereum.request({
      method: 'eth_chainId',
    });
    currentChainIdNum = parseInt(currentChainId, 16);

    console.log(`[x402] After switch, wallet chainId: ${currentChainIdNum}`);

    if (currentChainIdNum !== chain.id) {
      throw new Error(
        `No se pudo cambiar a ${chain.name}. Cambia manualmente en tu wallet e intenta de nuevo.`
      );
    }

    // Reinicializar walletClient con la nueva red
    walletClient = createWalletClient({
      account: address,
      chain: chain,
      transport: custom(window.ethereum),
    });
  }

  // Tiempos de validez (siguiendo uvd-x402-sdk)
  const now = Math.floor(Date.now() / 1000);
  const validAfter = BigInt(0); // Válido inmediatamente (uvd-x402-sdk usa 0)
  const validBefore = BigInt(now + 300); // Válido por 5 minutos

  // Generar nonce aleatorio
  const authorizationNonce = generateNonce();

  // USDC contract address por chain (from uvd-x402-sdk)
  const usdcAddresses = {
    43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // Avalanche
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base
    137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Polygon
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum
    42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum
    10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Optimism
    42220: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', // Celo
    143: '0x754704bc059f8c67012fed69bc8a327a5aafb603', // Monad
    999: '0xb88339CB7199b77E23DB6E890353E22632Ba630f', // HyperEVM
    130: '0x078d782b760474a361dda0af3839290b0ef57ad6', // Unichain
  };
  const usdcAddress = usdcAddresses[chain.id] || usdcAddresses[43114];

  // Nombres de dominio EIP-712 por chain (según uvd-x402-sdk)
  // Celo, HyperEVM, Unichain, Monad usan "USDC" en vez de "USD Coin"
  const domainNames = {
    43114: 'USD Coin', // Avalanche
    8453: 'USD Coin', // Base
    137: 'USD Coin', // Polygon
    1: 'USD Coin', // Ethereum
    42161: 'USD Coin', // Arbitrum
    10: 'USD Coin', // Optimism
    42220: 'USDC', // Celo
    143: 'USDC', // Monad
    999: 'USDC', // HyperEVM
    130: 'USDC', // Unichain
  };

  // EIP-712 Domain para USDC
  const domain = {
    name: paymentInfo.extra?.name || domainNames[chain.id] || 'USD Coin',
    version: paymentInfo.extra?.version || '2',
    chainId: chain.id,
    verifyingContract: usdcAddress,
  };

  // Tipos EIP-712 para TransferWithAuthorization (EIP-3009)
  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  };

  // Obtener receiver (v1) o payTo (v2)
  const recipient = paymentInfo.receiver || paymentInfo.payTo;

  // Mensaje a firmar
  const message = {
    from: address,
    to: recipient,
    value: amount,
    validAfter: validAfter,
    validBefore: validBefore,
    nonce: authorizationNonce,
  };

  // Debug logging
  console.log('[x402] EIP-712 Domain:', JSON.stringify(domain, (k, v) => typeof v === 'bigint' ? v.toString() : v));
  console.log('[x402] EIP-712 Message:', JSON.stringify(message, (k, v) => typeof v === 'bigint' ? v.toString() : v));

  // Firmar con EIP-712
  const signingClient = walletClient || client;
  const signature = await signingClient.signTypedData({
    account: signingClient.account,
    domain,
    types,
    primaryType: 'TransferWithAuthorization',
    message,
  });

  // Construir el payload x402 v1 (compatible con uvd-x402-sdk)
  const paymentPayload = {
    x402Version: 1,
    scheme: paymentInfo.scheme,
    network: paymentInfo.network || 'avalanche',
    payload: {
      signature: signature,
      authorization: {
        from: address,
        to: recipient,
        value: amount.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: authorizationNonce,
      },
    },
  };

  return paymentPayload;
}

/**
 * Codifica el payload de pago para el header X-Payment
 */
export function encodePaymentHeader(payload) {
  const jsonStr = JSON.stringify(payload);
  return btoa(jsonStr);
}

/**
 * Crea un fetch wrapper con soporte para pagos x402
 *
 * Flujo:
 * 1. Envía request sin pago
 * 2. Si recibe 402, lee el body JSON con la info de pago
 * 3. Abre wallet para que usuario firme la autorización
 * 4. Reenvía request con header X-Payment
 */
export async function createPaymentFetch() {
  // Asegurar que walletClient esté inicializado
  await ensureWalletClient();

  // Retornar un fetch wrapper que maneja 402 automáticamente
  return async (input, init) => {
    // Primera petición sin header de pago
    const firstResponse = await fetch(input, init);

    // Si no es 402, retornar la respuesta directamente
    if (firstResponse.status !== 402) {
      return firstResponse;
    }

    // Leer la información de pago del body JSON
    let x402Data;
    try {
      x402Data = await firstResponse.json();
    } catch (error) {
      throw new Error('No se pudo leer la información de pago del servidor');
    }

    // Validar que tengamos la info de pago (v1: paymentInfo, v2: accepts)
    const paymentInfo = x402Data.paymentInfo || x402Data.accepts?.[0];

    if (!paymentInfo) {
      throw new Error('El servidor no proporcionó información de pago válida');
    }

    // Convertir el monto (ya viene en unidades atómicas)
    const amount = BigInt(paymentInfo.amount || paymentInfo.maxAmountRequired);

    // Firmar la autorización de pago - esto abre la wallet para que el usuario confirme
    const paymentPayload = await signPaymentAuthorization(paymentInfo, amount);

    // Codificar el payload para el header X-Payment
    const paymentHeader = encodePaymentHeader(paymentPayload);

    // Segunda petición con header de pago x402 v1
    const newHeaders = new Headers(init?.headers);
    newHeaders.set('X-PAYMENT', paymentHeader);

    const secondResponse = await fetch(input, {
      ...init,
      headers: newHeaders,
    });

    return secondResponse;
  };
}

/**
 * Hook-like function para usar en componentes React
 * Retorna funciones para manejar pagos x402
 */
export async function getX402Functions() {
  const walletState = await getWalletState();

  if (!walletState.isConnected) {
    return {
      paymentFetch: null,
      isReady: false,
      walletState,
    };
  }

  try {
    const paymentFetch = await createPaymentFetch();
    return {
      paymentFetch,
      isReady: true,
      walletState,
    };
  } catch (error) {
    console.error('[x402] Error creating payment fetch:', error);
    return {
      paymentFetch: null,
      isReady: false,
      walletState,
      error: error.message,
    };
  }
}

export default {
  hasWalletProvider,
  connectWallet,
  getWalletState,
  getUSDCBalance,
  switchToCorrectNetwork,
  signPaymentAuthorization,
  encodePaymentHeader,
  createPaymentFetch,
  getX402Functions,
  setSelectedNetwork,
  getSelectedNetwork,
};
