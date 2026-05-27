// TrakX shared nav. Each page calls this once at startup. Page declares
// data-page on <body> so the active link gets highlighted. Page declares
// data-version on <body> so the badge stays correct.
//
//   <body data-page="dashboard" data-version="V0.08">
//   <script src="assets/nav.js" defer></script>

(function () {
  const links = [
    { id: 'dashboard', label: 'Dashboard',  href: 'index.html'   },
    { id: 'lines',     label: 'Entries',    href: 'lines.html'   },
    { id: 'submit',    label: 'Submit',     href: 'submit.html?p=fonterra-m26' },
    { id: 'approve',   label: 'Approve',    href: 'approve.html' },
    { id: 'ap',        label: 'AP',         href: 'ap.html'      },
    { id: 'ar',        label: 'AR',         href: 'ar.html'      },
    { id: 'admin',     label: 'Admin',      href: 'admin.html'   },
  ];

  function mount() {
    const body = document.body;
    const page = body.dataset.page || '';
    const version = body.dataset.version || '';
    const project = body.dataset.project || 'Fonterra Maungaturoto 26';

    const header = document.createElement('header');
    header.className = 'trakx-header';
    header.innerHTML = `
      <a class="trakx-brand" href="index.html">
        Trak<span class="mark">X</span>
      </a>
      <span class="trakx-context hide-mobile">${project}</span>
      <span class="trakx-spacer"></span>
      <nav class="trakx-nav-links" id="trakx-nav-links">
        ${links.map(l => `
          <a class="trakx-nav-link ${l.id === page ? 'current' : ''}" href="${l.href}">${l.label}</a>
        `).join('')}
      </nav>
      <button class="trakx-mobile-toggle" aria-label="menu" id="trakx-mobile-toggle">☰</button>
      <span class="trakx-version">${version}</span>
    `;
    body.insertBefore(header, body.firstChild);

    const toggle = document.getElementById('trakx-mobile-toggle');
    const linksEl = document.getElementById('trakx-nav-links');
    toggle.addEventListener('click', () => linksEl.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!header.contains(e.target)) linksEl.classList.remove('open');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
