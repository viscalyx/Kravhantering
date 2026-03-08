;(() => {
  try {
    const theme = localStorage.getItem('theme')
    if (
      theme === 'dark' ||
      (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ) {
      document.documentElement.classList.add('dark')
    }
    const colorTheme = localStorage.getItem('colorTheme')
    if (colorTheme) {
      document.documentElement.setAttribute('data-theme', colorTheme)
    }
  } catch {}
})()
