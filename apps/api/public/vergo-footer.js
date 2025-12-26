/**
 * VERGO Events - Shared Footer Component
 * Include this script on all pages for consistent footer
 * 
 * Usage: Add before </body>:
 *   <script src="/vergo-footer.js"></script>
 */

(function() {
  'use strict';

  const footerHTML = `
    <div class="footer-content">
      <div class="footer-column">
        <h3>About Us</h3>
        <p>
          Premium event staffing solutions founded by industry veterans. Combining 8+ years 
          of hands-on experience with decades of family business expertise in the film and music sectors.
        </p>
        <p style="margin-top: 20px; font-size: 0.85rem; color: #666;">
          Fully Insured • DBS Checked
        </p>
      </div>
      
      <div class="footer-column">
        <h3>Services</h3>
        <a href="/hire-staff.html">Event Staffing</a>
        <a href="/hire-us.html">Event Management</a>
        <a href="/pricing.html">Pricing</a>
        <a href="/jobs.html">Job Board</a>
        <a href="/blog.html">Blog</a>
      </div>
      
      <div class="footer-column">
        <h3>Company</h3>
        <a href="/about.html">About Us</a>
        <a href="/apply.html">Join Our Team</a>
        <a href="/contact.html">Get a Quote</a>
        <a href="/faq.html">FAQ</a>
      </div>
      
      <div class="footer-column">
        <h3>Contact Founder</h3>
        <p><strong>Direct:</strong> <a href="tel:+447944505783">+44 7944 505 783</a></p>
        <p><strong>Email:</strong> <a href="mailto:will@vergoltd.com">will@vergoltd.com</a></p>
        <p><strong>Location:</strong> London, UK</p>
      </div>
    </div>
    
    <div class="footer-bottom">
      <p>&copy; ${new Date().getFullYear()} VERGO Events Ltd. All rights reserved.</p>
      <p style="margin-top: 5px;">
        <a href="/privacy.html">Privacy</a> | 
        <a href="/terms.html">Terms</a>
      </p>
    </div>
  `;

  const footerCSS = `
    <style id="vergo-footer-styles">
      footer {
        background: #0a0a0a;
        color: #D4AF37;
        padding: 60px 40px 30px;
        border-top: 1px solid rgba(212, 175, 55, 0.2);
        margin-top: 80px;
      }
      
      .footer-content {
        max-width: 1200px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 40px;
        margin-bottom: 40px;
      }
      
      .footer-column h3 {
        color: #D4AF37;
        margin-bottom: 20px;
        font-size: 1.1rem;
      }
      
      .footer-column p,
      .footer-column a {
        color: #999;
        text-decoration: none;
        display: block;
        margin-bottom: 10px;
        font-size: 0.9rem;
        line-height: 1.7;
        transition: color 0.3s ease;
      }
      
      .footer-column a:hover { color: #D4AF37; }
      
      .footer-bottom {
        text-align: center;
        padding-top: 30px;
        border-top: 1px solid rgba(212, 175, 55, 0.2);
        color: #666;
        font-size: 0.85rem;
      }
      
      .footer-bottom a {
        color: #666;
        text-decoration: none;
        transition: color 0.3s ease;
      }
      
      .footer-bottom a:hover { color: #D4AF37; }
      
      @media (max-width: 768px) {
        footer { padding: 40px 20px 25px; }
        .footer-content { gap: 30px; }
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
