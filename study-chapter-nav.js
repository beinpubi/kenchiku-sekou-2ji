(() => {
  'use strict';
  const links = [...document.querySelectorAll('.chapter-navigation a[data-chapter-link]')];
  links.forEach(link => {
    link.addEventListener('click', async event => {
      event.preventDefault();
      try { window.StudyGoogleTTS?.stop?.(true); } catch (_) {}
      try {
        if (window.StudySync?.saveNow) {
          await Promise.race([
            Promise.resolve(window.StudySync.saveNow()),
            new Promise(resolve => setTimeout(resolve, 700))
          ]);
        }
      } catch (_) {}
      location.href = link.href;
    });
  });
})();
