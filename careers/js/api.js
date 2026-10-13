/* Data layer for the 314 talent network: talks to the Supabase project named in js/config.js.
 * Pages only call window.TalentAPI. Demo mode (fictional people, kept in the browser) lives in dev/ and is never shipped.
 */
(function () {
  const CFG = window.TALENT_CONFIG || { mode: "demo" };

  // Demo mode is for local testing only: load its files in place of this data layer.
  if (CFG.mode !== "supabase") {
    ['dev/reference-data.js', 'dev/demo-data.js', 'dev/api-demo.js'].forEach(function (s) { document.write('<script src="' + s + '"><\/script>'); });
    return;
  }

  // =========================== SUPABASE BACK END ===========================
  let sb = null;
  const need = (r) => { if (r.error) throw new Error(r.error.message || "Request failed"); return r.data; };
  const MESSAGES = {
    email_invalid: "Please enter a valid email address.",
    name_required: "Please enter your full name.",
    consent_required: "We need your consent to store your details.",
    payload_too_large: "That is a lot of entries. Please shorten the lists and try again.",
    url_invalid: "Please enter links as full web addresses, starting with https://",
    modes_required: "Please choose at least one kind of work.",
    try_later: "We are getting a lot of registrations right now. Please try again in a few minutes."
  };
  const friendly = (m) => {
    m = String(m || "");
    const code = Object.keys(MESSAGES).find(k => m.includes(k));
    if (code) return MESSAGES[code];
    if (/fetch|network|timeout/i.test(m)) return "We could not reach the server. Please check your connection and try again.";
    return "We could not save your details. Please check the form and try again.";
  };

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
    async getReference() {
      const [offerings, domains, skills] = await Promise.all([
        sb.from("offerings").select("*").eq("active", true).order("sort_order"),
        sb.from("domains").select("*").order("sort_order"),
        sb.from("skills").select("*").order("sort_order")]).then(r => r.map(need));
      return { offerings, domains, skills };
    },
    async getTemplates() {
      const t = need(await sb.from("role_templates").select("*, role_template_skills(skill_id, importance)").order("title"));
      return t.map(x => ({ id: x.id, offering_id: x.offering_id, title: x.title, seniority: x.seniority, skills: x.role_template_skills }));
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

  window.TalentAPI = live;
})();
