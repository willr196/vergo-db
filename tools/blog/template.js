'use strict';

/**
 * The blog page templates. Both outputs follow the shared public-page contract
 * that apps/api/scripts/validate-page-consistency.js enforces: standard meta,
 * canonical, a static <header class="site-header">, a footer[role="contentinfo"],
 * a skip link and #main-content.
 *
 * The blog uses the same stylesheet, header and footer as the rest of the
 * public site (vergo-site.css, with vergo-blog.css on top). It used to mount an
 * empty header that vergo-public-shell.js filled in client-side; that header
 * looked different, its mobile menu was broken, and crawlers never saw its links.
 * SITE_HEADER and SITE_FOOTER must match the markup on the other public pages.
 *
 * If you change the shape of these pages, update docs/blog-implementation-brief.md.
 */

const { escapeHtml, renderBlocks, renderInline } = require('./markdown');

const ORIGIN = 'https://vergoltd.com';
const OG_IMAGE = `${ORIGIN}/logo.png`;

const AUTHOR = {
  name: 'Will Robb',
  role: 'Founder, VERGO',
  bio: 'Will Robb has spent 8 or more years in London hospitality, film and television production, and live music. He interviews every worker on the VERGO roster himself.',
  company: 'VERGO LTD, company number 16627585, registered in England and Wales.',
};

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDate(iso) {
  return DATE_FORMAT.format(new Date(`${iso}T00:00:00Z`));
}

function attr(value) {
  return escapeHtml(value);
}

const SITE_HEADER = `  <header class="site-header" role="banner">
    <div class="site-header-inner">
      <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">V</span>VERGO</a>
      <nav class="header-actions" aria-label="Primary">
        <a class="switch-link" href="/hire">Staff</a>
        <a class="switch-link" href="/events">Events</a>
        <a class="switch-link" href="/work">Work</a>
        <a class="switch-link" href="/about">About</a>
        <a class="call-link" href="tel:+447944505783" data-vergo-tel="contact.phone" aria-label="Call VERGO on 07944 505783">
          <span data-vergo="contact.phoneDisplay">07944 505783</span>
        </a>
      </nav>
    </div>
  </header>`;

const SITE_FOOTER = `  <footer class="site-footer" role="contentinfo">
    <div class="footer-inner">
      <div>
        <div class="brand"><span class="brand-mark" aria-hidden="true">V</span>VERGO</div>
        <p class="footer-slogan">Wherever you go, VERGO.</p>
        <p class="footer-rate"><span data-vergo="rates.chargeRateShortDisplay">£18</span>/hr, no VAT, for core hospitality roles.</p>
        <p class="footer-contact"><a href="tel:+447944505783" data-vergo-tel="contact.phone"><span data-vergo="contact.phoneDisplay">07944 505783</span></a></p>
        <p class="footer-contact"><a href="mailto:wrobb@vergoltd.com" data-vergo-mailto="contact.email"><span data-vergo="contact.email">wrobb@vergoltd.com</span></a></p>
        <p class="footer-social">
          <a href="https://www.instagram.com/vergo.ltd/" data-vergo-href="social.instagram" target="_blank" rel="noopener">Instagram <span data-vergo="social.instagramHandle">@vergo.ltd</span></a>
          <a href="#" data-vergo-href="reviews.google" target="_blank" rel="noopener" hidden>Google reviews</a>
        </p>
      </div>
      <div class="footer-links">
        <a href="/hire">Staff</a>
        <a href="/events">Events</a>
        <a href="/work">Work</a>
        <a href="/about">About</a>
        <a href="/blog">Journal</a>
        <a href="/contact">Contact</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </div>
      <p class="footer-legal">
        <span data-vergo="company.legalName">VERGO LTD</span> &middot; Company number <span data-vergo="company.number">16627585</span><br>
        <span data-vergo="company.registeredOffice">Flat 96 Sulivan Court, Peterborough Road, London SW6 3DB</span><br>
        Employers' liability and public liability insured. Certificates on request.
      </p>
    </div>
  </footer>`;

const PAGE_SCRIPTS = `  <script src="/vergo-site-config.js"></script>
  <script src="/vergo-whatsapp.js" defer></script>`;

function head({ title, description, route, ogType = 'website', noindex = false }) {
  const url = `${ORIGIN}${route}`;
  return `  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <!-- Analytics, gated on cookie consent (see vergo-consent.js) -->
  <script src="/vergo-consent.js" defer></script>
  <title>${attr(title)}</title>
  <meta name="description" content="${attr(description)}">
${noindex ? '  <meta name="robots" content="noindex, nofollow">\n' : ''}  <meta property="og:title" content="${attr(title)}">
  <meta property="og:description" content="${attr(description)}">
  <meta property="og:image" content="${OG_IMAGE}">
  <meta property="og:url" content="${url}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="VERGO">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#0a0a0a">
  <link rel="icon" href="/favicon.ico">
  <link rel="canonical" href="${url}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@400;500&family=Work+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/vergo-site.css">
  <link rel="stylesheet" href="/vergo-blog.css">`;
}

function jsonLd(data) {
  // JSON-LD sits in a script tag, so the only escape that matters is </script
  // and the U+2028/2029 line separators.
  const json = JSON.stringify(data, null, 2).replace(
    /[<\u2028\u2029]/g,
    (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'),
  );
  return `  <script type="application/ld+json">\n${json}\n  </script>`;
}

function articleJsonLd(post) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.metaDescription,
    datePublished: post.published,
    dateModified: post.updated,
    inLanguage: 'en-GB',
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${ORIGIN}${post.route}` },
    author: {
      '@type': 'Person',
      name: AUTHOR.name,
      jobTitle: 'Founder',
      worksFor: { '@type': 'Organization', name: 'VERGO' },
    },
    publisher: {
      '@type': 'Organization',
      name: 'VERGO',
      legalName: 'VERGO LTD',
      url: ORIGIN,
      logo: { '@type': 'ImageObject', url: OG_IMAGE },
    },
  };
}

function faqJsonLd(post) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: post.faq.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}

function breadcrumbJsonLd(post) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Journal', item: `${ORIGIN}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title, item: `${ORIGIN}${post.route}` },
    ],
  };
}

function renderPost(post) {
  const summaryItems = post.inShort
    .map((bullet, index) => `          <li>${renderInline(bullet, `"In short" bullet ${index + 1}`)}</li>`)
    .join('\n');

  const body = renderBlocks(post.body);

  const faqItems = post.faq
    .map((entry) => {
      const answer = renderBlocks(entry.answerBlocks, { headingIds: false });
      return `      <div class="post-faq-item">
        <h3>${escapeHtml(entry.question)}</h3>
        ${answer}
      </div>`;
    })
    .join('\n');

  const structuredData = [
    jsonLd(articleJsonLd(post)),
    jsonLd(faqJsonLd(post)),
    jsonLd(breadcrumbJsonLd(post)),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
${head({
    title: post.metaTitle,
    description: post.metaDescription,
    route: post.route,
    ogType: 'article',
    noindex: post.draft,
  })}
${structuredData}
</head>
<body>
  <a href="#main-content" class="skip-link">Skip to main content</a>
${SITE_HEADER}

  <main id="main-content">
    <article class="post page-shell">
      <nav class="post-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a> <span aria-hidden="true">/</span> <a href="/blog">Journal</a>
      </nav>

      <header class="post-header">
        <span class="eyebrow">Journal</span>
        <h1>${escapeHtml(post.title)}</h1>
        <p class="post-dates">
          Published <time datetime="${post.published}">${formatDate(post.published)}</time>.
          Last updated <time datetime="${post.updated}">${formatDate(post.updated)}</time>.
        </p>
      </header>

      <aside class="post-summary panel" aria-labelledby="in-short">
        <h2 id="in-short">In short</h2>
        <ul>
${summaryItems}
        </ul>
      </aside>

      <div class="post-body">
    ${body}
      </div>

      <section class="post-faq" aria-labelledby="faq">
        <h2 id="faq">Frequently asked questions</h2>
${faqItems}
      </section>

      <aside class="post-author panel" aria-labelledby="about-the-author">
        <h2 id="about-the-author">${escapeHtml(AUTHOR.name)}</h2>
        <p class="post-author-role">${escapeHtml(AUTHOR.role)}</p>
        <p>${escapeHtml(AUTHOR.bio)}</p>
        <p class="post-author-company">${escapeHtml(AUTHOR.company)}</p>
      </aside>

      <aside class="post-cta cta-panel" aria-labelledby="post-cta-heading">
        <h2 id="post-cta-heading">Need staff for a night?</h2>
        <p>Send the date, the venue and the roles. Enquiries between 8am and 10pm get names the same day.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="/hire/quote">Send a brief</a>
          <a class="btn btn-secondary" href="/hire">Staff</a>
        </div>
      </aside>
    </article>
  </main>

${SITE_FOOTER}
${PAGE_SCRIPTS}
</body>
</html>
`;
}

const INDEX_DESCRIPTION = 'Notes from VERGO on what event staff cost in London, how bookings run, and what to ask any agency before you sign. Plain figures, no sales copy.';

function renderIndex(posts) {
  const cards = posts.length
    ? posts
      .map((post) => `        <article class="blog-card">
          <p class="post-card-date"><time datetime="${post.published}">${formatDate(post.published)}</time></p>
          <h2><a href="${post.route}">${escapeHtml(post.title)}</a></h2>
          <p>${escapeHtml(post.teaser)}</p>
          <p class="post-card-link"><a href="${post.route}">Read the post</a></p>
        </article>`)
      .join('\n')
    : `        <div class="empty-state">
          <p>The first posts are being written. In the meantime, the rates and terms are on <a href="/hire">Staff</a>.</p>
        </div>`;

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'VERGO Journal',
    url: `${ORIGIN}/blog`,
    inLanguage: 'en-GB',
    publisher: {
      '@type': 'Organization',
      name: 'VERGO',
      legalName: 'VERGO LTD',
      url: ORIGIN,
      logo: { '@type': 'ImageObject', url: OG_IMAGE },
    },
    blogPost: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      url: `${ORIGIN}${post.route}`,
      datePublished: post.published,
      dateModified: post.updated,
      author: { '@type': 'Person', name: AUTHOR.name },
    })),
  };

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
${head({
    title: 'Journal | VERGO',
    description: INDEX_DESCRIPTION,
    route: '/blog',
    // An index with nothing on it is worse than no index. It stays out of the
    // sitemap and out of the results until the first post is published.
    noindex: posts.length === 0,
  })}
${jsonLd(itemList)}
</head>
<body>
  <a href="#main-content" class="skip-link">Skip to main content</a>
${SITE_HEADER}

  <main id="main-content">
    <section class="page-hero">
      <div class="page-shell">
        <span class="eyebrow">Journal</span>
        <h1 class="post-index-title">Journal</h1>
        <p class="lede">${escapeHtml(INDEX_DESCRIPTION)}</p>
      </div>
    </section>

    <section class="section-block">
      <div class="page-shell post-index-grid">
${cards}
      </div>
    </section>
  </main>

${SITE_FOOTER}
${PAGE_SCRIPTS}
</body>
</html>
`;
}

module.exports = { AUTHOR, ORIGIN, formatDate, renderIndex, renderPost };
