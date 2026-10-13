(function () {
  const { h, clear, LABELS, CURRENCIES, PROFICIENCY, toast, confirmBox, modal, fmtDate, csvCell } = UI;
  const API = window.TalentAPI, CFG = window.TALENT_CONFIG;
  const root = document.getElementById("root");

  // PROS is loaded once at sign-in. Projects and role templates are fetched the first time they are opened.
  let REF, SESS, PROS = [], OPPS = null, view = "people", selOpp = null, showMore = false;
  const F = { q: "", status: "", domain: "", offering: "", skill: "", mode: "", avail: "", ver: "", country: "", check: "" };
  let skillById, domById, offById, tplById, byId;

  const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { console.error(e); toast(e.message || "Something went wrong."); } };
  const opt = (obj, cur) => Object.entries(obj).map(([v, l]) => h("option", { value: v, selected: v === cur, text: l }));
  const where = (p) => [p.city, p.country].filter(Boolean).join(", ");
  const roleLine = (p) => [p.current_title, p.current_employer].filter(Boolean).join(" at ");
  const st = (s) => h("span", { class: "st " + s, text: LABELS.status[s] || s });
  const rate = (p) => p.day_rate_min == null && p.day_rate_max == null ? "" : `${p.rate_currency} ${p.day_rate_min ?? "?"} to ${p.day_rate_max ?? "?"} a day`;
  const primaryDomain = (p) => { const d = p.domains.find(x => x.is_primary) || p.domains[0]; return d ? domById.get(d.domain_id) : null; };
  const topSkills = (p, n) => [...p.skills].sort((a, b) => b.proficiency - a.proficiency).slice(0, n).map(s => skillById.get(s.skill_id)).filter(Boolean);

  // ---- index built once per load, so searching and filtering do no repeated work ----
  const normName = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const normPhone = (s) => (s || "").replace(/\D/g, "");
  const normUrl = (s) => (s || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[/?#].*$/, (m) => m.startsWith("/") ? m.replace(/\/+$/, "") : "").replace(/\/+$/, "");
  function index() {
    skillById = new Map(REF.skills.map(x => [x.id, x])); domById = new Map(REF.domains.map(x => [x.id, x]));
    offById = new Map(REF.offerings.map(x => [x.id, x])); tplById = new Map((REF.templates || []).map(x => [x.id, x]));
  }
  function prepare() {
    byId = new Map(PROS.map(p => [p.id, p]));
    const keys = new Map();
    const addKey = (k, id) => { if (!k) return; if (!keys.has(k)) keys.set(k, []); keys.get(k).push(id); };
    for (const p of PROS) {
      const names = p.skills.map(s => skillById.get(s.skill_id)?.name || "");
      p._k = {
        skills: new Set(p.skills.map(s => skillById.get(s.skill_id)?.slug)),
        domains: new Set(p.domains.map(d => domById.get(d.domain_id)?.slug)),
        offers: new Set(p.offerings.map(o => offById.get(o)?.slug)),
        hay: [p.full_name, p.email, p.current_title, p.current_employer, p.city, p.country, p.advisory_topics, p.other_skills, ...names,
          ...p.credentials.map(c => c.name + " " + (c.issuer || ""))].join(" ").toLowerCase(),
        missing: [!p.skills.length && "skills", !p.domains.length && "main area", !p.offerings.length && "314 services"].filter(Boolean),
        twins: new Set()
      };
      addKey("n:" + normName(p.full_name), p.id);
      if (normPhone(p.phone).length >= 7) addKey("p:" + normPhone(p.phone), p.id);
      if (p.linkedin_url) addKey("l:" + normUrl(p.linkedin_url), p.id);
    }
    for (const ids of keys.values()) if (ids.length > 1) for (const a of ids) for (const b of ids) if (a !== b) byId.get(a)._k.twins.add(b);
  }

  // ---- shell ----
  function shell(content) {
    clear(root);
    if (CFG.mode !== "supabase") root.appendChild(h("div", { class: "devbar" }, "Test mode. Fictional people, kept only in this browser.",
      h("button", { type: "button", onclick: guard(async () => { if (await confirmBox("Reset test data", "This removes anything you added and restores the fictional profiles.", "Reset", true)) { await API.resetDemo(); await load(); render(); toast("Reset"); } }), text: "Reset" })));
    const nav = [["people", "People"], ["projects", "Projects"], ["roles", "Role library"]];
    root.appendChild(h("header", { class: "topbar" }, h("div", { class: "topbar-in" },
      h("img", { src: "assets/314_wordmark_reversed.svg", alt: "314 Technologies" }),
      h("nav", { "aria-label": "Sections" }, nav.map(([k, l]) => h("button", { type: "button", "aria-current": view === k ? "page" : null, onclick: () => { view = k; closeDrawer(); render(); }, text: l }))),
      h("span", { class: "sp" }),
      h("span", { class: "who", text: SESS.email }),
      CFG.mode === "supabase" ? h("button", { class: "signout", type: "button", onclick: guard(async () => { await API.signOut(); location.reload(); }), text: "Sign out" }) : null)));
    root.appendChild(h("main", { class: "shell" }, content));
  }

  function loginScreen(msg) {
    clear(root);
    const em = h("input", { id: "em", type: "email", autocomplete: "username" }), pw = h("input", { id: "pw", type: "password", autocomplete: "current-password" });
    const err = h("div", { class: "error", role: "alert", text: msg || "" });
    root.appendChild(h("div", { class: "login" }, h("img", { src: "assets/314_wordmark_ink.svg", alt: "314 Technologies" }), h("h1", { text: "Staff sign in" }),
      h("form", { onsubmit: guard(async (e) => { e.preventDefault(); err.textContent = ""; try { SESS = await API.signIn(em.value.trim(), pw.value); await start(); } catch (x) { err.textContent = x.message; } }) },
        h("div", { class: "field" }, h("label", { for: "em", text: "Email" }), em), h("div", { class: "field" }, h("label", { for: "pw", text: "Password" }), pw), err,
        h("button", { class: "btn btn-primary", type: "submit", text: "Sign in" }))));
  }

  // ---- people ----
  function matches(p) {
    const k = p._k;
    if (F.status && p.status !== F.status) return false;
    if (F.ver && p.verification_level !== F.ver) return false;
    if (F.mode && !p.engagement_modes.includes(F.mode)) return false;
    if (F.avail) { const order = ["immediate", "within_30_days", "within_60_days", "within_90_days"]; const i = order.indexOf(p.availability); if (i < 0 || i > order.indexOf(F.avail)) return false; }
    if (F.domain && !k.domains.has(F.domain)) return false;
    if (F.offering && !k.offers.has(F.offering)) return false;
    if (F.skill && !k.skills.has(F.skill)) return false;
    if (F.country && !(p.country || "").toLowerCase().includes(F.country.toLowerCase())) return false;
    if (F.check === "incomplete" && !k.missing.length) return false;
    if (F.check === "duplicate" && !k.twins.size) return false;
    const q = F.q.trim().toLowerCase();
    return !q || q.split(/\s+/).every(t => k.hay.includes(t));
  }

  function peopleView() {
    const pending = PROS.filter(p => p.status === "pending").length;
    const count = h("span", { class: "muted" });
    const head = h("div", { class: "page-head" }, h("h1", { text: "People" }), count, h("span", { class: "sp" }),
      h("button", { class: "btn btn-sm", type: "button", onclick: () => exportCsv(PROS.filter(matches)), text: "Export CSV" }));
    const queue = pending ? h("p", { class: "queue" }, h("button", { class: "link-btn", type: "button", onclick: () => { F.status = F.status === "pending" ? "" : "pending"; render(); },
      text: F.status === "pending" ? "Show everyone" : pending + (pending === 1 ? " profile" : " profiles") + " waiting for review" })) : null;

    const moreCount = () => ["offering", "skill", "mode", "avail", "ver", "country", "check"].filter(k => F[k]).length;
    const moreBtn = h("button", { class: "btn btn-sm", type: "button", "aria-expanded": String(showMore), onclick: () => { showMore = !showMore; render(); } });
    const clearBtn = h("button", { class: "link-btn", type: "button", onclick: () => { Object.keys(F).forEach(k => F[k] = ""); render(); }, text: "Clear all" });
    const tbody = h("tbody");
    const table = h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, [["Name"], ["Main area", "col-hide"], ["Skills", "col-hide"], ["Works as", "col-hide"], ["Available", "col-hide"], ["Status"]].map(([t, c]) => h("th", { scope: "col", class: c || null, text: t })))), tbody));
    const draw = () => {
      const list = PROS.filter(matches); clear(tbody);
      moreBtn.textContent = (showMore ? "Fewer filters" : "More filters") + (moreCount() ? " (" + moreCount() + ")" : "");
      clearBtn.hidden = !Object.values(F).some(Boolean);
      count.textContent = list.length === PROS.length ? PROS.length + " in total" : list.length + " of " + PROS.length;
      if (!list.length) { tbody.appendChild(h("tr", {}, h("td", { colspan: 6, class: "empty", text: PROS.length ? "No one matches these filters." : "No one has registered yet." }))); return; }
      list.slice(0, 300).forEach(p => {
        const dm = primaryDomain(p), k = p._k;
        tbody.appendChild(h("tr", { class: "click", tabindex: "0", onclick: () => openDrawer(p.id), onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); openDrawer(p.id); } } },
          h("td", {}, h("div", {}, h("strong", { text: p.full_name }), k.missing.length ? h("span", { class: "flag", text: "Incomplete" }) : null, k.twins.size ? h("span", { class: "flag", text: "Possible duplicate" }) : null),
            h("div", { class: "sub", text: [roleLine(p), where(p)].filter(Boolean).join(" | ") })),
          h("td", { class: "col-hide", text: dm ? dm.name : "" }),
          h("td", { class: "col-hide", text: topSkills(p, 3).map(s => s.name).join(", ") }),
          h("td", { class: "col-hide", text: p.engagement_modes.map(m => LABELS.modes[m]).join(", ") }),
          h("td", { class: "col-hide", text: LABELS.availability[p.availability] }),
          h("td", {}, st(p.status))));
      });
      if (list.length > 300) tbody.appendChild(h("tr", {}, h("td", { colspan: 6, class: "empty", text: `Showing 300 of ${list.length}. Narrow the search to see the rest.` })));
    };
    const set = (key) => (e) => { F[key] = e.target.value; draw(); };
    const sel = (key, label, items) => h("select", { "aria-label": label, onchange: set(key) }, h("option", { value: "", text: label }), items.map(([v, l]) => h("option", { value: v, selected: F[key] === v, text: l })));
    const skillSel = h("select", { "aria-label": "Skill", onchange: set("skill") }, h("option", { value: "", text: "Any skill" }),
      REF.domains.map(d => h("optgroup", { label: d.name }, REF.skills.filter(s => s.domain_id === d.id).map(s => h("option", { value: s.slug, selected: F.skill === s.slug, text: s.name + (s.vendor ? ` (${s.vendor})` : "") })))));

    const bar = h("div", { class: "bar" },
      h("input", { type: "search", placeholder: "Search name, skill, employer or certification", "aria-label": "Search", value: F.q, oninput: set("q") }),
      sel("status", "Any status", Object.entries(LABELS.status)), sel("domain", "Any area", REF.domains.map(d => [d.slug, d.name])),
      moreBtn, clearBtn);
    const more = showMore ? h("div", { class: "more" },
      sel("offering", "Any 314 service", REF.offerings.map(o => [o.slug, o.name])), skillSel, sel("mode", "Any kind of work", Object.entries(LABELS.modes)),
      sel("avail", "Any availability", [["immediate", "Immediately"], ["within_30_days", "Within 30 days"], ["within_60_days", "Within 60 days"], ["within_90_days", "Within 90 days"]]),
      sel("ver", "Any verification", Object.entries(LABELS.verification)),
      h("input", { type: "search", placeholder: "Country", "aria-label": "Country", value: F.country, oninput: set("country") }),
      sel("check", "All records", [["incomplete", "Incomplete"], ["duplicate", "Possible duplicates"]])) : null;
    draw();
    return h("div", {}, head, queue, bar, more, table);
  }

  function exportCsv(list) {
    const head = ["Name", "Email", "Phone", "Country", "City", "Title", "Employer", "Level", "Years", "Main area", "Skills", "314 services", "Kinds of work", "Availability", "Currency", "Day rate from", "Day rate to", "Status", "Verification"];
    const lines = [head.map(csvCell).join(",")];
    list.forEach(p => lines.push([p.full_name, p.email, p.phone, p.country, p.city, p.current_title, p.current_employer, p.seniority, p.years_experience, primaryDomain(p)?.name,
      p.skills.map(s => skillById.get(s.skill_id)?.name).join("; "), p.offerings.map(o => offById.get(o)?.name).join("; "), p.engagement_modes.join("; "), p.availability, p.rate_currency, p.day_rate_min, p.day_rate_max, p.status, p.verification_level].map(csvCell).join(",")));
    const a = h("a", { href: URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" })), download: "314-talent-export.csv" });
    document.body.appendChild(a); a.click(); a.remove(); toast("Exported " + list.length + (list.length === 1 ? " profile" : " profiles"));
  }

  // ---- one person ----
  function closeDrawer() { document.querySelectorAll(".drawer, .drawer-back").forEach(e => e.remove()); }
  const patch = guard(async (p, change, msg) => { Object.assign(p, await API.updateProfessional(p.id, change)); toast(msg || "Saved"); });

  async function openDrawer(id) {
    closeDrawer();
    const p = byId.get(id); if (!p) return;
    const [notes, pipeline] = await Promise.all([API.getNotes(id), API.listShortlistForProfessional(id)]);
    const kv = (k, v) => v == null || v === "" || (Array.isArray(v) && !v.length) ? null : [h("dt", { text: k }), h("dd", {}, v)];
    const link = (u) => u ? (/^https?:\/\//i.test(u) ? h("a", { href: u, target: "_blank", rel: "noopener noreferrer", text: u }) : u) : null;
    const close = () => { closeDrawer(); if (view === "people") render(); };
    const ratingSel = h("select", { id: "rating", "aria-label": "Internal rating" }, h("option", { value: "", text: "No rating" }), [1, 2, 3, 4, 5].map(n => h("option", { value: n, selected: notes.internal_rating === n, text: n + " of 5" })));
    const notesBox = h("textarea", { id: "notes", maxlength: 4000, "aria-label": "Screening notes", value: notes.screening_notes || "" });
    const twins = [...p._k.twins].map(i => byId.get(i)).filter(Boolean);
    const section = (title, ...kids) => h("div", { class: "section" }, title ? h("h3", { text: title }) : null, kids);

    const back = h("div", { class: "drawer-back", onclick: close });
    const el = h("aside", { class: "drawer", role: "dialog", "aria-modal": "true", "aria-label": "Profile for " + p.full_name },
      h("div", { class: "drawer-head" }, h("div", {}, h("h2", { text: p.full_name }), h("div", { class: "muted small", text: [roleLine(p), where(p)].filter(Boolean).join(" | ") })),
        h("button", { class: "btn btn-sm", type: "button", onclick: close, text: "Close" })),
      h("div", { class: "drawer-body" },
        p._k.missing.length ? h("div", { class: "notice", text: "Missing: " + p._k.missing.join(", ") + "." }) : null,
        twins.length ? h("div", { class: "notice" }, "Possible duplicate of ", twins.map((t, i) => [i ? ", " : "", h("button", { class: "link-btn", type: "button", onclick: () => openDrawer(t.id), text: t.full_name + " (" + t.email + ")" })])) : null,
        section("",
          h("div", { class: "grid-2" },
            h("div", { class: "field" }, h("label", { for: "stt", text: "Status" }), h("select", { id: "stt", onchange: e => patch(p, { status: e.target.value }, "Status updated") }, opt(LABELS.status, p.status))),
            h("div", { class: "field" }, h("label", { for: "vl", text: "Verification" }), h("select", { id: "vl", onchange: e => patch(p, { verification_level: e.target.value }, "Verification updated") }, opt(LABELS.verification, p.verification_level)))),
          h("div", { class: "actions" },
            h("a", { class: "btn btn-sm", href: "mailto:" + p.email, text: "Email" }),
            h("button", { class: "btn btn-sm", type: "button", onclick: () => addToShortlistDialog(p, close), text: "Add to a project role" }),
            h("button", { class: "btn btn-sm", type: "button", onclick: () => patch(p, { last_confirmed_at: new Date().toISOString() }, "Marked as current"), text: "Mark details as current" }))),
        section("Contact", h("dl", { class: "kv" }, kv("Email", p.email), kv("Phone", p.phone), kv("LinkedIn", link(p.linkedin_url)), kv("GitHub", link(p.github_url)), kv("Other link", link(p.portfolio_url)),
          kv("Registered", fmtDate(p.created_at)), kv("Last confirmed", fmtDate(p.last_confirmed_at)), kv("Source", p.source + (p.referred_by ? ", referred by " + p.referred_by : "")))),
        section("Work", h("dl", { class: "kv" },
          kv("Level", (LABELS.seniority[p.seniority] || "") + (p.years_experience != null ? `, ${p.years_experience} years` : "")), kv("Kinds of work", p.engagement_modes.map(m => LABELS.modes[m]).join(", ")),
          kv("Where", p.work_modes.map(m => LABELS.work[m]).join(", ")), kv("Available", LABELS.availability[p.availability] + (p.available_from ? " (from " + fmtDate(p.available_from) + ")" : "")),
          kv("Day rate", rate(p)), kv("Advisory rate", p.advisory_hourly_rate != null ? `${p.rate_currency} ${p.advisory_hourly_rate} an hour` : ""), kv("Can advise on", p.advisory_topics),
          kv("Main area", primaryDomain(p)?.name), kv("314 services", p.offerings.map(o => offById.get(o)?.name).filter(Boolean).join(", ")))),
        section("Skills", p.skills.length ? [...p.skills].sort((a, b) => b.proficiency - a.proficiency).map(s => { const sk = skillById.get(s.skill_id); return sk ? h("div", { class: "skill-line" }, h("span", { text: sk.name + (sk.vendor ? " (" + sk.vendor + ")" : "") }), h("span", { class: "lvl", text: PROFICIENCY[s.proficiency] })) : null; }) : h("p", { class: "muted", text: "None selected." }),
          p.other_skills ? h("p", { class: "small muted", style: "margin-top:8px", text: "Also: " + p.other_skills }) : null),
        section("Certifications", p.credentials.length ? [p.credentials.map(c => h("label", { class: "check" },
          h("input", { type: "checkbox", checked: c.verified, onchange: guard(async e => { await API.setCredentialVerified(p.id, c.id, e.target.checked); c.verified = e.target.checked; toast(c.verified ? "Marked verified" : "Verification removed"); }) }),
          h("span", {}, h("strong", { text: c.name }), c.issuer ? ", " + c.issuer : "", c.credential_ref ? h("span", { class: "muted", text: "  ID " + c.credential_ref }) : null, c.expires_on ? h("span", { class: "muted small", text: "  expires " + fmtDate(c.expires_on) }) : null))),
          h("p", { class: "small muted", text: "Tick one only after checking it with the issuer." })] : h("p", { class: "muted", text: "None listed." })),
        section("Sharing", h("dl", { class: "kv" }, kv("Employer", p.employer_display === "anonymised" ? "Keep private, describe generally" : "Can be named"), kv("Outside work", p.employer_approval_needed ? "Employer approval needed first" : ""),
          kv("Consent", p.consents ? (p.consents.share_with_clients ? "Anonymised summary can go to clients" : "Do not share with clients") : ""))),
        section("Project roles", pipeline.length ? pipeline.map(s => h("div", { class: "small", style: "margin-bottom:4px" }, LABELS.stage[s.stage] + ": " + (s.role_title || "Role") + ", " + (s.opportunity_name || "project"))) : h("p", { class: "muted", text: "Not on any shortlist." })),
        section("Private notes", h("div", { class: "field" }, notesBox), h("div", { class: "field", style: "max-width:180px" }, ratingSel),
          h("button", { class: "btn btn-sm btn-primary", type: "button", onclick: guard(async () => { await API.saveNotes(p.id, { screening_notes: notesBox.value, internal_rating: ratingSel.value ? +ratingSel.value : null }); toast("Notes saved"); }), text: "Save notes" })),
        SESS.role === "admin" ? section("Delete", h("p", { class: "small muted", style: "margin-bottom:10px", text: "Removes this person and everything held about them, including notes and shortlist entries. For erasure requests. This cannot be undone." }),
          h("button", { class: "btn btn-sm btn-danger", type: "button", onclick: guard(async () => { if (await confirmBox("Delete " + p.full_name + "?", "This permanently deletes the profile, notes and shortlist entries.", "Delete permanently", true)) { await API.erase(p.id); PROS = PROS.filter(x => x.id !== p.id); prepare(); closeDrawer(); render(); toast("Profile deleted"); } }), text: "Delete profile" })) : null));
    document.body.append(back, el); el.querySelector(".btn").focus();
  }

  const addToShortlistDialog = guard(async function (p) {
    await needProjects();
    const open = OPPS.filter(o => o.roles.length && !["closed", "lost"].includes(o.status));
    if (!open.length) { toast("Create a project with a role first."); return; }
    const os = h("select", { id: "so" }, open.map(o => h("option", { value: o.id, text: o.name }))), rs = h("select", { id: "sr" });
    const fill = () => { clear(rs); open.find(o => o.id === os.value).roles.forEach(r => rs.appendChild(h("option", { value: r.id, text: r.title }))); };
    os.onchange = fill; fill();
    const m = modal("Add " + p.full_name + " to a role", h("div", {}, h("div", { class: "field" }, h("label", { for: "so", text: "Project" }), os), h("div", { class: "field" }, h("label", { for: "sr", text: "Role" }), rs),
      h("div", { class: "modal-actions" }, h("button", { class: "btn btn-primary", type: "button", onclick: guard(async () => { await API.addToShortlist(rs.value, p.id); m.close(); toast("Added to shortlist"); openDrawer(p.id); }), text: "Add" }))));
  });

  // ---- matching ----
  function openMatches(cfg) {
    const results = h("div"), opts = { mode: "", budget: "", currency: "AED", hidePending: false };
    const names = (list, cls, suffix) => list.map(s => h("span", { class: "tag " + cls, text: skillById.get(s.skill_id)?.name + (suffix || "") }));
    const skillLine = h("div", { style: "margin-bottom:12px" }, names(cfg.skills.filter(s => s.importance === "required"), "on"), names(cfg.skills.filter(s => s.importance === "preferred"), "", " (nice to have)"));
    async function run() {
      clear(results); results.appendChild(h("p", { class: "muted", text: "Matching" }));
      let list = cfg.kind === "role" ? await API.matchRole(cfg.id, 60) : await API.matchTemplate(cfg.id, { mode: opts.mode || null, budget: opts.budget === "" ? null : +opts.budget, currency: opts.currency, limit: 60 });
      list = list.filter(r => byId.has(r.professional_id) && (!opts.hidePending || byId.get(r.professional_id).status !== "pending"));
      clear(results);
      if (!list.length) { results.appendChild(h("div", { class: "empty", text: "No one in the network has the required skills yet." })); return; }
      results.appendChild(h("p", { class: "small muted", style: "margin-bottom:8px", text: list.length + " people, best fit first. The score is out of 100: required skills 55, nice-to-have skills 15, skill level 10, kind of work 8, availability 7, verification 3, screening 2." }));
      const tb = h("tbody");
      list.slice(0, 30).forEach(r => {
        const p = byId.get(r.professional_id);
        tb.appendChild(h("tr", {},
          h("td", {}, h("div", { text: r.score.toFixed(0) }), h("span", { class: "scorebar" }, h("i", { style: "width:" + Math.min(100, r.score) + "%" }))),
          h("td", {}, h("button", { class: "link-btn", type: "button", onclick: () => { const mm = document.querySelector(".modal-back"); if (mm) mm.remove(); openDrawer(p.id); }, text: p.full_name }), h("div", { class: "sub", text: [p.current_title, where(p)].filter(Boolean).join(", ") })),
          h("td", {}, `${r.required_matched} of ${r.required_total}`, r.preferred_total ? h("div", { class: "sub", text: `${r.preferred_matched} of ${r.preferred_total} extras` }) : null),
          h("td", {}, LABELS.availability[p.availability], r.mode_ok ? null : h("div", { class: "sub", text: "Not open to " + (LABELS.modes[cfg.mode] || "this kind of work") }),
            r.rate_ok === false ? h("div", { class: "sub", style: "color:var(--danger)", text: "Rate above budget" }) : r.rate_ok === true ? h("div", { class: "sub", text: "Rate within budget" }) : null),
          h("td", {}, st(p.status)),
          h("td", {}, cfg.kind === "role" ? h("button", { class: "btn btn-sm", type: "button", onclick: guard(async (ev) => { await API.addToShortlist(cfg.id, p.id); ev.target.textContent = "Shortlisted"; ev.target.disabled = true; }), text: "Shortlist" }) : null)));
      });
      results.appendChild(h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Score", "Person", "Required", "Availability", "Status", ""].map(t => h("th", { scope: "col", text: t })))), tb)));
    }
    const hide = h("label", { class: "check", style: "margin:0" }, h("input", { type: "checkbox", onchange: e => { opts.hidePending = e.target.checked; run(); } }), h("span", { text: "Hide unreviewed" }));
    const controls = cfg.kind === "template" ? h("div", { class: "bar" },
      h("select", { "aria-label": "Kind of work", onchange: e => { opts.mode = e.target.value; run(); } }, h("option", { value: "", text: "Any kind of work" }), Object.entries(LABELS.modes).map(([v, l]) => h("option", { value: v, text: l }))),
      h("input", { type: "number", min: 0, placeholder: "Day rate budget", "aria-label": "Day rate budget", style: "width:150px", onchange: e => { opts.budget = e.target.value; run(); } }),
      h("select", { "aria-label": "Currency", style: "min-width:90px", onchange: e => { opts.currency = e.target.value; run(); } }, CURRENCIES.map(c => h("option", { value: c, text: c }))), hide)
      : h("div", { class: "bar" }, hide);
    const m = modal("Find people for " + cfg.title, h("div", {}, skillLine, controls, results), { onClose: cfg.onClose }); m.el.querySelector(".modal").style.width = "min(980px,100%)";
    guard(run)();
  }

  // ---- projects (a client contract, bid or prospect, and the roles it needs) ----
  async function projectsView() {
    await needProjects();
    const wrap = h("div", { class: "split" }), list = h("div", { class: "list" }), detail = h("div");
    wrap.append(h("div", {}, h("button", { class: "btn btn-primary", style: "width:100%;margin-bottom:12px", type: "button", onclick: newProject, text: "New project" }), list), detail);
    const drawList = () => {
      clear(list);
      if (!OPPS.length) list.appendChild(h("div", { class: "empty", text: "No projects yet." }));
      OPPS.forEach(o => list.appendChild(h("button", { class: "item", type: "button", "aria-current": o.id === selOpp ? "true" : "false", onclick: () => { selOpp = o.id; drawList(); drawDetail(); } },
        h("div", { text: o.name }), h("div", { class: "small muted", text: [o.client_name, LABELS.oppStatus[o.status], o.roles.length + (o.roles.length === 1 ? " role" : " roles")].filter(Boolean).join(" | ") }))));
    };
    async function drawDetail() {
      clear(detail); const o = OPPS.find(x => x.id === selOpp);
      if (!o) { detail.appendChild(h("div", { class: "empty", text: "Select a project, or create one." })); return; }
      const sl = await API.listShortlist(o.roles.map(r => r.id));
      const refresh = async () => { OPPS = await API.listOpportunities(); drawList(); drawDetail(); };
      detail.appendChild(h("div", { class: "block" },
        h("div", { class: "block-head" }, h("div", {}, h("h2", { text: o.name }), h("div", { class: "muted small", text: [o.client_name, o.country, o.offering_id ? offById.get(o.offering_id)?.name : null, o.expected_start ? "starts " + fmtDate(o.expected_start) : null].filter(Boolean).join(" | ") })),
          h("select", { "aria-label": "Project status", style: "width:auto", onchange: guard(async e => { await API.updateOpportunity(o.id, { status: e.target.value }); o.status = e.target.value; drawList(); toast("Status updated"); }) }, opt(LABELS.oppStatus, o.status))),
        o.notes ? h("p", { class: "small", style: "margin-bottom:10px", text: o.notes }) : null,
        h("div", { class: "actions", style: "margin-top:0" },
          h("button", { class: "btn btn-sm btn-primary", type: "button", onclick: () => addRoleDialog(o, refresh), text: "Add role" }),
          h("button", { class: "btn btn-sm btn-danger", type: "button", onclick: guard(async () => { if (await confirmBox("Delete project", "This removes the project, its roles and shortlists. The people stay in the network.", "Delete", true)) { await API.deleteOpportunity(o.id); selOpp = null; await refresh(); } }), text: "Delete project" }))));
      if (!o.roles.length) detail.appendChild(h("div", { class: "empty", text: "No roles yet. Add one from the role library to see who fits." }));
      o.roles.forEach(r => {
        const mine = sl.filter(s => s.role_id === r.id), placed = mine.filter(s => s.stage === "placed").length;
        detail.appendChild(h("div", { class: "block" },
          h("div", { class: "block-head" }, h("div", {}, h("h3", { text: r.title }), h("div", { class: "muted small", text: [LABELS.seniority[r.seniority], r.headcount + " needed", `${placed} placed`, r.engagement_mode ? LABELS.modes[r.engagement_mode] : null, r.work_mode ? LABELS.work[r.work_mode] : null, r.location, r.day_rate_budget_max ? `up to ${r.budget_currency} ${r.day_rate_budget_max} a day` : null].filter(Boolean).join(" | ") })),
            h("div", { class: "actions", style: "margin-top:0" }, h("button", { class: "btn btn-sm btn-primary", type: "button", onclick: () => openMatches({ kind: "role", id: r.id, title: r.title, skills: r.skills, mode: r.engagement_mode, onClose: refresh }), text: "Find people" }),
              h("button", { class: "btn btn-sm", type: "button", onclick: guard(async () => { if (await confirmBox("Remove role", "Remove " + r.title + " and its shortlist?", "Remove", true)) { await API.deleteRole(r.id); await refresh(); } }), text: "Remove" }))),
          h("div", {}, r.skills.map(s => h("span", { class: "tag " + (s.importance === "required" ? "on" : ""), text: skillById.get(s.skill_id)?.name }))),
          mine.length ? h("div", { class: "table-wrap", style: "margin-top:8px" }, h("table", {}, h("thead", {}, h("tr", {}, ["Shortlist", "Stage", ""].map(t => h("th", { scope: "col", text: t })))), h("tbody", {}, mine.map(s => {
            const p = byId.get(s.professional_id);
            return h("tr", {}, h("td", {}, p ? h("button", { class: "link-btn", type: "button", onclick: () => openDrawer(p.id), text: p.full_name }) : "Removed"),
              h("td", {}, h("select", { "aria-label": "Stage", style: "width:auto", onchange: guard(async e => { await API.setShortlistStage(s.id, e.target.value); s.stage = e.target.value; await refresh(); }) }, opt(LABELS.stage, s.stage))),
              h("td", {}, h("button", { class: "btn btn-sm", type: "button", onclick: guard(async () => { await API.removeFromShortlist(s.id); await refresh(); }), text: "Remove" })));
          })))) : h("p", { class: "small muted", style: "margin-top:8px", text: "No one shortlisted yet." })));
      });
    }
    drawList(); await drawDetail(); return h("div", {}, h("div", { class: "page-head" }, h("h1", { text: "Projects" }), h("span", { class: "muted", text: "Contracts and bids, and the roles they need" })), wrap);
  }

  function newProject() {
    const f = { name: "", client_name: "", offering_id: "", country: "", status: "prospect", expected_start: "", notes: "" };
    const inp = (k, label, type) => h("div", { class: "field" }, h("label", { text: label }), h("input", { type: type || "text", maxlength: 200, oninput: e => f[k] = e.target.value }));
    const m = modal("New project", h("form", { onsubmit: guard(async (e) => { e.preventDefault(); if (f.name.trim().length < 2) { toast("Give the project a name."); return; }
      const row = await API.createOpportunity(f); OPPS = await API.listOpportunities(); selOpp = row.id; m.close(); render(); toast("Project created"); }) },
      inp("name", "Name"), h("div", { class: "grid-2" }, inp("client_name", "Client"), inp("country", "Country")),
      h("div", { class: "grid-2" },
        h("div", { class: "field" }, h("label", { text: "Main 314 service" }), h("select", { onchange: e => f.offering_id = e.target.value }, h("option", { value: "", text: "Not sure yet" }), REF.offerings.map(o => h("option", { value: o.id, text: o.name })))),
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
      box.appendChild(h("div", { class: "actions", style: "margin:0 0 14px" }, [["library", "From the role library"], ["custom", "Custom role"]].map(([k, l]) =>
        h("button", { class: "btn btn-sm" + (tab === k ? " btn-primary" : ""), type: "button", onclick: () => { tab = k; draw(); }, text: l }))));
      if (tab === "library") {
        const tpls = REF.templates.filter(t => t.offering_id === lib.offering);
        if (!tpls.find(t => t.id === lib.tpl)) lib.tpl = tpls[0]?.id || "";
        const ts = h("select", { id: "tp", onchange: e => { lib.tpl = e.target.value; prev(); } }, tpls.map(t => h("option", { value: t.id, text: `${t.title} (${LABELS.seniority[t.seniority]})` })));
        const pv = h("div", { class: "small", style: "margin-bottom:14px" });
        const prev = () => { clear(pv); const t = tplById.get(lib.tpl); if (t) t.skills.forEach(s => pv.appendChild(h("span", { class: "tag " + (s.importance === "required" ? "on" : ""), text: skillById.get(s.skill_id)?.name }))); };
        box.append(h("div", { class: "field" }, h("label", { text: "314 service" }), h("select", { onchange: e => { lib.offering = e.target.value; draw(); } }, REF.offerings.map(x => h("option", { value: x.id, selected: x.id === lib.offering, text: x.name })))),
          h("div", { class: "field" }, h("label", { for: "tp", text: "Role" }), ts), pv,
          h("div", { class: "field", style: "max-width:160px" }, h("label", { text: "How many people" }), h("input", { type: "number", min: 1, max: 500, value: lib.headcount, oninput: e => lib.headcount = Math.max(1, +e.target.value || 1) })),
          h("div", { class: "modal-actions" }, h("button", { class: "btn btn-primary", type: "button", disabled: !lib.tpl, onclick: guard(async () => { await API.addRoleFromTemplate(o.id, lib.tpl, lib.headcount); m.close(); await done(); toast("Role added"); }), text: "Add role" })));
        prev();
      } else {
        const picker = h("select", { "aria-label": "Skill" }, REF.domains.map(d => h("optgroup", { label: d.name }, REF.skills.filter(s => s.domain_id === d.id).map(s => h("option", { value: s.id, text: s.name }))))), imp = h("select", { "aria-label": "Importance", style: "width:auto" }, h("option", { value: "required", text: "Required" }), h("option", { value: "preferred", text: "Nice to have" }));
        const chips = h("div", { style: "margin:8px 0 14px" });
        const dc = () => { clear(chips); cust.skills.forEach((s, i) => chips.appendChild(h("button", { class: "tag " + (s.importance === "required" ? "on" : ""), type: "button", title: "Remove", onclick: () => { cust.skills.splice(i, 1); dc(); }, text: skillById.get(s.skill_id)?.name + "  x" }))); };
        dc();
        const f = (k, label, type, extra) => h("div", { class: "field" }, h("label", { text: label }), h("input", Object.assign({ type: type || "text", maxlength: 200, value: cust[k], oninput: e => cust[k] = e.target.value }, extra || {})));
        box.append(f("title", "Role title"), h("div", { class: "grid-3" },
          h("div", { class: "field" }, h("label", { text: "Level" }), h("select", { onchange: e => cust.seniority = e.target.value }, h("option", { value: "", text: "Any" }), opt(LABELS.seniority, cust.seniority))),
          f("headcount", "How many", "number", { min: 1 }),
          h("div", { class: "field" }, h("label", { text: "Kind of work" }), h("select", { onchange: e => cust.engagement_mode = e.target.value }, h("option", { value: "", text: "Any" }), opt(LABELS.modes, cust.engagement_mode)))),
          h("div", { class: "grid-3" }, f("location", "Location"), f("start_date", "Start date", "date"),
            h("div", { class: "field" }, h("label", { text: "Where" }), h("select", { onchange: e => cust.work_mode = e.target.value }, h("option", { value: "", text: "Any" }), opt(LABELS.work, cust.work_mode)))),
          h("div", { class: "grid-2" }, f("day_rate_budget_max", "Day rate budget, up to", "number", { min: 0 }), h("div", { class: "field" }, h("label", { text: "Currency" }), h("select", { onchange: e => cust.budget_currency = e.target.value }, CURRENCIES.map(c => h("option", { value: c, text: c }))))),
          h("div", { class: "field" }, h("label", { text: "Skills needed" }), h("div", { style: "display:flex;gap:8px" }, picker, imp,
            h("button", { class: "btn btn-sm", type: "button", onclick: () => { if (!cust.skills.some(s => s.skill_id === picker.value)) { cust.skills.push({ skill_id: picker.value, importance: imp.value }); dc(); } }, text: "Add" })), chips),
          h("div", { class: "modal-actions" }, h("button", { class: "btn btn-primary", type: "button", onclick: guard(async () => {
            if (cust.title.trim().length < 2) { toast("Give the role a title."); return; } if (!cust.skills.length) { toast("Add at least one skill."); return; }
            await API.addCustomRole(o.id, { ...cust, headcount: +cust.headcount || 1, day_rate_budget_max: cust.day_rate_budget_max === "" ? null : +cust.day_rate_budget_max, seniority: cust.seniority || null, engagement_mode: cust.engagement_mode || null, work_mode: cust.work_mode || null });
            m.close(); await done(); toast("Role added"); }), text: "Add role" })));
      }
    }
    const m = modal("Add a role to " + o.name, box); draw();
  }

  // ---- role library ----
  let libOffering = "";
  async function rolesView() {
    await needProjects();
    const wrap = h("div");
    wrap.appendChild(h("div", { class: "page-head" }, h("h1", { text: "Role library" }), h("span", { class: "muted", text: "Pick a role to see who in the network fits" }), h("span", { class: "sp" }),
      h("select", { "aria-label": "314 service", style: "width:auto", onchange: e => { libOffering = e.target.value; render(); } }, h("option", { value: "", text: "All 314 services" }), REF.offerings.map(o => h("option", { value: o.id, selected: libOffering === o.id, text: o.name })))));
    REF.offerings.filter(o => !libOffering || o.id === libOffering).forEach(o => {
      const tpls = REF.templates.filter(t => t.offering_id === o.id); if (!tpls.length) return;
      wrap.appendChild(h("div", { class: "group" }, h("h3", { text: o.name }), h("div", { class: "table-wrap" }, h("table", {}, h("tbody", {}, tpls.map(t => h("tr", {},
        h("td", {}, h("strong", { text: t.title }), h("div", { class: "sub", text: LABELS.seniority[t.seniority] })),
        h("td", {}, t.skills.map(s => h("span", { class: "tag " + (s.importance === "required" ? "on" : ""), text: skillById.get(s.skill_id)?.name }))),
        h("td", { style: "text-align:right;white-space:nowrap" }, h("button", { class: "btn btn-sm", type: "button", onclick: () => openMatches({ kind: "template", id: t.id, title: t.title, skills: t.skills }), text: "Find people" })))))))));
    });
    return wrap;
  }

  // ---- boot ----
  async function needProjects() {
    if (OPPS !== null) return;
    [OPPS, REF.templates] = await Promise.all([API.listOpportunities(), API.getTemplates()]);
    index(); if (!OPPS.find(o => o.id === selOpp)) selOpp = OPPS[0]?.id || null;
  }
  async function render() {
    let content;
    try { content = view === "people" ? peopleView() : view === "projects" ? await projectsView() : await rolesView(); }
    catch (e) { console.error(e); content = h("p", { class: "empty", text: "Could not load this page. Please refresh and try again." }); }
    shell(content);
  }
  async function load() { PROS = await API.listProfessionals(); OPPS = null; prepare(); }
  async function start() { REF = await API.getReference(false); REF.templates = []; index(); await load(); await render(); }

  (async function boot() {
    try {
      await API.init(); SESS = await API.session();
      if (!SESS) { loginScreen(); return; }
      await start();
    } catch (e) { console.error(e); if (CFG.mode === "supabase") loginScreen(e.message); else root.appendChild(h("p", { class: "empty", text: "Could not start: " + e.message })); }
  })();
})();
