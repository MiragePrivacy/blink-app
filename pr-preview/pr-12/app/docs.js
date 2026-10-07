const THEME_KEY = 'blink.theme';

const PAGES = [
  { id: 'introduction', title: 'Introduction' },
  { id: 'labels', title: 'Tracked labels' },
  { id: 'sql', title: 'SQL guide' },
];

/* ---- theme (shares the dashboard's persisted preference) ---- */
function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function setTheme(theme) {
  if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.setAttribute('aria-label', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
  }
}

const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const next = currentTheme() === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* private browsing */ }
    setTheme(next);
  });
}
setTheme(currentTheme());

/* ---- page routing ---- */
function pagerLink(anchor, page) {
  if (!anchor) return;
  if (!page) {
    anchor.hidden = true;
    return;
  }
  anchor.hidden = false;
  anchor.href = `#${page.id}`;
  const isNext = anchor.classList.contains('next');
  anchor.innerHTML = '';
  const d = document.createElement('span');
  d.className = 'pager-dir';
  d.textContent = isNext ? 'Next' : 'Previous';
  const l = document.createElement('span');
  l.className = 'pager-label';
  l.textContent = isNext ? `${page.title} →` : `← ${page.title}`;
  anchor.append(d, l);
}

function buildPagers() {
  PAGES.forEach((page, i) => {
    const article = document.getElementById(`doc-${page.id}`);
    if (!article) return;
    pagerLink(article.querySelector('.docs-pager .prev'), PAGES[i - 1]);
    pagerLink(article.querySelector('.docs-pager .next'), PAGES[i + 1]);
  });
}

const slider = document.querySelector('.docs-nav-slider');

function positionSlider({ animate = true } = {}) {
  const active = document.querySelector('.docs-nav-item.active');
  if (!slider || !active) return;
  if (!animate) slider.classList.add('no-anim');
  slider.style.height = `${active.offsetHeight}px`;
  slider.style.transform = `translateY(${active.offsetTop}px)`;
  if (!animate) {
    // force reflow, then re-enable transitions for subsequent moves
    void slider.offsetHeight;
    slider.classList.remove('no-anim');
  }
}

function showPage(rawId, { scroll = true, animate = true } = {}) {
  const id = PAGES.some(p => p.id === rawId) ? rawId : PAGES[0].id;
  PAGES.forEach(page => {
    const article = document.getElementById(`doc-${page.id}`);
    if (article) article.toggleAttribute('hidden', page.id !== id);
    document
      .querySelector(`.docs-nav-item[data-doc="${page.id}"]`)
      ?.classList.toggle('active', page.id === id);
  });
  positionSlider({ animate });
  if (scroll) window.scrollTo(0, 0);
}

buildPagers();
showPage(location.hash.slice(1), { scroll: false, animate: false });

window.addEventListener('hashchange', () => showPage(location.hash.slice(1)));
window.addEventListener('resize', () => positionSlider({ animate: false }));
