(() => {
  const preference = matchMedia('(prefers-color-scheme: dark)');
  const override = new URLSearchParams(location.search).get('theme');
  const applyTheme = () => {
    document.documentElement.dataset.theme = override === 'light' || override === 'dark'
      ? override : preference.matches ? 'dark' : 'light';
  };
  applyTheme();
  preference.addEventListener('change', applyTheme);
})();
