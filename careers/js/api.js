/* Data layer for the 314 Talent Platform.
 * Two interchangeable back ends behind one interface:
 *   demo     runs in the browser with fictional people, stored in localStorage (safe to click around in)
 *   supabase talks to the real database using the policies and functions in /supabase
 * Pages only ever call window.TalentAPI, so switching mode needs no other code change.
 */
(function () {
  const CFG = window.TALENT_CONFIG || { mode: "demo" };
  const REF = window.TALENT_REF;
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(16).slice(2) + Date.now());

  // ---- Matching: same rules as match_core() in 0002_security_and_functions.sql ----
  function scoreProfessionals(profs, o) {
    const req = o.required || [], pref = o.preferred || [];
    const out = [];
    for (const p of profs) {
      if (p.status === "archived" || p.status === "declined") continue;
      const have = new Map(p.skills.map(s => [s.skill_id, s]));
      const reqHit = req.filter(id => have.has(id));
      const prefHit = pref.filter(id => have.has(id));
      if (req.length && !reqHit.length) continue;
      const ap = reqHit.length ? reqHit.reduce((a, id) => a + have.get(id).proficiency, 0) / reqHit.length : 0;
      const modeOk = !o.mode || p.engagement_modes.includes(o.mode);
      let s = (req.length ? 55 * reqHit.length / req.length : 55)
            + (pref.length ? 15 * prefHit.length / pref.length : 15)
            + ap / 5 * 10
            + (modeOk ? 8 : 0)
            + ({ immediate: 7, within_30_days: 5, within_60_days: 3, within_90_days: 1 }[p.availability] || 0)
            + ({ credential_verified: 3, email_verified: 2 }[p.verification_level] || 0)
            + ({ active: 2, verified: 2, screened: 1 }[p.status] || 0);
      let rateOk = null;
      if (o.budget != null && p.day_rate_min != null && p.rate_currency === (o.currency || "AED")) rateOk = p.day_rate_min <= o.budget;
      out.push({ professional_id: p.id, score: Math.round(s * 10) / 10, required_total: req.length, required_matched: reqHit.length,
        preferred_total: pref.length, preferred_matched: prefHit.length, avg_proficiency: reqHit.length ? Math.round(ap * 10) / 10 : null,
        mode_ok: modeOk, rate_ok: rateOk });
    }
    out.sort((a, b) => b.score - a.score || b.required_matched - a.required_matched);
    return out.slice(0, o.limit || 50);
  }

  // =========================== DEMO BACK END ===========================
  const DEMO_KEY = "314_talent_demo_v1";
  let memStore = null;
  function seedStore() {
    return { professionals: structuredClone(window.TALENT_DEMO || []), notes: {}, opportunities: [], roles: [], shortlist: [] };
  }
  function store() {
    if (memStore) return memStore;
    try { const s = localStorage.getItem(DEMO_KEY); if (s) { memStore = JSON.parse(s); return memStore; } } catch (e) {}
    memStore = seedStore(); return memStore;
  }
  function persist() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(memStore)); } catch (e) {} }
  const bySlug = (arr) => new Map(arr.map(x => [x.slug, x]));

  const demo = {
    mode: "demo",
    async init() {},
    async getReference() { return structuredClone(REF); },
    async submitApplication(p) {
      const st = store();
      const email = String(p.email || "").trim().toLowerCase();
      if (!p.full_name || p.full_name.trim().length < 2) throw new Error("Please enter your full name.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Please enter a valid email address.");
      if (!p.consents || !p.consents.talent_database) throw new Error("Consent is required to join.");
      if (st.professionals.some(x => x.email.toLowerCase() === email)) return { ok: true };
      const doms = bySlug(REF.domains), sks = bySlug(REF.skills), offs = bySlug(REF.offerings);
      const now = new Date().toISOString();
      st.professionals.unshift({
        id: uuid(), full_name: p.full_name.trim(), email, phone: p.phone || null, country: p.country || null, city: p.city || null,
        headline: p.headline || null, bio: p.bio || null, current_title: p.current_title || null, current_employer: p.current_employer || null,
        employer_display: p.employer_display || "named", employer_approval_needed: !!p.employer_approval_needed,
        seniority: p.seniority || null, years_experience: p.years_experience ?? null, languages: p.languages || [], sectors: p.sectors || [],
        linkedin_url: p.linkedin_url || null, github_url: p.github_url || null, portfolio_url: p.portfolio_url || null,
        engagement_modes: p.engagement_modes || [], availability: p.availability || "within_30_days", available_from: p.available_from || null,
        rate_currency: p.rate_currency || "AED", day_rate_min: p.day_rate_min ?? null, day_rate_max: p.day_rate_max ?? null,
        advisory_hourly_rate: p.advisory_hourly_rate ?? null, work_modes: p.work_modes || [], willing_to_relocate: !!p.willing_to_relocate,
        advisory_topics: p.advisory_topics || null, other_skills: p.other_skills || null, status: "pending", verification_level: "self_declared",
        source: p.referred_by ? "referral" : "website", referred_by: p.referred_by || null, created_at: now, last_confirmed_at: now,
        domains: (p.domains || []).filter(d => doms.has(d.slug)).map(d => ({ domain_id: doms.get(d.slug).id, is_primary: !!d.is_primary, years: d.years ?? null })),
        skills: (p.skills || []).filter(s => sks.has(s.slug)).map(s => ({ skill_id: sks.get(s.slug).id, proficiency: s.proficiency || 3, years: s.years ?? null })),
        offerings: (p.offerings || []).filter(o => offs.has(o)).map(o => offs.get(o).id),
        credentials: (p.credentials || []).filter(c => c.name && c.name.trim()).map(c => ({ id: uuid(), name: c.name.trim(), issuer: c.issuer || null, credential_ref: c.credential_ref || null, expires_on: c.expires_on || null, verified: false })),
        consents: { talent_database: true, share_with_clients: !!p.consents.share_with_clients }
      });
      persist(); return { ok: true };
    },
    async session() { return { email: "demo@314.test", role: "admin", demo: true }; },
    async signIn() { return this.session(); },
    async signOut() {},
    async resetDemo() { memStore = seedStore(); persist(); },
    async listProfessionals() { return structuredClone(store().professionals); },
    async updateProfessional(id, patch) {
      const p = store().professionals.find(x => x.id === id); if (!p) throw new Error("Not found");
      Object.assign(p, patch); persist(); return structuredClone(p);
    },
    async getNotes(id) { return structuredClone(store().notes[id] || { screening_notes: "", internal_rating: null }); },
    async saveNotes(id, n) { store().notes[id] = { screening_notes: n.screening_notes || "", internal_rating: n.internal_rating || null }; persist(); },
    async setCredentialVerified(profId, credId, v) {
      const p = store().professionals.find(x => x.id === profId); const c = p && p.credentials.find(x => x.id === credId);
      if (c) { c.verified = v; persist(); }
    },
    async erase(id) {
      const st = store(); st.professionals = st.professionals.filter(x => x.id !== id);
      st.shortlist = st.shortlist.filter(x => x.professional_id !== id); delete st.notes[id]; persist();
    },
    async listOpportunities() {
      const st = store();
      return structuredClone(st.opportunities.map(o => ({ ...o, roles: st.roles.filter(r => r.opportunity_id === o.id) })));
    },
    async createOpportunity(o) {
      const row = { id: uuid(), name: o.name, client_name: o.client_name || null, offering_id: o.offering_id || null, country: o.country || null,
        status: o.status || "prospect", expected_start: o.expected_start || null, notes: o.notes || null, created_at: new Date().toISOString() };
      store().opportunities.unshift(row); persist(); return structuredClone(row);
    },
    async updateOpportunity(id, patch) { Object.assign(store().opportunities.find(x => x.id === id), patch); persist(); },
    async deleteOpportunity(id) {
      const st = store(); const rids = st.roles.filter(r => r.opportunity_id === id).map(r => r.id);
      st.opportunities = st.opportunities.filter(o => o.id !== id); st.roles = st.roles.filter(r => r.opportunity_id !== id);
      st.shortlist = st.shortlist.filter(s => !rids.includes(s.role_id)); persist();
    },
    async addRoleFromTemplate(oppId, templateId, headcount) {
      const t = REF.templates.find(x => x.id === templateId); if (!t) throw new Error("Template not found");
      const row = { id: uuid(), opportunity_id: oppId, role_template_id: t.id, title: t.title, seniority: t.seniority, headcount: Math.max(1, headcount || 1),
        engagement_mode: null, work_mode: null, location: null, start_date: null, duration_months: null, day_rate_budget_max: null, budget_currency: "AED", notes: null,
        skills: structuredClone(t.skills) };
      store().roles.push(row); persist(); return structuredClone(row);
    },
    async addCustomRole(oppId, r) {
      const row = { id: uuid(), opportunity_id: oppId, role_template_id: null, title: r.title, seniority: r.seniority || null, headcount: Math.max(1, r.headcount || 1),
        engagement_mode: r.engagement_mode || null, work_mode: r.work_mode || null, location: r.location || null, start_date: r.start_date || null,
        duration_months: r.duration_months || null, day_rate_budget_max: r.day_rate_budget_max ?? null, budget_currency: r.budget_currency || "AED", notes: r.notes || null,
        skills: structuredClone(r.skills || []) };
      store().roles.push(row); persist(); return structuredClone(row);
    },
    async updateRole(id, patch) { Object.assign(store().roles.find(x => x.id === id), patch); persist(); },
    async deleteRole(id) { const st = store(); st.roles = st.roles.filter(r => r.id !== id); st.shortlist = st.shortlist.filter(s => s.role_id !== id); persist(); },
    async matchRole(roleId, limit) {
      const st = store(); const r = st.roles.find(x => x.id === roleId); if (!r) return [];
      return scoreProfessionals(st.professionals, {
        required: r.skills.filter(s => s.importance === "required").map(s => s.skill_id),
        preferred: r.skills.filter(s => s.importance === "preferred").map(s => s.skill_id),
        mode: r.engagement_mode, budget: r.day_rate_budget_max, currency: r.budget_currency, limit });
    },
    async matchTemplate(templateId, opts) {
      const t = REF.templates.find(x => x.id === templateId); if (!t) return [];
      opts = opts || {};
      return scoreProfessionals(store().professionals, {
        required: t.skills.filter(s => s.importance === "required").map(s => s.skill_id),
        preferred: t.skills.filter(s => s.importance === "preferred").map(s => s.skill_id),
        mode: opts.mode || null, budget: opts.budget ?? null, currency: opts.currency || "AED", limit: opts.limit });
    },
    async listShortlist(roleIds) { return structuredClone(store().shortlist.filter(s => roleIds.includes(s.role_id))); },
    async listShortlistForProfessional(profId) {
      const st = store();
      return st.shortlist.filter(s => s.professional_id === profId).map(s => {
        const r = st.roles.find(x => x.id === s.role_id); const o = r && st.opportunities.find(x => x.id === r.opportunity_id);
        return { ...structuredClone(s), role_title: r && r.title, opportunity_name: o && o.name };
      });
    },
    async addToShortlist(roleId, profId) {
      const st = store(); let row = st.shortlist.find(s => s.role_id === roleId && s.professional_id === profId);
      if (!row) { row = { id: uuid(), role_id: roleId, professional_id: profId, stage: "shortlisted", notes: null, updated_at: new Date().toISOString() }; st.shortlist.push(row); persist(); }
      return structuredClone(row);
    },
    async setShortlistStage(id, stage) { const r = store().shortlist.find(s => s.id === id); r.stage = stage; r.updated_at = new Date().toISOString(); persist(); },
    async removeFromShortlist(id) { const st = store(); st.shortlist = st.shortlist.filter(s => s.id !== id); persist(); }
  };

  // =========================== SUPABASE BACK END ===========================
  let sb = null;
  const need = (r) => { if (r.error) throw new Error(r.error.message || "Request failed"); return r.data; };
  const friendly = (m) => ({
    email_invalid: "Please enter a valid email address.", name_required: "Please enter your full name.",
    consent_required: "Consent is required to join.", payload_too_large: "That is a lot of entries. Please trim the lists and try again."
  }[(m || "").replace(/^.*?(email_invalid|name_required|consent_required|payload_too_large).*$/s, "$1")] || "We could not save your application. Please check the form and try again.");

  const live = {
    mode: "supabase",
    async init() {
      if (!window.supabase) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
          s.onload = res; s.onerror = () => rej(new Error("Could not load the database library"));
          document.head.appendChild(s);
        });
      }
      if (!CFG.supabaseUrl || !CFG.supabaseKey) throw new Error("Supabase URL and key are not set in js/config.js");
      sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
    },
    async getReference(withTemplates) {
      const [offerings, domains, skills] = await Promise.all([
        sb.from("offerings").select("*").eq("active", true).order("sort_order"),
        sb.from("domains").select("*").order("sort_order"),
        sb.from("skills").select("*").order("sort_order")]).then(r => r.map(need));
      const ref = { offerings, domains, skills, templates: [] };
      if (withTemplates) {
        const t = need(await sb.from("role_templates").select("*, role_template_skills(skill_id, importance)").order("title"));
        ref.templates = t.map(x => ({ id: x.id, offering_id: x.offering_id, title: x.title, seniority: x.seniority, skills: x.role_template_skills }));
      }
      return ref;
    },
    async submitApplication(payload) {
      const { error } = await sb.rpc("submit_application", { payload });
      if (error) throw new Error(friendly(error.message));
      return { ok: true };
    },
    async session() {
      const { data } = await sb.auth.getSession(); const u = data.session && data.session.user; if (!u) return null;
      const { data: row } = await sb.from("staff_users").select("role").eq("user_id", u.id).maybeSingle();
      if (!row) { await sb.auth.signOut(); throw new Error("This account is not set up as 314 staff."); }
      return { email: u.email, role: row.role, id: u.id };
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error("Email or password is not correct.");
      return this.session();
    },
    async signOut() { await sb.auth.signOut(); },
    async resetDemo() {},
    async listProfessionals() {
      const rows = need(await sb.from("professionals").select(
        "*, professional_domains(domain_id,is_primary,years), professional_skills(skill_id,proficiency,years), professional_offerings(offering_id), credentials(id,name,issuer,credential_ref,expires_on,verified), consents(purpose,withdrawn_at)"
      ).order("created_at", { ascending: false }).limit(5000));
      return rows.map(r => {
        const { professional_domains, professional_skills, professional_offerings, credentials, consents, ...p } = r;
        return { ...p, domains: professional_domains, skills: professional_skills, offerings: professional_offerings.map(o => o.offering_id), credentials,
          consents: { talent_database: consents.some(c => c.purpose === "talent_database" && !c.withdrawn_at), share_with_clients: consents.some(c => c.purpose === "share_with_clients" && !c.withdrawn_at) } };
      });
    },
    async updateProfessional(id, patch) { return need(await sb.from("professionals").update(patch).eq("id", id).select().single()); },
    async getNotes(id) {
      const d = need(await sb.from("professional_private_notes").select("*").eq("professional_id", id).maybeSingle());
      return d || { screening_notes: "", internal_rating: null };
    },
    async saveNotes(id, n) {
      const s = await this.session();
      need(await sb.from("professional_private_notes").upsert({ professional_id: id, screening_notes: n.screening_notes || null,
        internal_rating: n.internal_rating || null, updated_by: s.id, updated_at: new Date().toISOString() }));
    },
    async setCredentialVerified(profId, credId, v) {
      const s = await this.session();
      need(await sb.from("credentials").update({ verified: v, verified_at: v ? new Date().toISOString() : null, verified_by: v ? s.id : null }).eq("id", credId));
    },
    async erase(id) { need(await sb.rpc("erase_professional", { p_id: id })); },
    async listOpportunities() {
      const rows = need(await sb.from("opportunities").select("*, opportunity_roles(*, opportunity_role_skills(skill_id,importance))").order("created_at", { ascending: false }));
      return rows.map(({ opportunity_roles, ...o }) => ({ ...o, roles: opportunity_roles.map(({ opportunity_role_skills, ...r }) => ({ ...r, skills: opportunity_role_skills })) }));
    },
    async createOpportunity(o) {
      const s = await this.session();
      return need(await sb.from("opportunities").insert({ name: o.name, client_name: o.client_name || null, offering_id: o.offering_id || null, country: o.country || null,
        status: o.status || "prospect", expected_start: o.expected_start || null, notes: o.notes || null, created_by: s.id }).select().single());
    },
    async updateOpportunity(id, patch) { need(await sb.from("opportunities").update(patch).eq("id", id)); },
    async deleteOpportunity(id) { need(await sb.from("opportunities").delete().eq("id", id)); },
    async addRoleFromTemplate(oppId, templateId, headcount) {
      const id = need(await sb.rpc("add_role_from_template", { p_opportunity_id: oppId, p_template_id: templateId, p_headcount: headcount || 1 }));
      const r = need(await sb.from("opportunity_roles").select("*, opportunity_role_skills(skill_id,importance)").eq("id", id).single());
      const { opportunity_role_skills, ...rest } = r; return { ...rest, skills: opportunity_role_skills };
    },
    async addCustomRole(oppId, r) {
      const row = need(await sb.from("opportunity_roles").insert({ opportunity_id: oppId, title: r.title, seniority: r.seniority || null, headcount: Math.max(1, r.headcount || 1),
        engagement_mode: r.engagement_mode || null, work_mode: r.work_mode || null, location: r.location || null, start_date: r.start_date || null,
        duration_months: r.duration_months || null, day_rate_budget_max: r.day_rate_budget_max ?? null, budget_currency: r.budget_currency || "AED", notes: r.notes || null }).select().single());
      if (r.skills && r.skills.length) need(await sb.from("opportunity_role_skills").insert(r.skills.map(s => ({ role_id: row.id, skill_id: s.skill_id, importance: s.importance }))));
      return { ...row, skills: r.skills || [] };
    },
    async updateRole(id, patch) { need(await sb.from("opportunity_roles").update(patch).eq("id", id)); },
    async deleteRole(id) { need(await sb.from("opportunity_roles").delete().eq("id", id)); },
    async matchRole(roleId, limit) { return need(await sb.rpc("match_role", { p_role_id: roleId, p_limit: limit || 50 })); },
    async matchTemplate(templateId, o) {
      o = o || {};
      return need(await sb.rpc("match_template", { p_template_id: templateId, p_mode: o.mode || null, p_budget: o.budget ?? null, p_currency: o.currency || "AED", p_limit: o.limit || 50 }));
    },
    async listShortlist(roleIds) {
      if (!roleIds.length) return [];
      return need(await sb.from("shortlist").select("*").in("role_id", roleIds));
    },
    async listShortlistForProfessional(profId) {
      const rows = need(await sb.from("shortlist").select("*, opportunity_roles(title, opportunities(name))").eq("professional_id", profId));
      return rows.map(r => ({ ...r, role_title: r.opportunity_roles && r.opportunity_roles.title,
        opportunity_name: r.opportunity_roles && r.opportunity_roles.opportunities && r.opportunity_roles.opportunities.name }));
    },
    async addToShortlist(roleId, profId) {
      return need(await sb.from("shortlist").upsert({ role_id: roleId, professional_id: profId }, { onConflict: "role_id,professional_id", ignoreDuplicates: true }).select().maybeSingle())
        || need(await sb.from("shortlist").select("*").eq("role_id", roleId).eq("professional_id", profId).single());
    },
    async setShortlistStage(id, stage) { need(await sb.from("shortlist").update({ stage }).eq("id", id)); },
    async removeFromShortlist(id) { need(await sb.from("shortlist").delete().eq("id", id)); }
  };

  window.TalentAPI = CFG.mode === "supabase" ? live : demo;
})();
