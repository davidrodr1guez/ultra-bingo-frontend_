import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { NumberBall, BingoCard } from '../components/bingo';
import { useSocket } from '../context/SocketContext';
import { config } from '../config';
import './Admin.css';

// All possible bingo numbers
const ALL_NUMBERS = Array.from({ length: 75 }, (_, i) => i + 1);

function Admin() {
  const navigate = useNavigate();
  const { address, isConnected: walletConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  // Use shared socket context
  const {
    isConnected: socketConnected,
    gameState,
    startGame: contextStartGame,
    pauseGame: contextPauseGame,
    resumeGame: contextResumeGame,
    endGame: contextEndGame,
    callNumber: contextCallNumber,
    verifyWinner: contextVerifyWinner,
  } = useSocket();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
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
  });

  // Check if admin session exists
  useEffect(() => {
    const adminToken = localStorage.getItem('admin-token');
    if (adminToken) {
      validateToken(adminToken);
    }
  }, []);

  // Update available numbers when game state changes
  useEffect(() => {
    if (gameState?.calledNumbers) {
      setAvailableNumbers(ALL_NUMBERS.filter((n) => !gameState.calledNumbers.includes(n)));
    }
  }, [gameState?.calledNumbers]);

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
    navigate('/');
  };

  // Game controls with loading feedback
  const startGame = useCallback(async () => {
    if (!controlsLoading.start) {
      setControlsLoading((prev) => ({ ...prev, start: true }));
      await contextStartGame();
      setAvailableNumbers(ALL_NUMBERS);
      setTimeout(() => setControlsLoading((prev) => ({ ...prev, start: false })), 500);
    }
  }, [contextStartGame, controlsLoading.start]);

  const pauseGame = useCallback(async () => {
    if (!controlsLoading.pause) {
      setControlsLoading((prev) => ({ ...prev, pause: true }));
      await contextPauseGame();
      setTimeout(() => setControlsLoading((prev) => ({ ...prev, pause: false })), 500);
    }
  }, [contextPauseGame, controlsLoading.pause]);

  const resumeGame = useCallback(async () => {
    if (!controlsLoading.resume) {
      setControlsLoading((prev) => ({ ...prev, resume: true }));
      await contextResumeGame();
      setTimeout(() => setControlsLoading((prev) => ({ ...prev, resume: false })), 500);
    }
  }, [contextResumeGame, controlsLoading.resume]);

  const endGame = useCallback(async () => {
    if (!controlsLoading.end && window.confirm('¿Estás seguro de terminar el juego?')) {
      setControlsLoading((prev) => ({ ...prev, end: true }));
      await contextEndGame();
      setTimeout(() => setControlsLoading((prev) => ({ ...prev, end: false })), 500);
    }
  }, [contextEndGame, controlsLoading.end]);

  const callNumber = useCallback(async (number) => {
    if (gameState.status === 'playing' && !controlsLoading.callNumber) {
      setControlsLoading((prev) => ({ ...prev, callNumber: true }));
      await contextCallNumber(number);
      setTimeout(() => setControlsLoading((prev) => ({ ...prev, callNumber: false })), 300);
    }
  }, [contextCallNumber, gameState.status, controlsLoading.callNumber]);

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
  const handleVerifySelectedCard = useCallback(async () => {
    if (selectedCard) {
      await contextVerifyWinner(selectedCard.card.id, selectedCard.ownerOdId);
    }
  }, [contextVerifyWinner, selectedCard]);

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

  const { status, calledNumbers = [], currentNumber } = gameState;

  return (
    <div className="container admin">
      <header className="admin-header">
        <h1>Panel de Administrador</h1>
        <div className="header-status">
          <span className={`connection-status ${socketConnected ? 'connected' : 'disconnected'}`}>
            {socketConnected ? 'Conectado' : 'Desconectado'}
          </span>
          <button onClick={handleLogout} className="btn-logout">
            Cerrar Sesión
          </button>
        </div>
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
                    BINGO! - {selectedCard.winPattern}
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
