/* ═══════════════════════════════════════════════════
   TermiCursor Landing Page — JavaScript
   ═══════════════════════════════════════════════════ */

// ── Navbar scroll effect ──
const navbar = document.getElementById('navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const currentScroll = window.scrollY;
  if (currentScroll > 40) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
  lastScroll = currentScroll;
});

// ── Mobile menu toggle ──
const mobileBtn = document.getElementById('mobileMenuBtn');
const navLinks = document.querySelector('.nav-links');

if (mobileBtn) {
  mobileBtn.addEventListener('click', () => {
    navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
    navLinks.style.flexDirection = 'column';
    navLinks.style.position = 'absolute';
    navLinks.style.top = '64px';
    navLinks.style.right = '20px';
    navLinks.style.background = 'rgba(3, 13, 14, 0.97)';
    navLinks.style.border = '1px solid #153536';
    navLinks.style.borderRadius = '12px';
    navLinks.style.padding = '16px';
    navLinks.style.backdropFilter = 'blur(20px)';
    navLinks.style.zIndex = '9999';
    navLinks.style.boxShadow = '0 16px 48px rgba(0,0,0,0.4)';
  });
}

// ── Scroll reveal animations ──
const observerOptions = {
  root: null,
  rootMargin: '0px 0px -80px 0px',
  threshold: 0.1,
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, observerOptions);

// Observe all animatable elements
document.querySelectorAll('.feature-card, .arch-phase, .privacy-card, .download-card').forEach(el => {
  observer.observe(el);
});

// ── Smooth scroll for anchor links ──
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const targetId = this.getAttribute('href');
    if (targetId === '#') return;
    
    e.preventDefault();
    const target = document.querySelector(targetId);
    if (target) {
      const offsetTop = target.offsetTop - 80;
      window.scrollTo({
        top: offsetTop,
        behavior: 'smooth'
      });

      // Close mobile menu if open
      if (window.innerWidth <= 900) {
        navLinks.style.display = 'none';
      }
    }
  });
});

// ── Parallax on hero glows ──
window.addEventListener('mousemove', (e) => {
  const x = (e.clientX / window.innerWidth - 0.5) * 30;
  const y = (e.clientY / window.innerHeight - 0.5) * 30;
  
  const glow1 = document.querySelector('.hero-glow-1');
  const glow2 = document.querySelector('.hero-glow-2');
  
  if (glow1) glow1.style.transform = `translateX(calc(-50% + ${x}px)) translateY(${y}px)`;
  if (glow2) glow2.style.transform = `translateX(${-x * 0.5}px) translateY(${-y * 0.5}px)`;
});
