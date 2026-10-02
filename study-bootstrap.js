try {
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
} catch (e) {}
(function () {
  const root = document.documentElement;
  try {
    const savedTheme = localStorage.getItem('study-theme');
    root.dataset.theme = savedTheme === 'light' ? 'light' : 'dark';

    const savedMode = localStorage.getItem('study-mode');
    root.dataset.studyMode = savedMode === 'keywords' ? 'keywords' : 'full';

    const savedColumns = localStorage.getItem('study-force-columns');
    root.dataset.forceColumns = savedColumns === 'on' ? 'on' : 'off';

    const savedScale = Number(localStorage.getItem('study-font-scale'));
    const scale = Number.isFinite(savedScale) && savedScale >= 50 && savedScale <= 150 && savedScale % 5 === 0
      ? savedScale : 100;
    root.style.setProperty('--base-font-size', (16 * scale / 100) + 'px');
  } catch (e) {
    root.dataset.theme = 'dark';
    root.dataset.studyMode = 'full';
    root.dataset.forceColumns = 'off';
    root.style.setProperty('--base-font-size', '16px');
  }
})();
