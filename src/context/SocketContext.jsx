import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { config } from '../config';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [gameState, setGameState] = useState({
    status: 'waiting',
    gameMode: 'fullCard',
    calledNumbers: [],
    currentNumber: null,
    winner: null,
    potentialWinners: [],
    canPurchase: true,
    patternInfo: null,
    lastRejectedWinner: null,
    showContinueMessage: false,
  });
  const reconnectTimeoutRef = useRef(null);
  const continueMessageTimeoutRef = useRef(null);
  const wsRef = useRef(null);

  // Get auth info from localStorage
  const getAuthInfo = () => {
    try {
      const savedUser = localStorage.getItem('ultra-bingo-user');
      if (savedUser) {
        const user = JSON.parse(savedUser);
        return { token: user.token, isAdmin: user.isAdmin };
      }
    } catch (e) {
      console.error('Error reading auth info:', e);
    }
    return { token: null, isAdmin: false };
  };

  // Send message to WebSocket
  const sendMessage = useCallback((type, payload = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((event) => {
    try {
      const message = JSON.parse(event.data);
      const { type, payload } = message;

      switch (type) {
        case 'pong':
          // Heartbeat response
          break;

        case 'authenticated':
          console.log('WebSocket authenticated:', payload);
          // Request current game state after auth
          sendMessage('getGameState');
          break;

        case 'gameState':
        case 'gameUpdate':
          setGameState((prev) => ({
            ...prev,
            status: payload?.status || prev.status,
            gameMode: payload?.gameMode || prev.gameMode,
            calledNumbers: payload?.calledNumbers || prev.calledNumbers || [],
            currentNumber: payload?.currentNumber ?? prev.currentNumber,
            winner: payload?.winner || prev.winner,
            cardsSold: payload?.cardsSold || prev.cardsSold,
            prizePool: payload?.prizePool || prev.prizePool,
            potentialWinners: payload?.potentialWinners || prev.potentialWinners || [],
          }));
          break;

        case 'numberCalled':
          setGameState((prev) => ({
            ...prev,
            currentNumber: payload.number,
            calledNumbers: payload.calledNumbers || [...(prev.calledNumbers || []), payload.number],
          }));
          break;

        case 'gameStarted':
          setGameState((prev) => ({
            ...prev,
            status: 'playing',
            calledNumbers: [],
            currentNumber: null,
            winner: null,
            potentialWinners: [],
            canPurchase: false,
            gameMode: payload?.gameMode || prev.gameMode,
          }));
          break;

        case 'gamePaused':
          setGameState((prev) => ({
            ...prev,
            status: 'paused',
          }));
          break;

        case 'gameResumed':
          setGameState((prev) => ({
            ...prev,
            status: 'playing',
          }));
          break;

        case 'gameEnded':
          setGameState((prev) => ({
            ...prev,
            status: 'ended',
            winner: payload?.winner || null,
            potentialWinners: [],
            canPurchase: true,
          }));
          break;

        case 'gameCleared':
          setGameState((prev) => ({
            ...prev,
            status: 'waiting',
            calledNumbers: [],
            currentNumber: null,
            winner: null,
            potentialWinners: [],
            canPurchase: true,
            showContinueMessage: false,
          }));
          break;

        case 'gameModeChanged':
          setGameState((prev) => ({
            ...prev,
            gameMode: payload.mode || payload.gameMode,
            patternInfo: payload.patternInfo || null,
          }));
          break;

        case 'winnerAnnounced':
          setGameState((prev) => ({
            ...prev,
            winner: payload?.winner || null,
            potentialWinners: [],
          }));
          break;

        case 'potentialWinner':
        case 'bingoClaim':
          setGameState((prev) => {
            const currentWinners = prev?.potentialWinners || [];
            const exists = currentWinners.some(w => w.cardId === payload.cardId);
            if (exists) return prev;
            return {
              ...prev,
              potentialWinners: [...currentWinners, payload],
              showContinueMessage: false,
            };
          });
          break;

        case 'winnerRejected':
          setGameState((prev) => {
            const currentWinners = prev?.potentialWinners || [];
            return {
              ...prev,
              potentialWinners: currentWinners.filter(w => w.cardId !== payload.cardId),
              lastRejectedWinner: payload.cardId,
              showContinueMessage: true,
            };
          });
          if (continueMessageTimeoutRef.current) {
            clearTimeout(continueMessageTimeoutRef.current);
          }
          continueMessageTimeoutRef.current = setTimeout(() => {
            setGameState((prev) => ({
              ...prev,
              showContinueMessage: false,
            }));
          }, 5000);
          break;

        case 'error':
          console.error('WebSocket error:', payload);
          break;

        default:
          console.log('Unknown WebSocket message type:', type, payload);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }, [sendMessage]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = config.wsUrl;
    console.log('Connecting to WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setSocket(ws);

      // Authenticate after connection
      const { token } = getAuthInfo();
      if (token) {
        sendMessage('authenticate', { token });
      } else {
        // If no token, just get game state
        sendMessage('getGameState');
      }

      // Start heartbeat
      const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          sendMessage('ping');
        } else {
          clearInterval(heartbeat);
        }
      }, 30000);
    };

    ws.onmessage = handleMessage;

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      setSocket(null);
      wsRef.current = null;

      // Attempt reconnection after 3 seconds
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Attempting WebSocket reconnection...');
        connect();
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [handleMessage, sendMessage]);

  // Initialize WebSocket connection
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (continueMessageTimeoutRef.current) {
        clearTimeout(continueMessageTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // API helper for admin actions
  const apiCall = useCallback(async (endpoint, method = 'POST', body = null) => {
    const { token } = getAuthInfo();
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${config.apiUrl}${endpoint}`, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }

    return data;
  }, []);

  // Join a game room (for native WebSocket, just request game state)
  const joinGame = useCallback(() => {
    sendMessage('getGameState');
  }, [sendMessage]);

  // Leave a game room (no-op for native WebSocket)
  const leaveGame = useCallback(() => {}, []);

  // ============== ADMIN FUNCTIONS (via REST API) ==============

  const startGame = useCallback(async () => {
    try {
      await apiCall('/api/admin/game/start');
    } catch (error) {
      console.error('Failed to start game:', error);
    }
  }, [apiCall]);

  const pauseGame = useCallback(async () => {
    try {
      await apiCall('/api/admin/game/pause');
    } catch (error) {
      console.error('Failed to pause game:', error);
    }
  }, [apiCall]);

  const resumeGame = useCallback(async () => {
    try {
      await apiCall('/api/admin/game/resume');
    } catch (error) {
      console.error('Failed to resume game:', error);
    }
  }, [apiCall]);

  const endGame = useCallback(async (winner = null) => {
    try {
      await apiCall('/api/admin/game/end', 'POST', { winner });
    } catch (error) {
      console.error('Failed to end game:', error);
    }
  }, [apiCall]);

  const clearGame = useCallback(async () => {
    try {
      await apiCall('/api/admin/game/end');
    } catch (error) {
      console.error('Failed to clear game:', error);
    }
  }, [apiCall]);

  const callNumber = useCallback(async (number) => {
    try {
      await apiCall('/api/admin/game/call', 'POST', { number });
    } catch (error) {
      console.error('Failed to call number:', error);
    }
  }, [apiCall]);

  const verifyWinner = useCallback(async (cardId, odId) => {
    try {
      await apiCall('/api/admin/game/verify', 'POST', { cardId, odId });
    } catch (error) {
      console.error('Failed to verify winner:', error);
    }
  }, [apiCall]);

  const rejectWinner = useCallback(async (cardId) => {
    try {
      // For now, just remove from local state
      setGameState((prev) => ({
        ...prev,
        potentialWinners: (prev.potentialWinners || []).filter(w => w.cardId !== cardId),
        showContinueMessage: true,
      }));
    } catch (error) {
      console.error('Failed to reject winner:', error);
    }
  }, []);

  const setGameMode = useCallback(async (mode) => {
    try {
      await apiCall('/api/admin/game/mode', 'POST', { gameMode: mode });
    } catch (error) {
      console.error('Failed to set game mode:', error);
    }
  }, [apiCall]);

  // Reconnect with new auth
  const reconnectWithAuth = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setTimeout(connect, 100);
  }, [connect]);

  const value = {
    socket,
    isConnected,
    gameState,
    joinGame,
    leaveGame,
    startGame,
    pauseGame,
    resumeGame,
    endGame,
    clearGame,
    callNumber,
    verifyWinner,
    rejectWinner,
    setGameMode,
    reconnectWithAuth,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
