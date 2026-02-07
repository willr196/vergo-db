// Newsletter form
    document.getElementById('newsletter-form').addEventListener('submit', function(e) {
      e.preventDefault();
      const email = this.querySelector('input').value;
      // TODO: Submit to your email service
      this.innerHTML = '<p style="color: var(--color-gold);">✓ Thanks for subscribing!</p>';
    });
