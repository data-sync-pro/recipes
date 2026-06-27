/* Data Sync Pro · interactions */

// Shared email-format check. All three Web-to-Lead forms use novalidate, so
// the browser's type="email" check is bypassed — this enforces basic format
// (something@something.tld, no spaces) before the work-email domain guard.
const DSP_isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

// =========================================================
// Client-side submission limiter
// ---------------------------------------------------------
// LIMITS, NOT SECURITY. localStorage can be cleared, incognito bypasses this,
// and a determined attacker can hit the Web-to-Lead endpoint directly. The
// real abuse layer is Salesforce-side (enable reCAPTCHA on Web-to-Lead, plus
// Duplicate Rules on the Lead object). What this _does_ do well:
//   • Stops accidental double/triple submits (frustrated user clicking again)
//   • Casual bots that obey JS but don't bother clearing storage
//   • Gives the user clear feedback instead of silently creating duplicate Leads
//
// Shared across both modals — 3 submissions per browser per 24 hours.
// =========================================================
window.SubmissionLimiter = (() => {
  const KEY = 'dsp.submitTs.v1';
  const MAX = 3;
  const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

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
    /** How many submissions are still allowed in the rolling 24h window. */
    remaining() { return Math.max(0, MAX - recent().length); },
    /** True if the user has hit the cap. */
    isBlocked() { return this.remaining() <= 0; },
    /** Ms until the oldest submission ages out (when isBlocked is true). */
    msUntilReset() {
      const r = recent();
      if (r.length < MAX) return 0;
      return Math.max(0, (Math.min(...r) + WINDOW_MS) - Date.now());
    },
    /** Human-readable "X hours" / "Y minutes" string for the reset window. */
    resetLabel() {
      const ms = this.msUntilReset();
      if (ms <= 0) return 'shortly';
      const hours = Math.ceil(ms / (60 * 60 * 1000));
      if (hours >= 2) return `in about ${hours} hours`;
      const minutes = Math.max(1, Math.ceil(ms / (60 * 1000)));
      return `in about ${minutes} minute${minutes === 1 ? '' : 's'}`;
    },
    /** Record a submission. Prunes anything outside the rolling window. */
    record() {
      const next = [...recent(), Date.now()];
      write(next);
    },
    MAX, WINDOW_MS,
  };
})();

// =========================================================
// Salesforce W2L reCAPTCHA timestamp ticker
// ---------------------------------------------------------
// Salesforce wants the `captcha_settings` hidden input's JSON.ts field to
// be a freshly-stamped epoch millisecond at the moment of submit. SF's own
// generated snippet sets up a setInterval that updates only the FIRST
// captcha_settings input on the page — this site has two (one per modal),
// so we iterate all of them. Cheap (runs every 500ms; pure JSON work).
// =========================================================
(() => {
  const tick = () => {
    document.querySelectorAll('input[name="captcha_settings"]').forEach(inp => {
      try {
        const obj = JSON.parse(inp.value);
        obj.ts = String(Date.now());
        inp.value = JSON.stringify(obj);
      } catch { /* malformed — skip */ }
    });
  };
  setInterval(tick, 500);
  tick(); // run once immediately so the field is populated before any submit
})();

// =========================================================
// Lazy reCAPTCHA loader
// ---------------------------------------------------------
// Google's api.js used to load in <head> on every visit, pulling a large
// bundle up front just to pre-render captcha widgets that live inside three
// hidden modals. We now inject it only when a visitor first opens one of
// those modals. api.js auto-renders every .g-recaptcha div present in the
// DOM when it loads (visibility is irrelevant), so a single injection wires
// up all three widgets and their data-callback gates.
// =========================================================
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

// =========================================================
// Plan-config modal — opened by pricing-card CTAs
// =========================================================
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

  // -------- plan switcher --------
  // Default per-plan allowances — mirrors the pricing cards.
  //   conn:  Growth = 1 (current org only)
  //          Business = 5 (4 sandbox + 1 prod)
  //          Enterprise = 7 (scales on request)
  //   exec:  Growth = 100; Business = 200; Enterprise = 500
  //   batch: Growth/Business = 20k; Enterprise = Unlimited (matches <select> option value)
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
    // Populate the first org's fields with the plan's allowances.
    // Only auto-fill when the value is empty or still matches the previous
    // plan's default (i.e. user hasn't customized it) — avoids clobbering edits.
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

  // -------- success-plan switcher --------
  // Standard is included with every paid plan; Premium is a paid add-on
  // (25% of license). The choice rides along in the License Info JSON.
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

  // -------- org rows --------
  const renumberOrgs = () => {
    const rows = orgsHost.querySelectorAll('.pcm-org');
    rows.forEach((row, i) => {
      const n = row.querySelector('.pcm-org-n');
      if (n) n.textContent = i + 1;
      row.classList.toggle('is-only', rows.length === 1);
      // Row 0 is the production org (every customer has one); additional
      // rows are sandboxes. Update the per-row name label to match.
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

  // Executables are licensed in blocks of 100. If the user types an off-step
  // value (e.g. 101), round it UP to the next 100 on blur (→ 200), clamped to
  // the field's 100–2000 range.
  const roundExecUp = (inp) => {
    const n = Number(inp.value);
    if (!Number.isFinite(n) || n <= 0) return;   // empty/invalid → leave for the required check
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
    // Snap a manually-typed Executables value up to the next 100 on blur.
    const execInp = clone.querySelector('[data-org-field="exec"]');
    if (execInp) execInp.addEventListener('blur', () => roundExecUp(execInp));
    renumberOrgs();
    if (focus && nameInp) {
      nameInp.focus();
      // If we just stamped "Production" in, select it so the user can overtype quickly.
      if (nameInp.value) nameInp.select();
    }
  };
  document.getElementById('pcm-add-org').addEventListener('click', () => addOrgRow(true));

  // -------- open / close --------
  const open = (plan) => {
    if (orgsHost.children.length === 0) addOrgRow(false);
    setPlan(plan || planHidden.value || 'Business');
    setSuccessPlan(successPlanHidden.value || 'Standard');
    lastFocus = document.activeElement;
    if (window.DSP_loadRecaptcha) window.DSP_loadRecaptcha();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    // focus first contact input
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

  // Pricing card CTAs
  document.querySelectorAll('a[data-plan]').forEach(a => {
    a.addEventListener('click', (e) => {
      // Only intercept anchors pointing to the modal
      if (!a.getAttribute('href') || !a.getAttribute('href').startsWith('#plan-config')) return;
      e.preventDefault();
      open(a.dataset.plan);
    });
  });

  // Dismiss controls (backdrop + X + Esc)
  modal.querySelectorAll('[data-pcm-dismiss]').forEach(el => {
    el.addEventListener('click', close);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  // -------- work-email validation --------
  // Block common personal/free providers so plan requests are tied to a company domain.
  // Not exhaustive — meant to catch the obvious cases; sales can still flag edge cases.
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
      // Clear the error as soon as the user edits — re-validates on next blur/submit.
      if (emailInp.getAttribute('aria-invalid') === 'true') setEmailError('');
    });
  }

  // -------- submit --------
  // Rate-limit banner is rendered into #pcm-rate-limit when applicable.
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
  // Show the banner whenever the modal opens, not just at submit time, so
  // the user isn't surprised after filling everything in.
  const _openObserver = new MutationObserver(() => {
    if (!modal.hidden) showRateLimit();
  });
  _openObserver.observe(modal, { attributes: true, attributeFilter: ['hidden'] });

  // -------- live submit gating --------
  // Enable the button only when every required field is filled, the email is
  // valid (correct format AND a work-email domain), and the reCAPTCHA is solved.
  const submitBtn = form.querySelector('button[type="submit"]');
  // reCAPTCHA v2 injects a hidden <textarea name="g-recaptcha-response"> into
  // the widget once solved; its value clears on expiry. Non-empty == solved.
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
  // reCAPTCHA fires no input/change event, so its data-callback /
  // data-expired-callback (wired on the widget) re-run the gate when the
  // challenge is solved or expires.
  window.DSP_pcmCaptchaChange = refreshSubmit;
  refreshSubmit();

  form.addEventListener('submit', (e) => {
    if (trap && trap.value) { e.preventDefault(); return; }

    // Rate-limit guard — runs first so we don't validate a request we won't send.
    if (showRateLimit()) {
      e.preventDefault();
      return;
    }

    // Personal-email guard — runs before generic required-field check so the
    // dedicated message shows instead of a vague "this field is required".
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

    // Validate native required fields + flag invalid
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

    // reCAPTCHA guard — the button stays disabled until the challenge is
    // solved, so this is a belt-and-braces check (the token may expire
    // between solving and submitting).
    if (!captchaSolved()) {
      e.preventDefault();
      return;
    }

    // Serialize org details into hidden fields
    const orgs = [...orgsHost.querySelectorAll('.pcm-org')].map(row => ({
      name: row.querySelector('[data-org-field="name"]').value.trim(),
      connections: Number(row.querySelector('[data-org-field="conn"]').value) || 0,
      executables: Number(row.querySelector('[data-org-field="exec"]').value) || 0,
      daily_batch: row.querySelector('[data-org-field="batch"]').value,
    }));
    const totalConn = orgs.reduce((s, o) => s + o.connections, 0);
    const totalExec = orgs.reduce((s, o) => s + o.executables, 0);
    orgCountHidden.value = orgs.length;
    connHidden.value = totalConn;
    execHidden.value = totalExec;
    // Human-readable text block for Salesforce reps reviewing the lead.
    // Kept internal-only — actual lead payload uses the JSON below.
    if (detailsHidden) {
      detailsHidden.value = orgs.map((o, i) =>
        `Org ${i+1}: ${o.name} — ${o.connections} connection(s), ${o.executables} executable(s), ${o.daily_batch} daily batch`
      ).join('\n');
    }
    // Requested License Info (00NQl000009RvD7) holds a JSON object string:
    //   successPlan — Standard (included) or Premium (25% of license)
    //   orgs        — one object per org (name, connections, executables,
    //                 daily batch)
    if (licenseInfoHidden) {
      licenseInfoHidden.value = JSON.stringify({
        successPlan: successPlanHidden.value,
        orgs,
      });
    }

    // Let the POST proceed to the hidden iframe; swap UI to success
    setTimeout(() => {
      if (window.SubmissionLimiter) window.SubmissionLimiter.record();
      form.hidden = true;
      successEl.hidden = false;
    }, 50);
  });
})();

// =========================================================
// Demo request modal — opened by the closing-CTA "Request a demo" button.
// Lighter than the plan-config modal: no plan/org-config questions, just
// contact info + a couple of qualifying picks. Submits via hidden iframe.
// =========================================================
(() => {
  const modal   = document.getElementById('demo-request');
  if (!modal) return;
  const form    = document.getElementById('demo-request-form');
  const success = document.getElementById('drm-success');
  const trap    = form.querySelector('#drm-trap');
  const emailInp = document.getElementById('drm-email');
  const emailErr = form.querySelector('[data-error-for="drm-email"]');
  let lastFocus = null;

  // Same blocklist + helper as the plan-config modal. Duplicated locally to
  // keep this IIFE self-contained — if a third surface ever needs it, hoist.
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

  // -------- open / close --------
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

  // Closing-CTA button(s) — anything with [data-open-demo]
  document.querySelectorAll('[data-open-demo]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      open();
    });
  });

  // Dismiss controls (backdrop + X + Esc)
  modal.querySelectorAll('[data-drm-dismiss]').forEach(el => {
    el.addEventListener('click', close);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  // -------- submit --------
  // Rate-limit banner is rendered into #drm-rate-limit when applicable.
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
  // Show banner whenever the modal opens, not just at submit time.
  const _drmOpenObserver = new MutationObserver(() => {
    if (!modal.hidden) showRateLimit();
  });
  _drmOpenObserver.observe(modal, { attributes: true, attributeFilter: ['hidden'] });

  // -------- live submit gating --------
  // Enable the button only when every required field is filled, the email is
  // valid (correct format AND a work-email domain), and the reCAPTCHA is solved.
  const submitBtn = form.querySelector('button[type="submit"]');
  // reCAPTCHA v2 injects a hidden <textarea name="g-recaptcha-response"> into
  // the widget once solved; its value clears on expiry. Non-empty == solved.
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
  // reCAPTCHA fires no input/change event, so its data-callback /
  // data-expired-callback (wired on the widget) re-run the gate when the
  // challenge is solved or expires.
  window.DSP_drmCaptchaChange = refreshSubmit;
  refreshSubmit();

  form.addEventListener('submit', (e) => {
    if (trap && trap.value) { e.preventDefault(); return; }

    // Rate-limit guard — first, to avoid validating a request we won't send.
    if (showRateLimit()) {
      e.preventDefault();
      return;
    }

    // Personal-email guard first so the dedicated message wins over generic required.
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

    // Required-field check
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

    // reCAPTCHA guard — the button stays disabled until the challenge is
    // solved, so this is a belt-and-braces check (the token may expire
    // between solving and submitting).
    if (!captchaSolved()) {
      e.preventDefault();
      return;
    }

    // Every field maps to an exact Lead field by name: standard fields
    // (first_name, last_name, email, company, title, country, description)
    // plus Managed Orgs (00NQl000009hX5B) and Primary Interest
    // (00NQl000009hTj7). Nothing to serialize — the POST carries it all.

    // Let the POST proceed to the hidden iframe; swap UI to success
    setTimeout(() => {
      if (window.SubmissionLimiter) window.SubmissionLimiter.record();
      form.hidden = true;
      if (success) success.hidden = false;
    }, 50);
  });
})();

// =========================================================
// Partner inquiry modal — opened from the footer "Partners" link.
// Mirrors the demo-modal plumbing (W2L iframe POST, rate limiter, work-
// email guard, reCAPTCHA). Maps to exact Lead fields: Website (url),
// Current Client Base (00NQl000009iNmv), Description, IsPartner__c
// (00NQl000009gheT, hidden=1), Partner type (00NQl000009q31R), Company size
// (00NQl000009pxLq), Years with Salesforce (00NQl000009q3iz), and
// Certifications (00NQl000009q3mD).
// =========================================================
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

  // Shared blocklist as the other modals — duplicated locally to keep this
  // IIFE self-contained. If a fourth surface ever needs it, hoist.
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

  // -------- website (URL) normalization --------
  // type="url" needs a scheme, so a bare host ("example.com") would otherwise
  // leave the submit button stuck disabled. Auto-prepend https:// on blur.
  // Returns whether the field holds a valid URL afterwards (empty is fine —
  // the "required" check covers that). No inline message by design.
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
      // Value may have changed programmatically, so re-run the submit gate.
      refreshSubmit();
    });
  }

  // -------- open / close --------
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

  // Trigger button(s) — anything with [data-open-partner]
  document.querySelectorAll('[data-open-partner]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      open();
    });
  });

  // Dismiss (backdrop + X + Esc)
  modal.querySelectorAll('[data-prm-dismiss]').forEach(el => {
    el.addEventListener('click', close);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  // -------- submit --------
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
  // Show banner whenever the modal opens, not just at submit time.
  const _prmOpenObserver = new MutationObserver(() => {
    if (!modal.hidden) showRateLimit();
  });
  _prmOpenObserver.observe(modal, { attributes: true, attributeFilter: ['hidden'] });

  // -------- live submit gating --------
  // Enable the button only when every required field is filled, the email is
  // a valid format, and the reCAPTCHA is solved. Partners may use personal
  // emails, so no domain block.
  const submitBtn = form.querySelector('button[type="submit"]');
  // reCAPTCHA v2 injects a hidden <textarea name="g-recaptcha-response"> into
  // the widget once solved; its value clears on expiry. Non-empty == solved.
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
  // reCAPTCHA fires no input/change event, so its data-callback /
  // data-expired-callback (wired on the widget) re-run the gate when the
  // challenge is solved or expires.
  window.DSP_prmCaptchaChange = refreshSubmit;
  refreshSubmit();

  form.addEventListener('submit', (e) => {
    if (trap && trap.value) { e.preventDefault(); return; }

    // Rate-limit guard first.
    if (showRateLimit()) {
      e.preventDefault();
      return;
    }

    // Email format guard. Partners may use any email (personal addresses are
    // accepted), so there's no work-email domain block here.
    if (emailInp && emailInp.value.trim() && !DSP_isValidEmail(emailInp.value.trim())) {
      e.preventDefault();
      setEmailError("Please enter a valid email address.");
      emailInp.focus();
      return;
    }

    // Website (URL) guard — normalize (add https://) then block only if the
    // value still isn't a valid URL after that.
    if (websiteInp && websiteInp.value.trim() && !normalizeWebsite()) {
      e.preventDefault();
      websiteInp.focus();
      return;
    }

    // Required-field check
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

    // reCAPTCHA guard — the button stays disabled until the challenge is
    // solved, so this is a belt-and-braces check (the token may expire
    // between solving and submitting).
    if (!captchaSolved()) {
      e.preventDefault();
      return;
    }

    // Every field now maps to an exact Lead field by name (see the field
    // mapping note above the modal init): the four qualifiers — Partner type
    // (00NQl000009q31R), Company size (00NQl000009pxLq), Years with Salesforce
    // (00NQl000009q3iz), Certifications (00NQl000009q3mD) — POST directly, and
    // the pitch is the Description field's typed content. Nothing to serialize.

    // Let the POST proceed to the hidden iframe; swap UI to success
    setTimeout(() => {
      if (window.SubmissionLimiter) window.SubmissionLimiter.record();
      form.hidden = true;
      if (success) success.hidden = false;
    }, 50);
  });
})();

// =========================================================
// Sticky nav border on scroll
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

// Section routes — clean URLs (/capabilities, /why-dsp, …) in place of "#section".
// Firebase Hosting rewrites each path back to /index.html (see firebase.json),
// and the router below scrolls to the matching element. path → section id; they
// differ where the element id isn't a friendly URL slug.
// NOTE: the rewrites only apply when the site is served by Firebase Hosting
// (deployed, or `firebase emulators:start` / `firebase serve`). A plain static
// server / file:// will 404 on these paths when refreshed or opened directly.
const DSP_SECTION_ROUTES = {
  '/capabilities':  'surfaces',
  '/why-dsp':  'shift',
  '/security': 'security',
  '/pricing':  'pricing',
};

// Scroll-spy: highlight nav link for the section currently in view
(() => {
  const links = Array.from(document.querySelectorAll('#nav .nav-links a'))
    .filter(a => DSP_SECTION_ROUTES[a.getAttribute('href')]);
  if (!links.length || !('IntersectionObserver' in window)) return;

  // nav link by section id (resolved through the path → id route table)
  const linkById = new Map();
  links.forEach(a => {
    const id = DSP_SECTION_ROUTES[a.getAttribute('href')];
    if (id) linkById.set(id, a);
  });

  // Map: section element -> nav link it should activate.
  // Direct nav targets map to themselves; the Anatomy, Functions, and Numbers
  // sections all fall under the "Why DSP" (#shift) story, so they keep that
  // link highlighted through the whole narrative instead of leaving a gap.
  const sectionToLink = new Map();
  const register = (sectionId, linkId) => {
    const el = document.getElementById(sectionId);
    const link = linkById.get(linkId);
    if (el && link) sectionToLink.set(el, link);
  };
  linkById.forEach((link, id) => register(id, id));
  ['anatomy', 'engine', 'numbers'].forEach(id => register(id, 'shift'));
  if (!sectionToLink.size) return;

  // Track which sections are currently intersecting
  const visible = new Map(); // element -> intersectionRatio
  const setActive = () => {
    // Pick the section with highest intersection ratio that's actually visible
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
    // Anchor the "current" zone near the top: a section is considered current
    // when its top has scrolled past ~25% of the viewport.
    rootMargin: '-25% 0px -65% 0px',
    threshold: [0, 0.01, 0.1, 0.25, 0.5, 1]
  });

  sectionToLink.forEach((link, el) => io.observe(el));
})();

// Section router — intercept clicks on the section nav links so they scroll in
// place and swap the URL to the clean path via pushState (no reload), and jump
// to the right spot when the page opens at a section path directly or via
// browser back/forward.
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
    // Leave new-tab / modified clicks to the browser.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey ||
        e.shiftKey || e.altKey || a.target === '_blank') return;
    e.preventDefault();
    scrollToId(id, 'smooth');
    if (history.pushState && location.pathname !== path) {
      history.pushState(null, '', path);
    }
  });

  // Direct visit / refresh at a section path → jump straight to the section.
  if (DSP_SECTION_ROUTES[location.pathname]) {
    requestAnimationFrame(() => scrollToId(DSP_SECTION_ROUTES[location.pathname], 'auto'));
  }

  // Back/forward between section paths and the homepage root.
  window.addEventListener('popstate', () => {
    const id = DSP_SECTION_ROUTES[location.pathname];
    if (id) scrollToId(id, 'smooth');
    else if (location.pathname === '/' || location.pathname === '/index.html') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
})();

// Logo → home. The nav and footer logos link to "/", so on a real sub-page
// (e.g. /recipes) the click just navigates home. On the homepage document —
// including the section paths above — we intercept: smooth-scroll to the top
// and reset the URL to "/", instead of a full reload.
(() => {
  const onHomepage = () =>
    location.pathname === '/' ||
    location.pathname === '/index.html' ||
    Object.prototype.hasOwnProperty.call(DSP_SECTION_ROUTES, location.pathname) ||
    /^\/capabilities\//.test(location.pathname); // /capabilities/<panel> deep-links
  document.querySelectorAll('a.brand-mark').forEach(a => {
    a.addEventListener('click', (e) => {
      if (!onHomepage()) return; // real sub-pages: let the browser navigate to "/"
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (history.replaceState) history.replaceState(null, '', '/');
    });
  });
})();

// Reveal on scroll
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
    // Reveal above-the-fold elements immediately on load. The hero's lowest
    // items (e.g. the trust pip, data-d="4") sit inside the observer's bottom
    // -8% dead zone and would otherwise only appear after a small scroll.
    if (el.getBoundingClientRect().top < window.innerHeight) {
      el.classList.add('in');
    } else {
      io.observe(el);
    }
  });
})();

// Executable Anatomy stage walker
(() => {
  const buttons = document.querySelectorAll('.stage-btn');
  const rows = document.querySelectorAll('#anatomyRows .exec-row');
  const note = document.getElementById('stageNote');
  if (!buttons.length || !rows.length) return;

  const notes = {
    event: 'The trigger event is the input — a list of records from a DML operation.',
    scope: 'Scoping refines the input — filter rows, or join with another data set.',
    match: 'Match identifies the target records to act on — by field, formula, or duplicate rule.',
    map:   'Mapping transforms field values — pick from 170+ functions, or extend with Apex.',
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

  // Auto-advance once when in view
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

// Function library filter
(() => {
  const cats = document.querySelectorAll('#fnCats .fc');
  const chips = document.querySelectorAll('#fnGrid .chip');
  if (!cats.length) return;
  function applyFilter(cat) {
    const grid = document.getElementById('fnGrid');
    if (grid) grid.classList.toggle('view-all', cat === 'all');
    chips.forEach(ch => {
      let show;
      if (cat === 'all') {
        // Show only featured chips + the "more" link chip
        show = ch.dataset.featured === '1' || ch.classList.contains('more');
      } else {
        // Show chips in the chosen category; hide the "more" link
        show = !ch.classList.contains('more') && ch.dataset.cat === cat;
      }
      ch.style.display = show ? '' : 'none';
    });
  }
  cats.forEach(c => {
    c.addEventListener('click', () => {
      cats.forEach(x => x.classList.remove('on'));
      c.classList.add('on');
      applyFilter(c.dataset.cat);
    });
  });
  // Apply initial filter on load (greatest hits)
  applyFilter('all');
})();

// Surface tabs
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
    // Anchor the arrow to the BOTTOM OF THE WHOLE TAB GRID (the tab/panel
    // boundary), not the active tab's own row — when the tabs wrap to multiple
    // rows the arrow would otherwise land mid-grid instead of at the panel edge.
    const gridBottom = tabsEl ? tabsEl.getBoundingClientRect().bottom : box.bottom;
    fin.style.left = (box.left - wbox.left) + 'px';
    fin.style.top = (gridBottom - wbox.top - 1) + 'px';
    fin.style.width = box.width + 'px';
  }

  // urlMode: 'replace' (default — in-place tab switch), 'push' (footer-link
  // navigation, gets its own history entry), or 'none' (URL already correct,
  // e.g. applied from the current path on load / popstate).
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
    // Reflect the active surface in the URL as a clean path (/capabilities/<key>).
    const path = '/capabilities/' + key;
    if (urlMode === 'none') { /* URL already matches — leave history untouched */ }
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

  // Each surface is reachable at a clean path /capabilities/<panel>. These aren't real
  // element ids, so the browser won't scroll on its own — switch to that surface
  // and bring the section into view ourselves.
  const PANEL_PATH = /^\/capabilities\/(batch|trigger|loader|ui|query)\/?$/;
  function scrollToSurfaces(behavior) {
    const surfacesEl = document.getElementById('surfaces');
    if (!surfacesEl) return;
    const nav = document.getElementById('nav');
    const navH = nav ? nav.offsetHeight : 0;
    const y = surfacesEl.getBoundingClientRect().top + window.scrollY - navH - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: behavior || 'auto' });
  }
  // Apply the current path on load and on browser back/forward.
  function applyPath(behavior) {
    const m = location.pathname.match(PANEL_PATH);
    if (!m) return;
    show(m[1], 'none');
    requestAnimationFrame(() => scrollToSurfaces(behavior));
  }
  applyPath('auto');
  window.addEventListener('popstate', () => applyPath('smooth'));

  // Footer "Capabilities" links (/capabilities/<panel>) — intercept so they switch
  // the surface in place (no reload) and push a history entry, instead of doing
  // a full navigation. Runs even when the page is already open.
  document.addEventListener('click', (e) => {
    const a = e.target.closest ? e.target.closest('a[href^="/capabilities/"]') : null;
    if (!a) return;
    const m = a.getAttribute('href').match(PANEL_PATH);
    if (!m) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey ||
        e.shiftKey || e.altKey || a.target === '_blank') return;
    e.preventDefault();
    show(m[1], 'push');
    scrollToSurfaces('smooth');
  });

  // Reposition fin on resize / load
  const initial = tabList.find(t => t.classList.contains('active')) || tabList[0];
  window.addEventListener('load', () => placeFin(initial));
  window.addEventListener('resize', () => {
    const a = tabList.find(t => t.classList.contains('active')) || tabList[0];
    placeFin(a);
  });
  // Initial place after fonts/layout settle
  requestAnimationFrame(() => placeFin(initial));
  setTimeout(() => placeFin(tabList.find(t => t.classList.contains('active')) || tabList[0]), 250);

  const activeOrFirst = () => tabList.find(t => t.classList.contains('active')) || tabList[0];
  // Re-place once web fonts finish loading — font swap reflows the tab strip
  // and would otherwise leave the arrow at a stale (misplaced) position.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => placeFin(activeOrFirst()));
  }
  // Keep the arrow locked to the active tab through ANY layout change of the
  // tab strip (font swap, OS/browser zoom, container reflow) — covers cases the
  // load/resize/timeout triggers miss.
  if (window.ResizeObserver) {
    const tabsEl = tabList[0] && (tabList[0].closest('.surface-tabs') || tabList[0].parentElement);
    if (tabsEl) new ResizeObserver(() => placeFin(activeOrFirst())).observe(tabsEl);
  }

  // The tab strip animates in with a `.reveal` (translateY) entrance. placeFin
  // measures via getBoundingClientRect, which INCLUDES that transform — so any
  // placement that runs during the 0.7s reveal pins the arrow to the mid-
  // animation spot and it ends up detached. Re-place when the reveal transition
  // finishes (ResizeObserver can't see transforms), with a timer backstop.
  {
    const stripEl = tabList[0] && (tabList[0].closest('.surface-tabs') || tabList[0].parentElement);
    if (stripEl) {
      stripEl.addEventListener('transitionend', (e) => {
        if (e.propertyName === 'transform') placeFin(activeOrFirst());
      });
    }
    setTimeout(() => placeFin(activeOrFirst()), 900);
  }

  // First-visit auto-cycle when section enters viewport
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

  // Slim sub-bar: a separate, always-slim tab bar that fades in and pins once the
  // full cards have scrolled past the nav, then releases at the end of the section.
  const subbar = document.getElementById('surfaceSubbar');
  const subSentinel = document.getElementById('subbarSentinel');
  const siteNav = document.getElementById('nav');
  if (subbar && subSentinel && 'IntersectionObserver' in window) {
    subTabs.forEach(t => t.addEventListener('click', () => {
      show(t.dataset.panel);
      // The slim bar is pinned while the user is scrolled deep into a panel.
      // Switching capabilities here must also take them to the START of the
      // chosen capability — otherwise the panel swaps underneath them and they
      // stay stranded mid-content. Scroll the big tab shelf just under the nav.
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
      // Pull the bar up by its own height so it has no resting layout footprint.
      subbar.style.marginTop = '-' + Math.ceil(subbar.offsetHeight) + 'px';
    };
    sizeBar();
    window.addEventListener('resize', sizeBar);
    window.addEventListener('load', sizeBar);
    requestAnimationFrame(sizeBar);
    setTimeout(sizeBar, 300);

    // Reveal the bar only while the section is scrolled past the full cards
    // (sentinel above the nav line) — i.e. while the slim bar is actually pinned.
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

// Capability tabs
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

// Batch execution widget animation
(() => {
  const widgets = document.querySelectorAll('.batch-widget');
  if (!widgets.length) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = n => Math.round(n).toLocaleString('en-US');

  const TARGET_TOTAL = 1039809; // headline total — the run always lands here
  const BATCH_SIZE = 2000;      // Salesforce default — regular batch row shows 2,000
  const LAST_BATCH_SIZE = 1809; // realistic remainder for 1,039,809 in 2,000-chunks
  const N_BATCHES = 40;         // visible batch rows over the run (demo, not literal)
  const TICK_SLOW_MS = 260;     // starting cadence (warm-up)
  const TICK_FAST_MS = 40;      // ending cadence (full throttle)
  const TOTAL_RUN_MS = (TICK_SLOW_MS + TICK_FAST_MS) / 2 * N_BATCHES; // matches the eased-tick sum
  const REST_MS = 6000;         // pause after completion before resetting and replaying
  const MAX_SUBROWS = 5;        // how many batch rows to keep visible

  // Smooth, symmetric acceleration: smoothstep starts and ends gently with the
  // steepest change in the middle — feels less abrupt than t² at the tail end.
  const smoothstep = t => t * t * (3 - 2 * t);

  function checkSVG() {
    return '<span class="ck"><svg viewBox="0 0 16 16" fill="none"><path d="M4 8l2.5 2.5L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  }

  function buildGhostRow() {
    // A row that occupies space but renders nothing visible — keeps the widget at
    // its full height from the moment it loads, even before any batch arrives.
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
    // Wipe any batch rows (real or ghost), then re-seed with 5 ghosts so the
    // table holds its height while empty.
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
      // Only the Retrieved/Actioned cells carry data-bw-target — Failed stays at its
      // static 0 (a successful run has no failures), so it must NOT be driven by the counter.
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

    // Always remove one row from the bottom (ghost first, then oldest real)
    // BEFORE inserting, so the visible row count stays at exactly MAX_SUBROWS.
    const subRows = s.tbody.querySelectorAll('tr:not([data-bw-row="total"])');
    if (subRows.length >= MAX_SUBROWS) {
      subRows[subRows.length - 1].remove();
    }

    s.totalRow.after(row);
    requestAnimationFrame(() => {
      row.style.opacity = '1';
      row.style.transform = 'none';
    });

    // The total counter is animated continuously by a rAF loop (see tickTotal
    // below). We only bump the row counter here so the easing curve maps to
    // the right point on the timeline.
    s.batchesDone += 1;
    return true;
  }

  widgets.forEach(w => {
    const s = init(w);
    if (!s) return;
    s.isHero = !!w.closest('.hero-scene');

    // rAF loop that smoothly counts the total up every frame, decoupled from
    // the (much slower) row-insertion cadence. Without this, the total jumps
    // in big chunks at each tick — this fills in the in-between values.
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
        // Snap the total to the exact target — eased progress already lands here.
        s.total = TARGET_TOTAL;
        s.totalCells.forEach(td => { td.textContent = fmt(TARGET_TOTAL); });
        setTotalCheck(s.totalRow);
        if (s.toast) s.toast.classList.add('on');
        if (s.runBtn) { s.runBtn.classList.add('done'); s.runBtn.lastChild.nodeValue = 'Done'; }
        clearTimeout(s.timer);
        if (s.rafId) { cancelAnimationFrame(s.rafId); s.rafId = 0; }
        // Hero: run once and hold the finished state, then tell the rotator the
        // demo is done so it can advance to the next capability.
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

      // Tick cadence eases from slow → fast over the course of the run. Indexed
      // by batch number so the curve doesn't drift if the tab is throttled.
      const progress = s.batchesDone / N_BATCHES;
      const eased = smoothstep(progress);
      const nextTick = TICK_SLOW_MS + (TICK_FAST_MS - TICK_SLOW_MS) * eased;
      s.timer = setTimeout(loop, nextTick);
    }

    if (reduce) {
      // Reduced motion: paint a plausible finished snapshot and stop.
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

    // Hero batch: drive off the rotator scene's active state so it runs exactly
    // once when the scene appears, then holds completed until the rotator moves on.
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

    // Also pause when the tab is hidden — saves background CPU on long-open tabs.
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

// Pipeline execution widget animation
(() => {
  const widgets = document.querySelectorAll('.pipeline-widget');
  if (!widgets.length) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const checkSVG = '<svg viewBox="0 0 16 16" fill="none"><path d="M4 8l2.5 2.5L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Per-widget state map
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
    // Total step-increments + cap of ~60 visible ticks per row (smooth odometer feel).
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

    if (reduce) {
      rows.forEach(r => {
        r.classList.remove('pending');
        const status = r.querySelector('.pw-status');
        if (status) { status.classList.add('done'); status.innerHTML = checkSVG; }
        const tgt = parseInt(r.dataset.pwTarget, 10) || 0;
        r.querySelectorAll('.pw-retrieved, .pw-actioned').forEach(c => c.textContent = fmt(tgt));
      });
      if (toast) toast.classList.add('on');
      return;
    }

    const rowList = [...rows];
    function next() {
      if (!rowList.length) {
        ts(w, () => { if (toast) toast.classList.add('on'); }, 250);
        return;
      }
      const row = rowList.shift();
      animateRow(w, row, 900, next);
    }
    ts(w, next, 300);
  }

  // Estimate loop duration: rows × (~900 + 120 + ~250) + 250 toast + 300 init ≈ rows×1.27s + 550ms
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

// Trigger Execution Trace animation
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
    // Reset
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
    // Sequential firing
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
    // Replay 5s after the trace finishes (in-page section only)
    if (replay) {
      widget._ttReplay = setTimeout(() => animateTrace(widget, true), lastEnd + 5000);
    }
    // Signal completion to the hero rotator so it can advance.
    if (onDone) push(onDone, lastEnd + 200);
  }

  // Hero trigger: gate on the rotator scene's active state — run once per
  // activation and emit 'demodone' when the trace finishes (no self-replay).
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

// =========================================================
// Mobile nav (hamburger panel) + desktop Resources dropdown
// =========================================================
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
    // Close the panel whenever a link/CTA inside it is activated.
    panel.querySelectorAll('[data-nav-link]').forEach(el => {
      el.addEventListener('click', () => setOpen(false));
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('menu-open')) setOpen(false);
    });
    // If the viewport grows back to desktop while open, reset cleanly.
    window.addEventListener('resize', () => {
      if (window.innerWidth > 980 && nav.classList.contains('menu-open')) setOpen(false);
    });
  }

  // Resources dropdown — CSS handles hover; JS adds click + keyboard (touch,
  // and users who tab to the trigger and press Enter/Space).
  const dd = document.getElementById('navResources');
  if (dd) {
    const trigger = dd.querySelector('.nav-dd-trigger');
    const menu = dd.querySelector('.nav-dd-menu');
    if (trigger && menu) {
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
    }
  }
})();


// Hero capability rotator — cross-fades #Batch → #UI → #Trigger → #Query
(() => {
  const rot = document.getElementById('heroRotator');
  if (!rot) return;
  const scenes = [...rot.querySelectorAll('.hero-scene')];
  const dots = [...rot.querySelectorAll('.hero-dot')];
  if (scenes.length < 2) return;
  const DWELL = 15000;        // each capability card holds for 15s, then shifts
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

  // Fixed 20s dwell per capability, independent of when each demo signals
  // completion — guarantees the rotation always advances.
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

  dots.forEach((d, k) => d.addEventListener('click', () => { go(k); armScene(); }));
  rot.addEventListener('mouseenter', () => { paused = true; clearTimers(); });
  rot.addEventListener('mouseleave', () => { paused = false; armScene(); });

  // Start on the first capability (#UI), then advance as each demo completes.
  go(0);
  armScene();
})();

// #UI hero — faithful "actionable data list" demo (anchored on the screenshot).
// Guided tour of the surface: open the Priority column filter and drop "Low" →
// select the matching rows → custom actions enable → run the bulk "Accept" action,
// pushing the new status to every selected row → success toast. Pagination, search,
// built-in actions and the record count are all present so the capability reads at a glance.
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
  const acceptBtn = cacts.querySelector('[data-al-accept]');   // bulk "Accept" custom action
  const toast    = card.querySelector('[data-al-toast]');

  const SEL = [0, 2, 4, 5];        // selected rows (all High/Medium)
  const LOW = [1, 3];              // Low rows dropped by the filter
  const NEW_STATUS = 'In Progress';    // bulk action sets selected cases to In Progress
  // When the Low rows are filtered out, the page stays full — other matching
  // records take their place (server has 112 matches, not just 4).
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

    // Phase A — FILTER first: open picker, check High + Medium, total count changes
    at(550,  () => filter.classList.add('open'));
    at(1000, () => highChk.classList.add('on'));
    at(1280, () => medChk.classList.add('on'));
    at(1700, () => filter.classList.remove('open'));
    at(1880, () => {
      applyFilter(rows, true);   // page stays full — matches replace the dropped rows
      if (rc) rc.textContent = '112';
      filterVal.textContent = 'High, Medium';
      filterBox.classList.add('has');
      if (lastPg) lastPg.textContent = '12';
    });

    // Phase B — SELECT the filtered rows; custom actions light up
    const tSel = 2350;
    SEL.forEach((ri, k) => at(tSel + k * 230, () => {
      rows[ri].classList.add('sel');
      rows[ri].querySelector('[data-al-ck]').classList.add('on');
      selnote.textContent = (k + 1) + ' item' + (k ? 's' : '') + ' selected';
      selnote.classList.add('sel');
      ckall.classList.add('some');
    }));
    const tSelDone = tSel + SEL.length * 230;
    at(tSelDone + 60,  () => { cacts.classList.add('on'); cacts.querySelectorAll('.al-cbtn').forEach(b => b.classList.add('flash')); });
    at(tSelDone + 760, () => cacts.querySelectorAll('.al-cbtn').forEach(b => b.classList.remove('flash')));

    // Phase C — ACTION: run the bulk "Accept" custom action; selected rows move to the new status
    const tAct = tSelDone + 900;
    at(tAct,       () => { if (acceptBtn) acceptBtn.classList.add('press'); });
    at(tAct + 160, () => { if (acceptBtn) acceptBtn.classList.remove('press'); });
    SEL.forEach((ri, k) => at(tAct + 280 + k * 110, () => {
      const c = rows[ri].querySelector('[data-al-stat]');
      setStat(c, NEW_STATUS);
      c.classList.add('lit');
    }));

    // Phase D — success toast + de-select
    const tToast = tAct + 280 + SEL.length * 110 + 60;
    at(tToast, () => {
      toast.classList.add('on');
      // de-select at the same instant the success message pops
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
  }

  // Trigger when the scene becomes active in the rotator; clear when it leaves.
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

// #Query hero — "anyone queries without SOQL" demo: pick a saved query → build
// filters by clicking (incl. a dynamic filter) → Run → results land in an
// editable data list → manipulate a result inline. Hits all four capabilities.
(() => {
  const card = document.getElementById('queryHero');
  if (!card) return;
  const scene = card.closest('.hero-scene');
  if (!scene) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nameEl  = card.querySelector('[data-qh-name]');
  const saved   = card.querySelector('[data-qh-saved]');
  const sqPick  = card.querySelector('[data-qh-sq]');           // first saved query
  const c1      = card.querySelector('[data-qh-c1]');
  const c2      = card.querySelector('[data-qh-c2]');
  const addf    = card.querySelector('[data-qh-addf]');
  const runBtn  = card.querySelector('[data-qh-run]');
  const rows    = [...card.querySelectorAll('[data-qh-row]')];
  const countEl = card.querySelector('[data-qh-count]');
  const rateEl  = card.querySelector('[data-qh-rate]');         // Acme's Rating cell
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
    c1.classList.remove('in');
    c2.classList.remove('in');
    addf.classList.remove('armed');
    runBtn.classList.remove('press');
    rows.forEach(r => r.classList.remove('in'));
    countEl.textContent = '0';
    rateEl.textContent = 'Proposal';
    rateEl.classList.remove('editing', 'lit');
    toast.classList.remove('on');
  }

  function paintFinal() {
    nameEl.textContent = PICK_NAME;
    c1.classList.add('in');
    c2.classList.add('in');
    rows.forEach(r => r.classList.add('in'));
    countEl.textContent = fmt(COUNT);
    rateEl.textContent = NEW_RATE;
    toast.classList.add('on');
  }

  function play() {
    reset();
    if (reduce) { paintFinal(); setTimeout(fireDone, 1800); return; }

    // Phase A — manage saved queries: open the menu and pick one
    at(600,  () => saved.classList.add('open'));
    at(1150, () => sqPick.classList.add('pick'));
    at(1600, () => { saved.classList.remove('open'); nameEl.textContent = PICK_NAME; });

    // Phase B — build filters by clicking (incl. a dynamic filter)
    at(2000, () => addf.classList.add('armed'));
    at(2250, () => { c1.classList.add('in'); });
    at(2800, () => { c2.classList.add('in'); });           // dynamic: Owner = $CurrentUser
    at(3050, () => addf.classList.remove('armed'));

    // Phase C — Run → results land in an editable data list
    at(3350, () => runBtn.classList.add('press'));
    at(3500, () => runBtn.classList.remove('press'));
    rows.forEach((r, k) => at(3650 + k * 170, () => r.classList.add('in')));
    at(3700, () => countTo(COUNT, 1000));

    // Phase D — manipulate a result inline (editable Rating)
    const tEdit = 3650 + rows.length * 170 + 500;
    at(tEdit,        () => rateEl.classList.add('editing'));
    at(tEdit + 650,  () => { rateEl.textContent = NEW_RATE; });
    at(tEdit + 1050, () => { rateEl.classList.remove('editing'); rateEl.classList.add('lit'); });
    at(tEdit + 1250, () => { toast.classList.add('on'); fireDone(); });
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
// Plays when the loader scene activates: file drops & parses → field-mapping
// rows stream in and light up (transformations applied at load) → Run Upsert →
// status goes Running, progress bar fills while the audit row counts up → Done +
// success toast. Tells the self-serve import story end to end.
(() => {
  const card = document.getElementById('loaderHero');
  if (!card) return;
  const scene = card.closest('.hero-scene');
  if (!scene) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  function play() {
    reset();
    if (reduce) { paintFinal(); setTimeout(fireDone, 1800); return; }

    // 1 — file drops & parses
    at(500,  () => { drop.classList.add('parsed'); meta.textContent = 'parsing…'; });
    at(1150, () => { meta.textContent = fmt(TOTAL) + ' rows · 14 columns · 2.4 mb'; });

    // 2 — mapping rows stream in, then light up as the transforms apply
    mrows.forEach((r, k) => at(1500 + k * 220, () => r.classList.add('in')));
    const tApplied = 1500 + mrows.length * 220 + 150;
    mrows.forEach((r, k) => at(tApplied + k * 120, () => r.classList.add('applied')));

    // 3 — Run Upsert
    const tRun = tApplied + mrows.length * 120 + 420;
    at(tRun,        () => runBtn.classList.add('press'));
    at(tRun + 150,  () => runBtn.classList.remove('press'));
    at(tRun + 200,  () => {
      runBtn.classList.add('running');
      statusEl.className = 'hl-status running';
      statusEl.textContent = 'Running';
      progress.classList.add('on');
    });

    // 4 — progress bar fills while the audit row counts up
    const fillStart = tRun + 280, fillDur = 2600, steps = 26;
    for (let i = 1; i <= steps; i++) {
      at(fillStart + (fillDur / steps) * i, () => {
        const p = i / steps;
        bar.style.width = (p * 100) + '%';
        audit.innerHTML = '<b>' + fmt(Math.round(TOTAL * p)) + '</b> of ' + fmt(TOTAL) + ' upserted…';
      });
    }

    // 5 — done + success toast
    const tDone = fillStart + fillDur + 120;
    at(tDone, () => {
      runBtn.classList.remove('running');
      statusEl.className = 'hl-status done';
      statusEl.textContent = 'Done';
      bar.classList.add('done');
      audit.classList.add('done');
      audit.innerHTML = '<b>' + fmt(TOTAL) + '</b> upserted · 0 failed · 45s';
      toast.classList.add('on');
      fireDone();
    });
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


// Challenges/Solutions rows — click to pin a row open or folded (hover still
// previews after a delay; clicking toggles a persistent .open state).
(() => {
  document.addEventListener('click', (e) => {
    const row = e.target.closest ? e.target.closest('.cs-row') : null;
    if (!row) return;
    if (e.target.closest('a, button')) return; // don't hijack links/buttons inside
    row.classList.toggle('open');
  });
})();


// Keep --nav-h in sync with the sticky nav's real height so the hero fills
// exactly to the viewport bottom (the outcome ribbon's border lands on the fold).
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
