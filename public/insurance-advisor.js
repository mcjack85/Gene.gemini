(() => {
  const el = id => document.getElementById(id);
  const dialog = el("advisor-dialog");
  const record = el("review-record");
  const form = el("advisor-form");
  const feedback = el("review-status");
  const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  let baseline;

  function make(tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
  }

  function choices(id) {
    const group = el(id);
    for (const [key, label] of Object.entries(COVERAGE_CATEGORIES)) {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = key;
      const wrapper = document.createElement("label");
      wrapper.append(input, label);
      group.append(wrapper);
    }
    return Array.from(group.querySelectorAll("input"));
  }
  const needs = choices("advisor-needs");
  const covers = choices("review-covers");
  const selected = inputs => inputs.filter(input => input.checked).map(input => input.value);

  function publicLink(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
    } catch { return ""; }
  }

  function dated(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function documented(p) {
    const r = p.review;
    return p.name && p.insurer && r?.sale === "active" && dated(r.date) && r.date <= today() && publicLink(r.saleUrl)
      && publicLink(r.coverUrl) && typeof r.note === "string" && r.note.trim()
      && Array.isArray(r.covers) && r.covers.length > 0;
  }

  function evidenceLink(label, url) {
    const link = make("a", label);
    link.href = publicLink(url);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }

  function draw() {
    const list = el("advisor-results");
    const status = el("advisor-status");
    const required = selected(needs);
    list.replaceChildren();
    if (!required.length) {
      status.textContent = "고객이 확인한 보장 요구를 선택하세요.";
      return;
    }
    const eligible = loadProducts().filter(p => documented(p) && (!p.review.end || (dated(p.review.end) && p.review.end >= today())));
    const matches = eligible.filter(p => required.every(c => p.review.covers.includes(c)))
      .sort((a, b) => a.insurer.localeCompare(b.insurer, "ko") || a.name.localeCompare(b.name, "ko"));
    status.textContent = matches.length ? "선택한 담보를 모두 확인한 후보 " + matches.length + "개" :
      eligible.length ? "선택한 담보를 모두 확인한 후보가 없습니다." : "검토 자료가 없습니다. 아래에서 판매 상태와 담보 근거를 등록하세요.";
    for (const p of matches) {
      const li = document.createElement("li");
      li.append(make("h3", p.name), make("p", p.insurer + " · " + p.review.date + " 확인 당시 판매 중"),
        make("p", "포함 이유 · " + required.map(c => COVERAGE_CATEGORIES[c]).join(", ")),
        make("p", "근거 · " + p.review.note), evidenceLink("판매 자료", p.review.saleUrl), " · ", evidenceLink("담보 자료", p.review.coverUrl));
      list.append(li);
      if (combinations(p.review, p).length) {
        const build = make("button", "이 상품의 주계약과 특약 선택");
        build.type = "button";
        build.dataset.openPlan = "local-" + p.id;
        li.append(document.createElement("br"), build);
      }
    }
  }

  function loadEditor() {
    const p = loadProducts().find(p => p.id === record.value);
    baseline = JSON.stringify(p);
    const r = p?.review || {};
    el("review-insurer").value = p?.insurer || "";
    el("review-name").value = p?.name || "";
    el("review-sale").value = r.sale || "";
    el("review-date").max = today();
    el("review-date").value = r.date || today();
    el("review-end").value = r.end || "";
    el("review-sale-url").value = r.saleUrl || "";
    el("review-cover-url").value = r.coverUrl || "";
    el("review-note").value = r.note || "";
    el("review-combinations").replaceChildren();
    for (const option of combinations(r, p)) addCombination(option);
    for (const box of covers) box.checked = Array.isArray(r.covers) && r.covers.includes(box.value);
    feedback.textContent = "";
  }
  function combinations(review, product) {
    const data = review.plan;
    if (!product || !data || data.name !== product.name || data.insurer !== product.insurer || !Array.isArray(data.options)) return [];
    return data.options.filter(o => Array.isArray(o?.names) && o.names.length && o.names.every(n => typeof n === "string" && n.trim()) &&
      typeof o.condition === "string" && o.condition.trim());
  }
  function addCombination(option) {
    const row = document.createElement("fieldset");
    const label = make("label", "특약명 (한 줄에 하나씩)");
    const names = document.createElement("textarea");
    names.rows = 2;
    names.maxLength = 1500;
    names.required = true;
    names.value = option?.names.join("\n") || "";
    label.append(names);
    const terms = make("label", "가입 조건 및 근거 위치");
    const input = document.createElement("input");
    input.maxLength = 500;
    input.required = true;
    input.value = option?.condition || "";
    terms.append(input);
    const remove = make("button", "조합 삭제");
    remove.type = "button";
    remove.onclick = () => row.remove();
    row.append(label, terms, remove);
    el("review-combinations").append(row);
  }
  el("review-add-combination").onclick = () => addCombination();

  window.getReviewedInsurancePlans = () => loadProducts().filter(p => documented(p) &&
    (!p.review.end || (dated(p.review.end) && p.review.end >= today())) && combinations(p.review, p).length)
    .map(p => ({
      id: "local-" + p.id, insurer: p.insurer, name: p.name, version: "설계사 검토 자료",
      base: p.review.note, checked: p.review.date, url: publicLink(p.review.coverUrl), exclusive: true,
      options: combinations(p.review, p).map((option, i) => ({ ...option, id: String(i) }))
    }));

  function listRecords(id = "") {
    record.replaceChildren(new Option("새 상품 등록", ""));
    for (const p of loadProducts()) record.add(new Option([p.insurer, p.name].filter(Boolean).join(" · "), p.id));
    record.value = id;
    loadEditor();
  }
  form.onsubmit = event => {
    event.preventDefault();
    const records = loadProducts();
    const old = records.find(p => p.id === record.value);
    if (record.value && (!old || JSON.stringify(old) !== baseline)) {
      feedback.textContent = "다른 화면에서 상품이 변경되었습니다. 상품을 다시 선택해 주세요.";
      return;
    }
    const name = el("review-name").value.trim(), insurer = el("review-insurer").value.trim();
    const review = { sale: el("review-sale").value, date: el("review-date").value, end: el("review-end").value, covers: selected(covers),
      saleUrl: el("review-sale-url").value.trim(), coverUrl: el("review-cover-url").value.trim(), note: el("review-note").value.trim() };
    const p = { ...old, id: old?.id || crypto.randomUUID(), name, insurer, review };
    const rows = [...el("review-combinations").children];
    if (rows.length && old && (old.name !== name || old.insurer !== insurer)) {
      feedback.textContent = "보험사나 상품 버전이 바뀌면 기존 특약 조합을 삭제하고 상품을 저장한 뒤 새 조합을 등록하세요.";
      return;
    }
    const options = rows.map(row => ({
      names: [...new Set(row.querySelector("textarea").value.split(/\r?\n/).map(n => n.trim()).filter(Boolean))],
      condition: row.querySelector("input").value.trim()
    }));
    if (options.some(o => !o.names.length || !o.condition) || (options.length && !publicLink(review.coverUrl))) {
      feedback.textContent = "각 조합의 특약명, 가입 조건, HTTPS 담보 근거 링크를 입력하세요.";
      return;
    }
    if (options.length) review.plan = { name, insurer, options };
    if (!name || !insurer || !dated(review.date) || review.date > today() || (review.sale === "active" && !documented(p))) {
      feedback.textContent = "판매 중인 후보에는 보험사·상품명, 확인한 담보, 확인일, HTTPS 근거 링크 두 곳과 근거 위치가 필요합니다. 판매·담보가 같은 문서라면 같은 링크를 사용할 수 있습니다.";
      return;
    }
    if (records.some(r => r.id !== p.id && r.insurer === insurer && r.name === name)) {
      feedback.textContent = "같은 보험사·상품명이 이미 등록되어 있습니다. 기존 상품을 선택해 수정하세요.";
      return;
    }
    p.coverages = review.covers;
    if (old) records[records.indexOf(old)] = p;
    else records.push(p);
    if (!saveProducts(records)) {
      feedback.textContent = "브라우저에 저장할 수 없습니다. 저장 공간과 브라우저 설정을 확인하세요.";
      return;
    }
    listRecords(p.id);
    renderProductsList();
    draw();
    feedback.textContent = "검토 기록을 저장했습니다.";
  };
  record.onchange = loadEditor;
  el("advisor-needs").onchange = draw;
  for (const button of document.querySelectorAll("[data-advisor-insurance]")) {
    button.onclick = () => {
      for (const box of needs) box.checked = false;
      el("advisor-editor").open = false;
      listRecords();
      draw();
      dialog.showModal();
    };
  }
  window.addEventListener("storage", event => {
    if (dialog.open && (!event.key || event.key === PRODUCTS_KEY)) draw();
  });
  el("advisor-close").onclick = () => dialog.close();
})();
