// Runs in <head> before first paint: applies the saved theme (dark by default).
try {
  const saved = localStorage.getItem('poller-theme');
  document.documentElement.classList.toggle('dark', saved !== 'light');
} catch {
  // Storage can be blocked; the default theme stays.
}
