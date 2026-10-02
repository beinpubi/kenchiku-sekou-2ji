(function() {
    'use strict';
    const root = document.documentElement;
    try {
      const savedTheme = localStorage.getItem('study-theme');
      root.dataset.theme = savedTheme === 'light' ? 'light' : 'dark';
    } catch (e) {
      root.dataset.theme = 'dark';
    }
  })();
