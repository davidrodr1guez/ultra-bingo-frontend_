import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { config } from '../config';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [gameState, setGameState] = useState({
    status: 'waiting', // waiting, playing, paused, ended
    gameMode: 'fullCard', // Current game mode (ULTRA patterns)
    calledNumbers: [],
    currentNumber: null,
    winner: null,
    potentialWinners: [], // Cards that have completed BINGO
    canPurchase: true, // Whether card purchases are allowed
    patternInfo: null, // Current pattern info
    lastRejectedWinner: null, // Track last rejected winner for "Continua el juego" message
    showContinueMessage: false, // Show "Continua el juego" message
  });
  const hasReconnectedRef = useRef(false);
  const continueMessageTimeoutRef = useRef(null);

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

  useEffect(() => {
    const { token, isAdmin } = getAuthInfo();

    // Create socket connection with auth
    const newSocket = io(config.wsUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: {
        token,
        isAdmin,
      },
    });

    // Connection events
    newSocket.on('connect', () => {
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Handle connection errors silently
    newSocket.on('connect_error', () => {});

    // Handle general errors from server silently
    newSocket.on('error', () => {});

    // Game events
    newSocket.on('game-state', (state) => {
      // CRITICAL: Ensure all required fields exist to prevent crashes
      setGameState((prev) => ({
        ...prev,
        ...state,
        // Ensure arrays are always defined
        calledNumbers: state?.calledNumbers || prev?.calledNumbers || [],
        potentialWinners: state?.potentialWinners || prev?.potentialWinners || [],
      }));
    });

    newSocket.on('number-called', (data) => {
      setGameState((prev) => ({
        ...prev,
        currentNumber: data.number,
        calledNumbers: [...(prev?.calledNumbers || []), data.number],
      }));
    });

    newSocket.on('number-uncalled', (data) => {
      setGameState((prev) => ({
        ...prev,
        currentNumber: data.currentNumber,
        calledNumbers: data.calledNumbers || (prev?.calledNumbers || []).filter(n => n !== data.number),
      }));
    });

    newSocket.on('game-started', (data) => {
      setGameState((prev) => ({
        ...prev,
        status: 'playing',
        calledNumbers: [],
        currentNumber: null,
        winner: null,
        potentialWinners: [], // Reset potential winners on new game
        canPurchase: false,
        gameMode: data?.gameMode || prev?.gameMode || 'fullCard',
      }));
    });

    newSocket.on('game-mode-changed', (data) => {
      setGameState((prev) => ({
        ...prev,
        gameMode: data.mode,
        patternInfo: data.patternInfo || null,
      }));
    });

    newSocket.on('game-paused', () => {
      setGameState((prev) => ({
        ...prev,
        status: 'paused',
      }));
    });

    newSocket.on('game-resumed', () => {
      setGameState((prev) => ({
        ...prev,
        status: 'playing',
      }));
    });

    newSocket.on('game-ended', (data) => {
      setGameState((prev) => ({
        ...prev,
        status: 'ended',
        winner: data?.winner || null,
        potentialWinners: [], // Clear potential winners when game ends
        canPurchase: true,
      }));
    });

    newSocket.on('game-cleared', (data) => {
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
    });

    newSocket.on('winner-announced', (data) => {
      setGameState((prev) => ({
        ...prev,
        winner: data?.winner || null,
        potentialWinners: [], // Clear potential winners when official winner announced
      }));
    });

    // Potential winner detected (BINGO completed)
    newSocket.on('potential-winner', (data) => {
      setGameState((prev) => {
        // CRITICAL: Ensure potentialWinners is always an array
        const currentWinners = prev?.potentialWinners || [];
        // Avoid duplicates
        const exists = currentWinners.some(w => w.cardId === data.cardId);
        if (exists) return prev;
        return {
          ...prev,
          potentialWinners: [...currentWinners, data],
          showContinueMessage: false, // Hide continue message when new winner detected
        };
      });
    });

    // Winner rejected - game continues
    newSocket.on('winner-rejected', (data) => {
      setGameState((prev) => {
        const currentWinners = prev?.potentialWinners || [];
        return {
          ...prev,
          potentialWinners: currentWinners.filter(w => w.cardId !== data.cardId),
          lastRejectedWinner: data.cardId,
          showContinueMessage: true, // Show "Continua el juego" message
        };
      });
      // Auto-hide the continue message after 5 seconds
      // Clear any existing timeout to prevent memory leaks
      if (continueMessageTimeoutRef.current) {
        clearTimeout(continueMessageTimeoutRef.current);
      }
      continueMessageTimeoutRef.current = setTimeout(() => {
        setGameState((prev) => ({
          ...prev,
          showContinueMessage: false,
        }));
        continueMessageTimeoutRef.current = null;
      }, 5000);
    });

    setSocket(newSocket);

    // Cleanup on unmount - IMPORTANT: Remove all listeners to prevent memory leaks
    return () => {
      // Clear any pending timeout
      if (continueMessageTimeoutRef.current) {
        clearTimeout(continueMessageTimeoutRef.current);
        continueMessageTimeoutRef.current = null;
      }
      newSocket.off('connect');
      newSocket.off('disconnect');
      newSocket.off('connect_error');
      newSocket.off('error');
      newSocket.off('game-state');
      newSocket.off('number-called');
      newSocket.off('number-uncalled');
      newSocket.off('game-started');
      newSocket.off('game-paused');
      newSocket.off('game-resumed');
      newSocket.off('game-ended');
      newSocket.off('game-cleared');
      newSocket.off('game-mode-changed');
      newSocket.off('winner-announced');
      newSocket.off('potential-winner');
      newSocket.off('winner-rejected');
      newSocket.close();
    };
  }, []);

  // Join a game room - useCallback to prevent unnecessary re-renders
  const joinGame = useCallback((gameId) => {
    if (socket) {
      socket.emit('join-game', { gameId });
    }
  }, [socket]);

  // Leave a game room - useCallback to prevent unnecessary re-renders
  const leaveGame = useCallback((gameId) => {
    if (socket) {
      socket.emit('leave-game', { gameId });
    }
  }, [socket]);

  // ============== ADMIN FUNCTIONS ==============

  // Admin: Start game
  const startGame = useCallback(() => {
    if (socket) {
      socket.emit('admin:start-game');
          }
  }, [socket]);

  // Admin: Pause game
  const pauseGame = useCallback(() => {
    if (socket) {
      socket.emit('admin:pause-game');
          }
  }, [socket]);

  // Admin: Resume game
  const resumeGame = useCallback(() => {
    if (socket) {
      socket.emit('admin:resume-game');
          }
  }, [socket]);

  // Admin: End game
  const endGame = useCallback((winner = null) => {
    if (socket) {
      socket.emit('admin:end-game', { winner });
          }
  }, [socket]);

  // Admin: Clear game (reset UI without starting new game)
  const clearGame = useCallback(() => {
    if (socket) {
      socket.emit('admin:clear-game');
          }
  }, [socket]);

  // Admin: Call number
  const callNumber = useCallback((number) => {
    if (socket) {
      socket.emit('admin:call-number', { number });
          }
  }, [socket]);

  // Admin: Uncall number (remove incorrectly called number)
  const uncallNumber = useCallback((number) => {
    if (socket) {
      socket.emit('admin:uncall-number', { number });
          }
  }, [socket]);

  // Admin: Verify winner
  const verifyWinner = useCallback((cardId) => {
    if (socket) {
      socket.emit('admin:verify-winner', { cardId });
          }
  }, [socket]);

  // Admin: Reject potential winner and resume game
  const rejectWinner = useCallback((cardId) => {
    if (socket) {
      socket.emit('admin:reject-winner', { cardId });
          }
  }, [socket]);

  // Admin: Set game mode
  const setGameMode = useCallback((mode) => {
    if (socket) {
      socket.emit('admin:set-game-mode', { mode });
          }
  }, [socket]);

  // Reconnect with new auth (useful after login)
  const reconnectWithAuth = useCallback(() => {
    if (socket && !hasReconnectedRef.current) {
      hasReconnectedRef.current = true;
      const { token, isAdmin } = getAuthInfo();
      socket.auth = { token, isAdmin };
      socket.disconnect();
      setTimeout(() => {
        socket.connect();
                // Reset after a delay to allow future reconnects if needed
        setTimeout(() => {
          hasReconnectedRef.current = false;
        }, 5000);
      }, 100);
    }
  }, [socket]);

  const value = {
    socket,
    isConnected,
    gameState,
    joinGame,
    leaveGame,
    // Admin functions
    startGame,
    pauseGame,
    resumeGame,
    endGame,
    clearGame,
    callNumber,
    uncallNumber,
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
