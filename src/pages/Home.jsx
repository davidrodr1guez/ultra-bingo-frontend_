import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { createPaymentFetch, getWalletState, hasWalletProvider, getUSDCBalance, setSelectedNetwork } from '../services/x402';
import { CardQuantitySelector, NumberBall } from '../components/bingo';
import { GlowButton, GlassCard, AnimatedBackground } from '../components/ui';
import { AnimatedTitle, FadeUpText, GradientText } from '../components/ui/AnimatedText';
import { config } from '../config';
import './Home.css';

// Network info with logos/icons (all uvd-x402-sdk supported EVM mainnets)
const NETWORK_INFO = {
  avalanche: { name: 'Avalanche', icon: '🔺', color: '#E84142' },
  base: { name: 'Base', icon: '🔵', color: '#0052FF' },
  polygon: { name: 'Polygon', icon: '🟣', color: '#8247E5' },
  ethereum: { name: 'Ethereum', icon: '⟠', color: '#627EEA' },
  arbitrum: { name: 'Arbitrum', icon: '🔷', color: '#28A0F0' },
  optimism: { name: 'Optimism', icon: '🔴', color: '#FF0420' },
  celo: { name: 'Celo', icon: '🟡', color: '#FCFF52' },
  monad: { name: 'Monad', icon: '⚡', color: '#836EF9' },
  hyperevm: { name: 'HyperEVM', icon: '⚡', color: '#00D395' },
  unichain: { name: 'Unichain', icon: '🦄', color: '#FF007A' },
};

// Timeout for payment operations (30 seconds)
const PAYMENT_TIMEOUT_MS = 30000;

function Home() {
  const { user, isConnected, isLoggedIn, openLoginModal, connectWallet } = useAuth();
  const { gameState } = useSocket();

  const [availableCount, setAvailableCount] = useState(0);
  const [purchasedCards, setPurchasedCards] = useState([]);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [isWalletReady, setIsWalletReady] = useState(false);
  const [selectedNet, setSelectedNet] = useState(() => {
    return localStorage.getItem('ultra-bingo-network') || 'avalanche';
  });

  // Ref to prevent double-click race condition
  const isPurchasingRef = useRef(false);

  // Handle network change
  const handleNetworkChange = (network) => {
    if (NETWORK_INFO[network]?.disabled) return;
    setSelectedNet(network);
    localStorage.setItem('ultra-bingo-network', network);
    setSelectedNetwork(network);
  };

  // Initialize network on mount
  useEffect(() => {
    const savedNetwork = localStorage.getItem('ultra-bingo-network') || 'avalanche';
    setSelectedNetwork(savedNetwork);
  }, []);

  // Check wallet state on mount and when connection changes
  useEffect(() => {
    async function checkWallet() {
      if (!hasWalletProvider()) {
        setIsWalletReady(false);
        return;
      }
      try {
        const state = await getWalletState();
        setIsWalletReady(state.isConnected);
      } catch (err) {
        setIsWalletReady(false);
      }
    }
    checkWallet();
  }, [isConnected]);

  useEffect(() => {
    async function fetchAvailableCount() {
      try {
        const response = await fetch(`${config.apiUrl}/api/cards/available`);
        if (!response.ok) throw new Error('Error fetching cards');
        const data = await response.json();
        setAvailableCount(data.total || 0);
      } catch (err) {
        // Silent fail for non-critical fetch
      }
    }

    fetchAvailableCount();
  }, [purchasedCards]);

  const handlePurchase = async (quantity) => {
    // CRITICAL: Prevent double-click race condition using ref (immediate)
    if (isPurchasingRef.current) return;
    isPurchasingRef.current = true;

    if (!isLoggedIn) {
      isPurchasingRef.current = false;
      openLoginModal();
      return;
    }

    if (!quantity || quantity < 1) {
      isPurchasingRef.current = false;
      return;
    }

    // Validate Fibonacci quantity
    if (!config.fibonacciQuantities.includes(quantity)) {
      isPurchasingRef.current = false;
      setError(`Cantidad inválida. Opciones válidas: ${config.fibonacciQuantities.join(', ')}`);
      return;
    }

    // Check if wallet provider exists
    if (!hasWalletProvider()) {
      isPurchasingRef.current = false;
      setError('No se detectó wallet. Por favor instala MetaMask.');
      return;
    }

    // Check if wallet is ready for x402
    if (!isWalletReady) {
      isPurchasingRef.current = false;
      setError('Wallet no conectada. Por favor conecta tu wallet primero.');
      return;
    }

    setPurchasing(true);
    setError(null);
    setPaymentStatus('Verificando balance...');

    // Check USDC balance before attempting purchase
    try {
      const totalCost = quantity * config.cardPrice;
      const usdcBalance = await getUSDCBalance();

      if (!usdcBalance.hasEnough(totalCost)) {
        isPurchasingRef.current = false;
        setPurchasing(false);
        setPaymentStatus(null);
        setError(`Fondos insuficientes. Necesitas ${totalCost.toFixed(2)} USDC pero tienes ${usdcBalance.balanceFormatted} USDC en tu wallet.`);
        return;
      }
    } catch (balanceErr) {
      console.warn('Could not check balance:', balanceErr);
      // Continue anyway - the payment will fail if insufficient
    }

    setPaymentStatus('Iniciando pago...');

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PAYMENT_TIMEOUT_MS);

    try {
      setPaymentStatus('Preparando sistema de pago...');
      const paymentFetch = await createPaymentFetch();

      setPaymentStatus('Procesando compra con x402...');

      const response = await paymentFetch(`${config.apiUrl}/api/cards/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({
          quantity,
          wallet: user?.wallet,
          network: selectedNet,
        }),
        signal: controller.signal,
      });

      if (response.status === 402) {
        setError(`Pago rechazado o fallido. Por favor intenta de nuevo.`);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error purchasing cards');
      }

      const data = await response.json();
      setPaymentStatus('¡Compra exitosa!');

      // Store purchased cards to display them
      if (data.cards && data.cards.length > 0) {
        setPurchasedCards(data.cards);
      }

      // Clear success message after 3 seconds
      setTimeout(() => setPaymentStatus(null), 3000);
    } catch (err) {
      clearTimeout(timeoutId);
      const errMsg = err.message?.toLowerCase() || '';

      if (err.name === 'AbortError') {
        setError('La operación tardó demasiado. Por favor intenta de nuevo.');
      } else if (errMsg.includes('insufficient') || errMsg.includes('balance') || errMsg.includes('funds') || errMsg.includes('exceeds')) {
        setError('Fondos insuficientes. Verifica que tengas suficiente USDC en tu wallet en la red Avalanche.');
      } else if (errMsg.includes('rejected') || errMsg.includes('denied') || errMsg.includes('user rejected')) {
        setError('Transacción rechazada por el usuario.');
      } else if (errMsg.includes('wallet not connected') || errMsg.includes('not connected')) {
        setError('Wallet no conectada. Por favor conecta tu wallet.');
      } else if (errMsg.includes('network') || errMsg.includes('chain') || errMsg.includes('switch')) {
        setError('Red incorrecta. Por favor cambia a Avalanche C-Chain.');
      } else {
        setError(`Error: ${err.message}`);
      }
    } finally {
      clearTimeout(timeoutId);
      isPurchasingRef.current = false;
      setPurchasing(false);
      if (!paymentStatus?.includes('exitosa')) {
        setPaymentStatus(null);
      }
    }
  };

  const handleClearPurchased = () => {
    setPurchasedCards([]);
  };

  // Check if purchases are blocked (game in progress)
  const canPurchase = gameState?.canPurchase !== false;
  const gameInProgress = gameState?.status === 'playing' || gameState?.status === 'paused';

  return (
    <div className="home">
      <AnimatedBackground />

      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <motion.div
            className="hero-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            <div className="hero-badge">
              <motion.span
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
              >
                🎄 UltravioletaDAO 🎄
              </motion.span>
            </div>

            <h1 className="hero-title">
              <span className="title-line">
                <span className="christmas-emoji">🎅</span>
                <GradientText>Ultra</GradientText>
                <span className="title-highlight">Bingo</span>
                <span className="christmas-emoji">🎁</span>
              </span>
            </h1>

            <FadeUpText className="hero-subtitle" delay={0.4}>
              Edicion Navidad! El bingo descentralizado de la comunidad. Compra tus cartones,
              juega en vivo y gana premios increibles esta Navidad!
            </FadeUpText>

            <motion.div
              className="hero-stats"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <div className="stat">
                <span className="stat-value">{availableCount}</span>
                <span className="stat-label">Cartones disponibles</span>
              </div>
              <div className="stat-divider" />
              <div className="stat">
                <span className="stat-value">${config.cardPrice}</span>
                <span className="stat-label">Por carton</span>
              </div>
              <div className="stat-divider" />
              <div className="stat">
                <span className="stat-value">75</span>
                <span className="stat-label">Numeros en juego</span>
              </div>
            </motion.div>

            {/* Network Selector */}
            <motion.div
              className="network-selector"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
            >
              <span className="network-label">Paga con USDC en:</span>
              <div className="network-buttons">
                {Object.entries(NETWORK_INFO).map(([key, net]) => (
                  <button
                    key={key}
                    className={`network-btn ${selectedNet === key ? 'active' : ''} ${net.disabled ? 'disabled' : ''}`}
                    onClick={() => handleNetworkChange(key)}
                    disabled={net.disabled}
                    style={{ '--network-color': net.color }}
                  >
                    <span className="network-icon">{net.icon}</span>
                    <span className="network-name">{net.name}</span>
                    {net.soon && <span className="network-soon">Pronto</span>}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Floating BINGO snowballs - Fibonacci numbers */}
        <div className="hero-decorations">
          <motion.div
            className="floating-ball ball-1"
            animate={{
              y: [0, -20, 0],
            }}
            transition={{
              y: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
            }}
          >
            <NumberBall number={3} size="large" />
          </motion.div>
          <motion.div
            className="floating-ball ball-2"
            animate={{
              y: [0, 20, 0],
            }}
            transition={{
              y: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
            }}
          >
            <NumberBall number={8} size="large" />
          </motion.div>
          <motion.div
            className="floating-ball ball-3"
            animate={{
              y: [0, -15, 0],
            }}
            transition={{
              y: { duration: 3.5, repeat: Infinity, ease: 'easeInOut' },
            }}
          >
            <NumberBall number={13} size="large" />
          </motion.div>
          <motion.div
            className="floating-ball ball-4"
            animate={{
              y: [0, 25, 0],
            }}
            transition={{
              y: { duration: 4.5, repeat: Infinity, ease: 'easeInOut' },
            }}
          >
            <NumberBall number={34} size="large" />
          </motion.div>
          <motion.div
            className="floating-ball ball-5"
            animate={{
              y: [0, -25, 0],
            }}
            transition={{
              y: { duration: 5, repeat: Infinity, ease: 'easeInOut' },
            }}
          >
            <NumberBall number={55} size="large" />
          </motion.div>
        </div>
      </section>

      <div className="container main-content">
        {/* Authentication CTA */}
        <AnimatePresence>
          {!isLoggedIn && (
            <motion.section
              className="auth-section"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.5 }}
            >
              <GlassCard glow className="auth-card">
                <div className="auth-card-content">
                  <motion.div
                    className="auth-icon"
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                  </motion.div>
                  <div className="auth-text">
                    <h2>Inicia sesion para participar</h2>
                    <p>Ingresa tu nombre de usuario y conecta tu wallet para comprar cartones</p>
                  </div>
                  <GlowButton
                    onClick={openLoginModal}
                    size="lg"
                    icon={
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                      </svg>
                    }
                  >
                    Iniciar Sesion
                  </GlowButton>
                </div>
              </GlassCard>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Payment status message */}
        <AnimatePresence>
          {paymentStatus && (
            <motion.div
              className={`payment-status ${paymentStatus.includes('exitosa') ? 'success' : ''}`}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <motion.span
                className="status-spinner"
                animate={!paymentStatus.includes('exitosa') ? { rotate: 360 } : {}}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                {paymentStatus.includes('exitosa') ? '✓' : '⟳'}
              </motion.span>
              {paymentStatus}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error message */}
        <AnimatePresence>
          {error && (
            <motion.div
              className="error-message"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <span className="error-icon">!</span>
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game In Progress Alert */}
        <AnimatePresence>
          {gameInProgress && !canPurchase && (
            <motion.div
              className="game-in-progress-alert"
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <GlassCard className="game-alert-card" glow>
                <div className="game-alert-content">
                  <motion.div
                    className="game-alert-icon"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    🎮
                  </motion.div>
                  <div className="game-alert-text">
                    <h3>Juego en Progreso</h3>
                    <p>La venta de cartones está temporalmente pausada mientras hay un juego activo.</p>
                    <p className="game-alert-sub">¡Espera a que termine la partida actual para comprar más cartones!</p>
                  </div>
                  <motion.a
                    href="/bingo-live"
                    className="watch-game-btn"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <span>Ver Juego en Vivo</span>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </motion.a>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cards Section */}
        <section className={`cards-section ${!canPurchase ? 'disabled' : ''}`}>
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h2>
              <span className="section-number">01</span>
              {purchasedCards.length > 0 ? 'Tus cartones' : 'Compra tus cartones'}
            </h2>
            {purchasedCards.length === 0 && canPurchase && (
              <p className="section-description">
                Maximo {config.maxCardsPerPurchase} cartones por compra • Pago con USDC via x402
              </p>
            )}
          </motion.div>

          <CardQuantitySelector
            onPurchase={handlePurchase}
            purchasing={purchasing}
            isLoggedIn={isLoggedIn}
            purchasedCards={purchasedCards}
            onClearPurchased={handleClearPurchased}
            disabled={!canPurchase}
          />
        </section>
      </div>
    </div>
  );
}

export default Home;
