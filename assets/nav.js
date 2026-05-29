// ProjectX shared nav. Each page calls this once at startup. Page declares
// data-page on <body> so the active link gets highlighted. Page declares
// data-version on <body> so the badge stays correct.
//
//   <body data-page="dashboard" data-version="V0.08">
//   <script src="assets/nav.js" defer></script>

(function () {
  // Heroicons (outline, stroke 1.5). Match Project Tracker's header style.
  const ICON_HISTORY = '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" style="width:18px;height:18px"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>';
  const ICON_COG = '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" style="width:18px;height:18px"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.397-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.213-1.281Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>';

  const links = [
    { id: 'dashboard', label: 'Dashboard',  href: 'index.html'   },
    { id: 'lines',     label: 'Log',        href: 'lines.html'   },
    { id: 'approve',   label: 'Approve',    href: 'approve.html' },
    { id: 'ap',        label: 'AP',         href: 'ap.html'      },
    { id: 'ar',        label: 'AR',         href: 'ar.html'      },
    { id: 'history',   label: 'History',    href: 'history.html', icon: ICON_HISTORY },
    { id: 'admin',     label: 'Settings',   href: 'admin.html',   icon: ICON_COG     },
  ];

  // Subbie smartform is anonymous public — no internal nav links.
  // It still gets a stripped-down header (brand + project name + version)
  // so the page still feels like ProjectX, just without admin/AP/AR/etc.
  const PUBLIC_PAGES = new Set(['submit']);

  function mount() {
    const body = document.body;
    const page = body.dataset.page || '';
    const version = body.dataset.version || '';
    const project = body.dataset.project || 'Fonterra Maungaturoto 26';
    const isPublic = PUBLIC_PAGES.has(page);

    const header = document.createElement('header');
    header.className = 'projectx-header';
    header.innerHTML = `
      <a class="projectx-brand" ${isPublic ? '' : 'href="index.html"'}>
        Project<span class="mark">X</span>
      </a>
      <span class="projectx-context hide-mobile">${project}</span>
      <span class="projectx-spacer"></span>
      ${isPublic ? '' : `
        <nav class="projectx-nav-links" id="projectx-nav-links">
          ${links.map(l => `
            <a class="projectx-nav-link ${l.id === page ? 'current' : ''} ${l.icon ? 'is-icon' : ''}"
               href="${l.href}"
               ${l.icon ? `title="${l.label}" aria-label="${l.label}"` : ''}>${l.icon || l.label}</a>
          `).join('')}
        </nav>
        <button class="projectx-mobile-toggle" aria-label="menu" id="projectx-mobile-toggle">
          <svg class="icon-lg" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>
        </button>
      `}
      <span class="projectx-version">${version}</span>
    `;
    body.insertBefore(header, body.firstChild);

    if (!isPublic) {
      const toggle = document.getElementById('projectx-mobile-toggle');
      const linksEl = document.getElementById('projectx-nav-links');
      toggle.addEventListener('click', () => linksEl.classList.toggle('open'));
      document.addEventListener('click', (e) => {
        if (!header.contains(e.target)) linksEl.classList.remove('open');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
