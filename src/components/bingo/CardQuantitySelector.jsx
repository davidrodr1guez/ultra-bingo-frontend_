import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlowButton, GlassCard } from '../ui';
import { config } from '../../config';
import './CardQuantitySelector.css';

function CardQuantitySelector({
  onPurchase,
  purchasing = false,
  isLoggedIn = false,
  purchasedCards = [],
  onClearPurchased,
  disabled = false,
}) {
  const [quantity, setQuantity] = useState(1);
  const fibonacciQuantities = config.fibonacciQuantities;
  const pricePerCard = config.cardPrice;
  const totalPrice = quantity * pricePerCard;

  const handleSelectQuantity = (num) => {
    setQuantity(num);
  };

  // If we have purchased cards, show them
  if (purchasedCards.length > 0) {
    return (
      <div className="purchased-cards-display">
        <div className="purchased-header">
          <motion.div
            className="success-icon"
            initial={{ scale: 0 }}
            animate={{ scale: 1, rotate: 360 }}
            transition={{ type: 'spring', stiffness: 200 }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </motion.div>
          <h3>Compra exitosa!</h3>
          <p>Tus {purchasedCards.length} cartones han sido asignados</p>
        </div>

        <div className="purchased-cards-grid">
          {purchasedCards.map((card, index) => (
            <motion.div
              key={card.id}
              className="mini-card"
              initial={{ opacity: 0, y: 20, rotateY: 180 }}
              animate={{ opacity: 1, y: 0, rotateY: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <div className="mini-card-header">
                <span className="mini-card-id">#{card.id.slice(-6)}</span>
              </div>
              <div className="mini-card-numbers">
                {['B', 'I', 'N', 'G', 'O'].map(letter => (
                  <div key={letter} className="mini-column">
                    <span className="mini-letter">{letter}</span>
                    {card.numbers[letter].map((num, i) => (
                      <span key={i} className={`mini-number ${num === 0 ? 'free' : ''}`}>
                        {num === 0 ? '*' : num}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        <GlowButton onClick={onClearPurchased} variant="secondary">
          Comprar mas cartones
        </GlowButton>
      </div>
    );
  }

  return (
    <div className="quantity-selector">
      <GlassCard glow className="selector-card">
        <div className="selector-content">
          {/* Visual representation */}
          <div className="cards-visual">
            <AnimatePresence mode="popLayout">
              {[...Array(Math.min(quantity, 5))].map((_, i) => (
                <motion.div
                  key={i}
                  className="visual-card"
                  initial={{ opacity: 0, scale: 0.8, x: -20 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    x: 0,
                    rotate: (i - 2) * 5
                  }}
                  exit={{ opacity: 0, scale: 0.8, x: 20 }}
                  style={{
                    zIndex: 5 - i,
                    marginLeft: i > 0 ? '-30px' : '0'
                  }}
                >
                  <div className="visual-card-inner">
                    <span>B I N G O</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {quantity > 5 && (
              <motion.span
                className="extra-count"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                +{quantity - 5}
              </motion.span>
            )}
          </div>

          {/* Fibonacci quantity selection */}
          <div className="quantity-controls">
            <h3>Selecciona cantidad de cartones</h3>

            {/* Fibonacci grid selection */}
            <div className="fibonacci-grid">
              {fibonacciQuantities.map((num, index) => (
                <motion.button
                  key={num}
                  className={`fibonacci-btn ${quantity === num ? 'active' : ''}`}
                  onClick={() => handleSelectQuantity(num)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <span className="fib-number">{num}</span>
                  <span className="fib-price">${num * pricePerCard}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Price display */}
          <div className="price-display">
            <div className="price-breakdown">
              <span className="breakdown-line">
                {quantity} x ${pricePerCard}
              </span>
            </div>
            <motion.div
              className="total-price"
              key={totalPrice}
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
            >
              <span className="total-label">Total</span>
              <span className="total-value">
                ${totalPrice} <span className="currency">USDC</span>
              </span>
            </motion.div>
          </div>

          {/* Purchase button */}
          <GlowButton
            onClick={() => onPurchase(quantity)}
            size="xl"
            loading={purchasing}
            disabled={disabled || !isLoggedIn || purchasing}
            fullWidth
          >
            {disabled ? 'Compras bloqueadas' : purchasing ? 'Procesando...' : isLoggedIn ? 'Comprar cartones' : 'Iniciar sesion para comprar'}
          </GlowButton>

          <p className="purchase-note">
            Los numeros de tus cartones se asignaran automaticamente al completar la compra
          </p>
        </div>
      </GlassCard>
    </div>
  );
}

export default CardQuantitySelector;
