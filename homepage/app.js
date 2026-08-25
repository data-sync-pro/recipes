

const DSP_isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

window.SubmissionLimiter = (() => {
  const KEY = 'dsp.submitTs.v1';
  const MAX = 3;
  const WINDOW_MS = 24 * 60 * 60 * 1000; 

  const read = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(n => typeof n === 'number') : [];
    } catch { return []; }
  };
  const write = (arr) => {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch {}
  };
  const recent = () => {
    const cutoff = Date.now() - WINDOW_MS;
    return read().filter(ts => ts >= cutoff);
  };

  return {
    
    remaining() { return Math.max(0, MAX - recent().length); },
    
    isBlocked() { return this.remaining() <= 0; },
    
    msUntilReset() {
      const r = recent();
      if (r.length < MAX) return 0;
      return Math.max(0, (Math.min(...r) + WINDOW_MS) - Date.now());
    },
    
    resetLabel() {
      const ms = this.msUntilReset();
      if (ms <= 0) return 'shortly';
      const hours = Math.ceil(ms / (60 * 60 * 1000));
      if (hours >= 2) return `in about ${hours} hours`;
      const minutes = Math.max(1, Math.ceil(ms / (60 * 1000)));
      return `in about ${minutes} minute${minutes === 1 ? '' : 's'}`;
    },
    
    record() {
      const next = [...recent(), Date.now()];
      write(next);
    },
    MAX, WINDOW_MS,
  };
})();

(() => {
  const tick = () => {
    document.querySelectorAll('input[name="captcha_settings"]').forEach(inp => {
      try {
        const obj = JSON.parse(inp.value);
        obj.ts = String(Date.now());
        inp.value = JSON.stringify(obj);
      } catch {  }
    });
  };
  setInterval(tick, 500);
  tick(); 
})();

window.DSP_loadRecaptcha = (() => {
  let started = false;
  return () => {
    if (started) return;
    started = true;
    const sc = document.createElement('script');
    sc.src = 'https://www.google.com/recaptcha/api.js';
    sc.async = true;
    sc.defer = true;
    document.head.appendChild(sc);
  };
})();

(() => {
  const modal = document.getElementById('plan-config');
  if (!modal) return;
  const form = document.getElementById('plan-config-form');
  const planLabel = document.getElementById('pcm-plan-label');
  const planHidden = document.getElementById('pcm-hidden-plan');
  const orgCountHidden = document.getElementById('pcm-hidden-orgcount');
  const connHidden = document.getElementById('pcm-hidden-conn');
  const execHidden = document.getElementById('pcm-hidden-exec');
  const successPlanHidden = document.getElementById('pcm-hidden-successplan');
  const detailsHidden = document.getElementById('pcm-hidden-orgdetails');
  const licenseInfoHidden = document.getElementById('pcm-hidden-licenseinfo');
  const orgsHost = document.getElementById('pcm-orgs');
  const orgCountLabel = document.getElementById('pcm-org-count');
  const totalConnEl = document.getElementById('pcm-total-conn');
  const totalExecEl = document.getElementById('pcm-total-exec');
  const tpl = document.getElementById('pcm-org-template');
  const successEl = document.getElementById('pcm-success');
  const trap = form.querySelector('#pcm-trap');
  let lastFocus = null;

  

  

  const PLAN_DEFAULTS = {
    Growth:     { conn: 1, exec: 100, batch: '20k' },
    Business:   { conn: 5, exec: 200, batch: '20k' },
    Enterprise: { conn: 7, exec: 500, batch: 'Unlimited' },
  };
  const setPlan = (plan) => {
    if (!plan) return;
    const prevPlan = planHidden.value;
    planHidden.value = plan;
    planLabel.textContent = plan;
    modal.querySelectorAll('[data-pcm-plan]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.pcmPlan === plan);
    });

    
    const firstRow = orgsHost && orgsHost.querySelector('.pcm-org');
    const def = PLAN_DEFAULTS[plan];
    const prev = PLAN_DEFAULTS[prevPlan];
    if (firstRow && def) {
      const apply = (sel, key, isNum = true) => {
        const inp = firstRow.querySelector(sel);
        if (!inp) return;
        const cur = isNum ? Number(inp.value) : inp.value;
        const prevDef = prev && prev[key];
        const isEmpty = isNum ? !cur : !cur;
        if (!prevPlan || isEmpty || cur === prevDef) {
          inp.value = def[key];
        }
      };
      apply('[data-org-field="conn"]',  'conn',  true);
      apply('[data-org-field="exec"]',  'exec',  true);
      apply('[data-org-field="batch"]', 'batch', false);
      recalcTotals();
    }
  };
  modal.querySelectorAll('[data-pcm-plan]').forEach(btn => {
    btn.addEventListener('click', () => setPlan(btn.dataset.pcmPlan));
  });

  
  
  const setSuccessPlan = (plan) => {
    if (!plan) return;
    successPlanHidden.value = plan;
    modal.querySelectorAll('[data-pcm-success]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.pcmSuccess === plan);
    });
  };
  modal.querySelectorAll('[data-pcm-success]').forEach(btn => {
    btn.addEventListener('click', () => setSuccessPlan(btn.dataset.pcmSuccess));
  });

  const renumberOrgs = () => {
    const rows = orgsHost.querySelectorAll('.pcm-org');
    rows.forEach((row, i) => {
      const n = row.querySelector('.pcm-org-n');
      if (n) n.textContent = i + 1;
      row.classList.toggle('is-only', rows.length === 1);

      const nameLabel = row.querySelector('.pcm-org-name label');
      if (nameLabel) nameLabel.textContent = i === 0 ? 'Production org name' : 'Sandbox org name';
    });
    orgCountLabel.textContent = rows.length + (rows.length === 1 ? ' org' : ' orgs');
    recalcTotals();
  };

  const recalcTotals = () => {
    let conn = 0, exec = 0;
    orgsHost.querySelectorAll('.pcm-org').forEach(row => {
      conn += Number(row.querySelector('[data-org-field="conn"]').value) || 0;
      exec += Number(row.querySelector('[data-org-field="exec"]').value) || 0;
    });
    totalConnEl.textContent = conn;
    totalExecEl.textContent = exec;
  };

  
  
  const roundExecUp = (inp) => {
    const n = Number(inp.value);
    if (!Number.isFinite(n) || n <= 0) return;   
    const stepped = Math.ceil(n / 100) * 100;
    const clamped = Math.min(Math.max(stepped, 100), 2000);
    if (clamped !== n) {
      inp.value = clamped;
      recalcTotals();
    }
  };

  const addOrgRow = (focus = true) => {
    const clone = tpl.content.firstElementChild.cloneNode(true);
    orgsHost.appendChild(clone);
    const nameInp = clone.querySelector('[data-org-field="name"]');
    clone.querySelector('.pcm-org-remove').addEventListener('click', () => {
      if (orgsHost.querySelectorAll('.pcm-org').length <= 1) return;
      clone.remove();
      renumberOrgs();
    });
    clone.querySelectorAll('[data-org-field="conn"], [data-org-field="exec"]').forEach(inp => {
      inp.addEventListener('input', recalcTotals);
    });
    
    const execInp = clone.querySelector('[data-org-field="exec"]');
    if (execInp) execInp.addEventListener('blur', () => roundExecUp(execInp));
    renumberOrgs();
    if (focus && nameInp) {
      nameInp.focus();
      
      if (nameInp.value) nameInp.select();
    }
  };
  document.getElementById('pcm-add-org').addEventListener('click', () => addOrgRow(true));

  const open = (plan) => {
    if (orgsHost.children.length === 0) addOrgRow(false);
    setPlan(plan || planHidden.value || 'Business');
    setSuccessPlan(successPlanHidden.value || 'Standard');
    lastFocus = document.activeElement;
    if (window.DSP_loadRecaptcha) window.DSP_loadRecaptcha();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    
    setTimeout(() => {
      const first = document.getElementById('pcm-first');
      if (first) first.focus();
    }, 80);
  };
  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };

  document.querySelectorAll('a[data-plan]').forEach(a => {
    a.addEventListener('click', (e) => {
      
      if (!a.getAttribute('href') || !a.getAttribute('href').startsWith('#plan-config')) return;
      e.preventDefault();
      open(a.dataset.plan);
    });
  });

  modal.querySelectorAll('[data-pcm-dismiss]').forEach(el => {
    el.addEventListener('click', close);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  
  
  const PERSONAL_EMAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com',
    'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'yahoo.ca', 'yahoo.fr', 'yahoo.de', 'ymail.com', 'rocketmail.com',
    'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de',
    'outlook.com', 'outlook.co.uk', 'live.com', 'msn.com',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com',
    'protonmail.com', 'proton.me', 'pm.me',
    'gmx.com', 'gmx.net', 'gmx.de',
    'mail.com', 'mail.ru',
    'zoho.com',
    'yandex.com', 'yandex.ru',
    'qq.com', '163.com', '126.com', 'sina.com', 'sohu.com',
    'naver.com', 'daum.net',
    'hey.com',
    'fastmail.com', 'tutanota.com', 'tutamail.com',
    'inbox.com', 'rediffmail.com',
  ]);
  const emailInp = document.getElementById('pcm-email');
  const emailErr = form.querySelector('[data-error-for="pcm-email"]');
  const isPersonalEmail = (value) => {
    if (!value) return false;
    const at = value.lastIndexOf('@');
    if (at < 0) return false;
    const domain = value.slice(at + 1).trim().toLowerCase();
    return PERSONAL_EMAIL_DOMAINS.has(domain);
  };
  const setEmailError = (msg) => {
    if (!emailInp) return;
    if (msg) {
      emailInp.setAttribute('aria-invalid', 'true');
      if (emailErr) { emailErr.textContent = msg; emailErr.hidden = false; }
    } else {
      emailInp.removeAttribute('aria-invalid');
      if (emailErr) emailErr.hidden = true;
    }
  };
  if (emailInp) {
    emailInp.addEventListener('blur', () => {
      const v = emailInp.value.trim();
      if (v && !DSP_isValidEmail(v)) {
        setEmailError("Please enter a valid email address.");
      } else if (v && isPersonalEmail(v)) {
        setEmailError("Please use your work email — personal addresses (Gmail, Yahoo, Outlook, etc.) aren't accepted for plan requests.");
      } else {
        setEmailError('');
      }
    });
    emailInp.addEventListener('input', () => {
      
      if (emailInp.getAttribute('aria-invalid') === 'true') setEmailError('');
    });
  }

  
  const rateLimitEl = document.getElementById('pcm-rate-limit');
  const showRateLimit = () => {
    if (!rateLimitEl || !window.SubmissionLimiter) return false;
    if (window.SubmissionLimiter.isBlocked()) {
      const reset = window.SubmissionLimiter.resetLabel();
      rateLimitEl.innerHTML = `<b>Submission limit reached.</b> You've already sent ${window.SubmissionLimiter.MAX} requests from this browser today — try again ${reset}. If this is urgent, email <a href="mailto:hello@datasyncpro.io">hello@datasyncpro.io</a>.`;
      rateLimitEl.hidden = false;
      return true;
    }
    rateLimitEl.hidden = true;
    return false;
  };

  const _openObserver = new MutationObserver(() => {
    if (!modal.hidden) showRateLimit();
  });
  _openObserver.observe(modal, { attributes: true, attributeFilter: ['hidden'] });

  
  
  const submitBtn = form.querySelector('button[type="submit"]');

  const captchaSolved = () => {
    const t = form.querySelector('[name="g-recaptcha-response"]');
    return !!(t && t.value);
  };
  const isFormValid = () => {
    for (const el of form.querySelectorAll('[required]')) {
      if (!el.value || !String(el.value).trim()) return false;
      if (el.type === 'url' && !el.checkValidity()) return false;
    }
    if (emailInp) {
      const v = emailInp.value.trim();
      if (!DSP_isValidEmail(v) || isPersonalEmail(v)) return false;
    }
    if (!captchaSolved()) return false;
    return true;
  };
  const refreshSubmit = () => { if (submitBtn) submitBtn.disabled = !isFormValid(); };
  form.addEventListener('input', refreshSubmit);
  form.addEventListener('change', refreshSubmit);

  
  window.DSP_pcmCaptchaChange = refreshSubmit;
  refreshSubmit();

  form.addEventListener('submit', (e) => {
    if (trap && trap.value) { e.preventDefault(); return; }

    if (showRateLimit()) {
      e.preventDefault();
      return;
    }

    
    if (emailInp && emailInp.value.trim() && !DSP_isValidEmail(emailInp.value.trim())) {
      e.preventDefault();
      setEmailError("Please enter a valid email address.");
      emailInp.focus();
      return;
    }
    if (emailInp && isPersonalEmail(emailInp.value.trim())) {
      e.preventDefault();
      setEmailError("Please use your work email — personal addresses (Gmail, Yahoo, Outlook, etc.) aren't accepted for plan requests.");
      emailInp.focus();
      return;
    }

    const required = form.querySelectorAll('input[required], select[required]');
    let ok = true;
    required.forEach(el => {
      if (!el.value || !String(el.value).trim()) {
        el.setAttribute('aria-invalid', 'true');
        ok = false;
      } else {
        el.removeAttribute('aria-invalid');
      }
    });
    if (!ok) {
      e.preventDefault();
      const firstBad = form.querySelector('[aria-invalid="true"]');
      if (firstBad) firstBad.focus();
      return;
    }

    
    
    if (!captchaSolved()) {
      e.preventDefault();
      return;
    }

    const orgs = [...orgsHost.querySelectorAll('.pcm-org')].map(row => ({
      name: row.querySelector('[data-org-field="name"]').value.trim(),
      connections: Number(row.querySelector('[data-org-field="conn"]').value) || 0,
      executables: Number(row.querySelector('[data-org-field="exec"]').value) || 0,
      dailyBatchLimit: row.querySelector('[data-org-field="batch"]').value,
    }));
    const totalConn = orgs.reduce((s, o) => s + o.connections, 0);
    const totalExec = orgs.reduce((s, o) => s + o.executables, 0);
    orgCountHidden.value = orgs.length;
    connHidden.value = totalConn;
    execHidden.value = totalExec;

    if (detailsHidden) {
      detailsHidden.value = orgs.map((o, i) =>
        `Org ${i+1}: ${o.name} — ${o.connections} connection(s), ${o.executables} executable(s), ${o.dailyBatchLimit} daily batch`
      ).join('\n');
    }

    
    
    if (licenseInfoHidden) {
      licenseInfoHidden.value = JSON.stringify(
        orgs.map(o => ({ ...o, successPlan: successPlanHidden.value }))
      );
    }

    setTimeout(() => {
      if (window.SubmissionLimiter) window.SubmissionLimiter.record();
      form.hidden = true;
      successEl.hidden = false;
    }, 50);
  });
})();

(() => {
  const modal   = document.getElementById('demo-request');
  if (!modal) return;
  const form    = document.getElementById('demo-request-form');
  const success = document.getElementById('drm-success');
  const trap    = form.querySelector('#drm-trap');
  const emailInp = document.getElementById('drm-email');
  const emailErr = form.querySelector('[data-error-for="drm-email"]');
  let lastFocus = null;

  
  const PERSONAL_EMAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com',
    'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'yahoo.ca', 'yahoo.fr', 'yahoo.de', 'ymail.com', 'rocketmail.com',
    'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de',
    'outlook.com', 'outlook.co.uk', 'live.com', 'msn.com',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com',
    'protonmail.com', 'proton.me', 'pm.me',
    'gmx.com', 'gmx.net', 'gmx.de',
    'mail.com', 'mail.ru',
    'zoho.com',
    'yandex.com', 'yandex.ru',
    'qq.com', '163.com', '126.com', 'sina.com', 'sohu.com',
    'naver.com', 'daum.net',
    'hey.com',
    'fastmail.com', 'tutanota.com', 'tutamail.com',
    'inbox.com', 'rediffmail.com',
  ]);
  const isPersonalEmail = (value) => {
    if (!value) return false;
    const at = value.lastIndexOf('@');
    if (at < 0) return false;
    return PERSONAL_EMAIL_DOMAINS.has(value.slice(at + 1).trim().toLowerCase());
  };
  const setEmailError = (msg) => {
    if (!emailInp) return;
    if (msg) {
      emailInp.setAttribute('aria-invalid', 'true');
      if (emailErr) { emailErr.textContent = msg; emailErr.hidden = false; }
    } else {
      emailInp.removeAttribute('aria-invalid');
      if (emailErr) emailErr.hidden = true;
    }
  };
  if (emailInp) {
    emailInp.addEventListener('blur', () => {
      const v = emailInp.value.trim();
      if (v && !DSP_isValidEmail(v)) {
        setEmailError("Please enter a valid email address.");
      } else if (v && isPersonalEmail(v)) {
        setEmailError("Please use your work email — personal addresses (Gmail, Yahoo, Outlook, etc.) aren't accepted for demo requests.");
      } else {
        setEmailError('');
      }
    });
    emailInp.addEventListener('input', () => {
      if (emailInp.getAttribute('aria-invalid') === 'true') setEmailError('');
    });
  }

  const open = () => {
    lastFocus = document.activeElement;
    if (window.DSP_loadRecaptcha) window.DSP_loadRecaptcha();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const first = document.getElementById('drm-first');
      if (first) first.focus();
    }, 80);
  };
  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };

  document.querySelectorAll('[data-open-demo]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      open();
    });
  });

  modal.querySelectorAll('[data-drm-dismiss]').forEach(el => {
    el.addEventListener('click', close);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  
  const rateLimitEl = document.getElementById('drm-rate-limit');
  const showRateLimit = () => {
    if (!rateLimitEl || !window.SubmissionLimiter) return false;
    if (window.SubmissionLimiter.isBlocked()) {
      const reset = window.SubmissionLimiter.resetLabel();
      rateLimitEl.innerHTML = `<b>Submission limit reached.</b> You've already sent ${window.SubmissionLimiter.MAX} requests from this browser today — try again ${reset}. If this is urgent, email <a href="mailto:hello@datasyncpro.io">hello@datasyncpro.io</a>.`;
      rateLimitEl.hidden = false;
      return true;
    }
    rateLimitEl.hidden = true;
    return false;
  };
  
  const _drmOpenObserver = new MutationObserver(() => {
    if (!modal.hidden) showRateLimit();
  });
  _drmOpenObserver.observe(modal, { attributes: true, attributeFilter: ['hidden'] });

  
  
  const submitBtn = form.querySelector('button[type="submit"]');

  const captchaSolved = () => {
    const t = form.querySelector('[name="g-recaptcha-response"]');
    return !!(t && t.value);
  };
  const isFormValid = () => {
    for (const el of form.querySelectorAll('[required]')) {
      if (!el.value || !String(el.value).trim()) return false;
      if (el.type === 'url' && !el.checkValidity()) return false;
    }
    if (emailInp) {
      const v = emailInp.value.trim();
      if (!DSP_isValidEmail(v) || isPersonalEmail(v)) return false;
    }
    if (!captchaSolved()) return false;
    return true;
  };
  const refreshSubmit = () => { if (submitBtn) submitBtn.disabled = !isFormValid(); };
  form.addEventListener('input', refreshSubmit);
  form.addEventListener('change', refreshSubmit);

  
  window.DSP_drmCaptchaChange = refreshSubmit;
  refreshSubmit();

  form.addEventListener('submit', (e) => {
    if (trap && trap.value) { e.preventDefault(); return; }

    if (showRateLimit()) {
      e.preventDefault();
      return;
    }

    if (emailInp && emailInp.value.trim() && !DSP_isValidEmail(emailInp.value.trim())) {
      e.preventDefault();
      setEmailError("Please enter a valid email address.");
      emailInp.focus();
      return;
    }
    if (emailInp && isPersonalEmail(emailInp.value.trim())) {
      e.preventDefault();
      setEmailError("Please use your work email — personal addresses (Gmail, Yahoo, Outlook, etc.) aren't accepted for demo requests.");
      emailInp.focus();
      return;
    }

    const required = form.querySelectorAll('input[required], select[required]');
    let ok = true;
    required.forEach(el => {
      if (!el.value || !String(el.value).trim()) {
        el.setAttribute('aria-invalid', 'true');
        ok = false;
      } else {
        el.removeAttribute('aria-invalid');
      }
    });
    if (!ok) {
      e.preventDefault();
      const firstBad = form.querySelector('[aria-invalid="true"]');
      if (firstBad) firstBad.focus();
      return;
    }

    
    
    if (!captchaSolved()) {
      e.preventDefault();
      return;
    }

    

    
    setTimeout(() => {
      if (window.SubmissionLimiter) window.SubmissionLimiter.record();
      form.hidden = true;
      if (success) success.hidden = false;
    }, 50);
  });
})();

(() => {
  const modal   = document.getElementById('partner-request');
  if (!modal) return;
  const form    = document.getElementById('partner-request-form');
  const success = document.getElementById('prm-success');
  const trap    = form.querySelector('#prm-trap');
  const emailInp = document.getElementById('prm-email');
  const emailErr = form.querySelector('[data-error-for="prm-email"]');
  const websiteInp = document.getElementById('prm-website');
  let lastFocus = null;

  
  const PERSONAL_EMAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com',
    'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'yahoo.ca', 'yahoo.fr', 'yahoo.de', 'ymail.com', 'rocketmail.com',
    'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de',
    'outlook.com', 'outlook.co.uk', 'live.com', 'msn.com',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com',
    'protonmail.com', 'proton.me', 'pm.me',
    'gmx.com', 'gmx.net', 'gmx.de',
    'mail.com', 'mail.ru',
    'zoho.com',
    'yandex.com', 'yandex.ru',
    'qq.com', '163.com', '126.com', 'sina.com', 'sohu.com',
    'naver.com', 'daum.net',
    'hey.com',
    'fastmail.com', 'tutanota.com', 'tutamail.com',
    'inbox.com', 'rediffmail.com',
  ]);
  const isPersonalEmail = (value) => {
    if (!value) return false;
    const at = value.lastIndexOf('@');
    if (at < 0) return false;
    return PERSONAL_EMAIL_DOMAINS.has(value.slice(at + 1).trim().toLowerCase());
  };
  const setEmailError = (msg) => {
    if (!emailInp) return;
    if (msg) {
      emailInp.setAttribute('aria-invalid', 'true');
      if (emailErr) { emailErr.textContent = msg; emailErr.hidden = false; }
    } else {
      emailInp.removeAttribute('aria-invalid');
      if (emailErr) emailErr.hidden = true;
    }
  };
  if (emailInp) {
    emailInp.addEventListener('blur', () => {
      const v = emailInp.value.trim();
      if (v && !DSP_isValidEmail(v)) {
        setEmailError("Please enter a valid email address.");
      } else {
        setEmailError('');
      }
    });
    emailInp.addEventListener('input', () => {
      if (emailInp.getAttribute('aria-invalid') === 'true') setEmailError('');
    });
  }

  

  
  const normalizeWebsite = () => {
    if (!websiteInp) return true;
    const v = websiteInp.value.trim();
    if (!v) return true;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : 'https://' + v;
    if (withScheme !== websiteInp.value) websiteInp.value = withScheme;
    return !websiteInp.validity.typeMismatch;
  };
  if (websiteInp) {
    websiteInp.addEventListener('blur', () => {
      normalizeWebsite();
      
      refreshSubmit();
    });
  }

  const open = () => {
    lastFocus = document.activeElement;
    if (window.DSP_loadRecaptcha) window.DSP_loadRecaptcha();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const first = document.getElementById('prm-first');
      if (first) first.focus();
    }, 80);
  };
  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };

  document.querySelectorAll('[data-open-partner]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      open();
    });
  });

  modal.querySelectorAll('[data-prm-dismiss]').forEach(el => {
    el.addEventListener('click', close);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  const rateLimitEl = document.getElementById('prm-rate-limit');
  const showRateLimit = () => {
    if (!rateLimitEl || !window.SubmissionLimiter) return false;
    if (window.SubmissionLimiter.isBlocked()) {
      const reset = window.SubmissionLimiter.resetLabel();
      rateLimitEl.innerHTML = `<b>Submission limit reached.</b> You've already sent ${window.SubmissionLimiter.MAX} requests from this browser today — try again ${reset}. If this is urgent, email <a href="mailto:hello@datasyncpro.io">hello@datasyncpro.io</a>.`;
      rateLimitEl.hidden = false;
      return true;
    }
    rateLimitEl.hidden = true;
    return false;
  };
  
  const _prmOpenObserver = new MutationObserver(() => {
    if (!modal.hidden) showRateLimit();
  });
  _prmOpenObserver.observe(modal, { attributes: true, attributeFilter: ['hidden'] });

  

  const submitBtn = form.querySelector('button[type="submit"]');

  const captchaSolved = () => {
    const t = form.querySelector('[name="g-recaptcha-response"]');
    return !!(t && t.value);
  };
  const isFormValid = () => {
    for (const el of form.querySelectorAll('[required]')) {
      if (!el.value || !String(el.value).trim()) return false;
      if (el.type === 'url' && !el.checkValidity()) return false;
    }
    if (emailInp && !DSP_isValidEmail(emailInp.value.trim())) return false;
    if (!captchaSolved()) return false;
    return true;
  };
  const refreshSubmit = () => { if (submitBtn) submitBtn.disabled = !isFormValid(); };
  form.addEventListener('input', refreshSubmit);
  form.addEventListener('change', refreshSubmit);

  
  window.DSP_prmCaptchaChange = refreshSubmit;
  refreshSubmit();

  form.addEventListener('submit', (e) => {
    if (trap && trap.value) { e.preventDefault(); return; }

    if (showRateLimit()) {
      e.preventDefault();
      return;
    }

    
    if (emailInp && emailInp.value.trim() && !DSP_isValidEmail(emailInp.value.trim())) {
      e.preventDefault();
      setEmailError("Please enter a valid email address.");
      emailInp.focus();
      return;
    }

    
    if (websiteInp && websiteInp.value.trim() && !normalizeWebsite()) {
      e.preventDefault();
      websiteInp.focus();
      return;
    }

    const required = form.querySelectorAll('input[required], select[required], textarea[required]');
    let ok = true;
    required.forEach(el => {
      if (!el.value || !String(el.value).trim()) {
        el.setAttribute('aria-invalid', 'true');
        ok = false;
      } else {
        el.removeAttribute('aria-invalid');
      }
    });
    if (!ok) {
      e.preventDefault();
      const firstBad = form.querySelector('[aria-invalid="true"]');
      if (firstBad) firstBad.focus();
      return;
    }

    
    
    if (!captchaSolved()) {
      e.preventDefault();
      return;
    }

    

    

    setTimeout(() => {
      if (window.SubmissionLimiter) window.SubmissionLimiter.record();
      form.hidden = true;
      if (success) success.hidden = false;
    }, 50);
  });
})();

(() => {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const onScroll = () => {
    if (window.scrollY > 8) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
})();

const DSP_SECTION_ROUTES = {
  '/surfaces':  'surfaces',
  '/why-dsp':  'shift',
  '/security': 'security',
  '/pricing':  'pricing',
};

(() => {
  const links = Array.from(document.querySelectorAll('#nav .nav-links a'))
    .filter(a => DSP_SECTION_ROUTES[a.getAttribute('href')]);
  if (!links.length || !('IntersectionObserver' in window)) return;

  const linkById = new Map();
  links.forEach(a => {
    const id = DSP_SECTION_ROUTES[a.getAttribute('href')];
    if (id) linkById.set(id, a);
  });

  

  const sectionToLink = new Map();
  const register = (sectionId, linkId) => {
    const el = document.getElementById(sectionId);
    const link = linkById.get(linkId);
    if (el && link) sectionToLink.set(el, link);
  };
  linkById.forEach((link, id) => register(id, id));
  ['anatomy', 'engine', 'numbers'].forEach(id => register(id, 'shift'));
  if (!sectionToLink.size) return;

  const visible = new Map(); 
  const setActive = () => {
    
    let bestEl = null;
    let bestRatio = 0;
    for (const [el, ratio] of visible) {
      if (ratio > bestRatio) { bestRatio = ratio; bestEl = el; }
    }
    links.forEach(a => a.classList.remove('active'));
    if (bestEl && sectionToLink.has(bestEl)) {
      sectionToLink.get(bestEl).classList.add('active');
    }
  };

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) visible.set(e.target, e.intersectionRatio);
      else visible.delete(e.target);
    });
    setActive();
  }, {

    rootMargin: '-25% 0px -65% 0px',
    threshold: [0, 0.01, 0.1, 0.25, 0.5, 1]
  });

  sectionToLink.forEach((link, el) => io.observe(el));
})();

(() => {
  const scrollToId = (id, behavior) => {
    const el = document.getElementById(id);
    if (!el) return;
    const nav = document.getElementById('nav');
    const navH = nav ? nav.offsetHeight : 0;
    const y = el.getBoundingClientRect().top + window.scrollY - navH - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: behavior || 'smooth' });
  };

  document.addEventListener('click', (e) => {
    const a = e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    const path = a.getAttribute('href');
    const id = path && DSP_SECTION_ROUTES[path];
    if (!id) return;
    
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey ||
        e.shiftKey || e.altKey || a.target === '_blank') return;
    e.preventDefault();
    scrollToId(id, 'smooth');
    if (history.pushState && location.pathname !== path) {
      history.pushState(null, '', path);
    }
  });

  if (DSP_SECTION_ROUTES[location.pathname]) {
    requestAnimationFrame(() => scrollToId(DSP_SECTION_ROUTES[location.pathname], 'auto'));
  }

  window.addEventListener('popstate', () => {
    const id = DSP_SECTION_ROUTES[location.pathname];
    if (id) scrollToId(id, 'smooth');
    else if (location.pathname === '/' || location.pathname === '/index.html') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
})();

(() => {
  const onHomepage = () =>
    location.pathname === '/' ||
    location.pathname === '/index.html' ||
    Object.prototype.hasOwnProperty.call(DSP_SECTION_ROUTES, location.pathname) ||
    /^\/surfaces\//.test(location.pathname); 
  document.querySelectorAll('a.brand-mark').forEach(a => {
    a.addEventListener('click', (e) => {
      if (!onHomepage()) return; 
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (history.replaceState) history.replaceState(null, '', '/');
    });
  });
})();

(() => {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    els.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach(el => {

    
    if (el.getBoundingClientRect().top < window.innerHeight) {
      el.classList.add('in');
    } else {
      io.observe(el);
    }
  });
})();

(() => {
  const buttons = document.querySelectorAll('.stage-btn');
  const rows = document.querySelectorAll('#anatomyRows .exec-row');
  const note = document.getElementById('stageNote');
  if (!buttons.length || !rows.length) return;

  const notes = {
    event: 'The trigger event is the input — a list of records from a DML operation.',
    scope: 'Scoping refines the input — filter rows, or join with another data set.',
    match: 'Match identifies the target records to act on — by field, formula, or duplicate rule.',
    map:   'Mapping transforms field values — pick from 180+ functions, or extend with Apex.',
    action:'Insert, Update, Upsert, Delete, Merge, Lead Convert, Approval, Notify, Publish, and more.'
  };
  const order = ['event','scope','match','map','action'];

  function setStage(key) {
    buttons.forEach(b => {
      const on = b.dataset.stage === key;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const activeIdx = order.indexOf(key);
    rows.forEach(r => {
      const rIdx = order.indexOf(r.dataset.row);
      r.classList.remove('dim', 'lit');
      if (rIdx === activeIdx) r.classList.add('lit');
      else if (rIdx > activeIdx) r.classList.add('dim');
    });
    if (note) {
      note.innerHTML = `<span class="dot"></span>${notes[key]}`;
    }
  }

  buttons.forEach(b => b.addEventListener('click', () => setStage(b.dataset.stage)));

  const card = document.getElementById('anatomyCard');
  if (card && 'IntersectionObserver' in window) {
    let started = false;
    const io2 = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting && !started) {
          started = true;
          let i = 0;
          const tick = () => {
            setStage(order[i]);
            i++;
            if (i < order.length) setTimeout(tick, 2000);
          };
          setTimeout(tick, 350);
          io2.disconnect();
        }
      });
    }, { threshold: 0.4 });
    io2.observe(card);
  }
})();

(() => {
  const cats = document.querySelectorAll('#fnCats .fc');
  const chips = document.querySelectorAll('#fnGrid .chip');
  if (!cats.length) return;
  const mobile = matchMedia('(max-width: 640px)');
  const moreLabel = document.querySelector('#fnGrid .chip.more span');
  const baseMore = moreLabel ? parseInt((moreLabel.textContent.match(/\d+/) || [150])[0], 10) : 150;
  const featuredTotal = [...chips].filter(ch => ch.dataset.featured === '1').length;
  let lastCat = 'all';
  function applyFilter(cat) {
    lastCat = cat;
    const grid = document.getElementById('fnGrid');
    if (grid) grid.classList.toggle('view-all', cat === 'all');
    const cap = mobile.matches ? 10 : Infinity;
    let shown = 0;
    chips.forEach(ch => {
      const isMore = ch.classList.contains('more');
      let show;
      if (cat === 'all') {

        show = ch.dataset.featured === '1' || isMore;
      } else {

        show = !isMore && ch.dataset.cat === cat;
      }
      if (show && !isMore) {
        if (shown >= cap) show = false;
        else shown++;
      }
      ch.style.display = show ? '' : 'none';
    });
    if (cat === 'all' && moreLabel) {
      moreLabel.textContent = '+ ' + (baseMore + featuredTotal - shown) + ' more →';
    }
  }
  cats.forEach(c => {
    c.addEventListener('click', () => {
      cats.forEach(x => x.classList.remove('on'));
      c.classList.add('on');
      applyFilter(c.dataset.cat);
    });
  });
  (mobile.addEventListener ? mobile.addEventListener('change', () => applyFilter(lastCat)) : mobile.addListener(() => applyFilter(lastCat)));
  applyFilter('all');
})();

(() => {
  const tabs = document.querySelectorAll('#surfaceTabs .surface-tab');
  const panels = document.querySelectorAll('#surfacePanels .surface-panel');
  if (!tabs.length) return;
  const tabList = [...tabs];
  const subTabs = [...document.querySelectorAll('#surfaceSubbar .subbar-tab')];
  const counter = document.getElementById('snCount');
  const fin = document.getElementById('surfaceFin');
  const prev = document.getElementById('snPrev');
  const next = document.getElementById('snNext');

  function placeFin(tab) {
    if (!fin || !tab) return;
    const wrap = fin.parentElement;
    if (!wrap) return;
    const tabsEl = tab.closest('.surface-tabs') || tab.parentElement;
    const wbox = wrap.getBoundingClientRect();
    const box = tab.getBoundingClientRect();

    
    const gridBottom = tabsEl ? tabsEl.getBoundingClientRect().bottom : box.bottom;
    fin.style.left = (box.left - wbox.left) + 'px';
    fin.style.top = (gridBottom - wbox.top - 1) + 'px';
    fin.style.width = box.width + 'px';
  }

  
  
  function show(key, urlMode) {
    let active = null;
    tabs.forEach(t => {
      const on = t.dataset.panel === key;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) active = t;
    });
    panels.forEach(p => {
      p.classList.toggle('active', p.id === 'panel-' + key);
    });
    subTabs.forEach(t => {
      const on = t.dataset.panel === key;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (counter && active) {
      counter.textContent = active.dataset.num || String(tabList.indexOf(active) + 1).padStart(2, '0');
    }
    placeFin(active);
    
    const path = '/surfaces/' + key;
    if (urlMode === 'none') {  }
    else if (urlMode === 'push') {
      if (history.pushState && location.pathname !== path) history.pushState(null, '', path);
    } else if (history.replaceState) {
      history.replaceState(null, '', path);
    }
  }
  tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.panel)));

  function step(dir) {
    const cur = tabList.findIndex(t => t.classList.contains('active'));
    const nx = (cur + dir + tabList.length) % tabList.length;
    show(tabList[nx].dataset.panel);
  }
  prev && prev.addEventListener('click', () => step(-1));
  next && next.addEventListener('click', () => step(1));

  
  
  const PANEL_PATH = /^\/surfaces\/(batch|trigger|loader|ui|query)\/?$/;
  function scrollToSurfaces(behavior) {
    const surfacesEl = document.getElementById('surfaces');
    if (!surfacesEl) return;
    const nav = document.getElementById('nav');
    const navH = nav ? nav.offsetHeight : 0;
    const y = surfacesEl.getBoundingClientRect().top + window.scrollY - navH - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: behavior || 'auto' });
  }
  
  function applyPath(behavior) {
    const m = location.pathname.match(PANEL_PATH);
    if (!m) return;
    show(m[1], 'none');
    requestAnimationFrame(() => scrollToSurfaces(behavior));
  }
  applyPath('auto');
  window.addEventListener('popstate', () => applyPath('smooth'));

  
  
  document.addEventListener('click', (e) => {
    const a = e.target.closest ? e.target.closest('a[href^="/surfaces/"]') : null;
    if (!a) return;
    const m = a.getAttribute('href').match(PANEL_PATH);
    if (!m) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey ||
        e.shiftKey || e.altKey || a.target === '_blank') return;
    e.preventDefault();
    show(m[1], 'push');
    scrollToSurfaces('smooth');
  });

  const initial = tabList.find(t => t.classList.contains('active')) || tabList[0];
  window.addEventListener('load', () => placeFin(initial));
  window.addEventListener('resize', () => {
    const a = tabList.find(t => t.classList.contains('active')) || tabList[0];
    placeFin(a);
  });
  
  requestAnimationFrame(() => placeFin(initial));
  setTimeout(() => placeFin(tabList.find(t => t.classList.contains('active')) || tabList[0]), 250);

  const activeOrFirst = () => tabList.find(t => t.classList.contains('active')) || tabList[0];

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => placeFin(activeOrFirst()));
  }

  
  if (window.ResizeObserver) {
    const tabsEl = tabList[0] && (tabList[0].closest('.surface-tabs') || tabList[0].parentElement);
    if (tabsEl) new ResizeObserver(() => placeFin(activeOrFirst())).observe(tabsEl);
  }

  

  
  {
    const stripEl = tabList[0] && (tabList[0].closest('.surface-tabs') || tabList[0].parentElement);
    if (stripEl) {
      stripEl.addEventListener('transitionend', (e) => {
        if (e.propertyName === 'transform') placeFin(activeOrFirst());
      });
    }
    setTimeout(() => placeFin(activeOrFirst()), 900);
  }

  const surfacesSection = document.getElementById('surfaces');
  if (surfacesSection && 'IntersectionObserver' in window && !sessionStorage.getItem('dsp-surfaces-cycled')) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          io.disconnect();
          sessionStorage.setItem('dsp-surfaces-cycled', '1');
          const originalKey = (tabList.find(t => t.classList.contains('active')) || tabList[0]).dataset.panel;
          let i = 0;
          const cycle = () => {
            if (i >= tabList.length) {
              show(originalKey);
              tabList.forEach(t => t.classList.remove('is-cycling'));
              return;
            }
            tabList.forEach(t => t.classList.remove('is-cycling'));
            const tab = tabList[i];
            tab.classList.add('is-cycling');
            show(tab.dataset.panel);
            i++;
            setTimeout(cycle, 360);
          };
          setTimeout(cycle, 350);
        }
      });
    }, { threshold: 0.35 });
    io.observe(surfacesSection);
  }

  
  const subbar = document.getElementById('surfaceSubbar');
  const subSentinel = document.getElementById('subbarSentinel');
  const siteNav = document.getElementById('nav');
  if (subbar && subSentinel && 'IntersectionObserver' in window) {
    subTabs.forEach(t => t.addEventListener('click', () => {
      show(t.dataset.panel);

      
      
      requestAnimationFrame(() => {
        const navH = siteNav ? siteNav.offsetHeight : 0;
        const anchor = document.getElementById('surfacesSticky');
        if (!anchor) return;
        const y = anchor.getBoundingClientRect().top + window.pageYOffset - navH - 12;
        window.scrollTo({ top: y, behavior: 'smooth' });
      });
    }));

    const sizeBar = () => {
      const navH = siteNav ? siteNav.offsetHeight : 0;
      subbar.style.top = navH + 'px';
      
      subbar.style.marginTop = '-' + Math.ceil(subbar.offsetHeight) + 'px';
    };
    sizeBar();
    window.addEventListener('resize', sizeBar);
    window.addEventListener('load', sizeBar);
    requestAnimationFrame(sizeBar);
    setTimeout(sizeBar, 300);

    
    new IntersectionObserver(([entry]) => {
      const navH = siteNav ? siteNav.offsetHeight : 0;
      const pinned = !entry.isIntersecting && entry.boundingClientRect.top < navH;
      subbar.classList.toggle('is-visible', pinned);
      subbar.setAttribute('aria-hidden', pinned ? 'false' : 'true');
    }, {
      threshold: [0, 1],
      rootMargin: (siteNav ? `-${siteNav.offsetHeight}px` : '0px') + ' 0px 0px 0px',
    }).observe(subSentinel);
  }
})();

(() => {
  const tabs = document.querySelectorAll('#capTabs .cap-tab');
  const panels = document.querySelectorAll('#capPanels .cap-panel');
  if (!tabs.length) return;
  function show(key) {
    tabs.forEach(t => {
      const on = t.dataset.cap === key;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panels.forEach(p => {
      p.classList.toggle('active', p.id === 'cap-' + key);
    });
  }
  tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.cap)));
})();

(() => {
  const widgets = document.querySelectorAll('.batch-widget');
  if (!widgets.length) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = n => Math.round(n).toLocaleString('en-US');

  const TARGET_TOTAL = 1039809; 
  const BATCH_SIZE = 2000;      
  const LAST_BATCH_SIZE = 1809; 
  const N_BATCHES = 40;         
  const TICK_SLOW_MS = 260;     
  const TICK_FAST_MS = 40;      
  const TOTAL_RUN_MS = (TICK_SLOW_MS + TICK_FAST_MS) / 2 * N_BATCHES; 
  const REST_MS = 6000;         
  const MAX_SUBROWS = 7;

  
  const smoothstep = t => t * t * (3 - 2 * t);

  function checkSVG() {
    return '<span class="ck"><svg viewBox="0 0 16 16" fill="none"><path d="M4 8l2.5 2.5L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  }

  function buildGhostRow() {

    const tr = document.createElement('tr');
    tr.dataset.bwGhost = '1';
    tr.style.visibility = 'hidden';
    tr.innerHTML =
      '<td><span class="row-name">' + checkSVG() +
      '<span class="row-link">Batch-0000000000</span></span></td>' +
      '<td class="num">0</td>' +
      '<td class="num">0</td>' +
      '<td class="num">0</td>';
    return tr;
  }

  function setTotalSpinner(totalRow) {
    const wrap = totalRow.querySelector('.row-name');
    if (!wrap) return;
    const ck = wrap.querySelector('.ck');
    if (ck) {
      const s = document.createElement('span');
      s.className = 'spin';
      ck.replaceWith(s);
    } else if (!wrap.querySelector('.spin')) {
      const s = document.createElement('span');
      s.className = 'spin';
      wrap.prepend(s);
    }
  }

  function setTotalCheck(totalRow) {
    const wrap = totalRow.querySelector('.row-name');
    if (!wrap) return;
    const spin = wrap.querySelector('.spin');
    if (spin) spin.outerHTML = checkSVG();
  }

  function reset(s) {

    s.tbody.querySelectorAll('tr:not([data-bw-row="total"])').forEach(r => r.remove());
    for (let i = 0; i < MAX_SUBROWS; i++) {
      s.totalRow.after(buildGhostRow());
    }
    s.total = 0;
    s.batchesDone = 0;
    s.totalCells.forEach(td => { td.textContent = '0'; });
    setTotalSpinner(s.totalRow);
    if (s.toast) s.toast.classList.remove('on');
    if (s.runBtn) { s.runBtn.classList.remove('done'); s.runBtn.lastChild.nodeValue = 'Running'; }
  }

  function init(widget) {
    const tbody = widget.querySelector('tbody');
    if (!tbody) return null;
    const totalRow = tbody.querySelector('tr[data-bw-row="total"]');
    if (!totalRow) return null;

    const s = {
      widget, tbody, totalRow,

      totalCells: totalRow.querySelectorAll('td.num[data-bw-target]'),
      toast: widget.querySelector('.bw-toast'),
      runBtn: widget.querySelector('.run-btn'),
      total: 0,
      batchesDone: 0,
      nextId: 1692960 + Math.floor(Math.random() * 25),
      visible: false,
      timer: 0,
    };
    reset(s);
    return s;
  }

  function addBatch(s, size) {
    if (size <= 0) return false;
    const id = s.nextId;
    s.nextId += 1 + Math.floor(Math.random() * 4);

    const row = document.createElement('tr');
    row.innerHTML =
      '<td><span class="row-name">' + checkSVG() +
      '<span class="row-link">Batch-' + String(id).padStart(7, '0') + '</span></span></td>' +
      '<td class="num">' + fmt(size) + '</td>' +
      '<td class="num">' + fmt(size) + '</td>' +
      '<td class="num">0</td>';
    row.style.opacity = '0';
    row.style.transform = 'translateY(-4px)';
    row.style.transition = 'opacity .22s ease, transform .22s ease';

    
    const subRows = s.tbody.querySelectorAll('tr:not([data-bw-row="total"])');
    if (subRows.length >= MAX_SUBROWS) {
      subRows[subRows.length - 1].remove();
    }

    s.totalRow.after(row);
    requestAnimationFrame(() => {
      row.style.opacity = '1';
      row.style.transform = 'none';
    });

    
    
    s.batchesDone += 1;
    return true;
  }

  widgets.forEach(w => {
    const s = init(w);
    if (!s) return;
    s.isHero = !!w.closest('.hero-scene');

    
    
    function tickTotal() {
      if (!s.runStart || !s.visible) return;
      const elapsed = performance.now() - s.runStart;
      const progress = Math.min(1, elapsed / TOTAL_RUN_MS);
      const next = Math.round(TARGET_TOTAL * smoothstep(progress));
      if (next !== s.total) {
        s.total = next;
        s.totalCells.forEach(td => { td.textContent = fmt(s.total); });
      }
      if (progress < 1) s.rafId = requestAnimationFrame(tickTotal);
      else s.rafId = 0;
    }

    function loop() {
      if (!s.visible) return;

      if (!s.runStart) {
        s.runStart = performance.now();
        s.rafId = requestAnimationFrame(tickTotal);
      }

      if (s.batchesDone >= N_BATCHES) {
        
        s.total = TARGET_TOTAL;
        s.totalCells.forEach(td => { td.textContent = fmt(TARGET_TOTAL); });
        setTotalCheck(s.totalRow);
        if (s.toast) s.toast.classList.add('on');
        if (s.runBtn) { s.runBtn.classList.add('done'); s.runBtn.lastChild.nodeValue = 'Done'; }
        clearTimeout(s.timer);
        if (s.rafId) { cancelAnimationFrame(s.rafId); s.rafId = 0; }

        if (s.isHero) {
          const sc = s.widget.closest('.hero-scene');
          if (sc) sc.dispatchEvent(new CustomEvent('demodone', { bubbles: true }));
          return;
        }
        s.timer = setTimeout(() => {
          if (!s.visible) return;
          reset(s);
          s.runStart = 0;
          s.timer = setTimeout(loop, 300);
        }, REST_MS);
        return;
      }

      const isLast = (s.batchesDone === N_BATCHES - 1);
      addBatch(s, isLast ? LAST_BATCH_SIZE : BATCH_SIZE);

      
      const progress = s.batchesDone / N_BATCHES;
      const eased = smoothstep(progress);
      const nextTick = TICK_SLOW_MS + (TICK_FAST_MS - TICK_SLOW_MS) * eased;
      s.timer = setTimeout(loop, nextTick);
    }

    if (reduce) {
      
      for (let i = 0; i < MAX_SUBROWS - 1; i++) addBatch(s, BATCH_SIZE);
      addBatch(s, LAST_BATCH_SIZE);
      s.total = TARGET_TOTAL;
      s.totalCells.forEach(td => { td.textContent = fmt(TARGET_TOTAL); });
      setTotalCheck(s.totalRow);
      if (s.toast) s.toast.classList.add('on');
        if (s.runBtn) { s.runBtn.classList.add('done'); s.runBtn.lastChild.nodeValue = 'Done'; }
      if (s.isHero) {
        const sc = w.closest('.hero-scene');
        if (sc) setTimeout(() => sc.dispatchEvent(new CustomEvent('demodone', { bubbles: true })), 1800);
      }
      return;
    }

    
    if (s.isHero) {
      const scene = w.closest('.hero-scene');
      const syncScene = () => {
        const nowActive = scene.classList.contains('is-active') && !document.hidden;
        if (nowActive && !s.visible) {
          s.visible = true;
          clearTimeout(s.timer);
          reset(s);
          s.runStart = 0;
          s.timer = setTimeout(loop, 500);
        } else if (!nowActive && s.visible) {
          s.visible = false;
          clearTimeout(s.timer);
          if (s.rafId) { cancelAnimationFrame(s.rafId); s.rafId = 0; }
          reset(s);
          s.runStart = 0;
        }
      };
      new MutationObserver(syncScene).observe(scene, { attributes: true, attributeFilter: ['class'] });
      document.addEventListener('visibilitychange', syncScene);
      syncScene();
      return;
    }

    if (!('IntersectionObserver' in window)) {
      s.visible = true;
      s.timer = setTimeout(loop, 400);
      return;
    }

    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const wasVisible = s.visible;
        s.visible = e.isIntersecting && !document.hidden;
        if (s.visible && !wasVisible) {
          clearTimeout(s.timer);
          s.timer = setTimeout(loop, 500);
        } else if (!s.visible) {
          clearTimeout(s.timer);
          if (s.rafId) { cancelAnimationFrame(s.rafId); s.rafId = 0; }
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: [0, 0.05, 0.2] });
    io.observe(w);

    document.addEventListener('visibilitychange', () => {
      const rect = w.getBoundingClientRect();
      const inViewport = rect.top < (window.innerHeight || 800) && rect.bottom > 0;
      const wasVisible = s.visible;
      s.visible = inViewport && !document.hidden;
      if (s.visible && !wasVisible) {
        clearTimeout(s.timer);
        s.timer = setTimeout(loop, 500);
      } else if (!s.visible) {
        clearTimeout(s.timer);
        if (s.rafId) { cancelAnimationFrame(s.rafId); s.rafId = 0; }
      }
    });
  });
})();

(() => {
  const widgets = document.querySelectorAll('.pipeline-widget');
  if (!widgets.length) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const checkSVG = '<svg viewBox="0 0 16 16" fill="none"><path d="M4 8l2.5 2.5L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const wstate = new WeakMap();
  function st(w) {
    let s = wstate.get(w);
    if (!s) { s = { timers: [], visible: false, running: false, loopTimer: 0 }; wstate.set(w, s); }
    return s;
  }
  function ts(w, fn, ms) { const id = setTimeout(fn, ms); st(w).timers.push(id); return id; }
  function clearAll(w) { st(w).timers.forEach(t => clearTimeout(t)); st(w).timers = []; }

  function animateRow(w, row, durMs, onDone) {
    const target = parseInt(row.dataset.pwTarget, 10);
    const step = parseInt(row.dataset.pwStep, 10) || 200;
    const cells = [row.querySelector('.pw-retrieved'), row.querySelector('.pw-actioned')];
    const status = row.querySelector('.pw-status');
    row.classList.remove('pending');
    status.classList.add('running');
    
    const totalSteps = Math.ceil(target / step);
    const tickCount = Math.min(60, totalSteps);
    const incPerTick = Math.max(1, Math.ceil(totalSteps / tickCount));
    const stepMs = Math.max(12, durMs / tickCount);
    let cur = 0;
    function tick() {
      cur += step * incPerTick;
      const val = cur >= target ? target : cur;
      cells.forEach(c => { if (c) c.textContent = fmt(val); });
      if (val < target) ts(w, tick, stepMs);
      else {
        ts(w, () => {
          status.classList.remove('running');
          status.classList.add('done');
          status.innerHTML = checkSVG;
          if (onDone) onDone();
        }, 120);
      }
    }
    ts(w, tick, stepMs);
  }

  function runPipeline(w) {
    clearAll(w);
    const rows = w.querySelectorAll('.pw-row');
    rows.forEach(r => {
      r.classList.add('pending');
      const status = r.querySelector('.pw-status');
      if (status) { status.className = 'pw-status'; status.innerHTML = ''; }
      r.querySelectorAll('.pw-retrieved, .pw-actioned').forEach(c => c.textContent = '0');
    });
    const toast = w.querySelector('.pw-toast');
    if (toast) toast.classList.remove('on');
    const runBtn = w.querySelector('.run-btn');
    if (runBtn) { runBtn.classList.remove('done'); runBtn.innerHTML = '<span class="pulse"></span>Running'; }

    if (reduce) {
      rows.forEach(r => {
        r.classList.remove('pending');
        const status = r.querySelector('.pw-status');
        if (status) { status.classList.add('done'); status.innerHTML = checkSVG; }
        const tgt = parseInt(r.dataset.pwTarget, 10) || 0;
        r.querySelectorAll('.pw-retrieved, .pw-actioned').forEach(c => c.textContent = fmt(tgt));
      });
      if (toast) toast.classList.add('on');
      if (runBtn) { runBtn.classList.add('done'); runBtn.innerHTML = '<span class="pulse"></span>Done'; }
      return;
    }

    const rowList = [...rows];
    function next() {
      if (!rowList.length) {
        ts(w, () => {
          if (toast) toast.classList.add('on');
          if (runBtn) { runBtn.classList.add('done'); runBtn.innerHTML = '<span class="pulse"></span>Done'; }
        }, 250);
        return;
      }
      const row = rowList.shift();
      animateRow(w, row, 900, next);
    }
    ts(w, next, 300);
  }

  function loopDuration(w) {
    const rows = w.querySelectorAll('.pw-row').length;
    return rows * 1270 + 550;
  }

  if (!('IntersectionObserver' in window)) {
    widgets.forEach(w => runPipeline(w));
    return;
  }

  function loop(w) {
    const s = st(w);
    if (!s.visible || s.running) return;
    s.running = true;
    runPipeline(w);
    clearTimeout(s.loopTimer);
    s.loopTimer = setTimeout(() => {
      s.running = false;
      if (s.visible) s.loopTimer = setTimeout(() => loop(w), 2200);
    }, loopDuration(w));
  }

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const w = e.target;
      const s = st(w);
      s.visible = e.isIntersecting;
      if (s.visible) {
        if (!s.running) {
          clearTimeout(s.loopTimer);
          s.loopTimer = setTimeout(() => loop(w), 250);
        }
      } else {
        clearTimeout(s.loopTimer);
        clearAll(w);
        s.running = false;
      }
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: [0, 0.05, 0.2] });
  widgets.forEach(w => io.observe(w));

  setTimeout(() => {
    widgets.forEach(w => {
      const r = w.getBoundingClientRect();
      const visible = r.top < (window.innerHeight || document.documentElement.clientHeight) && r.bottom > 0;
      if (visible) {
        const s = st(w);
        s.visible = true;
        if (!s.running) loop(w);
      }
    });
  }, 600);
})();

(() => {
  const widgets = document.querySelectorAll('.trigger-trace');
  if (!widgets.length) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function cancel(widget) {
    clearTimeout(widget._ttReplay);
    (widget._ttTimers || []).forEach(clearTimeout);
    widget._ttTimers = [];
  }

  function setRunBtn(widget, label, done) {
    const b = widget.querySelector('.run-btn');
    if (!b) return;
    b.classList.toggle('done', !!done);
    if (b.lastChild) b.lastChild.nodeValue = label;
  }

  function animateTrace(widget, replay = true, onDone = null) {
    const rules = [...widget.querySelectorAll('.tt-rule')];
    if (!rules.length) return;
    cancel(widget);
    setRunBtn(widget, 'Firing', false);
    const push = (fn, ms) => { widget._ttTimers.push(setTimeout(fn, ms)); };
    
    rules.forEach(r => {
      r.classList.remove('running', 'done');
      const fill = r.querySelector('.tt-bar-fill');
      if (fill) {
        fill.style.transition = 'none';
        fill.style.width = '0%';
      }
    });
    if (reduce) {
      rules.forEach(r => {
        r.classList.add('done');
        const fill = r.querySelector('.tt-bar-fill');
        if (fill) fill.style.width = '100%';
      });
      setRunBtn(widget, 'Fired', true);
      if (onDone) push(onDone, 1800);
      return;
    }
    
    let delay = 250;
    let lastEnd = 0;
    rules.forEach((rule) => {
      const dur = parseInt(rule.dataset.ttDur, 10) || 550;
      push(() => {
        rule.classList.add('running');
        const fill = rule.querySelector('.tt-bar-fill');
        if (fill) {
          fill.style.transition = `width ${dur}ms linear`;
          requestAnimationFrame(() => { fill.style.width = '100%'; });
        }
        push(() => {
          rule.classList.remove('running');
          rule.classList.add('done');
        }, dur);
      }, delay);
      lastEnd = delay + dur;
      delay += dur + 180;
    });
    push(() => setRunBtn(widget, 'Fired', true), lastEnd + 100);
    
    if (replay) {
      widget._ttReplay = setTimeout(() => animateTrace(widget, true), lastEnd + 5000);
    }
    
    if (onDone) push(onDone, lastEnd + 200);
  }

  
  const heroWidgets = [], pageWidgets = [];
  widgets.forEach(w => (w.closest('.hero-scene') ? heroWidgets : pageWidgets).push(w));

  heroWidgets.forEach(w => {
    const scene = w.closest('.hero-scene');
    const fireDone = () => scene.dispatchEvent(new CustomEvent('demodone', { bubbles: true }));
    let active = false;
    const sync = () => {
      const now = scene.classList.contains('is-active');
      if (now && !active) animateTrace(w, false, fireDone);
      else if (!now && active) cancel(w);
      active = now;
    };
    new MutationObserver(sync).observe(scene, { attributes: true, attributeFilter: ['class'] });
    sync();
  });

  if (!pageWidgets.length) return;

  if (!('IntersectionObserver' in window)) {
    pageWidgets.forEach(w => animateTrace(w));
    return;
  }
  const seen = new WeakMap();
  function fire(w) {
    if (seen.get(w)) return;
    seen.set(w, true);
    setTimeout(() => animateTrace(w), 250);
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) fire(e.target); });
  }, { rootMargin: '0px 0px -10% 0px', threshold: [0, 0.05, 0.2] });
  pageWidgets.forEach(w => io.observe(w));

  setTimeout(() => {
    pageWidgets.forEach(w => {
      const r = w.getBoundingClientRect();
      if (r.top < (window.innerHeight || document.documentElement.clientHeight) && r.bottom > 0) fire(w);
    });
  }, 600);
})();

(() => {
  const nav = document.getElementById('nav');
  const toggle = document.getElementById('navToggle');
  const panel = document.getElementById('navMobile');

  if (nav && toggle && panel) {
    const setOpen = (open) => {
      nav.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      panel.hidden = !open;
      document.body.style.overflow = open ? 'hidden' : '';
    };
    toggle.addEventListener('click', () => {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    
    panel.querySelectorAll('[data-nav-link]').forEach(el => {
      el.addEventListener('click', () => setOpen(false));
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('menu-open')) setOpen(false);
    });
    
    window.addEventListener('resize', () => {
      if (window.innerWidth > 980 && nav.classList.contains('menu-open')) setOpen(false);
    });
  }

  
  // All nav dropdowns (Resources, Customers, …) get click/tap toggle behavior.
  document.querySelectorAll('.nav-dd').forEach((dd) => {
    const trigger = dd.querySelector('.nav-dd-trigger');
    const menu = dd.querySelector('.nav-dd-menu');
    if (!trigger || !menu) return;
    const openDd = (open) => {
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.classList.toggle('open', open);
    };
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      openDd(trigger.getAttribute('aria-expanded') !== 'true');
    });
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => openDd(false)));
    document.addEventListener('click', (e) => {
      if (!dd.contains(e.target)) openDd(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') openDd(false);
    });
  });
})();

(() => {
  const rot = document.getElementById('heroRotator');
  if (!rot) return;
  const scenes = [...rot.querySelectorAll('.hero-scene')];
  const dots = [...rot.querySelectorAll('.hero-dot')];
  if (scenes.length < 2) return;
  const DWELL = 15000;        
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let idx = 0, advTimer = 0, paused = false;

  function tickQueryCount() {
    const el = rot.querySelector('.hs-count[data-q-target]');
    if (!el) return;
    const target = +el.dataset.qTarget;
    const start = performance.now(), dur = 900;
    function step(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = p * p * (3 - 2 * p);
      el.textContent = Math.round(target * eased).toLocaleString('en-US');
      if (p < 1) requestAnimationFrame(step);
    }
    el.textContent = '0';
    requestAnimationFrame(step);
  }

  function go(i) {
    idx = (i + scenes.length) % scenes.length;
    scenes.forEach((s, k) => s.classList.toggle('is-active', k === idx));
    dots.forEach((d, k) => {
      d.classList.toggle('on', k === idx);
      d.setAttribute('aria-selected', k === idx ? 'true' : 'false');
    });
    if (scenes[idx].dataset.surface === 'query') tickQueryCount();
  }

  function clearTimers() { clearTimeout(advTimer); }

  
  function armScene() {
    clearTimers();
    if (paused) return;
    advTimer = setTimeout(advance, DWELL);
  }

  function advance() {
    clearTimers();
    go(idx + 1);
    armScene();
  }

  dots.forEach((d, k) => d.addEventListener('click', () => {
    if (k === idx) {
      // Re-clicking the active dot: bounce is-active off and on so each
      // demo's MutationObserver sees a change and replays from the start.
      const s = scenes[idx];
      s.classList.remove('is-active');
      setTimeout(() => s.classList.add('is-active'), 40);
    } else {
      go(k);
    }
    armScene();
  }));
  rot.addEventListener('mouseenter', () => { paused = true; clearTimers(); });
  rot.addEventListener('mouseleave', () => { paused = false; armScene(); });

  go(0);
  armScene();
})();

function dspFakeCursor(card, sel) {
  const cur = card.querySelector(sel);
  if (!cur) return null;
  const move = (target, dx, dy) => {
    const el = typeof target === 'string' ? card.querySelector(target) : target;
    if (!el) return;
    const cr = card.getBoundingClientRect();
    if (!cr.width) return;
    const scale = cr.width / card.offsetWidth || 1;
    const er = el.getBoundingClientRect();
    cur.style.left = ((er.left - cr.left + er.width / 2) / scale + (dx || 0)) + 'px';
    cur.style.top = ((er.top - cr.top + er.height / 2) / scale + (dy || 0)) + 'px';
  };
  let clickT = 0;
  return {
    show(t, dx, dy) {
      cur.style.transition = 'none';
      move(t, dx, dy);
      void cur.offsetWidth;
      cur.style.transition = '';
      cur.classList.add('show');
    },
    to: move,
    click() {
      cur.classList.add('click');
      clearTimeout(clickT);
      clickT = setTimeout(() => cur.classList.remove('click'), 340);
    },
    hide() { cur.classList.remove('show', 'click'); },
  };
}

(() => {
  const card = document.getElementById('uiListHero');
  if (!card) return;
  const scene = card.closest('.hero-scene');
  if (!scene) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const rowsWrap = card.querySelector('[data-al-rows]');
  const selnote  = card.querySelector('[data-al-selnote]');
  const cacts    = card.querySelector('.al-cacts');
  const ckall    = card.querySelector('[data-al-ckall]');
  const rc       = card.querySelector('[data-al-rc]');
  const filter   = card.querySelector('[data-al-filter]');
  const filterBox = card.querySelector('[data-al-filterbox]');
  const filterVal = card.querySelector('[data-al-filterval]');
  const lastPg   = card.querySelector('[data-al-lastpg]');
  const highChk   = card.querySelector('[data-al-high]');
  const medChk    = card.querySelector('[data-al-med]');
  const lowChk    = card.querySelector('[data-al-low]');
  const acceptBtn = cacts.querySelector('[data-al-accept]');
  const confirmBtn = card.querySelector('[data-al-confirm]');
  const cursor   = dspFakeCursor(card, '[data-al-cursor]');
  const toast    = card.querySelector('[data-al-toast]');

  const SEL = [0, 2, 4, 5];        
  const LOW = [1, 3];              
  const NEW_STATUS = 'In Progress';    

  const REPLACE = {
    1: { num: '03271103', subj: 'Audit Trail Export', pri: 'High',   stat: 'On Hold',   ctype: 'Feature Request' },
    3: { num: '03276627', subj: 'Custom Workflow Approvals', pri: 'Medium', stat: 'Escalated', ctype: 'Problem' },
  };
  const CK = '<span class="al-ck" data-al-ck><svg viewBox="0 0 16 16" fill="none"><path d="M3.5 8l3 3 6-6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  const CARET = '<span class="al-rcaret"><svg viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5l3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  function rowInner(d) {
    return CK + '<span class="al-cnum">' + d.num + '</span><span class="al-subj">' + d.subj +
      '</span><span class="al-ctype">' + d.ctype + '</span><span class="al-pri" data-al-pri>' + d.pri +
      '</span><span class="al-stat" data-al-stat>' + d.stat + '</span>' + CARET;
  }
  function applyFilter(rows, animate) {
    LOW.forEach(i => {
      rows[i].setAttribute('data-pri', REPLACE[i].pri);
      rows[i].innerHTML = rowInner(REPLACE[i]);
      if (animate) rows[i].classList.add('incoming');
    });
  }
  const baseHTML = rowsWrap.innerHTML;
  const baseRc = rc ? rc.textContent : '';

  let timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const rowEls = () => [...rowsWrap.querySelectorAll('[data-al-row]')];

  function setStat(cell, val) {
    cell.textContent = val;
  }

  function reset() {
    timers.forEach(clearTimeout);
    timers = [];
    rowsWrap.innerHTML = baseHTML;
    selnote.textContent = 'Updated just now';
    selnote.classList.remove('sel');
    cacts.classList.remove('on');
    cacts.querySelectorAll('.al-cbtn').forEach(b => b.classList.remove('flash', 'press'));
    ckall.classList.remove('some');
    if (rc) rc.textContent = baseRc;
    filter.classList.remove('open');
    if (highChk) highChk.classList.remove('on');
    if (medChk) medChk.classList.remove('on');
    if (lowChk) lowChk.classList.remove('on');
    filterVal.textContent = 'Filter…';
    filterBox.classList.remove('has');
    if (lastPg) lastPg.textContent = '15';
    if (cursor) cursor.hide();
    toast.classList.remove('on');
  }

  function paintFinal() {
    const rows = rowEls();
    applyFilter(rows, false);
    if (highChk) highChk.classList.add('on');
    if (medChk) medChk.classList.add('on');
    SEL.forEach(i => {
      rows[i].classList.add('sel');
      rows[i].querySelector('[data-al-ck]').classList.add('on');
      setStat(rows[i].querySelector('[data-al-stat]'), NEW_STATUS);
    });
    if (lowChk) lowChk.classList.remove('on');
    filterVal.textContent = 'High, Medium';
    filterBox.classList.add('has');
    if (lastPg) lastPg.textContent = '12';
    selnote.textContent = '4 items selected';
    selnote.classList.add('sel');
    cacts.classList.add('on');
    ckall.classList.add('some');
    if (rc) rc.textContent = '112';
    toast.classList.add('on');
  }

  function play() {
    reset();
    if (reduce) { paintFinal(); setTimeout(fireDone, 1800); return; }
    const rows = rowEls();

    at(550,  () => filter.classList.add('open'));
    at(1000, () => highChk.classList.add('on'));
    at(1420, () => medChk.classList.add('on'));
    at(1960, () => filter.classList.remove('open'));
    at(2140, () => {
      applyFilter(rows, true);
      if (rc) rc.textContent = '112';
      filterVal.textContent = 'High, Medium';
      filterBox.classList.add('has');
      if (lastPg) lastPg.textContent = '12';
    });

    const tSel = 2550;
    SEL.forEach((ri, k) => at(tSel + k * 340, () => {
      rows[ri].classList.add('sel');
      rows[ri].querySelector('[data-al-ck]').classList.add('on');
      selnote.textContent = (k + 1) + ' item' + (k ? 's' : '') + ' selected';
      selnote.classList.add('sel');
      ckall.classList.add('some');
    }));
    const tSelDone = tSel + SEL.length * 340;
    at(tSelDone + 60,  () => { cacts.classList.add('on'); cacts.querySelectorAll('.al-cbtn').forEach(b => b.classList.add('flash')); });
    at(tSelDone + 760, () => cacts.querySelectorAll('.al-cbtn').forEach(b => b.classList.remove('flash')));

    const tAct = tSelDone + 900;
    at(tAct,       () => { if (acceptBtn) acceptBtn.classList.add('press'); });
    at(tAct + 160, () => { if (acceptBtn) acceptBtn.classList.remove('press'); });
    SEL.forEach((ri, k) => at(tAct + 280 + k * 110, () => {
      const c = rows[ri].querySelector('[data-al-stat]');
      setStat(c, NEW_STATUS);
      c.classList.add('lit');
    }));

    const tToast = tAct + 280 + SEL.length * 110 + 60;
    at(tToast, () => {
      toast.classList.add('on');

      SEL.forEach(ri => {
        rows[ri].classList.remove('sel');
        rows[ri].querySelector('[data-al-ck]').classList.remove('on');
      });
      ckall.classList.remove('some');
      cacts.classList.remove('on');
      selnote.classList.remove('sel');
      selnote.textContent = 'Updated just now';
      fireDone();
    });

    if (cursor) {
      at(300,  () => cursor.show(filterBox));
      at(530,  () => cursor.click());
      at(650,  () => cursor.to(highChk));
      at(1000, () => cursor.click());
      at(1080, () => cursor.to(medChk));
      at(1420, () => cursor.click());
      at(1520, () => cursor.to(confirmBtn));
      at(1900, () => cursor.click());
      SEL.forEach((ri, k) => {
        at(tSel + k * 340 - 340, () => cursor.to(rows[ri].querySelector('[data-al-ck]')));
        at(tSel + k * 340, () => cursor.click());
      });
      at(tAct - 360, () => cursor.to(acceptBtn));
      at(tAct, () => cursor.click());
      at(tToast, () => cursor.hide());
    }
  }

  const fireDone = () => scene.dispatchEvent(new CustomEvent('demodone', { bubbles: true }));
  let active = false;
  const sync = () => {
    const now = scene.classList.contains('is-active');
    if (now && !active) play();
    else if (!now && active) reset();
    active = now;
  };
  new MutationObserver(sync).observe(scene, { attributes: true, attributeFilter: ['class'] });
  sync();
})();

(() => {
  const card = document.getElementById('queryHero');
  if (!card) return;
  const scene = card.closest('.hero-scene');
  if (!scene) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nameEl  = card.querySelector('[data-qh-name]');
  const saved   = card.querySelector('[data-qh-saved]');
  const sqPick  = card.querySelector('[data-qh-sq]');
  const builder = card.querySelector('.qh-builder');
  const filters = card.querySelector('[data-qh-filters]');
  const listhd  = card.querySelector('.qh-listhead');
  const pager   = card.querySelector('.al-pager');
  const c1      = card.querySelector('[data-qh-c1]');
  const c2      = card.querySelector('[data-qh-c2]');
  const addf    = card.querySelector('[data-qh-addf]');
  const runBtn  = card.querySelector('[data-qh-run]');
  const rows    = [...card.querySelectorAll('[data-qh-row]')];
  const countEl = card.querySelector('[data-qh-count]');
  const rates   = [...card.querySelectorAll('[data-qh-rate]')];
  const origRates = rates.map(r => r.textContent);
  const editbar = card.querySelector('[data-qh-editbar]');
  const saveBtn = editbar ? editbar.querySelector('.qh-ebtn.primary') : null;
  const savedBtn = card.querySelector('[data-qh-savedbtn]');
  const cursor  = dspFakeCursor(card, '[data-qh-cursor]');
  const toast   = card.querySelector('[data-qh-toast]');

  const COUNT = 342;
  const NEW_RATE = 'Negotiation';
  const PICK_NAME = sqPick ? sqPick.textContent : 'My Open Pipeline';
  const fmt = n => n.toLocaleString('en-US');

  let timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));

  function countTo(target, dur) {
    const start = performance.now();
    function step(now) {
      const p = Math.min(1, (now - start) / dur);
      countEl.textContent = fmt(Math.round(target * (p * p * (3 - 2 * p))));
      if (p < 1) timers.push(requestAnimationFrame(step));
    }
    timers.push(requestAnimationFrame(step));
  }

  function reset() {
    timers.forEach(t => { clearTimeout(t); cancelAnimationFrame(t); });
    timers = [];
    nameEl.textContent = 'New query';
    saved.classList.remove('open');
    sqPick.classList.remove('pick');
    builder.classList.remove('in');
    filters.classList.remove('in');
    listhd.classList.remove('in');
    pager.classList.remove('in');
    c1.classList.remove('in');
    c2.classList.remove('in');
    addf.classList.remove('armed');
    runBtn.classList.remove('press');
    rows.forEach(r => {
      r.classList.remove('in', 'sel');
      const ck = r.querySelector('.al-ck');
      if (ck) ck.classList.remove('on');
    });
    countEl.textContent = '0';
    rates.forEach((r, i) => { r.textContent = origRates[i]; r.classList.remove('editing', 'lit'); });
    if (editbar) editbar.classList.remove('on');
    if (saveBtn) saveBtn.classList.remove('press');
    if (cursor) cursor.hide();
    toast.classList.remove('on');
  }

  function paintFinal() {
    nameEl.textContent = PICK_NAME;
    builder.classList.add('in');
    filters.classList.add('in');
    listhd.classList.add('in');
    pager.classList.add('in');
    c1.classList.add('in');
    c2.classList.add('in');
    rows.forEach(r => r.classList.add('in'));
    countEl.textContent = fmt(COUNT);
    rates.forEach(r => { r.textContent = NEW_RATE; });
    toast.classList.add('on');
  }

  function play() {
    reset();
    if (reduce) { paintFinal(); setTimeout(fireDone, 1800); return; }

    at(600,  () => saved.classList.add('open'));
    at(1150, () => sqPick.classList.add('pick'));
    at(1600, () => { saved.classList.remove('open'); nameEl.textContent = PICK_NAME; });
    at(1800, () => { builder.classList.add('in'); filters.classList.add('in'); });

    at(2100, () => addf.classList.add('armed'));
    at(2350, () => { c1.classList.add('in'); });
    at(2800, () => { c2.classList.add('in'); });
    at(3050, () => addf.classList.remove('armed'));

    at(3350, () => runBtn.classList.add('press'));
    at(3500, () => runBtn.classList.remove('press'));
    at(3550, () => { listhd.classList.add('in'); pager.classList.add('in'); });
    rows.forEach((r, k) => at(3650 + k * 170, () => r.classList.add('in')));
    at(3700, () => countTo(COUNT, 1000));

    const targets = rows.filter(r => r.querySelector('[data-qh-rate]'));
    const tSel = 3650 + rows.length * 170 + 400;
    targets.forEach((r, k) => at(tSel + k * 340, () => {
      r.classList.add('sel');
      const ck = r.querySelector('.al-ck');
      if (ck) ck.classList.add('on');
    }));
    const tBar = tSel + targets.length * 340 + 250;
    at(tBar, () => { if (editbar) editbar.classList.add('on'); });
    at(tBar + 500,  () => rates.forEach(r => r.classList.add('editing')));
    at(tBar + 1150, () => rates.forEach(r => { r.textContent = NEW_RATE; }));
    at(tBar + 1500, () => rates.forEach(r => { r.classList.remove('editing'); r.classList.add('lit'); }));
    at(tBar + 2400, () => { if (saveBtn) saveBtn.classList.add('press'); });
    at(tBar + 2600, () => {
      if (saveBtn) saveBtn.classList.remove('press');
      if (editbar) editbar.classList.remove('on');
      toast.classList.add('on');
      fireDone();
    });

    if (cursor) {
      at(380,  () => cursor.show(savedBtn));
      at(600,  () => cursor.click());
      at(700,  () => cursor.to(sqPick));
      at(1150, () => cursor.click());
      at(1700, () => cursor.to(addf));
      at(2100, () => cursor.click());
      at(2950, () => cursor.to(runBtn));
      at(3350, () => cursor.click());
      targets.forEach((r, k) => {
        at(tSel + k * 340 - 340, () => cursor.to(r.querySelector('.al-ck')));
        at(tSel + k * 340, () => cursor.click());
      });
      at(tBar + 1520, () => cursor.to(saveBtn));
      at(tBar + 2400, () => cursor.click());
      at(tBar + 2600, () => cursor.hide());
    }
  }

  const fireDone = () => scene.dispatchEvent(new CustomEvent('demodone', { bubbles: true }));
  let active = false;
  const sync = () => {
    const now = scene.classList.contains('is-active');
    if (now && !active) play();
    else if (!now && active) reset();
    active = now;
  };
  new MutationObserver(sync).observe(scene, { attributes: true, attributeFilter: ['class'] });
  sync();
})();

(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function build(card) {
  const statusEl = card.querySelector('[data-hl-status]');
  const drop     = card.querySelector('[data-hl-drop]');
  const meta     = card.querySelector('[data-hl-meta]');
  const mrows    = [...card.querySelectorAll('[data-hl-mrow]')];
  const audit    = card.querySelector('[data-hl-audit]');
  const runBtn   = card.querySelector('[data-hl-run]');
  const progress = card.querySelector('[data-hl-progress]');
  const bar      = card.querySelector('[data-hl-bar]');
  const toast    = card.querySelector('[data-hl-toast]');

  const TOTAL = 12481;
  const AUDIT_BASE = audit.innerHTML;
  const cursor = dspFakeCursor(card, '[data-hl-cursor]');

  let timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const fmt = n => n.toLocaleString('en-US');

  function reset() {
    timers.forEach(clearTimeout);
    timers = [];
    statusEl.className = 'hl-status';
    statusEl.textContent = 'Ready';
    drop.classList.remove('parsed');
    meta.textContent = 'drop CSV to begin';
    mrows.forEach(r => r.classList.remove('in', 'applied'));
    audit.classList.remove('done');
    audit.innerHTML = AUDIT_BASE;
    runBtn.classList.remove('press', 'running');
    progress.classList.remove('on');
    bar.classList.remove('done');
    bar.style.width = '0%';
    if (cursor) cursor.hide();
    toast.classList.remove('on');
  }

  function paintFinal() {
    drop.classList.add('parsed');
    meta.textContent = fmt(TOTAL) + ' rows · 14 columns · 2.4 mb';
    mrows.forEach(r => r.classList.add('in', 'applied'));
    statusEl.className = 'hl-status done';
    statusEl.textContent = 'Done';
    audit.classList.add('done');
    audit.innerHTML = '<b>' + fmt(TOTAL) + '</b> upserted · 0 failed · 45s';
    progress.classList.add('on');
    bar.classList.add('done');
    bar.style.width = '100%';
    toast.classList.add('on');
  }

  function play(onDone) {
    const done = typeof onDone === 'function' ? onDone : () => {};
    reset();
    if (reduce) { paintFinal(); setTimeout(done, 1800); return; }

    at(500,  () => { drop.classList.add('parsed'); meta.textContent = 'parsing…'; });
    at(1150, () => { meta.textContent = fmt(TOTAL) + ' rows · 14 columns · 2.4 mb'; });

    mrows.forEach((r, k) => at(1500 + k * 220, () => r.classList.add('in')));
    const tApplied = 1500 + mrows.length * 220 + 150;
    mrows.forEach((r, k) => at(tApplied + k * 120, () => r.classList.add('applied')));

    const tRun = tApplied + mrows.length * 120 + 420;
    at(tRun,        () => runBtn.classList.add('press'));
    at(tRun + 150,  () => runBtn.classList.remove('press'));
    at(tRun + 200,  () => {
      runBtn.classList.add('running');
      statusEl.className = 'hl-status running';
      statusEl.textContent = 'Running';
      progress.classList.add('on');
    });
    if (cursor) {
      at(240, () => cursor.show(drop));
      at(490, () => cursor.click());
      at(tRun - 380, () => cursor.to(runBtn));
      at(tRun + 10, () => cursor.click());
      at(tRun + 700, () => cursor.hide());
    }

    const fillStart = tRun + 280, fillDur = 2600, steps = 26;
    for (let i = 1; i <= steps; i++) {
      at(fillStart + (fillDur / steps) * i, () => {
        const p = i / steps;
        bar.style.width = (p * 100) + '%';
        audit.innerHTML = '<b>' + fmt(Math.round(TOTAL * p)) + '</b> of ' + fmt(TOTAL) + ' upserted…';
      });
    }

    const tDone = fillStart + fillDur + 120;
    at(tDone, () => {
      runBtn.classList.remove('running');
      statusEl.className = 'hl-status done';
      statusEl.textContent = 'Done';
      bar.classList.add('done');
      audit.classList.add('done');
      audit.innerHTML = '<b>' + fmt(TOTAL) + '</b> upserted · 0 failed · 45s';
      toast.classList.add('on');
      done();
    });
  }

    return { reset, play };
  }

  const heroCard = document.getElementById('loaderHero');
  if (heroCard) {
    const scene = heroCard.closest('.hero-scene');
    if (scene) {
      const demo = build(heroCard);
      const fireDone = () => scene.dispatchEvent(new CustomEvent('demodone', { bubbles: true }));
      let active = false;
      const sync = () => {
        const now = scene.classList.contains('is-active');
        if (now && !active) demo.play(fireDone);
        else if (!now && active) demo.reset();
        active = now;
      };
      new MutationObserver(sync).observe(scene, { attributes: true, attributeFilter: ['class'] });
      sync();
    }
  }

  const capCard = document.getElementById('loaderCap');
  if (capCard) {
    const demo = build(capCard);
    if (!('IntersectionObserver' in window)) {
      demo.play();
    } else {
      let playing = false;
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !playing) { playing = true; demo.play(); }
          else if (!e.isIntersecting && playing) { playing = false; demo.reset(); }
        });
      }, { threshold: [0, 0.25], rootMargin: '0px 0px -10% 0px' });
      io.observe(capCard);
    }
  }
})();

(() => {
  document.addEventListener('click', (e) => {
    const row = e.target.closest ? e.target.closest('.cs-row') : null;
    if (!row) return;
    if (e.target.closest('a, button')) return; 
    row.classList.toggle('open');
  });
})();

(() => {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const setNavH = () => {
    document.documentElement.style.setProperty('--nav-h', Math.round(nav.getBoundingClientRect().height) + 'px');
  };
  setNavH();
  window.addEventListener('resize', setNavH);
  if (window.ResizeObserver) { new ResizeObserver(setNavH).observe(nav); }
})();
