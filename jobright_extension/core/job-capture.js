(function () {
  const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const first = (root, selector) => root.querySelector(selector);
  const read = (root, selector, max) => {
    const node = first(root, selector);
    return text(node?.getAttribute('content') || node?.innerText || node?.textContent, max);
  };
  const parse = value => {
    try { return JSON.parse(value); } catch { return null; }
  };

  function url(value, base) {
    if (!value) return null;
    try {
      const result = new URL(value, base);
      return /^https?:$/.test(result.protocol) && !result.username && !result.password ? result.href : null;
    } catch {
      return null;
    }
  }

  function structuredPosting(root) {
    const postings = [];
    function visit(node) {
      if (Array.isArray(node)) {
        node.forEach(visit);
      } else if (node && typeof node === 'object') {
        if ([node['@type']].flat().some(type => /(?:^|\/)JobPosting$/.test(type))) postings.push(node);
        visit(node['@graph']);
        visit(node.mainEntity);
      }
    }
    for (const node of root.querySelectorAll('script[type="application/ld+json"]')) visit(parse(node.textContent));
    if (postings.length === 1) return postings[0];
    const heading = read(root, 'h1', 200).toLowerCase();
    const matching = postings.filter(posting => text(posting.title || posting.name, 200).toLowerCase() === heading);
    return heading && matching.length === 1 ? matching[0] : null;
  }

  function formatLocations(locations) {
    return [locations].flat().map(item => {
      const address = item?.address || item;
      if (typeof address === 'string') return address;
      return [address?.addressLocality, address?.addressRegion,
        address?.addressCountry?.name || address?.addressCountry].filter(part => typeof part === 'string').join(', ');
    }).filter(Boolean).join(' • ');
  }

  function safeHtml(markup) {
    const template = document.createElement('template');
    template.innerHTML = String(markup).slice(0, 120_000);
    template.content.querySelectorAll('script, style, template, iframe, object, embed, form, svg, img, link, meta, audio, video').forEach(node => node.remove());
    for (const node of template.content.querySelectorAll('*')) {
      for (const attribute of node.getAttributeNames()) node.removeAttribute(attribute);
    }
    return template;
  }

  function kekaPosting(page) {
    const id = /(^|\.)keka\.com$/.test(page.hostname) &&
      page.pathname.match(/^\/careers\/(?:jobdetails|applyjob)\/(\d+)\/?$/i)?.[1];
    return id ? {
      id,
      details: new URL('/careers/jobdetails/' + id, page.origin).href,
      application: new URL('/careers/applyjob/' + id, page.origin).href,
    } : null;
  }

  function jobFromDom(root = document, pageUrl = location.href) {
    const jobUrl = url(pageUrl);
    if (!jobUrl) return null;
    const current = new URL(jobUrl);
    const keka = kekaPosting(current);
    const isWorkspace = /(^|\.)(nextkinhr\.com|jobright-internal\.com)$/.test(current.hostname)
      || ['localhost', '127.0.0.1'].includes(current.hostname) && !!first(root, '#nextkin-job-details');
    const portal = isWorkspace && /^\/(?:dashboard\/jobs|jobs\/info)\/[^/]+\/?$/.test(current.pathname);
    if (isWorkspace && !portal) return null;
    const workspace = portal ? parse(first(root, '#nextkin-job-details')?.textContent) : null;
    const posting = workspace ? null : structuredPosting(root);
    const descriptionNode = [
      '.jd-prose', '[itemprop="description"]', '[data-automation-id="jobPostingDescription"]',
      '[data-testid="job-description"]', '[data-qa="job-description"]', '.job__description',
      '#job-description', '#jobDescriptionText', '#jobDescription', '#content.job-description',
      '.job-description', '.job-description-content', '.jobs-description__content', '#job-details',
      '[class*="job-description" i]', '.posting-page .section-wrapper', 'main article',
    ].map(selector => first(root, selector)).find(Boolean);
    const knownJobPath = /\/(?:jobs?|careers?|openings?|positions?|requisitions?|jobdetails|viewjob|job-detail|job-posting)(?:\/[^/]+)|[?&](?:gh_jid|jobId|job_id|jk)=/i.test(jobUrl);
    if (!workspace && !posting && (!descriptionNode || !knownJobPath)) return null;

    const title = text(workspace?.title || posting?.title || posting?.name || read(root,
      '[data-automation-id="jobPostingHeader"], [data-testid="job-title"], [itemprop="title"], .posting-headline h2, .job-title, h1', 200), 200);
    const postingCompany = typeof posting?.hiringOrganization === 'string' ? posting.hiringOrganization : posting?.hiringOrganization?.name;
    const kekaCompany = keka && current.hostname.split('.')[0].replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
    const workspaceCompany = portal && first(root, 'main h1')?.previousElementSibling?.querySelector('span')?.textContent;
    const company = text(workspace?.company || postingCompany || read(root,
      '[itemprop="hiringOrganization"] [itemprop="name"], [data-testid="company-name"], [data-automation-id="companyName"], .company-name, .job-company, .topcard__org-name-link, .jobs-unified-top-card__company-name, [property="og:site_name"]', 200) || workspaceCompany || kekaCompany, 200);
    const markup = workspace?.descriptionHtml || posting?.description || descriptionNode?.innerHTML || '';
    const template = safeHtml(markup);
    const descriptionHtml = template.innerHTML.slice(0, 120_000);
    for (const element of template.content.querySelectorAll('br, p, li, h1, h2, h3, h4, div, section')) element.after('\n');
    const description = text(workspace?.description || template.content.textContent || descriptionNode?.innerText, 60_000);
    if (!title || !company || description.length < 30 || /^(careers?|open positions?|job search|all jobs|open roles|job opportunities)$/i.test(title)) return null;

    const apply = [...root.querySelectorAll('a[href]')].find(link => /^(apply(?:\s+(?:now|for\s+(?:this\s+)?(?:job|role|position)))?|submit application)\b/i
      .test((link.innerText || link.getAttribute('aria-label') || link.textContent || '').trim()));
    const canonical = url(posting?.url || first(root, 'link[rel="canonical"]')?.getAttribute('href'), jobUrl);
    const onSameSite = canonical && new URL(canonical).origin === current.origin;
    const postingParam = [...current.searchParams.keys()].some(key => /^(?:gh_jid|jobId|job_id|jk|postingId)$/i.test(key));
    return {
      title, company, description, descriptionHtml,
      jobUrl: keka?.details || (workspace || postingParam || !onSameSite || /^(?:\/|\/(?:careers?|jobs?|openings?)\/?)$/i.test(new URL(canonical).pathname) ? jobUrl : canonical),
      applicationUrl: keka?.application || url(workspace?.applicationUrl || posting?.applicationUrl || apply?.getAttribute('href'), jobUrl),
      location: text(workspace?.location || formatLocations(posting?.jobLocation) || read(root,
        '[itemprop="jobLocation"], [data-automation-id="locations"], [data-automation-id="jobPostingLocation"], [data-testid="job-location"], .job-location, .posting-categories .location, .ki-location + span', 200), 200),
      department: text(workspace?.department || posting?.occupationalCategory || read(root, '[data-testid="job-department"], .job-department, .posting-categories .department', 100), 100),
      employmentType: text(workspace?.employmentType || [posting?.employmentType].flat().filter(Boolean).join(', ') || read(root,
        '[itemprop="employmentType"], [data-automation-id="time"], [data-testid="employment-type"], .employment-type, .posting-categories .commitment, .ki-briefcase + span', 100), 100),
      compensation: workspace?.compensation ?? posting?.baseSalary ?? (read(root, '[itemprop="baseSalary"], [data-testid="job-salary"], .salary-range, .job-salary', 500) || null),
      arrangements: workspace?.arrangements ?? (text(posting?.jobLocationType, 100) || null),
      externalId: text(String(workspace?.externalId || keka?.id || posting?.identifier?.value || (typeof posting?.identifier === 'string' ? posting.identifier : '')), 200),
      postedAt: text(workspace?.postedAt || posting?.datePosted || first(root, 'time[itemprop="datePosted"]')?.dateTime, 50),
      closesAt: text(workspace?.closesAt || posting?.validThrough, 50),
      portalSource: text(workspace?.portalSource || current.hostname, 100),
    };
  }

  globalThis.NextkinJobCapture = { read: jobFromDom, kekaPosting };
})();
