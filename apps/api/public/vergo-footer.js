/**
 * VERGO Ltd - Premium Footer Component
 * Modern, warm design with gold accents and clear navigation
 *
 * Usage: Add before </body>:
 *   <script src="/vergo-footer.js"></script>
 */

(function() {
  'use strict';

  const footerHTML = `
    <div class="footer-inner">
      <!-- Top section with gold divider -->
      <div class="footer-divider"></div>

      <div class="footer-content">
        <!-- Brand Column -->
        <div class="footer-brand">
          <a href="/" class="footer-logo" aria-label="VERGO Ltd Home">
            <img src="/logo.png" alt="VERGO Ltd" width="120" height="auto">
          </a>
          <p class="footer-tagline">
            Premium event staffing for London and surrounding areas. Trusted teams.
          </p>
          <div class="footer-roles">
            Event Chefs &middot; Bar Staff &middot; Front of House &middot; Baristas &middot; Catering Assistants
          </div>
        </div>

        <!-- Quick Links -->
        <div class="footer-column">
          <h3>Services</h3>
          <ul>
            <li><a href="/hire-staff.html">Hire Event Staff</a></li>
            <li><a href="/pricing.html">Pricing</a></li>
            <li><a href="/quote.html">Get a Quote</a></li>
            <li><a href="/jobs.html">Current Jobs</a></li>
          </ul>
        </div>

        <!-- Work With Us -->
        <div class="footer-column">
          <h3>Work With Us</h3>
          <ul>
            <li><a href="/apply.html">Join the Team</a></li>
            <li><a href="/jobs.html">View Openings</a></li>
          </ul>
        </div>

        <!-- Company -->
        <div class="footer-column">
          <h3>Company</h3>
          <ul>
            <li><a href="/about.html">About VERGO</a></li>
            <li><a href="/faq.html">FAQ</a></li>
            <li><a href="/contact.html">Contact</a></li>
          </ul>
        </div>

        <!-- Contact Column -->
        <div class="footer-column footer-contact">
          <h3>Get in Touch</h3>
          <a href="mailto:wrobb@vergoltd.com" class="footer-email">wrobb@vergoltd.com</a>
          <p class="footer-response">Replies within 24 hours</p>
          <p class="footer-coverage">London & surrounding areas</p>
        </div>
      </div>

      <!-- Bottom section -->
      <div class="footer-bottom">
        <div class="footer-bottom-content">
          <p class="footer-copyright">
            &copy; ${new Date().getFullYear()} VERGO Ltd. All rights reserved.
          </p>
          <div class="footer-legal">
            <a href="/privacy.html">Privacy Policy</a>
            <span class="footer-separator">&middot;</span>
            <a href="/terms.html">Terms of Service</a>
          </div>
        </div>
      </div>
    </div>
  `;

  const footerCSS = `
    <style id="vergo-footer-styles">
      /* Footer Variables */
      :root {
        --footer-bg: #FFFFFF;
        --footer-bg-alt: #FAF8F5;
        --footer-text: #1C1C1C;
        --footer-text-muted: #6B6B6B;
        --footer-text-light: #8A8A8A;
        --footer-gold: #C9A24D;
        --footer-border: rgba(28, 28, 28, 0.08);
        --footer-font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      footer {
        background: var(--footer-bg);
        color: var(--footer-text);
        font-family: var(--footer-font);
      }

      .footer-inner {
        max-width: 1400px;
        margin: 0 auto;
      }

      /* Gold Divider */
      .footer-divider {
        height: 2px;
        background: linear-gradient(
          90deg,
          transparent 0%,
          var(--footer-gold) 20%,
          var(--footer-gold) 80%,
          transparent 100%
        );
        opacity: 0.4;
      }

      /* Main Content Grid */
      .footer-content {
        display: grid;
        grid-template-columns: 1.5fr repeat(4, 1fr);
        gap: 48px;
        padding: 60px 48px 48px;
      }

      /* Brand Column */
      .footer-brand {
        padding-right: 24px;
      }

      .footer-logo {
        display: inline-block;
        margin-bottom: 20px;
      }

      .footer-logo img {
        height: 36px;
        width: auto;
        display: block;
      }

      .footer-tagline {
        font-size: 0.95rem;
        color: var(--footer-text-muted);
        line-height: 1.7;
        margin-bottom: 16px;
      }

      .footer-roles {
        font-size: 0.85rem;
        color: var(--footer-text-light);
        letter-spacing: 0.01em;
      }

      /* Column Styling */
      .footer-column h3 {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--footer-gold);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 20px;
      }

      .footer-column ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .footer-column li {
        margin-bottom: 12px;
      }

      .footer-column a {
        color: var(--footer-text-muted);
        text-decoration: none;
        font-size: 0.9rem;
        transition: color 0.25s ease;
        display: inline-block;
      }

      .footer-column a:hover {
        color: var(--footer-gold);
      }

      /* Contact Column */
      .footer-contact .footer-email {
        display: block;
        color: var(--footer-text);
        font-weight: 500;
        font-size: 0.95rem;
        margin-bottom: 12px;
      }

      .footer-contact .footer-email:hover {
        color: var(--footer-gold);
      }

      .footer-contact .footer-response,
      .footer-contact .footer-coverage {
        font-size: 0.85rem;
        color: var(--footer-text-light);
        margin: 0 0 6px 0;
      }

      /* Bottom Section */
      .footer-bottom {
        background: var(--footer-bg-alt);
        padding: 24px 48px;
        border-top: 1px solid var(--footer-border);
      }

      .footer-bottom-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        max-width: 1400px;
        margin: 0 auto;
      }

      .footer-copyright {
        font-size: 0.85rem;
        color: var(--footer-text-muted);
        margin: 0;
      }

      .footer-legal {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .footer-legal a {
        color: var(--footer-text-muted);
        text-decoration: none;
        font-size: 0.85rem;
        transition: color 0.25s ease;
      }

      .footer-legal a:hover {
        color: var(--footer-gold);
      }

      .footer-separator {
        color: var(--footer-text-light);
      }

      /* Responsive */
      @media (max-width: 1024px) {
        .footer-content {
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          padding: 48px 32px 40px;
        }

        .footer-brand {
          grid-column: 1 / -1;
          padding-right: 0;
          text-align: center;
        }

        .footer-logo {
          margin-bottom: 16px;
        }

        .footer-bottom {
          padding: 20px 32px;
        }
      }

      @media (max-width: 768px) {
        .footer-content {
          grid-template-columns: 1fr;
          gap: 32px;
          padding: 40px 24px;
          text-align: center;
        }

        .footer-column h3 {
          margin-bottom: 16px;
        }

        .footer-column li {
          margin-bottom: 10px;
        }

        .footer-bottom {
          padding: 20px 24px;
        }

        .footer-bottom-content {
          flex-direction: column;
          gap: 12px;
          text-align: center;
        }
      }

      @media (max-width: 480px) {
        .footer-content {
          padding: 32px 20px;
        }

        .footer-bottom {
          padding: 16px 20px;
        }

        .footer-legal {
          flex-wrap: wrap;
          justify-content: center;
        }
      }
    </style>
  `;

  // Replace existing footer
  const footer = document.querySelector('footer');
  if (footer) {
    footer.setAttribute('role', 'contentinfo');
    footer.innerHTML = footerHTML;
  }

  // Inject styles if not present
  if (!document.getElementById('vergo-footer-styles')) {
    document.head.insertAdjacentHTML('beforeend', footerCSS);
  }

})();
