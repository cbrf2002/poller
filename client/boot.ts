// Runs in <head> before first paint, so nothing flashes in the wrong colours.
const root = document.documentElement;

// Saved theme; dark by default.
try {
  const saved = localStorage.getItem('poller-theme');
  root.classList.toggle('dark', saved !== 'light');
} catch {
  // Storage can be blocked; the default theme stays.
}

// A fresh accent on every load. Jade and citrine stay out of the draw: they
// already mean "live" and "closed".
const PALETTES = ['rose', 'lavender', 'sky', 'coral'];
root.dataset.palette =
  PALETTES[Math.floor(Math.random() * PALETTES.length)] ?? 'rose';

// The logo stamp plays once per visit, not on every page of it.
try {
  if (!sessionStorage.getItem('poller-stamped')) {
    root.dataset.stamp = '';
    sessionStorage.setItem('poller-stamped', '1');
  }
} catch {
  root.dataset.stamp = '';
}
