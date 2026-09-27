// TermiCursor landing page

// Nav border once the page scrolls
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Mobile menu
const menuBtn = document.getElementById('menuBtn');
const navLinks = document.getElementById('navLinks');
const setMenu = (open) => {
  navLinks.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
};
menuBtn.addEventListener('click', () => setMenu(!navLinks.classList.contains('open')));
navLinks.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

// Copy buttons
document.querySelectorAll('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const text = document.querySelector(btn.dataset.copy).textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1600);
    } catch { /* clipboard blocked: the command is still selectable */ }
  });
});

// Reveal on scroll
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -60px 0px', threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
} else {
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
}

// Download tracking (Vercel Web Analytics)
document.querySelectorAll('[data-track="download"]').forEach((link) => {
  link.addEventListener('click', () => {
    if (typeof window.va === 'function') window.va('event', 'Download_TermiCursor');
  });
});
