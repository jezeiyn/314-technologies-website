(function () {
  const { h, clear, LABELS, SECTORS, CURRENCIES, PROFICIENCY } = UI;
  const API = window.TalentAPI;
  const CFG = window.TALENT_CONFIG;
  const app = document.getElementById("app");

  const S = {
    full_name: "", email: "", phone: "", country: "", city: "", current_title: "", current_employer: "",
    hide_employer: false, employer_approval_needed: false, headline: "", seniority: "", years_experience: "",
    languages: "English", sectors: new Set(), linkedin_url: "", github_url: "", portfolio_url: "",
    primaryDomain: "", primaryYears: "", extraDomains: new Set(), skills: new Map(), other_skills: "",
    offerings: new Set(), credentials: [{ name: "", issuer: "", credential_ref: "", expires_on: "" }],
    engagement_modes: new Set(), availability: "within_30_days", available_from: "", rate_currency: "AED",
    day_rate_min: "", day_rate_max: "", advisory_hourly_rate: "", work_modes: new Set(), willing_to_relocate: false,
    advisory_topics: "", referred_by: "", consent_db: false, consent_share: false, hp: ""
  };
  const STEPS = ["About you", "Expertise", "Where you fit", "How you work", "Consent"];
  let step = 0, REF = null, errors = {};

  // ---- form building blocks ----
  const field = (label, control, opts = {}) => h("div", { class: "field" },
    h("label", { for: control.id || null }, label, opts.optional ? h("span", { class: "opt", text: " (optional)" }) : null),
    control, opts.hint ? h("div", { class: "hint", text: opts.hint }) : null,
    opts.err && errors[opts.err] ? h("div", { class: "error", role: "alert", text: errors[opts.err] }) : null);

  const text = (key, o = {}) => h("input", { id: "f_" + key, type: o.type || "text", value: S[key], autocomplete: o.auto || "off",
    maxlength: o.max || 200, placeholder: o.ph || null, min: o.min, max: o.maxv, inputmode: o.inputmode || null,
    oninput: (e) => { S[key] = e.target.value; } });

  const select = (key, options, o = {}) => h("select", { id: "f_" + key, onchange: (e) => { S[key] = e.target.value; delete errors[key]; if (o.rerender) render(); } },
    (o.blank ? [h("option", { value: "", text: o.blank })] : []),
    options.map(([v, l]) => h("option", { value: v, selected: S[key] === v, text: l })));

  const check = (label, get, set, hint) => h("label", { class: "check" },
    h("input", { type: "checkbox", checked: get(), onchange: (e) => set(e.target.checked) }),
    h("span", {}, label, hint ? h("span", { class: "muted small", text: " " + hint }) : null));

  const chipSet = (setObj, items, rerender) => h("div", { class: "chips" }, items.map(([v, l]) =>
    h("label", { class: "chip" }, h("input", { type: "checkbox", checked: setObj.has(v),
      onchange: (e) => { e.target.checked ? setObj.add(v) : setObj.delete(v); if (rerender) render(); } }), l)));

  // ---- steps ----
  function stepAbout() {
    return h("section", { class: "panel" }, h("h2", { text: "About you" }),
      h("p", { class: "lead", text: "Basic details so we can reach you and understand where you are in your career." }),
      h("div", { class: "grid-2" },
        field("Full name", text("full_name", { auto: "name" }), { err: "full_name" }),
        field("Email", text("email", { type: "email", auto: "email" }), { err: "email", hint: "We use this to contact you about relevant work. We never publish it." })),
      h("div", { class: "grid-2" },
        field("Phone or WhatsApp", text("phone", { type: "tel", auto: "tel" }), { optional: true }),
        field("Country you are based in", text("country", { auto: "country-name" }), { err: "country" })),
      h("div", { class: "grid-2" },
        field("City", text("city", { auto: "address-level2" }), { optional: true }),
        field("Current job title", text("current_title"), { err: "current_title" })),
      field("Current employer", text("current_employer"), { optional: true }),
      check("Do not show my employer's name to clients. Describe it generally instead.", () => S.hide_employer, v => S.hide_employer = v),
      check("My employer requires approval for outside work.", () => S.employer_approval_needed, v => S.employer_approval_needed = v,
        "We will not approach you for outside work until you confirm you are cleared."),
      h("div", { style: "height:14px" }),
      field("One line that describes what you do", text("headline", { max: 160, ph: "e.g. Cloud security architect for regulated industries" }), { optional: true }),
      h("div", { class: "grid-3" },
        field("Seniority", select("seniority", Object.entries(LABELS.seniority), { blank: "Select" }), { err: "seniority" }),
        field("Years of experience", text("years_experience", { type: "number", min: 0, maxv: 60, inputmode: "numeric" }), { err: "years_experience" }),
        field("Languages", text("languages", { max: 120 }), { hint: "Separate with commas." })),
      field("Sectors you have worked in", chipSet(S.sectors, SECTORS.map(s => [s, s])), { optional: true }),
      h("div", { class: "grid-3" },
        field("LinkedIn", text("linkedin_url", { type: "url", ph: "https://" }), { optional: true }),
        field("GitHub", text("github_url", { type: "url", ph: "https://" }), { optional: true }),
        field("Portfolio or website", text("portfolio_url", { type: "url", ph: "https://" }), { optional: true })));
  }

  function stepExpertise() {
    const domOpts = REF.domains.map(d => [d.slug, d.name]);
    const picked = [S.primaryDomain, ...S.extraDomains].filter(Boolean);
    const groups = picked.map(slug => {
      const dom = REF.domains.find(d => d.slug === slug);
      const skills = REF.skills.filter(s => s.domain_id === dom.id);
      return h("div", { class: "skill-group" }, h("h3", { text: dom.name }),
        skills.map(sk => {
          const on = S.skills.has(sk.slug);
          const row = h("div", { class: "skill-row" + (on ? "" : " off") },
            h("label", { class: "check", style: "margin:0" },
              h("input", { type: "checkbox", checked: on, onchange: (e) => {
                if (e.target.checked) S.skills.set(sk.slug, { proficiency: 3 }); else S.skills.delete(sk.slug); delete errors.skills;
                row.classList.toggle("off", !e.target.checked); } }),
              h("span", {}, sk.name, sk.vendor ? h("span", { class: "tag", style: "margin-left:8px", text: sk.vendor }) : null)),
            h("select", { "aria-label": "Level for " + sk.name, onchange: (e) => { const v = S.skills.get(sk.slug); if (v) v.proficiency = +e.target.value; } },
              Object.entries(PROFICIENCY).map(([n, l]) => h("option", { value: n, selected: (S.skills.get(sk.slug)?.proficiency || 3) == n, text: l }))));
          return row;
        }));
    });
    return h("section", { class: "panel" }, h("h2", { text: "Your expertise" }),
      h("p", { class: "lead", text: "Choose your main area, then the skills you would put your name to. Be honest about your level. We check." }),
      h("div", { class: "grid-2" },
        field("Main area of expertise", select("primaryDomain", domOpts, { blank: "Select", rerender: true }), { err: "primaryDomain" }),
        field("Years in this area", text("primaryYears", { type: "number", min: 0, maxv: 60 }), { optional: true })),
      field("Other areas you work in", chipSet(S.extraDomains, REF.domains.filter(d => d.slug !== S.primaryDomain).map(d => [d.slug, d.name]), true), { optional: true }),
      picked.length ? h("div", {}, h("div", { class: "small muted", style: "margin-bottom:6px", text: "Tick your skills and set a level for each." }), groups, errors.skills ? h("div", { class: "error", role: "alert", text: errors.skills }) : null)
        : h("p", { class: "muted", text: "Pick a main area to see its skills." }),
      h("div", { style: "height:16px" }),
      field("Anything else we should know about your skills", h("textarea", { id: "f_other", maxlength: 1000, oninput: (e) => S.other_skills = e.target.value, value: S.other_skills }), { optional: true }),
      h("h3", { text: "Certifications" }),
      h("p", { class: "muted small", text: "Add the ones that matter for the work you want. We verify them with the issuer before they show as verified." }),
      S.credentials.map((c, i) => h("div", { class: "cred-row" },
        h("div", {}, h("label", { class: i ? "sr-only" : null, text: "Certification" }), h("input", { type: "text", value: c.name, maxlength: 160, placeholder: "e.g. Professional Cloud Architect", oninput: e => c.name = e.target.value })),
        h("div", {}, h("label", { class: i ? "sr-only" : null, text: "Issuer" }), h("input", { type: "text", value: c.issuer, maxlength: 120, oninput: e => c.issuer = e.target.value })),
        h("div", {}, h("label", { class: i ? "sr-only" : null, text: "Credential ID" }), h("input", { type: "text", value: c.credential_ref, maxlength: 120, oninput: e => c.credential_ref = e.target.value })),
        h("div", {}, h("label", { class: i ? "sr-only" : null, text: "Expires" }), h("input", { type: "date", value: c.expires_on, oninput: e => c.expires_on = e.target.value })),
        h("button", { class: "btn btn-sm", type: "button", "aria-label": "Remove certification", onclick: () => { S.credentials.splice(i, 1); if (!S.credentials.length) S.credentials.push({ name: "", issuer: "", credential_ref: "", expires_on: "" }); render(); }, text: "Remove" }))),
      S.credentials.length < 12 ? h("button", { class: "btn btn-sm", type: "button", onclick: () => { S.credentials.push({ name: "", issuer: "", credential_ref: "", expires_on: "" }); render(); }, text: "Add another" }) : null);
  }

  function stepFit() {
    const lines = ["consulting", "dpi", "cloud"];
    return h("section", { class: "panel" }, h("h2", { text: "Where you could fit" }),
      h("p", { class: "lead", text: "These are the 314 service lines and products. Tick the ones where your experience would help. This is how we find you quickly when a contract lands." }),
      lines.map(l => h("div", { class: "offer-line" }, h("h3", { text: LABELS.line[l] }),
        h("div", { class: "chips" }, REF.offerings.filter(o => o.service_line === l).map(o =>
          h("label", { class: "chip", title: o.summary }, h("input", { type: "checkbox", checked: S.offerings.has(o.slug),
            onchange: e => e.target.checked ? S.offerings.add(o.slug) : S.offerings.delete(o.slug) }), o.name))))),
      errors.offerings ? h("div", { class: "error", role: "alert", text: errors.offerings }) : null);
  }

  function stepWork() {
    const adv = S.engagement_modes.has("advisory");
    return h("section", { class: "panel" }, h("h2", { text: "How you like to work" }),
      h("p", { class: "lead", text: "Tick every kind of engagement you would consider." }),
      h("div", { class: "field" }, h("label", { text: "Engagement types" }),
        chipSet(S.engagement_modes, Object.entries(LABELS.modes), true),
        h("div", { class: "hint", text: "Advisory means paid expert input by the hour, such as reviews, workshops and second opinions." }),
        errors.engagement_modes ? h("div", { class: "error", role: "alert", text: errors.engagement_modes }) : null),
      h("div", { class: "grid-2" },
        field("When could you start?", select("availability", Object.entries(LABELS.availability)), {}),
        field("Or from a specific date", text("available_from", { type: "date" }), { optional: true })),
      h("div", { class: "grid-3" },
        field("Currency", select("rate_currency", CURRENCIES.map(c => [c, c]))),
        field("Day rate, from", text("day_rate_min", { type: "number", min: 0 }), { optional: true }),
        field("Day rate, to", text("day_rate_max", { type: "number", min: 0 }), { optional: true })),
      h("p", { class: "muted small", text: "Rates are only used internally to check fit with a project budget. They are never shown to clients without your approval." }),
      adv ? field("Advisory hourly rate", text("advisory_hourly_rate", { type: "number", min: 0 }), { optional: true }) : null,
      adv ? field("What could you advise on?", h("textarea", { id: "f_adv", maxlength: 1500, value: S.advisory_topics, oninput: e => S.advisory_topics = e.target.value }),
        { hint: "For example: zero trust roadmaps, GCP landing zone reviews, ISO 27001 readiness.", err: "advisory_topics" }) : null,
      field("Where can you work?", chipSet(S.work_modes, Object.entries(LABELS.work)), { optional: true }),
      check("I would consider relocating for the right project.", () => S.willing_to_relocate, v => S.willing_to_relocate = v),
      h("div", { style: "height:14px" }),
      field("Who referred you?", text("referred_by", { max: 120 }), { optional: true }));
  }

  function stepConsent() {
    return h("section", { class: "panel" }, h("h2", { text: "Consent" }),
      h("p", { class: "lead", text: "We hold your details only for matching you to work, and you can ask us to change or delete them at any time." }),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: S.consent_db, onchange: e => S.consent_db = e.target.checked }),
        h("span", {}, "I agree that Three One Four Technologies L.L.C may store the information in this form and use it to contact me about relevant work. I have read the ", h("a", { href: "/careers/privacy", target: "_blank", rel: "noopener", text: "privacy notice" }), ".")),
      errors.consent ? h("div", { class: "error", role: "alert", text: errors.consent }) : null,
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: S.consent_share, onchange: e => S.consent_share = e.target.checked }),
        h("span", {}, "I am happy for 314 to share an anonymised summary of my profile with clients when proposing a team. My name and contact details are only shared after I say yes to that specific opportunity. ", h("span", { class: "muted", text: "(optional)" }))),
      h("div", { class: "honeypot", "aria-hidden": "true" }, h("label", { for: "f_hp", text: "Leave this empty" }), h("input", { id: "f_hp", type: "text", tabindex: "-1", autocomplete: "off", oninput: e => S.hp = e.target.value })),
      errors.submit ? h("div", { class: "error", role: "alert", text: errors.submit }) : null);
  }

  // ---- validation and submit ----
  const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  function validate(i) {
    errors = {};
    if (i === 0) {
      if (S.full_name.trim().length < 2) errors.full_name = "Please enter your full name.";
      if (!EMAIL.test(S.email.trim())) errors.email = "Please enter a valid email address.";
      if (!S.country.trim()) errors.country = "Please enter your country.";
      if (!S.current_title.trim()) errors.current_title = "Please enter your job title.";
      if (!S.seniority) errors.seniority = "Please choose a level.";
      if (S.years_experience === "" || +S.years_experience < 0 || +S.years_experience > 60) errors.years_experience = "Enter a number from 0 to 60.";
    }
    if (i === 1) {
      if (!S.primaryDomain) errors.primaryDomain = "Please choose your main area.";
      else {
        const live = new Set([S.primaryDomain, ...S.extraDomains]);
        const inLive = REF.skills.filter(sk => S.skills.has(sk.slug) && live.has(REF.domains.find(d => d.id === sk.domain_id).slug));
        if (!inLive.length) errors.skills = "Tick at least one skill.";
      }
    }
    if (i === 2 && !S.offerings.size) errors.offerings = "Tick at least one, or choose the closest match.";
    if (i === 3) {
      if (!S.engagement_modes.size) errors.engagement_modes = "Choose at least one.";
      if (S.engagement_modes.has("advisory") && !S.advisory_topics.trim()) errors.advisory_topics = "Tell us what you could advise on.";
    }
    if (i === 4 && !S.consent_db) errors.consent = "We need your consent to store your details.";
    return !Object.keys(errors).length;
  }

  function payload() {
    const num = v => (v === "" || v == null) ? null : +v;
    const domains = [{ slug: S.primaryDomain, is_primary: true, years: num(S.primaryYears) }, ...[...S.extraDomains].map(s => ({ slug: s, is_primary: false }))];
    const liveSlugs = new Set(domains.map(d => d.slug));
    const skillSlugs = new Map(REF.skills.map(s => [s.slug, REF.domains.find(d => d.id === s.domain_id).slug]));
    return {
      full_name: S.full_name.trim(), email: S.email.trim(), phone: S.phone.trim(), country: S.country.trim(), city: S.city.trim(),
      current_title: S.current_title.trim(), current_employer: S.current_employer.trim(), employer_display: S.hide_employer ? "anonymised" : "named",
      employer_approval_needed: S.employer_approval_needed, headline: S.headline.trim(), seniority: S.seniority, years_experience: num(S.years_experience),
      languages: S.languages.split(",").map(x => x.trim()).filter(Boolean), sectors: [...S.sectors],
      linkedin_url: S.linkedin_url.trim(), github_url: S.github_url.trim(), portfolio_url: S.portfolio_url.trim(),
      engagement_modes: [...S.engagement_modes], availability: S.availability, available_from: S.available_from || null,
      rate_currency: S.rate_currency, day_rate_min: num(S.day_rate_min), day_rate_max: num(S.day_rate_max),
      advisory_hourly_rate: S.engagement_modes.has("advisory") ? num(S.advisory_hourly_rate) : null,
      work_modes: [...S.work_modes], willing_to_relocate: S.willing_to_relocate,
      advisory_topics: S.engagement_modes.has("advisory") ? S.advisory_topics.trim() : "", other_skills: S.other_skills.trim(), referred_by: S.referred_by.trim(),
      domains, skills: [...S.skills].filter(([slug]) => liveSlugs.has(skillSlugs.get(slug))).map(([slug, v]) => ({ slug, proficiency: v.proficiency })),
      offerings: [...S.offerings],
      credentials: S.credentials.filter(c => c.name.trim()).map(c => ({ ...c, expires_on: c.expires_on || null })),
      consents: { talent_database: S.consent_db, share_with_clients: S.consent_share }, policy_version: CFG.policyVersion
    };
  }

  let busy = false;
  async function next() {
    if (!validate(step)) { render(); const e = app.querySelector(".error"); if (e) e.scrollIntoView({ block: "center" }); return; }
    if (step < STEPS.length - 1) { step++; render(); window.scrollTo({ top: app.offsetTop - 20 }); return; }
    if (busy) return; busy = true; render();
    try {
      if (S.hp) { step = 99; } // a bot filled the hidden field: pretend success, store nothing
      else await API.submitApplication(payload());
      step = 99;
    } catch (e) { errors = { submit: e.message || "Something went wrong. Please try again." }; }
    busy = false; render(); window.scrollTo({ top: app.offsetTop - 20 });
  }

  function render() {
    clear(app);
    if (step === 99) {
      app.appendChild(h("section", { class: "panel done-box" }, h("h2", { text: "Thank you. You are on our list." }),
        h("p", { text: "We review every application. If your profile fits current or upcoming work, someone from 314 will contact you at " + S.email.trim() + ". If you would like to change or remove your details, reply to any email from us." })));
      return;
    }
    app.appendChild(h("ol", { class: "steps", "aria-label": "Progress" }, STEPS.map((s, i) => h("li", { class: i === step ? "on" : i < step ? "done" : "", "aria-current": i === step ? "step" : null, text: (i + 1) + ". " + s }))));
    const body = [stepAbout, stepExpertise, stepFit, stepWork, stepConsent][step]();
    app.appendChild(h("form", { novalidate: "", onsubmit: e => { e.preventDefault(); next(); } }, body,
      h("div", { class: "form-nav" },
        step > 0 ? h("button", { class: "btn", type: "button", onclick: () => { step--; errors = {}; render(); window.scrollTo({ top: app.offsetTop - 20 }); }, text: "Back" }) : h("span"),
        h("button", { class: "btn btn-primary", type: "submit", disabled: busy, text: step === STEPS.length - 1 ? (busy ? "Sending" : "Submit application") : "Continue" }))));
  }

  (async function boot() {
    if (CFG.mode === "demo") {
      document.getElementById("banner").appendChild(h("div", { class: "banner" }, h("div", { class: "banner-inner" }, h("strong", { text: "Test mode" }),
        h("span", { text: "Nothing you enter here leaves this browser. Applications appear in the " }), h("a", { href: "/careers/staff", text: "admin dashboard" }), h("span", { text: " of this same browser." }))));
    }
    try { await API.init(); REF = await API.getReference(false); }
    catch (e) { app.appendChild(h("section", { class: "panel" }, h("h2", { text: "We could not load the form" }), h("p", { text: "Please try again in a moment." }))); console.error(e); return; }
    render();
  })();
})();
