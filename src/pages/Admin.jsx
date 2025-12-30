import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { NumberBall, BingoCard } from '../components/bingo';
import { config } from '../config';
import './Admin.css';

// All possible bingo numbers
const ALL_NUMBERS = Array.from({ length: 75 }, (_, i) => i + 1);

function Admin() {
  const navigate = useNavigate();
  const { address, isConnected: walletConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [socket, setSocket] = useState(null);
  const [gameState, setGameState] = useState({
    status: 'waiting',
    calledNumbers: [],
    currentNumber: null,
  });
  const [availableNumbers, setAvailableNumbers] = useState(ALL_NUMBERS);

  // Card Search State
  const [cardSearchQuery, setCardSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);

  // Loading states for game controls
  const [controlsLoading, setControlsLoading] = useState({
    start: false,
    pause: false,
    resume: false,
    end: false,
    callNumber: false,
    resetGame: false,
    resetCards: false,
    fullReset: false,
  });

  // Check if admin session exists
  useEffect(() => {
    const adminToken = localStorage.getItem('admin-token');
    if (adminToken) {
      validateToken(adminToken);
    }
  }, []);

  // Connect to socket when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const adminToken = localStorage.getItem('admin-token');
    const newSocket = io(config.wsUrl, {
      auth: { token: adminToken, isAdmin: true },
    });

    newSocket.on('connect', () => {
      console.log('Admin socket connected');
    });

    newSocket.on('game-state', (state) => {
      setGameState(state);
      updateAvailableNumbers(state.calledNumbers);
    });

    newSocket.on('number-called', (data) => {
      setGameState((prev) => ({
        ...prev,
        currentNumber: data.number,
        calledNumbers: [...prev.calledNumbers, data.number],
      }));
      setAvailableNumbers((prev) => prev.filter((n) => n !== data.number));
    });

    setSocket(newSocket);

    // SECURITY: Cleanup all listeners to prevent memory leaks
    return () => {
      newSocket.off('connect');
      newSocket.off('game-state');
      newSocket.off('number-called');
      newSocket.close();
    };
  }, [isAuthenticated]);

  const validateToken = async (token) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/admin/validate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        setIsAuthenticated(true);
      } else {
        localStorage.removeItem('admin-token');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // SECURITY: Connect wallet for admin login
  const handleConnectWallet = async () => {
    try {
      await connect({ connector: injected() });
    } catch (err) {
      setError('Error conectando wallet');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    // SECURITY: Wallet is required for admin login
    if (!walletConnected || !address) {
      setError('Debes conectar tu wallet primero');
      return;
    }

    try {
      const response = await fetch(`${config.apiUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          wallet: address, // CRITICAL: Send wallet for JWT token
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Credenciales incorrectas');
      }

      const data = await response.json();
      localStorage.setItem('admin-token', data.token);
      setIsAuthenticated(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin-token');
    setIsAuthenticated(false);
    setSocket(null);
    navigate('/');
  };

  const updateAvailableNumbers = (called) => {
    setAvailableNumbers(ALL_NUMBERS.filter((n) => !called.includes(n)));
  };

  // Game controls with loading feedback
  const startGame = useCallback(() => {
    if (socket && !controlsLoading.start) {
      setControlsLoading((prev) => ({ ...prev, start: true }));
      socket.emit('admin:start-game');
      setGameState((prev) => ({ ...prev, status: 'playing', calledNumbers: [], currentNumber: null }));
      setAvailableNumbers(ALL_NUMBERS);
      setTimeout(() => setControlsLoading((prev) => ({ ...prev, start: false })), 500);
    }
  }, [socket, controlsLoading.start]);

  const pauseGame = useCallback(() => {
    if (socket && !controlsLoading.pause) {
      setControlsLoading((prev) => ({ ...prev, pause: true }));
      socket.emit('admin:pause-game');
      setGameState((prev) => ({ ...prev, status: 'paused' }));
      setTimeout(() => setControlsLoading((prev) => ({ ...prev, pause: false })), 500);
    }
  }, [socket, controlsLoading.pause]);

  const resumeGame = useCallback(() => {
    if (socket && !controlsLoading.resume) {
      setControlsLoading((prev) => ({ ...prev, resume: true }));
      socket.emit('admin:resume-game');
      setGameState((prev) => ({ ...prev, status: 'playing' }));
      setTimeout(() => setControlsLoading((prev) => ({ ...prev, resume: false })), 500);
    }
  }, [socket, controlsLoading.resume]);

  const endGame = useCallback(() => {
    if (socket && !controlsLoading.end && window.confirm('¿Estás seguro de terminar el juego?')) {
      setControlsLoading((prev) => ({ ...prev, end: true }));
      socket.emit('admin:end-game');
      setGameState((prev) => ({ ...prev, status: 'ended' }));
      setTimeout(() => setControlsLoading((prev) => ({ ...prev, end: false })), 500);
    }
  }, [socket, controlsLoading.end]);

  const callNumber = useCallback((number) => {
    if (socket && gameState.status === 'playing' && !controlsLoading.callNumber) {
      setControlsLoading((prev) => ({ ...prev, callNumber: true }));
      socket.emit('admin:call-number', { number });
      setTimeout(() => setControlsLoading((prev) => ({ ...prev, callNumber: false })), 300);
    }
  }, [socket, gameState.status, controlsLoading.callNumber]);

  const callRandomNumber = useCallback(() => {
    if (availableNumbers.length > 0 && gameState.status === 'playing' && !controlsLoading.callNumber) {
      const randomIndex = Math.floor(Math.random() * availableNumbers.length);
      const number = availableNumbers[randomIndex];
      callNumber(number);
    }
  }, [availableNumbers, gameState.status, callNumber, controlsLoading.callNumber]);

  // Card search function
  const handleCardSearch = useCallback(async (e) => {
    e.preventDefault();
    if (!cardSearchQuery.trim()) return;

    setSearchLoading(true);
    setSearchResults([]);
    setSelectedCard(null);

    try {
      const adminToken = localStorage.getItem('admin-token');
      const response = await fetch(`${config.apiUrl}/api/admin/cards/search?query=${encodeURIComponent(cardSearchQuery)}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (!response.ok) {
        throw new Error('Error buscando cartones');
      }

      const data = await response.json();
      setSearchResults(data.cards || []);
    } catch (err) {
      console.error('Error searching cards:', err);
      setError(err.message);
    } finally {
      setSearchLoading(false);
    }
  }, [cardSearchQuery]);

  // Get card details with winner check
  const handleSelectCard = useCallback(async (cardId) => {
    try {
      const adminToken = localStorage.getItem('admin-token');
      const response = await fetch(`${config.apiUrl}/api/admin/cards/${cardId}/details`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (!response.ok) {
        throw new Error('Error obteniendo detalles del cartón');
      }

      const data = await response.json();
      setSelectedCard(data);
    } catch (err) {
      console.error('Error getting card details:', err);
      setError(err.message);
    }
  }, []);

  // Verify winner from selected card
  const handleVerifySelectedCard = useCallback(() => {
    if (socket && selectedCard) {
      socket.emit('admin:verify-winner', { cardId: selectedCard.card.id });
    }
  }, [socket, selectedCard]);

  // Reset game state only
  const handleResetGame = useCallback(async () => {
    if (!window.confirm('¿Estás seguro de reiniciar el juego? Se limpiarán los números cantados.')) return;

    setControlsLoading((prev) => ({ ...prev, resetGame: true }));
    try {
      const adminToken = localStorage.getItem('admin-token');
      const response = await fetch(`${config.apiUrl}/api/admin/game/reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Error al reiniciar juego');

      const data = await response.json();
      setGameState(data.state);
      setAvailableNumbers(ALL_NUMBERS);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setControlsLoading((prev) => ({ ...prev, resetGame: false }));
    }
  }, []);

  // Reset cards only
  const handleResetCards = useCallback(async () => {
    if (!window.confirm('¿Estás seguro de reiniciar los cartones? Se eliminarán TODOS los cartones comprados.')) return;

    setControlsLoading((prev) => ({ ...prev, resetCards: true }));
    try {
      const adminToken = localStorage.getItem('admin-token');
      const response = await fetch(`${config.apiUrl}/api/admin/cards/reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ generateCount: 100 }),
      });

      if (!response.ok) throw new Error('Error al reiniciar cartones');

      const data = await response.json();
      alert(`Cartones reiniciados. Eliminados: ${data.deletedPurchased}, Disponibles: ${data.availableCards}`);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setControlsLoading((prev) => ({ ...prev, resetCards: false }));
    }
  }, []);

  // Full reset - game AND cards
  const handleFullReset = useCallback(async () => {
    if (!window.confirm('⚠️ RESET COMPLETO ⚠️\n\n¿Estás seguro? Esto reiniciará:\n- El juego (números cantados)\n- TODOS los cartones comprados\n\nEsta acción no se puede deshacer.')) return;

    setControlsLoading((prev) => ({ ...prev, fullReset: true }));
    try {
      const adminToken = localStorage.getItem('admin-token');
      const response = await fetch(`${config.apiUrl}/api/admin/full-reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ generateCount: 100 }),
      });

      if (!response.ok) throw new Error('Error en reset completo');

      const data = await response.json();
      setGameState(data.game);
      setAvailableNumbers(ALL_NUMBERS);
      alert(`Reset completo exitoso.\nCartones eliminados: ${data.cards.deletedPurchased}\nCartones disponibles: ${data.cards.availableCards}`);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setControlsLoading((prev) => ({ ...prev, fullReset: false }));
    }
  }, []);

  // Login form - SECURITY: Requires wallet + password
  if (!isAuthenticated) {
    return (
      <div className="container admin-login">
        <div className="login-card card">
          <h1>Panel de Administrador</h1>
          <p>Conecta tu wallet y ingresa la contraseña</p>

          {/* Wallet connection status */}
          <div className="wallet-status" style={{ marginBottom: '1rem', padding: '0.5rem', borderRadius: '8px', background: walletConnected ? '#10b98120' : '#f59e0b20' }}>
            {walletConnected ? (
              <span style={{ color: '#10b981' }}>
                Wallet: {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
            ) : (
              <button
                type="button"
                onClick={handleConnectWallet}
                className="btn-secondary"
                style={{ width: '100%' }}
              >
                Conectar Wallet
              </button>
            )}
          </div>

          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              className="input"
              autoFocus
              disabled={!walletConnected}
            />
            {error && <div className="error-text">{error}</div>}
            <button
              type="submit"
              className="btn-primary"
              disabled={!walletConnected}
            >
              Ingresar
            </button>
          </form>
        </div>
      </div>
    );
  }

  const { status, calledNumbers, currentNumber } = gameState;

  return (
    <div className="container admin">
      <header className="admin-header">
        <h1>Panel de Administrador</h1>
        <button onClick={handleLogout} className="btn-logout">
          Cerrar Sesión
        </button>
      </header>

      {/* Game Status */}
      <section className="game-status-section card">
        <div className="status-badge" data-status={status}>
          {status === 'waiting' && 'Esperando'}
          {status === 'playing' && 'En Juego'}
          {status === 'paused' && 'Pausado'}
          {status === 'ended' && 'Terminado'}
        </div>

        <div className="game-controls">
          {status === 'waiting' && (
            <button
              onClick={startGame}
              className="btn-primary btn-control"
              disabled={controlsLoading.start}
            >
              {controlsLoading.start ? 'Iniciando...' : 'Iniciar Bingo'}
            </button>
          )}
          {status === 'playing' && (
            <>
              <button
                onClick={pauseGame}
                className="btn-control btn-warning"
                disabled={controlsLoading.pause}
              >
                {controlsLoading.pause ? 'Pausando...' : 'Pausar'}
              </button>
              <button
                onClick={endGame}
                className="btn-control btn-danger"
                disabled={controlsLoading.end}
              >
                {controlsLoading.end ? 'Terminando...' : 'Terminar'}
              </button>
            </>
          )}
          {status === 'paused' && (
            <>
              <button
                onClick={resumeGame}
                className="btn-primary btn-control"
                disabled={controlsLoading.resume}
              >
                {controlsLoading.resume ? 'Reanudando...' : 'Reanudar'}
              </button>
              <button
                onClick={endGame}
                className="btn-control btn-danger"
                disabled={controlsLoading.end}
              >
                {controlsLoading.end ? 'Terminando...' : 'Terminar'}
              </button>
            </>
          )}
          {status === 'ended' && (
            <button
              onClick={startGame}
              className="btn-primary btn-control"
              disabled={controlsLoading.start}
            >
              {controlsLoading.start ? 'Iniciando...' : 'Nuevo Juego'}
            </button>
          )}
        </div>
      </section>

      {/* Reset Controls */}
      <section className="reset-section card">
        <h2>Controles de Reset</h2>
        <div className="reset-controls">
          <button
            onClick={handleResetGame}
            className="btn-control btn-warning"
            disabled={controlsLoading.resetGame || status === 'playing'}
          >
            {controlsLoading.resetGame ? 'Reiniciando...' : 'Reiniciar Juego'}
          </button>
          <button
            onClick={handleResetCards}
            className="btn-control btn-warning"
            disabled={controlsLoading.resetCards || status === 'playing'}
          >
            {controlsLoading.resetCards ? 'Reiniciando...' : 'Reiniciar Cartones'}
          </button>
          <button
            onClick={handleFullReset}
            className="btn-control btn-danger"
            disabled={controlsLoading.fullReset || status === 'playing'}
          >
            {controlsLoading.fullReset ? 'Reiniciando...' : 'Reset Completo'}
          </button>
        </div>
        <p className="reset-note">
          Los controles de reset están deshabilitados mientras hay un juego en progreso.
        </p>
      </section>

      {/* Current Number */}
      <section className="current-section">
        <h2>Número Actual</h2>
        {currentNumber ? (
          <NumberBall number={currentNumber} size="huge" />
        ) : (
          <div className="no-number">-</div>
        )}
        <div className="called-count">
          {calledNumbers.length} / 75 números cantados
        </div>
      </section>

      {/* Random Call Button */}
      {status === 'playing' && (
        <section className="random-section">
          <button
            onClick={callRandomNumber}
            className="btn-primary btn-random"
            disabled={availableNumbers.length === 0 || controlsLoading.callNumber}
          >
            {controlsLoading.callNumber ? 'Cantando...' : 'Cantar Numero Aleatorio'}
          </button>
        </section>
      )}

      {/* Number Selector */}
      <section className="numbers-section">
        <h2>Seleccionar Número</h2>
        <div className="numbers-grid">
          {ALL_NUMBERS.map((num) => {
            const isCalled = calledNumbers.includes(num);
            return (
              <button
                key={num}
                onClick={() => !isCalled && callNumber(num)}
                className={`number-btn ${isCalled ? 'called' : ''} ${num === currentNumber ? 'current' : ''}`}
                disabled={isCalled || status !== 'playing'}
              >
                {num}
              </button>
            );
          })}
        </div>
      </section>

      {/* Called Numbers History */}
      <section className="history-section">
        <h2>Historial</h2>
        <div className="history-list">
          {calledNumbers.length === 0 ? (
            <p className="no-history">No hay números cantados</p>
          ) : (
            calledNumbers.map((num, index) => (
              <NumberBall key={num} number={num} size="small" />
            ))
          )}
        </div>
      </section>

      {/* Card Search Section */}
      <section className="card-search-section card">
        <h2>Buscar Cartón</h2>
        <form onSubmit={handleCardSearch} className="card-search-form">
          <input
            type="text"
            value={cardSearchQuery}
            onChange={(e) => setCardSearchQuery(e.target.value)}
            placeholder="Buscar por ID o wallet..."
            className="input card-search-input"
          />
          <button type="submit" className="btn-primary" disabled={searchLoading}>
            {searchLoading ? 'Buscando...' : 'Buscar'}
          </button>
        </form>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="search-results">
            <h3>Resultados ({searchResults.length})</h3>
            <div className="search-results-list">
              {searchResults.map((result) => (
                <div
                  key={result.card.id}
                  className={`search-result-item ${selectedCard?.card.id === result.card.id ? 'selected' : ''}`}
                  onClick={() => handleSelectCard(result.card.id)}
                >
                  <span className="result-id">#{result.card.id.slice(-8)}</span>
                  <span className="result-owner">@{result.ownerUsername || 'Anónimo'}</span>
                  <span className="result-wallet">{result.ownerWallet?.slice(0, 8)}...</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selected Card Details with Visual */}
        {selectedCard && (
          <div className="selected-card-details">
            <h3>Detalles del Cartón</h3>
            <div className="card-detail-grid">
              <div className="card-visual-container">
                <BingoCard
                  card={selectedCard.card}
                  calledNumbers={calledNumbers}
                  size="normal"
                />
              </div>
              <div className="card-info-panel">
                <div className="info-row">
                  <span className="info-label">ID:</span>
                  <span className="info-value">{selectedCard.card.id}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Dueño:</span>
                  <span className="info-value">@{selectedCard.ownerUsername || 'Anónimo'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Wallet:</span>
                  <span className="info-value">{selectedCard.ownerWallet}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Modo:</span>
                  <span className="info-value">{selectedCard.patternInfo?.name || gameState.gameMode}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Progreso:</span>
                  <span className="info-value progress-value">
                    {selectedCard.progress?.completed || 0} / {selectedCard.progress?.total || 24}
                    <div
                      className="progress-bar"
                      style={{
                        width: `${((selectedCard.progress?.completed || 0) / (selectedCard.progress?.total || 24)) * 100}%`
                      }}
                    />
                  </span>
                </div>

                {/* Winner Check Result */}
                {selectedCard.isWinner && (
                  <div className="winner-badge">
                    ¡BINGO! - {selectedCard.winPattern}
                  </div>
                )}

                {/* Verify Winner Button */}
                {status === 'playing' && selectedCard.isWinner && (
                  <button
                    onClick={handleVerifySelectedCard}
                    className="btn-primary btn-verify-winner"
                  >
                    Verificar y Declarar Ganador
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default Admin;
