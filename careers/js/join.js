(function () {
  const { h, clear, LABELS, CURRENCIES, PROFICIENCY } = UI;
  const API = window.TalentAPI;
  const CFG = window.TALENT_CONFIG;
  const app = document.getElementById("app");
  const actions = document.getElementById("actions");
  const stepnav = document.getElementById("stepnav");

  const blankCert = () => ({ name: "", issuer: "", credential_ref: "" });
  const S = {
    full_name: "", email: "", phone: "", country: "", city: "", current_title: "", current_employer: "",
    hide_employer: false, employer_approval_needed: false, seniority: "", years_experience: "",
    linkedin_url: "", portfolio_url: "",
    primaryDomain: "", primaryYears: "", extraDomains: new Set(), skills: new Map(), other_skills: "",
    offerings: new Set(), credentials: [blankCert()],
    engagement_modes: new Set(), availability: "within_30_days", rate_currency: "AED",
    day_rate_min: "", day_rate_max: "", advisory_hourly_rate: "", work_modes: new Set(),
    advisory_topics: "", referred_by: "", consent_db: false, consent_share: false, hp: ""
  };
  const STEPS = [
    { title: "About you", head: "About you", lead: "How we can reach you, and what you do now." },
    { title: "What you do", head: "What you do", lead: "Your main area, your skills and your level in each." },
    { title: "Where you fit", head: "Where you could help", lead: "Tick the 314 services where your experience would help. We search on this when a project starts." },
    { title: "How you work", head: "How you would like to work", lead: "The kinds of work you would consider, and when you could start." },
    { title: "Check and send", head: "Check and send", lead: "Read it through. Use Edit to change anything." }
  ];
  const COUNTRIES = ["United Arab Emirates", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman", "Egypt", "Jordan", "Lebanon", "Turkey", "India", "Pakistan", "United Kingdom", "Ireland", "Germany", "France", "Netherlands", "Spain", "Italy", "Poland", "United States", "Canada", "Australia", "Singapore", "South Africa", "Kenya", "Nigeria", "Ghana", "Ethiopia", "Tanzania", "Uganda", "Rwanda", "Zambia", "Zimbabwe", "Botswana", "Namibia", "Mauritius", "Morocco", "Tunisia", "Senegal", "Cote d'Ivoire", "Democratic Republic of the Congo"];
  const SVGNS = "http://www.w3.org/2000/svg";
  const tick = (cls) => { const s = document.createElementNS(SVGNS, "svg"); s.setAttribute("viewBox", "0 0 14 14"); s.setAttribute("fill", "none"); if (cls) s.setAttribute("class", cls);
    const p = document.createElementNS(SVGNS, "path"); p.setAttribute("d", "M2.5 7.4l3 3 6-6.4"); p.setAttribute("stroke", "currentColor"); p.setAttribute("stroke-width", "2"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round"); s.appendChild(p); return s; };
  const arrow = () => { const s = document.createElementNS(SVGNS, "svg"); s.setAttribute("viewBox", "0 0 16 16"); s.setAttribute("fill", "none");
    const p = document.createElementNS(SVGNS, "path"); p.setAttribute("d", "M3 8h10M9 4l4 4-4 4"); p.setAttribute("stroke", "currentColor"); p.setAttribute("stroke-width", "1.8"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round"); s.appendChild(p); return s; };

  let step = 0, REF = null, busy = false, submitError = "";
  // Cloudflare Turnstile: only active when a site key is set in config.js. The token is single use.
  let tsToken = "", tsNode = null, tsId = null, tsLoad = null;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    return tsLoad || (tsLoad = new Promise((res, rej) => { const el = document.createElement("script"); el.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; el.async = true; el.onload = res; el.onerror = () => { tsLoad = null; rej(new Error("check")); }; document.head.appendChild(el); }));
  }
  function checkBlock() {
    if (!CFG.turnstileSiteKey) return null;
    if (!tsNode) {
      tsNode = h("div", { class: "check" });
      loadTurnstile().then(() => { tsId = window.turnstile.render(tsNode, { sitekey: CFG.turnstileSiteKey, callback: t => { tsToken = t; setErr("check", ""); }, "expired-callback": () => { tsToken = ""; }, "error-callback": () => { tsToken = ""; } }); }).catch(() => { setErr("check", "The security check could not load. Please reload the page and try again."); });
    }
    return h("div", { class: "check-wrap" }, tsNode, errSlot("check"));
  }
  function resetCheck() { tsToken = ""; if (tsId !== null && window.turnstile) { try { window.turnstile.reset(tsId); } catch (e) { /* ignore */ } } }
  const touched = new Set();

  // ---- draft autosave (this browser only; consent and the bot trap are never stored) ----
  const DRAFT_KEY = "314_talent_draft_v2";
  const SETS = ["extraDomains", "offerings", "engagement_modes", "work_modes"];
  let saveTimer, restoredAt = null;
  function snapshot() {
    const o = {};
    for (const k of Object.keys(S)) {
      if (["consent_db", "consent_share", "hp"].includes(k)) continue;
      o[k] = SETS.includes(k) ? [...S[k]] : k === "skills" ? [...S.skills] : S[k];
    }
    return { v: 2, at: Date.now(), step, data: o };
  }
  function saveDraft() {
    try {
      const empty = !S.full_name && !S.email && !S.primaryDomain && !S.offerings.size;
      if (empty) return;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot()));
      for (const id of ["saved"]) { const el = document.getElementById(id); if (el) el.hidden = false; }
      const ps = document.getElementById("progSaved"); if (ps) ps.textContent = "Saved";
    } catch (e) { /* storage unavailable: the form still works */ }
  }
  const queueSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 350); };
  // Save straight away if the tab is closed, reloaded or hidden before the short delay above has run.
  window.addEventListener("pagehide", () => { if (step !== 99) saveDraft(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && step !== 99) saveDraft(); });
  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY); if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || d.v !== 2 || Date.now() - d.at > 30 * 864e5) { localStorage.removeItem(DRAFT_KEY); return false; }
      for (const [k, v] of Object.entries(d.data)) {
        if (!(k in S)) continue;
        if (SETS.includes(k)) S[k] = new Set(v); else if (k === "skills") S.skills = new Map(v); else S[k] = v;
      }
      if (!S.credentials || !S.credentials.length) S.credentials = [blankCert()];
      step = Math.min(Math.max(+d.step || 0, 0), STEPS.length - 2);
      restoredAt = d.at; return true;
    } catch (e) { return false; }
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ } }

  // ---- error handling: update messages in place so typing never loses focus ----
  const errSlot = (key) => h("div", { class: "error", role: "alert", "data-err": key, hidden: true });
  function setErr(key, msg) {
    document.querySelectorAll('[data-err="' + key + '"]').forEach(el => { el.textContent = msg || ""; el.hidden = !msg; });
    const ctl = document.getElementById("f_" + key);
    if (ctl) { if (msg) ctl.setAttribute("aria-invalid", "true"); else ctl.removeAttribute("aria-invalid"); }
    document.querySelectorAll('[data-box="' + key + '"]').forEach(el => el.classList.toggle("invalid", !!msg));
  }
  function showErrors(errs, only) {
    const keys = new Set([...document.querySelectorAll("[data-err]")].map(e => e.dataset.err));
    keys.forEach(k => { if (!only || only.has(k)) setErr(k, errs[k]); });
  }
  const touch = (key) => { touched.add(key); showErrors(validate(step), new Set([key])); };
  const clearErr = (key) => { if (touched.has(key) || document.querySelector('[data-err="' + key + '"]:not([hidden])')) setErr(key, ""); };

  // ---- form building blocks ----
  const field = (key, label, control, o = {}) => h("div", { class: "field" + (o.narrow ? " narrow" : ""), "data-field": key },
    h("label", { for: control.id || null }, label, o.optional ? h("span", { class: "opt", text: " (optional)" }) : null),
    control, o.hint ? h("div", { class: "hint", text: o.hint }) : null, errSlot(key));

  const text = (key, o = {}) => h("input", { id: "f_" + key, type: o.type || "text", value: S[key], autocomplete: o.auto || "off", maxlength: o.max || 200,
    placeholder: o.ph || null, min: o.min, max: o.maxv, inputmode: o.inputmode || null, list: o.list || null, enterkeyhint: o.enter || null, "data-k": key,
    oninput: (e) => { S[key] = e.target.value; if (touched.has(key)) touch(key); else clearErr(key); queueSave(); },
    onblur: () => { if (STEP_KEYS[step].includes(key)) touch(key); } });

  const select = (key, options, o = {}) => h("select", { id: "f_" + key, "data-k": key,
    onchange: (e) => { S[key] = e.target.value; clearErr(key); if (o.rerender) render(); queueSave(); } },
    (o.blank ? [h("option", { value: "", text: o.blank })] : []),
    options.map(([v, l]) => h("option", { value: v, selected: S[key] === v, text: l })));

  const seg = (key, options) => h("div", { class: "seg", role: "radiogroup", id: "f_" + key + "_g" }, options.map(([v, l]) =>
    h("label", {}, h("input", { type: "radio", name: "r_" + key, value: v, checked: S[key] === v, "data-k": key,
      onchange: () => { S[key] = v; clearErr(key); queueSave(); } }), h("span", { text: l }))));

  const tags = (setObj, items, rerender) => h("div", { class: "tags" }, items.map(([v, l]) =>
    h("label", { class: "tt" }, h("input", { type: "checkbox", checked: setObj.has(v), "data-k": "t_" + v,
      onchange: (e) => { e.target.checked ? setObj.add(v) : setObj.delete(v); if (rerender) render(); queueSave(); } }), h("span", { text: l }))));

  const card = (checked, title, desc, onchange, big) => h("label", { class: "cc" + (big ? " big" : "") },
    h("input", { type: "checkbox", checked, onchange }), h("span", { class: "cc-body" }, h("span", { class: "cc-t", text: title }), h("span", { class: "cc-tick" }, tick()), desc ? h("span", { class: "cc-d", text: desc }) : null));

  const sw = (title, desc, get, set, boxKey) => h("label", { class: "switch", "data-box": boxKey || null },
    h("input", { type: "checkbox", checked: get(), onchange: (e) => { set(e.target.checked); queueSave(); if (boxKey) setErr(boxKey, ""); } }),
    h("span", { class: "box" }, tick()), h("span", { class: "st" }, title, desc ? h("span", { class: "sd", text: desc }) : null));

  // ---- steps ----
  const STEP_KEYS = [
    ["full_name", "email", "country", "current_title", "seniority", "years_experience", "linkedin_url", "portfolio_url"],
    ["primaryDomain", "skills"], ["offerings"], ["engagement_modes", "advisory_topics"], ["consent", "check"]
  ];

  function stepAbout() {
    return [
      h("div", { class: "row c2" },
        field("full_name", "Full name", text("full_name", { auto: "name", enter: "next" })),
        field("email", "Email", text("email", { type: "email", auto: "email", inputmode: "email" }), { hint: "Only used to contact you." })),
      h("div", { class: "row c2" },
        field("phone", "Phone or WhatsApp", text("phone", { type: "tel", auto: "tel" }), { optional: true }),
        field("country", "Country you are based in", text("country", { auto: "country-name", list: "countries" }))),
      h("datalist", { id: "countries" }, COUNTRIES.map(c => h("option", { value: c }))),
      h("div", { class: "row c2" },
        field("city", "City", text("city", { auto: "address-level2" }), { optional: true }),
        field("current_title", "Current job title", text("current_title"))),
      field("current_employer", "Current employer", text("current_employer"), { optional: true }),
      sw("Keep my employer's name private", "Clients see a general description instead.", () => S.hide_employer, v => S.hide_employer = v),
      sw("My employer must approve outside work", "We will not approach you until you tell us you are cleared.", () => S.employer_approval_needed, v => S.employer_approval_needed = v),
      h("hr", { class: "rule" }),
      h("div", { class: "field", "data-field": "seniority" }, h("span", { class: "lbl", text: "Seniority" }), seg("seniority", Object.entries(LABELS.seniority)), errSlot("seniority")),
      field("years_experience", "Years of experience", text("years_experience", { type: "number", min: 0, maxv: 60, inputmode: "numeric" }), { narrow: true }),
      h("hr", { class: "rule" }),
      h("div", { class: "row c2" },
        field("linkedin_url", "LinkedIn", text("linkedin_url", { type: "text", ph: "linkedin.com/in/yourname", inputmode: "url" }), { optional: true }),
        field("portfolio_url", "Another link", text("portfolio_url", { type: "text", ph: "GitHub, portfolio or website", inputmode: "url" }), { optional: true }))
    ];
  }

  function skillRow(sk) {
    const on = S.skills.has(sk.slug);
    const cur = () => (S.skills.get(sk.slug) || { proficiency: 3 }).proficiency;
    const name = h("span", { class: "lvl-name", text: PROFICIENCY[cur()] });
    const btns = h("div", { class: "lvl-btns", role: "group", "aria-label": "Your level in " + sk.name }, [1, 2, 3, 4, 5].map(n =>
      h("button", { type: "button", "aria-pressed": String(cur() === n), "aria-label": n + " of 5, " + PROFICIENCY[n], text: String(n), onclick: (e) => {
        const v = S.skills.get(sk.slug); if (!v) return; v.proficiency = n; name.textContent = PROFICIENCY[n]; paint(); queueSave(); } })));
    const paint = () => btns.querySelectorAll("button").forEach((b, i) => { b.classList.toggle("f", i + 1 <= cur()); b.setAttribute("aria-pressed", String(i + 1 === cur())); });
    paint();
    const row = h("div", { class: "skill-row" + (on ? " on" : "") },
      h("label", { class: "skill-pick" }, h("input", { type: "checkbox", checked: on, "data-k": "s_" + sk.slug, onchange: (e) => {
        if (e.target.checked) S.skills.set(sk.slug, { proficiency: 3 }); else S.skills.delete(sk.slug);
        row.classList.toggle("on", e.target.checked); name.textContent = PROFICIENCY[cur()]; paint();
        setErr("skills", ""); queueSave(); } }),
        h("span", { class: "box" }, tick()), h("span", { class: "skill-name" }, sk.name, sk.vendor ? h("span", { class: "v", text: sk.vendor }) : null)),
      h("div", { class: "lvl" }, btns, name));
    return row;
  }

  function stepExpertise() {
    const picked = [S.primaryDomain, ...S.extraDomains].filter(Boolean);
    const groups = picked.map(slug => {
      const dom = REF.domains.find(d => d.slug === slug); if (!dom) return null;
      const list = REF.skills.filter(s => s.domain_id === dom.id);
      const n = list.filter(s => S.skills.has(s.slug)).length;
      return h("div", { class: "skill-group" }, h("h3", {}, dom.name, h("small", { text: n ? n + " selected" : list.length + " skills" })), list.map(skillRow));
    });
    return [
      h("div", { class: "row c2" },
        field("primaryDomain", "Main area of expertise", select("primaryDomain", REF.domains.map(d => [d.slug, d.name]), { blank: "Choose one", rerender: true })),
        field("primaryYears", "Years in this area", text("primaryYears", { type: "number", min: 0, maxv: 60, inputmode: "numeric" }), { optional: true })),
      h("div", { class: "field" }, h("span", { class: "lbl" }, "Other areas you work in", h("span", { class: "opt", text: " (optional)" })),
        tags(S.extraDomains, REF.domains.filter(d => d.slug !== S.primaryDomain).map(d => [d.slug, d.name]), true)),
      picked.length
        ? h("div", { class: "field", "data-field": "skills" }, h("span", { class: "lbl", text: "Tick your skills and set your level in each" }), h("div", {}, groups), errSlot("skills"))
        : h("div", { class: "empty", text: "Choose a main area and its skills will appear here." }),
      field("other_skills", "Other skills", h("textarea", { id: "f_other_skills", maxlength: 1000, value: S.other_skills, "data-k": "other_skills", oninput: (e) => { S.other_skills = e.target.value; queueSave(); } }, ), { optional: true }),
      h("h3", { class: "sub", text: "Certifications" }),
      h("p", { class: "hint", style: "margin-top:-14px", text: "Add the ones that matter for the work you want. We may check them with the issuer." }),
      h("div", {}, S.credentials.map((c, i) => h("div", { class: "cert" },
        field("c" + i + "n", "Certification", h("input", { id: "f_c" + i + "n", type: "text", value: c.name, maxlength: 160, placeholder: "Professional Cloud Architect", oninput: e => { c.name = e.target.value; queueSave(); } })),
        field("c" + i + "i", "Issuer", h("input", { id: "f_c" + i + "i", type: "text", value: c.issuer, maxlength: 120, placeholder: "Google Cloud", oninput: e => { c.issuer = e.target.value; queueSave(); } })),
        field("c" + i + "r", "Credential ID", h("input", { id: "f_c" + i + "r", type: "text", value: c.credential_ref, maxlength: 120, oninput: e => { c.credential_ref = e.target.value; queueSave(); } }), { optional: true }),
        S.credentials.length > 1 || c.name ? h("button", { class: "link-btn rm", type: "button", onclick: () => { S.credentials.splice(i, 1); if (!S.credentials.length) S.credentials.push(blankCert()); render(); queueSave(); }, text: "Remove" }) : null)),
        S.credentials.length < 12 ? h("button", { class: "add", type: "button", onclick: () => { S.credentials.push(blankCert()); render(); queueSave(); }, text: "+ Add another certification" }) : null)
    ];
  }

  function stepFit() {
    return [
      ...["consulting", "dpi", "cloud"].map(l => {
        const list = REF.offerings.filter(o => o.service_line === l);
        return h("div", { class: "offer-line" }, h("div", { class: "line-title" }, h("h3", { text: LABELS.line[l] }), h("span", { text: S.offerings.size ? "" : list.length + (list.length === 1 ? " offering" : " offerings") })),
          h("div", { class: "cards" }, list.map(o => card(S.offerings.has(o.slug), o.name, o.summary, (e) => { e.target.checked ? S.offerings.add(o.slug) : S.offerings.delete(o.slug); setErr("offerings", ""); queueSave(); }))));
      }),
      h("div", { class: "field" }, errSlot("offerings"))
    ];
  }

  function stepWork() {
    const adv = S.engagement_modes.has("advisory");
    const modeDesc = { full_time: "A permanent role with 314.", contract: "A project or fixed period, usually at a day rate.", advisory: "Paid expert input by the hour, such as reviews and workshops." };
    return [
      h("div", { class: "field", "data-field": "engagement_modes" }, h("span", { class: "lbl", text: "Engagement types" }),
        h("div", { class: "cards" }, Object.entries(LABELS.modes).map(([v, l]) => card(S.engagement_modes.has(v), l, modeDesc[v], (e) => {
          e.target.checked ? S.engagement_modes.add(v) : S.engagement_modes.delete(v); setErr("engagement_modes", ""); render(); queueSave(); }, true))),
        h("div", { class: "hint", text: "Choose every kind you would consider." }), errSlot("engagement_modes")),
      adv ? h("div", { class: "enter" }, h("div", { class: "row c2" },
        field("advisory_hourly_rate", "Advisory hourly rate", text("advisory_hourly_rate", { type: "number", min: 0, inputmode: "decimal" }), { optional: true }),
        h("div")), h("div", { style: "height:18px" }),
        field("advisory_topics", "What could you advise on?", h("textarea", { id: "f_advisory_topics", maxlength: 1500, "data-k": "advisory_topics", value: S.advisory_topics,
          oninput: e => { S.advisory_topics = e.target.value; if (touched.has("advisory_topics")) touch("advisory_topics"); queueSave(); }, onblur: () => touch("advisory_topics") }),
          { hint: "For example: zero trust roadmaps, GCP landing zone reviews, ISO 27001 readiness." })) : null,
      h("hr", { class: "rule" }),
      h("div", { class: "field" }, h("span", { class: "lbl", text: "When could you start?" }), seg("availability", Object.entries(LABELS.availability))),
      h("hr", { class: "rule" }),
      h("div", { class: "row c3" },
        field("rate_currency", "Currency", select("rate_currency", CURRENCIES.map(c => [c, c]))),
        field("day_rate_min", "Day rate, from", text("day_rate_min", { type: "number", min: 0, inputmode: "decimal" }), { optional: true }),
        field("day_rate_max", "Day rate, to", text("day_rate_max", { type: "number", min: 0, inputmode: "decimal" }), { optional: true })),
      h("p", { class: "hint", style: "margin-top:-10px", text: "Only used internally to check fit with a budget. Never shown to a client without your approval." }),
      h("div", { class: "field" }, h("span", { class: "lbl" }, "Where can you work?", h("span", { class: "opt", text: " (optional)" })), tags(S.work_modes, Object.entries(LABELS.work))),
      field("referred_by", "Who referred you?", text("referred_by", { max: 120 }), { optional: true })
    ];
  }

  function reviewBlock(title, goto, rows) {
    return h("section", { class: "rv" }, h("div", { class: "rv-h" }, h("h3", { text: title }), h("button", { class: "link-btn", type: "button", onclick: () => go(goto), text: "Edit" })),
      h("dl", {}, rows.filter(r => r[1] != null && r[1] !== "" && !(Array.isArray(r[1]) && !r[1].length)).map(([k, v]) => [h("dt", { text: k }),
        h("dd", {}, Array.isArray(v) ? h("div", { class: "tags" }, v.map(x => h("span", { text: x }))) : String(v))])));
  }

  function stepReview() {
    const dom = (slug) => (REF.domains.find(d => d.slug === slug) || {}).name;
    const live = new Set([S.primaryDomain, ...S.extraDomains]);
    const skills = REF.skills.filter(s => S.skills.has(s.slug) && live.has(REF.domains.find(d => d.id === s.domain_id).slug));
    const certs = S.credentials.filter(c => c.name.trim()).map(c => c.name.trim() + (c.issuer.trim() ? " (" + c.issuer.trim() + ")" : ""));
    const rate = (S.day_rate_min || S.day_rate_max) ? S.rate_currency + " " + (S.day_rate_min || "?") + " to " + (S.day_rate_max || "?") + " a day" : "";
    return [
      reviewBlock("About you", 0, [["Name", S.full_name.trim()], ["Email", S.email.trim()], ["Phone", S.phone.trim()], ["Based in", [S.city.trim(), S.country.trim()].filter(Boolean).join(", ")],
        ["Role", [S.current_title.trim(), S.current_employer.trim() && !S.hide_employer ? "at " + S.current_employer.trim() : ""].filter(Boolean).join(" ")], ["Level", LABELS.seniority[S.seniority] + (S.years_experience !== "" ? ", " + S.years_experience + " years" : "")]]),
      reviewBlock("What you do", 1, [["Main area", dom(S.primaryDomain)], ["Also work in", [...S.extraDomains].map(dom)], ["Skills", skills.map(s => s.name + " (" + PROFICIENCY[S.skills.get(s.slug).proficiency] + ")")], ["Certifications", certs]]),
      reviewBlock("Where you fit", 2, [["314 services", REF.offerings.filter(o => S.offerings.has(o.slug)).map(o => o.name)]]),
      reviewBlock("How you work", 3, [["Engagement", [...S.engagement_modes].map(m => LABELS.modes[m])], ["Available", LABELS.availability[S.availability]],
        ["Day rate", rate], ["Advisory rate", S.engagement_modes.has("advisory") && S.advisory_hourly_rate ? S.rate_currency + " " + S.advisory_hourly_rate + " an hour" : ""], ["Work style", [...S.work_modes].map(m => LABELS.work[m])]]),
      h("div", { class: "consents" },
        h("label", { class: "switch", "data-box": "consent" }, h("input", { type: "checkbox", checked: S.consent_db, "data-k": "consent", onchange: e => { S.consent_db = e.target.checked; if (e.target.checked) setErr("consent", ""); else if (touched.has("consent")) touch("consent"); } }),
          h("span", { class: "box" }, tick()), h("span", { class: "st" }, "I agree that Three One Four Technologies L.L.C may store the information in this form and use it to contact me about relevant work. I have read the ",
            h("a", { href: "/careers/privacy", target: "_blank", rel: "noopener", text: "privacy notice" }), ".")),
        errSlot("consent"),
        sw("Share an anonymised summary of my profile with clients", "Used when 314 proposes a team. My name and contact details are only shared after I say yes to that specific opportunity. Optional.", () => S.consent_share, v => S.consent_share = v),
        checkBlock(),
        h("div", { class: "honeypot", "aria-hidden": "true" }, h("label", { for: "f_hp", text: "Leave this empty" }), h("input", { id: "f_hp", type: "text", tabindex: "-1", autocomplete: "off", oninput: e => S.hp = e.target.value })))
    ];
  }

  // ---- validation (returns messages, never touches the page) ----
  const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const fullUrl = (v) => { v = (v || "").trim(); return v && !/^https?:\/\//i.test(v) ? "https://" + v : v; };
  const URLOK = /^https?:\/\/[^\s/]+\.[^\s/]+\S*$/i;
  function validate(i) {
    const e = {};
    if (i === 0) {
      if (S.full_name.trim().length < 2) e.full_name = "Please enter your full name.";
      if (!EMAIL.test(S.email.trim())) e.email = "Please enter a valid email address, like name@company.com.";
      if (!S.country.trim()) e.country = "Please enter your country.";
      if (!S.current_title.trim()) e.current_title = "Please enter your job title.";
      if (!S.seniority) e.seniority = "Please choose a level.";
      if (S.years_experience === "" || +S.years_experience < 0 || +S.years_experience > 60) e.years_experience = "Enter a number from 0 to 60.";
      for (const k of ["linkedin_url", "portfolio_url"]) if (S[k].trim() && !URLOK.test(fullUrl(S[k]))) e[k] = "That does not look like a web address.";
    }
    if (i === 1) {
      if (!S.primaryDomain) e.primaryDomain = "Please choose your main area.";
      else {
        const live = new Set([S.primaryDomain, ...S.extraDomains]);
        const n = REF.skills.filter(sk => S.skills.has(sk.slug) && live.has(REF.domains.find(d => d.id === sk.domain_id).slug)).length;
        if (!n) e.skills = "Tick at least one skill.";
      }
    }
    if (i === 2 && !S.offerings.size) e.offerings = "Pick at least one, or the closest match.";
    if (i === 3) {
      if (!S.engagement_modes.size) e.engagement_modes = "Choose at least one.";
      if (S.engagement_modes.has("advisory") && !S.advisory_topics.trim()) e.advisory_topics = "Tell us what you could advise on.";
    }
    if (i === 4 && !S.consent_db) e.consent = "We need your consent to store your details.";
    if (i === 4 && CFG.turnstileSiteKey && !tsToken) e.check = "Please complete the security check.";
    return e;
  }

  function payload() {
    const num = v => (v === "" || v == null) ? null : +v;
    const domains = [{ slug: S.primaryDomain, is_primary: true, years: num(S.primaryYears) }, ...[...S.extraDomains].map(s => ({ slug: s, is_primary: false }))];
    const liveSlugs = new Set(domains.map(d => d.slug));
    const skillSlugs = new Map(REF.skills.map(s => [s.slug, REF.domains.find(d => d.id === s.domain_id).slug]));
    return {
      full_name: S.full_name.trim(), email: S.email.trim(), phone: S.phone.trim(), country: S.country.trim(), city: S.city.trim(),
      current_title: S.current_title.trim(), current_employer: S.current_employer.trim(), employer_display: S.hide_employer ? "anonymised" : "named",
      employer_approval_needed: S.employer_approval_needed, seniority: S.seniority, years_experience: num(S.years_experience),
      linkedin_url: fullUrl(S.linkedin_url), portfolio_url: fullUrl(S.portfolio_url),
      engagement_modes: [...S.engagement_modes], availability: S.availability,
      rate_currency: S.rate_currency, day_rate_min: num(S.day_rate_min), day_rate_max: num(S.day_rate_max),
      advisory_hourly_rate: S.engagement_modes.has("advisory") ? num(S.advisory_hourly_rate) : null,
      work_modes: [...S.work_modes],
      advisory_topics: S.engagement_modes.has("advisory") ? S.advisory_topics.trim() : "", other_skills: S.other_skills.trim(), referred_by: S.referred_by.trim(),
      domains, skills: [...S.skills].filter(([slug]) => liveSlugs.has(skillSlugs.get(slug))).map(([slug, v]) => ({ slug, proficiency: v.proficiency })),
      offerings: [...S.offerings],
      credentials: S.credentials.filter(c => c.name.trim()).map(c => ({ name: c.name.trim(), issuer: c.issuer.trim(), credential_ref: c.credential_ref.trim() })),
      consents: { talent_database: S.consent_db, share_with_clients: S.consent_share }, policy_version: CFG.policyVersion
    };
  }

  // ---- navigation ----
  function scrollTop() { window.scrollTo({ top: 0, behavior: "smooth" }); }
  function go(i, focusMain) { step = i; submitError = ""; render(); scrollTop(); if (focusMain !== false) app.focus({ preventScroll: true }); queueSave(); }

  function firstInvalid(errs) {
    const order = STEP_KEYS[step]; const k = order.find(x => errs[x]) || Object.keys(errs)[0];
    const el = document.getElementById("f_" + k) || document.querySelector('[data-field="' + k + '"] input, [data-field="' + k + '"] button') || document.querySelector('[data-err="' + k + '"]');
    return el;
  }
  async function next() {
    if (busy) return;
    const errs = validate(step);
    if (Object.keys(errs).length) {
      Object.keys(errs).forEach(k => touched.add(k)); showErrors(errs);
      const el = firstInvalid(errs); if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); if (el.focus) el.focus({ preventScroll: true }); }
      return;
    }
    if (step < STEPS.length - 1) { go(step + 1); return; }
    busy = true; submitError = ""; renderActions();
    try {
      if (!S.hp) await API.submitApplication(payload(), tsToken);
      clearDraft(); restoredAt = null; clear(document.getElementById("restore")); const sv = document.getElementById("saved"); if (sv) sv.hidden = true; const ps = document.getElementById("progSaved"); if (ps) ps.textContent = ""; busy = false; step = 99; render(); scrollTop(); app.focus({ preventScroll: true }); return;
    } catch (e) { submitError = (e && e.message) || "Something went wrong. Please try again."; resetCheck(); }
    busy = false; renderActions();
  }

  // ---- rendering ----
  function renderNav() {
    clear(stepnav);
    STEPS.forEach((s, i) => {
      const state = i === step ? "on" : i < step ? "done" : "";
      const can = i < step;
      stepnav.appendChild(h("li", { class: state }, h("button", { type: "button", "data-go": can ? "1" : null, disabled: !can && i !== step, "aria-current": i === step ? "step" : null,
        onclick: () => { if (can) go(i); } },
        h("span", { class: "n", text: String(i + 1).padStart(2, "0") }), h("span", { class: "t", text: s.title }), i < step ? h("span", { class: "ok", text: "Done" }) : h("span"))));
    });
    const pt = document.getElementById("progText"), pb = document.getElementById("progBar");
    const n = Math.min(step, STEPS.length - 1);
    if (pt) { clear(pt); pt.append("Step " + (n + 1) + " of " + STEPS.length + "  "); pt.appendChild(h("b", { text: STEPS[n].title })); }
    if (pb) pb.style.width = ((step === 99 ? STEPS.length : n + 1) / STEPS.length * 100) + "%";
  }

  function renderActions() {
    clear(actions);
    if (step === 99) return;
    const last = step === STEPS.length - 1;
    actions.appendChild(h("div", { class: "jn-actions-in" },
      step > 0 ? h("button", { class: "btn btn-ghost", type: "button", onclick: () => go(step - 1), disabled: busy, text: "Back" }) : h("span"),
      h("div", { style: "flex:1;min-width:0" }, submitError ? h("div", { class: "form-error", role: "alert", text: submitError }) : null),
      h("button", { class: "btn btn-primary", type: "button", disabled: busy, onclick: next },
        busy ? [h("span", { class: "spin" }), "Sending"] : last ? "Send" : "Continue")));
  }

  function doneView() {
    const first = S.full_name.trim().split(/\s+/)[0] || "";
    return h("section", { class: "finish enter" },
      h("h2", { text: first ? "Thanks, " + first + "." : "Thanks." }),
      h("p", { text: "We have your details. Someone on our team will read your profile, and if it fits a project we will email you at " + S.email.trim() + ". Registering does not guarantee work." }),
      h("p", { class: "small", text: "If you registered with this email before, your earlier profile stays as it is. Reply to any email from us to change or delete your details." }),
      h("a", { class: "btn", href: "/careers", text: "Back to careers" }));
  }

  function render() {
    const active = document.activeElement; const keep = active && active.dataset ? active.dataset.k : null;
    let sel = null; if (active && active.setSelectionRange && keep) { try { sel = [active.selectionStart, active.selectionEnd]; } catch (e) { sel = null; } }
    clear(app); renderNav(); renderActions();
    if (step === 99) { app.appendChild(doneView()); return; }
    const s = STEPS[step];
    app.appendChild(h("div", { class: "enter", key: step },
      h("header", { class: "jn-head" }, h("h2", { text: s.head }), h("p", { text: s.lead })),
      h("form", { class: "jn-form", novalidate: "", onsubmit: e => { e.preventDefault(); next(); } }, [stepAbout, stepExpertise, stepFit, stepWork, stepReview][step](),
        h("button", { type: "submit", class: "sr-only", tabindex: "-1", text: "Continue" }))));
    // re-show any errors the person has already seen on this step
    if (touched.size) showErrors(validate(step), touched);
    if (keep) { const el = app.querySelector('[data-k="' + keep + '"]'); if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignore */ } } }
  }

  function renderRestore() {
    const host = document.getElementById("restore"); clear(host);
    if (!restoredAt) return;
    host.appendChild(h("div", { class: "jn-restore" }, h("span", { text: "Welcome back. We restored your draft from " + UI.fmtDate(restoredAt) + "." }),
      h("button", { type: "button", onclick: () => { clearDraft(); location.reload(); }, text: "Start again" })));
  }

  (async function boot() {
    if (CFG.mode === "demo") {
      document.getElementById("banner").appendChild(h("div", { class: "jn-banner" }, h("strong", { text: "Test mode. " }),
        "Nothing you enter here leaves this browser. Applications appear in the ", h("a", { href: "/careers/staff", text: "admin dashboard" }), " of this same browser."));
    }
    try { await API.init(); REF = await API.getReference(false); }
    catch (e) { app.appendChild(h("section", { class: "finish" }, h("h2", { text: "We could not load the form" }), h("p", { text: "Please check your connection and try again in a moment." }))); console.error(e); return; }
    loadDraft(); renderRestore(); render();
    const ps = document.getElementById("progSaved"); if (ps && restoredAt) ps.textContent = "Saved";
    const sv = document.getElementById("saved"); if (sv && restoredAt) sv.hidden = false;
  })();
})();
