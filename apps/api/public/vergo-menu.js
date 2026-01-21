/**
 * VERGO Ltd - Navigation Menu Handler
 * Handles mobile menu toggle, dropdowns, and accessibility
 * Include at the bottom of HTML files, before </body>
 */

document.addEventListener('DOMContentLoaded', function() {
  const menuToggle = document.querySelector('.menu-toggle');
  const navMenu = document.querySelector('nav ul');
  const header = document.querySelector('header');
  
  // ============================================
  // MOBILE MENU TOGGLE
  // ============================================
  if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      menuToggle.classList.toggle('active');
      navMenu.classList.toggle('active');
      
      const isExpanded = navMenu.classList.contains('active');
      menuToggle.setAttribute('aria-expanded', isExpanded);
      document.body.style.overflow = isExpanded ? 'hidden' : '';
    });
  }
  
  // ============================================
  // DROPDOWN MENUS
  // ============================================
  const dropdowns = document.querySelectorAll('.nav-dropdown');
  
  dropdowns.forEach(dropdown => {
    const toggle = dropdown.querySelector('a[aria-haspopup]');
    
    if (toggle) {
      toggle.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const isActive = dropdown.classList.toggle('active');
        toggle.setAttribute('aria-expanded', isActive);
        
        // Close other dropdowns
        dropdowns.forEach(other => {
          if (other !== dropdown) {
            other.classList.remove('active');
            const otherToggle = other.querySelector('a[aria-haspopup]');
            if (otherToggle) {
              otherToggle.setAttribute('aria-expanded', 'false');
            }
          }
        });
      });
    }
  });
  
  // ============================================
  // CLOSE ON OUTSIDE CLICK
  // ============================================
  document.addEventListener('click', function(e) {
    if (header && !header.contains(e.target)) {
      // Close mobile menu
      if (menuToggle && navMenu) {
        menuToggle.classList.remove('active');
        navMenu.classList.remove('active');
        menuToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
      
      // Close all dropdowns
      dropdowns.forEach(dropdown => {
        dropdown.classList.remove('active');
        const toggle = dropdown.querySelector('a[aria-haspopup]');
        if (toggle) {
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
  });
  
  // ============================================
  // CLOSE ON ESCAPE KEY
  // ============================================
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      // Close mobile menu
      if (menuToggle && navMenu && navMenu.classList.contains('active')) {
        menuToggle.classList.remove('active');
        navMenu.classList.remove('active');
        menuToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
        menuToggle.focus();
      }
      
      // Close dropdowns
      dropdowns.forEach(dropdown => {
        if (dropdown.classList.contains('active')) {
          dropdown.classList.remove('active');
          const toggle = dropdown.querySelector('a[aria-haspopup]');
          if (toggle) {
            toggle.setAttribute('aria-expanded', 'false');
            toggle.focus();
          }
        }
      });
    }
  });
  
  // ============================================
  // CLOSE MENU ON NAV LINK CLICK (Mobile)
  // ============================================
  if (navMenu) {
    navMenu.querySelectorAll('a:not([aria-haspopup])').forEach(link => {
      link.addEventListener('click', function() {
        if (menuToggle) {
          menuToggle.classList.remove('active');
          navMenu.classList.remove('active');
          menuToggle.setAttribute('aria-expanded', 'false');
          document.body.style.overflow = '';
        }
      });
    });
  }
});

// ============================================
// GLOBAL FUNCTIONS (for onclick compatibility)
// ============================================
function toggleMenu() {
  const menu = document.getElementById('nav-menu');
  const toggle = document.querySelector('.menu-toggle');
  
  if (menu && toggle) {
    const isActive = menu.classList.toggle('active');
    toggle.classList.toggle('active');
    toggle.setAttribute('aria-expanded', isActive);
    document.body.style.overflow = isActive ? 'hidden' : '';
  }
}

function toggleDropdown(event, dropdownId) {
  event.preventDefault();
  event.stopPropagation();
  
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;
  
  const isActive = dropdown.classList.toggle('active');
  const link = dropdown.querySelector('a[aria-haspopup]');
  
  if (link) {
    link.setAttribute('aria-expanded', isActive);
  }
  
  // Close other dropdowns
  document.querySelectorAll('.nav-dropdown').forEach(item => {
    if (item.id !== dropdownId) {
      item.classList.remove('active');
      const otherLink = item.querySelector('a[aria-haspopup]');
      if (otherLink) {
        otherLink.setAttribute('aria-expanded', 'false');
      }
    }
  });
}