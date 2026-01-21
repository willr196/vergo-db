/**
 * VERGO Ltd - WhatsApp Floating Button
 * Add this script to any page to show a WhatsApp contact button
 * 
 * Usage: <script src="/js/vergo-whatsapp.js"></script>
 * 
 * Configuration (optional - set before loading script):
 * window.VERGO_WHATSAPP = {
 *   phone: '447123456789',  // UK number without + (default: your number)
 *   message: 'Hi VERGO!',   // Pre-filled message
 *   position: 'right',      // 'left' or 'right' (default: right)
 *   offset: 20,             // Distance from edge in px (default: 20)
 *   showAfter: 3000,        // Show after ms (default: 3000)
 *   hideOnScroll: false     // Hide when scrolling (default: false)
 * };
 */

(function() {
  'use strict';

  // Configuration with defaults
  const config = Object.assign({
    phone: '447000000000', // Replace with your actual WhatsApp number
    message: 'Hi VERGO Ltd! I\'d like to enquire about your services.',
    position: 'right',
    offset: 20,
    showAfter: 3000,
    hideOnScroll: false,
    pulseAnimation: true
  }, window.VERGO_WHATSAPP || {});

  // Don't run on admin pages
  if (window.location.pathname.includes('admin') || window.location.pathname.includes('login')) {
    return;
  }

  // Create styles
  const styles = document.createElement('style');
  styles.textContent = `
    .vergo-whatsapp-btn {
      position: fixed;
      bottom: ${config.offset}px;
      ${config.position}: ${config.offset}px;
      z-index: 9999;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #25D366;
      box-shadow: 0 4px 20px rgba(37, 211, 102, 0.4);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      opacity: 0;
      transform: scale(0.8) translateY(20px);
      pointer-events: none;
      border: none;
      outline: none;
    }

    .vergo-whatsapp-btn.visible {
      opacity: 1;
      transform: scale(1) translateY(0);
      pointer-events: auto;
    }

    .vergo-whatsapp-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 25px rgba(37, 211, 102, 0.5);
    }

    .vergo-whatsapp-btn:active {
      transform: scale(0.95);
    }

    .vergo-whatsapp-btn svg {
      width: 32px;
      height: 32px;
      fill: #fff;
    }

    ${config.pulseAnimation ? `
    .vergo-whatsapp-btn::before {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      background: rgba(37, 211, 102, 0.3);
      animation: whatsapp-pulse 2s ease-out infinite;
      pointer-events: none;
    }

    @keyframes whatsapp-pulse {
      0% {
        transform: scale(1);
        opacity: 0.6;
      }
      100% {
        transform: scale(1.4);
        opacity: 0;
      }
    }
    ` : ''}

    .vergo-whatsapp-btn.hidden {
      opacity: 0;
      transform: scale(0.8) translateY(20px);
      pointer-events: none;
    }

    /* Tooltip */
    .vergo-whatsapp-tooltip {
      position: absolute;
      ${config.position === 'right' ? 'right: 70px' : 'left: 70px'};
      top: 50%;
      transform: translateY(-50%);
      background: #1a1a1a;
      color: #fff;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
      border: 1px solid #333;
    }

    .vergo-whatsapp-tooltip::after {
      content: '';
      position: absolute;
      ${config.position === 'right' ? 'right: -6px' : 'left: -6px'};
      top: 50%;
      transform: translateY(-50%);
      border: 6px solid transparent;
      border-${config.position === 'right' ? 'left' : 'right'}-color: #1a1a1a;
    }

    .vergo-whatsapp-btn:hover .vergo-whatsapp-tooltip {
      opacity: 1;
    }

    /* Mobile adjustments */
    @media (max-width: 768px) {
      .vergo-whatsapp-btn {
        width: 56px;
        height: 56px;
        bottom: 15px;
        ${config.position}: 15px;
      }

      .vergo-whatsapp-btn svg {
        width: 28px;
        height: 28px;
      }

      .vergo-whatsapp-tooltip {
        display: none;
      }
    }
  `;
  document.head.appendChild(styles);

  // Create button
  const button = document.createElement('button');
  button.className = 'vergo-whatsapp-btn';
  button.setAttribute('aria-label', 'Chat on WhatsApp');
  button.innerHTML = `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
    <span class="vergo-whatsapp-tooltip">Chat with us</span>
  `;

  // Click handler
  button.addEventListener('click', function() {
    const encodedMessage = encodeURIComponent(config.message);
    const whatsappUrl = `https://wa.me/${config.phone}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  });

  // Add to page
  document.body.appendChild(button);

  // Show after delay
  setTimeout(function() {
    button.classList.add('visible');
  }, config.showAfter);

  // Hide on scroll (optional)
  if (config.hideOnScroll) {
    let scrollTimeout;
    window.addEventListener('scroll', function() {
      button.classList.add('hidden');
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(function() {
        button.classList.remove('hidden');
      }, 1000);
    }, { passive: true });
  }

  // Expose for manual control
  window.vergoWhatsApp = {
    show: function() { button.classList.add('visible'); button.classList.remove('hidden'); },
    hide: function() { button.classList.remove('visible'); },
    setMessage: function(msg) { config.message = msg; }
  };

})();
