/* Small DOM helpers shared by both pages. Content is always set with textContent,
 * never innerHTML, because applicants type some of what staff later read. */
(function () {
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else if (k === "checked" || k === "disabled" || k === "selected" || k === "required") el[k] = !!v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  const LABELS = {
    seniority: { junior: "Junior", mid: "Mid-level", senior: "Senior", lead: "Lead", principal: "Principal" },
    modes: { full_time: "Full-time", contract: "Contract", advisory: "Advisory" },
    work: { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" },
    availability: { immediate: "Immediately", within_30_days: "Within 30 days", within_60_days: "Within 60 days", within_90_days: "Within 90 days", unavailable: "Not available" },
    status: { pending: "Pending", screened: "Screened", verified: "Verified", active: "Active", on_hold: "On hold", archived: "Archived", declined: "Declined" },
    verification: { self_declared: "Self-declared", email_verified: "Email verified", credential_verified: "Credential verified" },
    oppStatus: { prospect: "Prospect", bidding: "Bidding", won: "Won", active: "Active", closed: "Closed", lost: "Lost" },
    stage: { shortlisted: "Shortlisted", contacted: "Contacted", interested: "Interested", interviewed: "Interviewed", offered: "Offered", placed: "Placed", declined: "Declined" },
    line: { consulting: "314 Consulting", dpi: "314 DPI", cloud: "314 Cloud" }
  };
  const SECTORS = ["Government", "Healthcare", "Education", "Finance and Banking", "Telecommunications", "Manufacturing and Industrial", "Energy and Utilities"];
  const CURRENCIES = ["AED", "USD", "EUR", "GBP", "ZAR", "KES", "NGN"];
  const PROFICIENCY = { 1: "Familiar", 2: "Working", 3: "Proficient", 4: "Advanced", 5: "Expert" };

  let toastTimer;
  function toast(msg) {
    document.querySelectorAll(".toast").forEach(t => t.remove());
    const t = h("div", { class: "toast", role: "status", text: msg }); document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 2800);
  }

  // Returns a promise. Resolves true if confirmed.
  function confirmBox(title, body, okLabel, danger) {
    return new Promise(resolve => {
      const done = (v) => { back.remove(); resolve(v); };
      const back = h("div", { class: "modal-back", role: "dialog", "aria-modal": "true", "aria-label": title },
        h("div", { class: "modal", style: "max-width:480px" },
          h("div", { class: "modal-head" }, h("h2", { text: title })),
          h("div", { class: "modal-body" }, h("p", { text: body }),
            h("div", { class: "modal-actions" },
              h("button", { class: "btn", type: "button", onclick: () => done(false), text: "Cancel" }),
              h("button", { class: "btn " + (danger ? "btn-danger" : "btn-primary"), type: "button", onclick: () => done(true), text: okLabel || "Confirm" })))));
      document.body.appendChild(back);
      back.querySelector("button.btn-primary, button.btn-danger").focus();
    });
  }

  function modal(title, contentEl, opts) {
    const close = () => { back.remove(); document.removeEventListener("keydown", esc); if (opts && opts.onClose) opts.onClose(); };
    const esc = (e) => { if (e.key === "Escape") close(); };
    const back = h("div", { class: "modal-back", role: "dialog", "aria-modal": "true", "aria-label": title, onclick: (e) => { if (e.target === back) close(); } },
      h("div", { class: "modal" },
        h("div", { class: "modal-head" }, h("h2", { text: title }), h("button", { class: "btn btn-sm", type: "button", onclick: close, text: "Close" })),
        h("div", { class: "modal-body" }, contentEl)));
    document.addEventListener("keydown", esc); document.body.appendChild(back);
    return { close, el: back };
  }

  const fmtDate = (s) => { if (!s) return ""; const d = new Date(s); return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
  const csvCell = (v) => { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const dots = (n) => h("span", { class: "dots", role: "img", "aria-label": n + " of 5" }, [1, 2, 3, 4, 5].map(i => h("i", { class: i <= n ? "on" : "" })));

  window.UI = { h, clear, LABELS, SECTORS, CURRENCIES, PROFICIENCY, toast, confirmBox, modal, fmtDate, csvCell, dots };
})();
