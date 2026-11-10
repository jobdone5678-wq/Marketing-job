(function(root){
  'use strict';
  root.NextkinAdapters = root.NextkinAdapters || [];
  root.NextkinAdapters.push({
    id: 'ashby',
    matches: host => /(^|\.)ashbyhq\.com$/i.test(host),
    hint: el => {
      const name = el.getAttribute('name') || '';
      if (name === '_systemfield_name') return 'name';
      if (name === '_systemfield_email') return 'email';
      if (name === '_systemfield_location') return 'location';
      if (name === '_systemfield_phone') return 'phone';
      if (/urls\[([^\]]+)\]/i.test(name)) return RegExp.$1.toLowerCase();
      return el.getAttribute('data-testid') || '';
    }
  });
})(globalThis);
