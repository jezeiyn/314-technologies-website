(function () {
  const { h, clear, LABELS, CURRENCIES, PROFICIENCY, toast, confirmBox, modal, fmtDate, csvCell, dots } = UI;
  const API = window.TalentAPI, CFG = window.TALENT_CONFIG;
  const root = document.getElementById("root");

  let REF, SESS, PROS = [], OPPS = [], view = "talent", selOpp = null, drawerId = null;
  const F = { q: "", domain: "", offering: "", mode: "", avail: "", status: "", ver: "", country: "", skills: new Set(), all: true };
  let skillById, domById, offById, tplById;

  const idx = () => {
    skillById = new Map(REF.skills.map(x => [x.id, x])); domById = new Map(REF.domains.map(x => [x.id, x]));
    offById = new Map(REF.offerings.map(x => [x.id, x])); tplById = new Map(REF.templates.map(x => [x.id, x]));
  };
  const primaryDomain = (p) => { const d = p.domains.find(x => x.is_primary) || p.domains[0]; return d ? domById.get(d.domain_id) : null; };
  const topSkills = (p, n) => [...p.skills].sort((a, b) => b.proficiency - a.proficiency).slice(0, n).map(s => skillById.get(s.skill_id)).filter(Boolean);
  const where = (p) => [p.city, p.country].filter(Boolean).join(", ");
  const rate = (p) => p.day_rate_min == null && p.day_rate_max == null ? "" : `${p.rate_currency} ${p.day_rate_min ?? "?"} to ${p.day_rate_max ?? "?"} a day`;
  const statusTag = (s) => h("span", { class: "tag " + (s === "active" || s === "verified" ? "teal" : s === "pending" ? "warn" : s === "declined" || s === "archived" ? "bad" : ""), text: LABELS.status[s] || s });
  const verTag = (v) => h("span", { class: "tag " + (v === "credential_verified" ? "dark" : v === "email_verified" ? "teal" : ""), text: LABELS.verification[v] || v });
  const opt = (obj, cur) => Object.entries(obj).map(([v, l]) => h("option", { value: v, selected: v === cur, text: l }));
  const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { console.error(e); toast(e.message || "Something went wrong"); } };

  // ------------------------------------------------------------ shell
  function shell(content) {
    clear(root);
    if (CFG.mode === "demo") root.appendChild(h("div", { class: "banner" }, h("div", { class: "banner-inner" }, h("strong", { text: "Test mode" }),
      h("span", { text: "Fictional people, saved only in this browser." }),
      h("button", { class: "link-btn", type: "button", onclick: guard(async () => { if (await confirmBox("Reset demo data", "This removes anything you added and restores the 16 fictional profiles.", "Reset", true)) { await API.resetDemo(); await load(); render(); toast("Demo data reset"); } }), text: "Reset demo data" }),
      h("a", { href: "/careers/apply", text: "Open the public join form" }))));
    const nav = [["talent", "Talent"], ["opps", "Opportunities"], ["library", "Role library"]];
    root.appendChild(h("header", { class: "topbar" }, h("div", { class: "topbar-inner" },
      h("img", { src: "assets/314_wordmark_reversed.svg", alt: "314 Technologies" }),
      h("nav", { "aria-label": "Sections" }, nav.map(([k, l]) => h("button", { type: "button", "aria-current": view === k ? "page" : null, onclick: () => { view = k; drawerClose(); render(); }, text: l }))),
      h("span", { class: "spacer" }),
      h("span", { class: "who", text: SESS.email + " (" + SESS.role + ")" }),
      CFG.mode === "supabase" ? h("button", { class: "btn btn-sm", style: "color:#FAFAF8;border-color:#50596A", type: "button", onclick: guard(async () => { await API.signOut(); location.reload(); }), text: "Sign out" }) : null)));
    root.appendChild(h("main", { class: "shell" }, content));
  }

  function loginScreen(msg) {
    clear(root);
    const em = h("input", { id: "em", type: "email", autocomplete: "username" }), pw = h("input", { id: "pw", type: "password", autocomplete: "current-password" });
    const err = h("div", { class: "error", role: "alert", text: msg || "" });
    root.appendChild(h("div", { class: "login" }, h("img", { src: "assets/314_wordmark_ink.svg", alt: "314 Technologies", style: "height:44px;margin-bottom:24px" }),
      h("h1", { style: "font-size:1.6rem", text: "Staff sign in" }),
      h("form", { onsubmit: guard(async (e) => { e.preventDefault(); try { SESS = await API.signIn(em.value.trim(), pw.value); await start(); } catch (x) { err.textContent = x.message; } }) },
        h("div", { class: "field" }, h("label", { for: "em", text: "Email" }), em), h("div", { class: "field" }, h("label", { for: "pw", text: "Password" }), pw), err,
        h("button", { class: "btn btn-primary", type: "submit", text: "Sign in" }))));
  }

  // ------------------------------------------------------------ TALENT
  function filtered() {
    const q = F.q.trim().toLowerCase();
    return PROS.filter(p => {
      if (F.status && p.status !== F.status) return false;
      if (F.ver && p.verification_level !== F.ver) return false;
      if (F.mode && !p.engagement_modes.includes(F.mode)) return false;
      if (F.avail) { const order = ["immediate", "within_30_days", "within_60_days", "within_90_days"]; const lim = order.indexOf(F.avail); if (order.indexOf(p.availability) < 0 || order.indexOf(p.availability) > lim) return false; }
      if (F.domain && !p.domains.some(d => domById.get(d.domain_id)?.slug === F.domain)) return false;
      if (F.offering && !p.offerings.some(o => offById.get(o)?.slug === F.offering)) return false;
      if (F.country && !(p.country || "").toLowerCase().includes(F.country.toLowerCase())) return false;
      if (F.skills.size) {
        const have = new Set(p.skills.map(s => skillById.get(s.skill_id)?.slug));
        const want = [...F.skills]; if (F.all ? !want.every(x => have.has(x)) : !want.some(x => have.has(x))) return false;
      }
      if (q) {
        const hay = [p.full_name, p.email, p.current_title, p.current_employer, p.headline, p.city, p.country, p.advisory_topics, p.other_skills,
          ...p.skills.map(s => skillById.get(s.skill_id)?.name), ...p.credentials.map(c => c.name + " " + (c.issuer || ""))].join(" ").toLowerCase();
        if (!q.split(/\s+/).every(t => hay.includes(t))) return false;
      }
      return true;
    });
  }

  function talentView() {
    const rows = filtered();
    const live = PROS.filter(p => !["archived", "declined"].includes(p.status));
    const stat = (n, l) => h("div", { class: "stat" }, h("div", { class: "n", text: n }), h("div", { class: "l", text: l }));
    const tbody = h("tbody");
    const table = h("div", { class: "table-wrap" }, h("table", { class: "talent-table" }, h("thead", {}, h("tr", {}, ["Name", "Main area", "Top skills", "Level", "Engagement", "Available", "Status", "Verification"].map(t => h("th", { scope: "col", text: t })))), tbody));
    const draw = (list) => {
      clear(tbody);
      if (!list.length) { tbody.appendChild(h("tr", {}, h("td", { colspan: 8, class: "empty", text: PROS.length ? "No one matches these filters." : "No profiles yet. Share the join form to start." }))); return; }
      list.slice(0, 300).forEach(p => {
        const dm = primaryDomain(p);
        tbody.appendChild(h("tr", { class: "click", tabindex: "0", onclick: () => openDrawer(p.id), onkeydown: (e) => { if (e.key === "Enter") openDrawer(p.id); } },
          h("td", {}, h("div", { style: "font-weight:500", text: p.full_name }), h("div", { class: "sub", text: [p.current_title, p.current_employer].filter(Boolean).join(" at ") }), h("div", { class: "sub", text: where(p) })),
          h("td", { text: dm ? dm.name : "" }),
          h("td", {}, topSkills(p, 3).map(s => h("span", { class: "tag", style: "margin:0 4px 4px 0", text: s.name }))),
          h("td", { text: (LABELS.seniority[p.seniority] || "") + (p.years_experience != null ? ` (${p.years_experience}y)` : "") }),
          h("td", {}, p.engagement_modes.map(m => LABELS.modes[m]).join(", ")),
          h("td", { text: LABELS.availability[p.availability] }), h("td", {}, statusTag(p.status)), h("td", {}, verTag(p.verification_level))));
      });
      if (list.length > 300) tbody.appendChild(h("tr", {}, h("td", { colspan: 8, class: "empty", text: `Showing 300 of ${list.length}. Narrow the filters to see the rest.` })));
    };
    draw(rows);
    const count = h("span", { class: "muted small", text: rows.length + " of " + PROS.length });
    const rerun = () => { const l = filtered(); count.textContent = l.length + " of " + PROS.length; draw(l); renderSkillChips(); };

    const sel = (key, label, items) => h("select", { "aria-label": label, onchange: e => { F[key] = e.target.value; rerun(); } }, h("option", { value: "", text: label }), items.map(([v, l]) => h("option", { value: v, selected: F[key] === v, text: l })));
    const skillSel = h("select", { "aria-label": "Add skill filter", onchange: e => { if (e.target.value) { F.skills.add(e.target.value); e.target.value = ""; rerun(); } } },
      h("option", { value: "", text: "Filter by skill" }),
      REF.domains.map(d => h("optgroup", { label: d.name }, REF.skills.filter(s => s.domain_id === d.id).map(s => h("option", { value: s.slug, text: s.name + (s.vendor ? ` (${s.vendor})` : "") })))));
    const chips = h("div", { class: "filters-chips" });
    function renderSkillChips() {
      clear(chips);
      if (!F.skills.size) return;
      chips.appendChild(h("label", { class: "check", style: "margin:0 8px 0 0" }, h("input", { type: "checkbox", checked: F.all, onchange: e => { F.all = e.target.checked; rerun(); } }), h("span", { class: "small", text: "Must have all" })));
      [...F.skills].forEach(slug => chips.appendChild(h("span", { class: "tag dark", role: "button", tabindex: "0", title: "Remove", onclick: () => { F.skills.delete(slug); rerun(); }, onkeydown: e => { if (e.key === "Enter") { F.skills.delete(slug); rerun(); } }, text: (REF.skills.find(s => s.slug === slug)?.name || slug) + "  x" })));
    }
    renderSkillChips();

    return h("div", {},
      h("div", { class: "stats" }, stat(live.length, "Profiles in the network"), stat(PROS.filter(p => p.status === "pending").length, "Waiting for review"),
        stat(PROS.filter(p => ["verified", "active"].includes(p.status)).length, "Verified or active"),
        stat(live.filter(p => ["immediate", "within_30_days"].includes(p.availability)).length, "Available within 30 days"),
        stat(live.filter(p => p.engagement_modes.includes("advisory") && ["verified", "active"].includes(p.status)).length, "Ready for advisory work")),
      h("div", { class: "toolbar" },
        h("input", { type: "search", placeholder: "Search name, skill, employer, certification", "aria-label": "Search", value: F.q, oninput: e => { F.q = e.target.value; rerun(); } }),
        sel("domain", "All areas", REF.domains.map(d => [d.slug, d.name])), sel("offering", "All offerings", REF.offerings.map(o => [o.slug, o.name])), skillSel),
      h("div", { class: "toolbar" },
        sel("mode", "Any engagement", Object.entries(LABELS.modes)), sel("avail", "Any availability", [["immediate", "Immediately"], ["within_30_days", "Within 30 days"], ["within_60_days", "Within 60 days"], ["within_90_days", "Within 90 days"]]),
        sel("status", "Any status", Object.entries(LABELS.status)), sel("ver", "Any verification", Object.entries(LABELS.verification)),
        h("input", { type: "search", style: "flex:0 1 160px", placeholder: "Country", "aria-label": "Country", value: F.country, oninput: e => { F.country = e.target.value; rerun(); } }),
        h("button", { class: "btn btn-sm", type: "button", onclick: () => { Object.assign(F, { q: "", domain: "", offering: "", mode: "", avail: "", status: "", ver: "", country: "" }); F.skills.clear(); render(); }, text: "Clear" }),
        h("span", { class: "spacer", style: "flex:1" }), count,
        h("button", { class: "btn btn-sm", type: "button", onclick: () => exportCsv(filtered()), text: "Export CSV" })),
      chips, table);
  }

  function exportCsv(list) {
    const head = ["Name", "Email", "Phone", "Country", "City", "Title", "Employer", "Seniority", "Years", "Main area", "Skills", "Offerings", "Engagement", "Availability", "Rate currency", "Day rate min", "Day rate max", "Status", "Verification"];
    const lines = [head.map(csvCell).join(",")];
    list.forEach(p => lines.push([p.full_name, p.email, p.phone, p.country, p.city, p.current_title, p.current_employer, p.seniority, p.years_experience, primaryDomain(p)?.name,
      p.skills.map(s => skillById.get(s.skill_id)?.name).join("; "), p.offerings.map(o => offById.get(o)?.name).join("; "), p.engagement_modes.join("; "), p.availability, p.rate_currency, p.day_rate_min, p.day_rate_max, p.status, p.verification_level].map(csvCell).join(",")));
    const a = h("a", { href: URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" })), download: "314-talent-export.csv" });
    document.body.appendChild(a); a.click(); a.remove(); toast("Exported " + list.length + " profiles");
  }

  // ------------------------------------------------------------ profile drawer
  function drawerClose() { document.querySelectorAll(".drawer, .drawer-back").forEach(e => e.remove()); drawerId = null; }
  const guardedPatch = guard(async (p, patch, msg) => { Object.assign(p, await API.updateProfessional(p.id, patch)); toast(msg || "Saved"); });

  async function openDrawer(id) {
    drawerClose(); drawerId = id;
    const p = PROS.find(x => x.id === id); if (!p) return;
    const [notes, pipeline] = await Promise.all([API.getNotes(id), API.listShortlistForProfessional(id)]);
    const kv = (k, v) => v == null || v === "" || (Array.isArray(v) && !v.length) ? null : [h("dt", { text: k }), h("dd", {}, v)];
    const link = (u) => u ? h("a", { href: /^https?:\/\//i.test(u) ? u : "#", target: "_blank", rel: "noopener noreferrer", text: u }) : null;
    const close = () => { drawerClose(); if (view === "talent") render(); };
    const ratingSel = h("select", { id: "rating", "aria-label": "Internal rating" }, h("option", { value: "", text: "No rating" }), [1, 2, 3, 4, 5].map(n => h("option", { value: n, selected: notes.internal_rating === n, text: n + " of 5" })));
    const notesBox = h("textarea", { id: "notes", maxlength: 4000, "aria-label": "Screening notes", value: notes.screening_notes || "" });

    const back = h("div", { class: "drawer-back", onclick: close });
    const el = h("aside", { class: "drawer", role: "dialog", "aria-modal": "true", "aria-label": "Profile for " + p.full_name },
      h("div", { class: "drawer-head" }, h("div", {}, h("h2", { text: p.full_name }), h("div", { class: "muted", text: [p.current_title, p.current_employer].filter(Boolean).join(" at ") }), h("div", { class: "muted small", text: where(p) })),
        h("button", { class: "btn btn-sm", type: "button", onclick: close, text: "Close" })),
      h("div", { class: "drawer-body" },
        h("div", { class: "section" }, h("div", { class: "grid-2" },
          h("div", { class: "field" }, h("label", { for: "st", text: "Status" }), h("select", { id: "st", onchange: e => guardedPatch(p, { status: e.target.value }, "Status updated") }, opt(LABELS.status, p.status))),
          h("div", { class: "field" }, h("label", { for: "vl", text: "Verification" }), h("select", { id: "vl", onchange: e => guardedPatch(p, { verification_level: e.target.value }, "Verification updated") }, opt(LABELS.verification, p.verification_level)))),
          h("div", { style: "display:flex;gap:8px;flex-wrap:wrap" },
            h("button", { class: "btn btn-sm btn-primary", type: "button", onclick: () => addToShortlistDialog(p, close), text: "Add to a contract role" }),
            h("button", { class: "btn btn-sm", type: "button", onclick: () => guardedPatch(p, { last_confirmed_at: new Date().toISOString() }, "Marked as current"), text: "Mark details as current" }),
            h("a", { class: "btn btn-sm", href: "mailto:" + encodeURIComponent(p.email).replace("%40", "@"), text: "Email" }))),
        h("div", { class: "section" }, h("h3", { text: "Profile" }), h("dl", { class: "kv" },
          kv("Headline", p.headline), kv("Email", p.email), kv("Phone", p.phone), kv("Seniority", LABELS.seniority[p.seniority] + (p.years_experience != null ? `, ${p.years_experience} years` : "")),
          kv("Sectors", p.sectors.join(", ")), kv("Languages", p.languages.join(", ")), kv("LinkedIn", link(p.linkedin_url)), kv("GitHub", link(p.github_url)), kv("Portfolio", link(p.portfolio_url)),
          kv("Engagement", p.engagement_modes.map(m => LABELS.modes[m]).join(", ")), kv("Work style", p.work_modes.map(m => LABELS.work[m]).join(", ")),
          kv("Available", LABELS.availability[p.availability] + (p.available_from ? " (from " + fmtDate(p.available_from) + ")" : "")), kv("Day rate", rate(p)),
          kv("Advisory rate", p.advisory_hourly_rate != null ? `${p.rate_currency} ${p.advisory_hourly_rate} an hour` : ""), kv("Relocation", p.willing_to_relocate ? "Open to relocating" : ""),
          kv("Employer shown to clients", p.employer_display === "anonymised" ? "No, described generally" : "Yes"), kv("Outside work", p.employer_approval_needed ? "Needs employer approval first" : ""),
          kv("Source", p.source + (p.referred_by ? ", referred by " + p.referred_by : "")), kv("Applied", fmtDate(p.created_at)), kv("Last confirmed", fmtDate(p.last_confirmed_at)),
          kv("Consent", p.consents ? ["Stored for matching", p.consents.share_with_clients ? "anonymised sharing with clients allowed" : "do not share with clients"].join("; ") : ""))),
        p.advisory_topics ? h("div", { class: "section" }, h("h3", { text: "Can advise on" }), h("p", { text: p.advisory_topics })) : null,
        h("div", { class: "section" }, h("h3", { text: "Skills" }),
          [...p.skills].sort((a, b) => b.proficiency - a.proficiency).map(s => { const sk = skillById.get(s.skill_id); return sk ? h("span", { class: "skill-pill", title: PROFICIENCY[s.proficiency] }, sk.name, dots(s.proficiency), sk.vendor ? h("span", { class: "tag", text: sk.vendor }) : null) : null; }),
          p.other_skills ? h("p", { class: "small muted", style: "margin-top:8px", text: "Also: " + p.other_skills }) : null),
        h("div", { class: "section" }, h("h3", { text: "Areas and offerings" }),
          p.domains.map(d => h("span", { class: "tag " + (d.is_primary ? "dark" : ""), style: "margin:0 6px 6px 0", text: (domById.get(d.domain_id)?.name || "") + (d.years ? ` (${d.years}y)` : "") })), h("br"),
          p.offerings.map(o => h("span", { class: "tag teal", style: "margin:0 6px 6px 0", text: offById.get(o)?.name || "" }))),
        h("div", { class: "section" }, h("h3", { text: "Certifications" }),
          p.credentials.length ? p.credentials.map(c => h("label", { class: "check" },
            h("input", { type: "checkbox", checked: c.verified, onchange: guard(async e => { await API.setCredentialVerified(p.id, c.id, e.target.checked); c.verified = e.target.checked; toast(c.verified ? "Marked verified" : "Verification removed"); }) }),
            h("span", {}, h("strong", { text: c.name }), c.issuer ? ", " + c.issuer : "", c.credential_ref ? h("span", { class: "mono muted", text: "  ID " + c.credential_ref }) : null, c.expires_on ? h("span", { class: "muted small", text: "  expires " + fmtDate(c.expires_on) }) : null)))
            : h("p", { class: "muted", text: "None listed." }),
          p.credentials.length ? h("p", { class: "hint small muted", text: "Tick a certification only after checking it with the issuer." }) : null),
        h("div", { class: "section" }, h("h3", { text: "Contract roles" }),
          pipeline.length ? pipeline.map(s => h("div", { class: "small", style: "margin-bottom:4px" }, h("span", { class: "tag", text: LABELS.stage[s.stage] }), " ", (s.role_title || "Role") + " on " + (s.opportunity_name || "an opportunity"))) : h("p", { class: "muted", text: "Not on any shortlist." })),
        h("div", { class: "section" }, h("h3", { text: "Private notes (staff only)" }),
          h("div", { class: "field" }, notesBox), h("div", { class: "field", style: "max-width:200px" }, ratingSel),
          h("button", { class: "btn btn-sm btn-primary", type: "button", onclick: guard(async () => { await API.saveNotes(p.id, { screening_notes: notesBox.value, internal_rating: ratingSel.value ? +ratingSel.value : null }); toast("Notes saved"); }), text: "Save notes" })),
        SESS.role === "admin" ? h("div", { class: "section" }, h("h3", { text: "Remove from the network" }),
          h("p", { class: "small muted", text: "Deletes this person and all their data, including notes and shortlist entries. Use this for erasure requests. It cannot be undone." }),
          h("button", { class: "btn btn-sm btn-danger", type: "button", onclick: guard(async () => { if (await confirmBox("Delete " + p.full_name + "?", "This permanently deletes the profile, notes and shortlist entries.", "Delete permanently", true)) { await API.erase(p.id); PROS = PROS.filter(x => x.id !== p.id); drawerClose(); render(); toast("Profile deleted"); } }), text: "Delete profile" })) : null));
    document.body.append(back, el); el.querySelector(".btn").focus();
  }

  const addToShortlistDialog = guard(async function (p, afterClose) {
    OPPS = await API.listOpportunities();
    const open = OPPS.filter(o => o.roles.length && !["closed", "lost"].includes(o.status));
    if (!open.length) { toast("Create an opportunity with a role first (Opportunities tab)"); return; }
    const os = h("select", { id: "so" }, open.map(o => h("option", { value: o.id, text: o.name })));
    const rs = h("select", { id: "sr" });
    const fill = () => { clear(rs); open.find(o => o.id === os.value).roles.forEach(r => rs.appendChild(h("option", { value: r.id, text: r.title }))); };
    os.onchange = fill; fill();
    const m = modal("Add " + p.full_name + " to a role", h("div", {}, h("div", { class: "field" }, h("label", { for: "so", text: "Opportunity" }), os), h("div", { class: "field" }, h("label", { for: "sr", text: "Role" }), rs),
      h("div", { class: "modal-actions" }, h("button", { class: "btn btn-primary", type: "button", onclick: guard(async () => { await API.addToShortlist(rs.value, p.id); m.close(); toast("Added to shortlist"); drawerClose(); openDrawer(p.id); }), text: "Add to shortlist" }))));
  });

  // ------------------------------------------------------------ MATCH dialog (roles and library templates)
  function openMatches(cfg) {
    const results = h("div"), opts = { mode: "", budget: "", currency: "AED", hidePending: false };
    const skillLine = h("div", { style: "margin-bottom:12px" },
      cfg.skills.filter(s => s.importance === "required").map(s => h("span", { class: "tag teal", style: "margin:0 6px 6px 0", text: skillById.get(s.skill_id)?.name })),
      cfg.skills.filter(s => s.importance === "preferred").map(s => h("span", { class: "tag", style: "margin:0 6px 6px 0", text: skillById.get(s.skill_id)?.name + " (nice to have)" })));
    async function run() {
      clear(results); results.appendChild(h("p", { class: "muted", text: "Matching" }));
      let list = cfg.kind === "role" ? await API.matchRole(cfg.id, 60) : await API.matchTemplate(cfg.id, { mode: opts.mode || null, budget: opts.budget === "" ? null : +opts.budget, currency: opts.currency, limit: 60 });
      const byId = new Map(PROS.map(p => [p.id, p]));
      list = list.filter(r => byId.has(r.professional_id) && (!opts.hidePending || byId.get(r.professional_id).status !== "pending"));
      clear(results);
      if (!list.length) { results.appendChild(h("div", { class: "empty", text: "No one in the network has the required skills yet. This is a sourcing gap to fill." })); return; }
      results.appendChild(h("p", { class: "small muted", text: list.length + " people, best fit first. Score is out of 100: required skills 55, preferred 15, skill level 10, engagement type 8, availability 7, verification 3, screening 2." }));
      const tb = h("tbody");
      list.slice(0, 30).forEach((r, i) => {
        const p = byId.get(r.professional_id);
        tb.appendChild(h("tr", {},
          h("td", {}, h("div", { style: "font-weight:500", text: r.score.toFixed(0) }), h("span", { class: "scorebar" }, h("i", { style: "width:" + Math.min(100, r.score) + "%" }))),
          h("td", {}, h("button", { class: "link-btn", type: "button", onclick: () => { const mm = document.querySelector(".modal-back"); if (mm) mm.remove(); openDrawer(p.id); }, text: p.full_name }),
            h("div", { class: "sub", text: [p.current_title, where(p)].filter(Boolean).join(", ") })),
          h("td", {}, `${r.required_matched} of ${r.required_total}`, r.preferred_total ? h("div", { class: "sub", text: `${r.preferred_matched} of ${r.preferred_total} extras` }) : null),
          h("td", { text: r.avg_proficiency != null ? r.avg_proficiency.toFixed(1) + " of 5" : "" }),
          h("td", {}, LABELS.availability[p.availability], r.mode_ok ? null : h("div", { class: "sub", text: "Not open to " + (LABELS.modes[cfg.mode] || "this type") }),
            r.rate_ok === false ? h("div", { class: "sub", style: "color:#A32D2D", text: "Rate above budget" }) : r.rate_ok === true ? h("div", { class: "sub", text: "Rate within budget" }) : null),
          h("td", {}, statusTag(p.status), h("div", {}, verTag(p.verification_level))),
          h("td", {}, cfg.kind === "role" ? h("button", { class: "btn btn-sm", type: "button", onclick: guard(async (ev) => { await API.addToShortlist(cfg.id, p.id); ev.target.textContent = "Shortlisted"; ev.target.disabled = true; cfg.onShortlist && cfg.onShortlist(); }), text: "Shortlist" }) : null)));
      });
      results.appendChild(h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Score", "Person", "Required skills", "Skill level", "Availability", "Status", ""].map(t => h("th", { scope: "col", text: t })))), tb)));
    }
    const controls = cfg.kind === "template" ? h("div", { class: "toolbar" },
      h("select", { "aria-label": "Engagement type", onchange: e => { opts.mode = e.target.value; run(); } }, h("option", { value: "", text: "Any engagement" }), Object.entries(LABELS.modes).map(([v, l]) => h("option", { value: v, text: l }))),
      h("input", { type: "number", min: 0, placeholder: "Day rate budget", "aria-label": "Day rate budget", style: "width:150px", onchange: e => { opts.budget = e.target.value; run(); } }),
      h("select", { "aria-label": "Budget currency", style: "min-width:90px", onchange: e => { opts.currency = e.target.value; run(); } }, CURRENCIES.map(c => h("option", { value: c, text: c }))),
      h("label", { class: "check", style: "margin:0" }, h("input", { type: "checkbox", onchange: e => { opts.hidePending = e.target.checked; run(); } }), h("span", { class: "small", text: "Hide unreviewed" })))
      : h("div", { class: "toolbar" }, h("label", { class: "check", style: "margin:0" }, h("input", { type: "checkbox", onchange: e => { opts.hidePending = e.target.checked; run(); } }), h("span", { class: "small", text: "Hide unreviewed" })));
    cfg.mode = cfg.mode || null;
    const body = h("div", {}, skillLine, controls, results);
    const m = modal("Find people: " + cfg.title, body, { onClose: cfg.onClose }); m.el.querySelector(".modal").style.width = "min(1000px,100%)";
    guard(run)();
  }

  // ------------------------------------------------------------ OPPORTUNITIES
  async function oppView() {
    const wrap = h("div", { class: "split" });
    const list = h("div", { class: "list" }), detail = h("div");
    wrap.append(h("div", {}, h("button", { class: "btn btn-primary", style: "width:100%;margin-bottom:12px", type: "button", onclick: newOpportunity, text: "New opportunity" }), list), detail);
    const drawList = () => {
      clear(list);
      if (!OPPS.length) list.appendChild(h("div", { class: "empty", text: "No opportunities yet. Add one when a bid or contract comes in." }));
      OPPS.forEach(o => list.appendChild(h("button", { class: "item", type: "button", "aria-current": o.id === selOpp ? "true" : "false", onclick: () => { selOpp = o.id; drawList(); drawDetail(); } },
        h("div", { style: "font-weight:500", text: o.name }), h("div", { class: "sub small muted", text: [o.client_name, LABELS.oppStatus[o.status], o.roles.length + " role" + (o.roles.length === 1 ? "" : "s")].filter(Boolean).join(" | ") }))));
    };
    async function drawDetail() {
      clear(detail); const o = OPPS.find(x => x.id === selOpp);
      if (!o) { detail.appendChild(h("div", { class: "card empty", text: "Select an opportunity, or create one." })); return; }
      const sl = await API.listShortlist(o.roles.map(r => r.id));
      const refresh = async () => { OPPS = await API.listOpportunities(); drawList(); drawDetail(); };
      detail.appendChild(h("div", { class: "card" },
        h("div", { class: "card-head" }, h("div", {}, h("h2", { style: "margin:0", text: o.name }), h("div", { class: "muted", text: [o.client_name, o.country, o.offering_id ? offById.get(o.offering_id)?.name : null, o.expected_start ? "starts " + fmtDate(o.expected_start) : null].filter(Boolean).join(" | ") })),
          h("select", { "aria-label": "Opportunity status", style: "width:auto", onchange: guard(async e => { await API.updateOpportunity(o.id, { status: e.target.value }); o.status = e.target.value; drawList(); toast("Status updated"); }) }, opt(LABELS.oppStatus, o.status))),
        o.notes ? h("p", { class: "small", text: o.notes }) : null,
        h("div", { style: "display:flex;gap:8px;flex-wrap:wrap" },
          h("button", { class: "btn btn-sm btn-primary", type: "button", onclick: () => addRoleDialog(o, refresh), text: "Add role" }),
          h("button", { class: "btn btn-sm btn-danger", type: "button", onclick: guard(async () => { if (await confirmBox("Delete opportunity", "This removes the opportunity, its roles and shortlists. The people stay in the network.", "Delete", true)) { await API.deleteOpportunity(o.id); selOpp = null; await refresh(); } }), text: "Delete opportunity" }))));
      if (!o.roles.length) detail.appendChild(h("div", { class: "card empty", text: "No roles yet. Add roles from the library to see who in the network fits." }));
      o.roles.forEach(r => {
        const mine = sl.filter(s => s.role_id === r.id), placed = mine.filter(s => s.stage === "placed").length;
        detail.appendChild(h("div", { class: "card" },
          h("div", { class: "card-head" }, h("div", {}, h("h3", { text: r.title }), h("div", { class: "muted small", text: [LABELS.seniority[r.seniority], r.headcount + " needed", `${placed} placed`, r.engagement_mode ? LABELS.modes[r.engagement_mode] : null, r.work_mode ? LABELS.work[r.work_mode] : null, r.location, r.day_rate_budget_max ? `up to ${r.budget_currency} ${r.day_rate_budget_max} a day` : null].filter(Boolean).join(" | ") })),
            h("div", { style: "display:flex;gap:8px" }, h("button", { class: "btn btn-sm btn-primary", type: "button", onclick: () => openMatches({ kind: "role", id: r.id, title: r.title, skills: r.skills, mode: r.engagement_mode, onClose: refresh }), text: "Find matches" }),
              h("button", { class: "btn btn-sm", type: "button", onclick: guard(async () => { if (await confirmBox("Remove role", "Remove " + r.title + " and its shortlist?", "Remove", true)) { await API.deleteRole(r.id); await refresh(); } }), text: "Remove" }))),
          h("div", {}, r.skills.filter(s => s.importance === "required").map(s => h("span", { class: "tag teal", style: "margin:0 6px 6px 0", text: skillById.get(s.skill_id)?.name })), r.skills.filter(s => s.importance === "preferred").map(s => h("span", { class: "tag", style: "margin:0 6px 6px 0", text: skillById.get(s.skill_id)?.name }))),
          mine.length ? h("div", { class: "table-wrap", style: "margin-top:10px" }, h("table", {}, h("thead", {}, h("tr", {}, ["Shortlist", "Stage", ""].map(t => h("th", { scope: "col", text: t })))), h("tbody", {}, mine.map(s => {
            const p = PROS.find(x => x.id === s.professional_id);
            return h("tr", {}, h("td", {}, p ? h("button", { class: "link-btn", type: "button", onclick: () => openDrawer(p.id), text: p.full_name }) : "Removed"),
              h("td", {}, h("select", { "aria-label": "Stage", style: "width:auto", onchange: guard(async e => { await API.setShortlistStage(s.id, e.target.value); s.stage = e.target.value; await refresh(); }) }, opt(LABELS.stage, s.stage))),
              h("td", {}, h("button", { class: "btn btn-sm", type: "button", onclick: guard(async () => { await API.removeFromShortlist(s.id); await refresh(); }), text: "Remove" })));
          })))) : h("p", { class: "small muted", style: "margin:10px 0 0", text: "No one shortlisted yet." })));
      });
    }
    drawList(); await drawDetail(); return wrap;
  }

  function newOpportunity() {
    const f = { name: "", client_name: "", offering_id: "", country: "", status: "prospect", expected_start: "", notes: "" };
    const inp = (k, label, type) => h("div", { class: "field" }, h("label", { text: label }), h("input", { type: type || "text", maxlength: 200, oninput: e => f[k] = e.target.value }));
    const m = modal("New opportunity", h("form", { onsubmit: guard(async (e) => { e.preventDefault(); if (f.name.trim().length < 2) { toast("Give the opportunity a name"); return; }
      const row = await API.createOpportunity(f); OPPS = await API.listOpportunities(); selOpp = row.id; m.close(); render(); toast("Opportunity created"); }) },
      inp("name", "Name"), h("div", { class: "grid-2" }, inp("client_name", "Client"), inp("country", "Country")),
      h("div", { class: "grid-2" },
        h("div", { class: "field" }, h("label", { text: "Main offering" }), h("select", { onchange: e => f.offering_id = e.target.value }, h("option", { value: "", text: "Not sure yet" }), REF.offerings.map(o => h("option", { value: o.id, text: o.name })))),
        h("div", { class: "field" }, h("label", { text: "Status" }), h("select", { onchange: e => f.status = e.target.value }, opt(LABELS.oppStatus, "prospect")))),
      inp("expected_start", "Expected start", "date"),
      h("div", { class: "field" }, h("label", { text: "Notes" }), h("textarea", { maxlength: 2000, oninput: e => f.notes = e.target.value })),
      h("div", { class: "modal-actions" }, h("button", { class: "btn btn-primary", type: "submit", text: "Create" }))));
  }

  function addRoleDialog(o, done) {
    let tab = "library"; const box = h("div");
    const lib = { offering: o.offering_id || REF.offerings[0].id, tpl: "", headcount: 1 };
    const cust = { title: "", seniority: "", headcount: 1, engagement_mode: "", work_mode: "", location: "", start_date: "", day_rate_budget_max: "", budget_currency: "AED", skills: [] };
    function draw() {
      clear(box);
      box.appendChild(h("div", { class: "chips", style: "margin-bottom:16px" }, [["library", "From the role library"], ["custom", "Custom role"]].map(([k, l]) =>
        h("button", { class: "btn btn-sm" + (tab === k ? " btn-primary" : ""), type: "button", onclick: () => { tab = k; draw(); }, text: l }))));
      if (tab === "library") {
        const tpls = REF.templates.filter(t => t.offering_id === lib.offering);
        if (!tpls.find(t => t.id === lib.tpl)) lib.tpl = tpls[0]?.id || "";
        const ts = h("select", { id: "tp", onchange: e => { lib.tpl = e.target.value; prev(); } }, tpls.map(t => h("option", { value: t.id, text: `${t.title} (${LABELS.seniority[t.seniority]})` })));
        const pv = h("div", { class: "small", style: "margin-bottom:14px" });
        const prev = () => { clear(pv); const t = tplById.get(lib.tpl); if (t) t.skills.forEach(s => pv.appendChild(h("span", { class: "tag " + (s.importance === "required" ? "teal" : ""), style: "margin:0 6px 6px 0", text: skillById.get(s.skill_id)?.name }))); };
        box.append(h("div", { class: "field" }, h("label", { text: "Offering" }), h("select", { onchange: e => { lib.offering = e.target.value; draw(); } }, REF.offerings.map(x => h("option", { value: x.id, selected: x.id === lib.offering, text: x.name })))),
          h("div", { class: "field" }, h("label", { for: "tp", text: "Role" }), ts), pv,
          h("div", { class: "field", style: "max-width:160px" }, h("label", { text: "How many people" }), h("input", { type: "number", min: 1, max: 500, value: lib.headcount, oninput: e => lib.headcount = Math.max(1, +e.target.value || 1) })),
          h("div", { class: "modal-actions" }, h("button", { class: "btn btn-primary", type: "button", disabled: !lib.tpl, onclick: guard(async () => { await API.addRoleFromTemplate(o.id, lib.tpl, lib.headcount); m.close(); await done(); toast("Role added"); }), text: "Add role" })));
        prev();
      } else {
        const picker = h("select", { "aria-label": "Skill" }, REF.domains.map(d => h("optgroup", { label: d.name }, REF.skills.filter(s => s.domain_id === d.id).map(s => h("option", { value: s.id, text: s.name }))))), imp = h("select", { "aria-label": "Importance", style: "width:auto" }, h("option", { value: "required", text: "Required" }), h("option", { value: "preferred", text: "Nice to have" }));
        const chips = h("div", { style: "margin:8px 0 14px" });
        const dc = () => { clear(chips); cust.skills.forEach((s, i) => chips.appendChild(h("span", { class: "tag " + (s.importance === "required" ? "teal" : ""), style: "margin:0 6px 6px 0;cursor:pointer", role: "button", tabindex: "0", title: "Remove", onclick: () => { cust.skills.splice(i, 1); dc(); }, text: skillById.get(s.skill_id)?.name + "  x" }))); };
        dc();
        const f = (k, label, type, extra) => h("div", { class: "field" }, h("label", { text: label }), h("input", Object.assign({ type: type || "text", maxlength: 200, value: cust[k], oninput: e => cust[k] = e.target.value }, extra || {})));
        box.append(f("title", "Role title"), h("div", { class: "grid-3" },
          h("div", { class: "field" }, h("label", { text: "Level" }), h("select", { onchange: e => cust.seniority = e.target.value }, h("option", { value: "", text: "Any" }), opt(LABELS.seniority, cust.seniority))),
          f("headcount", "How many", "number", { min: 1 }),
          h("div", { class: "field" }, h("label", { text: "Engagement" }), h("select", { onchange: e => cust.engagement_mode = e.target.value }, h("option", { value: "", text: "Any" }), opt(LABELS.modes, cust.engagement_mode)))),
          h("div", { class: "grid-3" }, f("location", "Location"), f("start_date", "Start date", "date"),
            h("div", { class: "field" }, h("label", { text: "Work style" }), h("select", { onchange: e => cust.work_mode = e.target.value }, h("option", { value: "", text: "Any" }), opt(LABELS.work, cust.work_mode)))),
          h("div", { class: "grid-2" }, f("day_rate_budget_max", "Day rate budget, up to", "number", { min: 0 }), h("div", { class: "field" }, h("label", { text: "Currency" }), h("select", { onchange: e => cust.budget_currency = e.target.value }, CURRENCIES.map(c => h("option", { value: c, text: c }))))),
          h("div", { class: "field" }, h("label", { text: "Skills needed" }), h("div", { style: "display:flex;gap:8px" }, picker, imp,
            h("button", { class: "btn btn-sm", type: "button", onclick: () => { if (!cust.skills.some(s => s.skill_id === picker.value)) { cust.skills.push({ skill_id: picker.value, importance: imp.value }); dc(); } }, text: "Add" })), chips),
          h("div", { class: "modal-actions" }, h("button", { class: "btn btn-primary", type: "button", onclick: guard(async () => {
            if (cust.title.trim().length < 2) { toast("Give the role a title"); return; } if (!cust.skills.length) { toast("Add at least one skill"); return; }
            await API.addCustomRole(o.id, { ...cust, headcount: +cust.headcount || 1, day_rate_budget_max: cust.day_rate_budget_max === "" ? null : +cust.day_rate_budget_max, seniority: cust.seniority || null, engagement_mode: cust.engagement_mode || null, work_mode: cust.work_mode || null });
            m.close(); await done(); toast("Role added"); }), text: "Add role" })));
      }
    }
    const m = modal("Add a role to " + o.name, box); draw();
  }

  // ------------------------------------------------------------ ROLE LIBRARY
  let libOffering = "";
  function libraryView() {
    const wrap = h("div");
    wrap.appendChild(h("div", { class: "toolbar" }, h("select", { "aria-label": "Offering", onchange: e => { libOffering = e.target.value; render(); } }, h("option", { value: "", text: "All offerings" }), REF.offerings.map(o => h("option", { value: o.id, selected: libOffering === o.id, text: o.name }))),
      h("span", { class: "muted small", text: "Use this when a contract lands. Pick the offering, press Find people on a role, and see who in the network fits." })));
    REF.offerings.filter(o => !libOffering || o.id === libOffering).forEach(o => {
      const tpls = REF.templates.filter(t => t.offering_id === o.id); if (!tpls.length) return;
      wrap.appendChild(h("div", { class: "offering-group" }, h("h3", {}, o.name, h("span", { class: "tag", text: LABELS.line[o.service_line] }), h("span", { class: "muted small", style: "font-weight:400", text: o.delivery_type })),
        tpls.map(t => h("div", { class: "card" }, h("div", { class: "card-head" }, h("div", {}, h("h3", { text: t.title }), h("span", { class: "muted small", text: LABELS.seniority[t.seniority] })),
          h("button", { class: "btn btn-sm btn-primary", type: "button", onclick: () => openMatches({ kind: "template", id: t.id, title: t.title, skills: t.skills }), text: "Find people" })),
          h("div", {}, t.skills.map(s => h("span", { class: "tag " + (s.importance === "required" ? "teal" : ""), style: "margin:0 6px 6px 0", text: skillById.get(s.skill_id)?.name })))))));
    });
    return wrap;
  }

  // ------------------------------------------------------------ boot
  async function render() {
    const content = view === "talent" ? talentView() : view === "opps" ? await oppView() : libraryView();
    shell(content);
  }
  async function load() { [PROS, OPPS] = await Promise.all([API.listProfessionals(), API.listOpportunities()]); if (!OPPS.find(o => o.id === selOpp)) selOpp = OPPS[0]?.id || null; }
  async function start() { REF = await API.getReference(true); idx(); await load(); await render(); }

  (async function boot() {
    try {
      await API.init(); SESS = await API.session();
      if (!SESS) { loginScreen(); return; }
      await start();
    } catch (e) { console.error(e); if (CFG.mode === "supabase") loginScreen(e.message); else root.appendChild(h("div", { class: "shell" }, h("p", { text: "Could not start: " + e.message }))); }
  })();
})();
