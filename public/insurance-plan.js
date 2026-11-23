(() => {
  const el = id => document.getElementById(id);
  const dialog = el("plan-dialog");
  const insurer = el("plan-insurer");
  const product = el("plan-product");
  const options = el("plan-options");
  const status = el("plan-status");
  let catalog = [];
  let active;
  let requestedId;
  let request = 0;

  function selectedOptions() {
    const checked = new Set([...options.querySelectorAll("input:checked")].map(input => input.value));
    return active.options.filter(option => checked.has(option.id));
  }

  function displaySummary() {
    el("plan-summary-name").textContent = [active.insurer, active.name, active.version].join(" · ");
    const names = selectedOptions().flatMap(option => option.names);
    el("plan-summary-riders").replaceChildren(...(names.length ? names : ["주계약만 선택됨"]).map(name => {
      const row = document.createElement("li");
      row.textContent = name;
      return row;
    }));
  }

  function displayProduct() {
    active = catalog.find(row => row.id === product.value && row.insurer === insurer.value);
    options.replaceChildren();
    el("plan-config").hidden = !active;
    if (!active) return;
    el("plan-base").textContent = active.base;
    el("plan-date").textContent = active.checked;
    el("plan-source").href = active.url;
    if (active.exclusive) {
      const none = document.createElement("input");
      none.type = "radio";
      none.name = "plan-combination";
      none.value = "none";
      none.checked = true;
      const label = document.createElement("label");
      label.append(none, "주계약만 선택");
      options.append(label);
    }
    for (const option of active.options) {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = active.exclusive ? "radio" : "checkbox";
      if (active.exclusive) checkbox.name = "plan-combination";
      checkbox.value = option.id;
      const text = document.createElement("span");
      const names = document.createElement("strong");
      names.textContent = option.names.join(" + ");
      const terms = document.createElement("small");
      terms.textContent = option.condition;
      text.append(names, terms);
      label.append(checkbox, text);
      options.append(label);
    }
    displaySummary();
  }

  function listProducts() {
    product.replaceChildren(new Option("주계약 선택", ""));
    for (const p of catalog.filter(row => row.insurer === insurer.value)) {
      product.add(new Option(p.name + " · " + p.version, p.id));
    }
    product.disabled = !insurer.value;
    displayProduct();
  }

  async function load() {
    const seq = ++request;
    active = null;
    el("plan-fields").hidden = true;
    el("plan-retry").hidden = true;
    status.textContent = "상품별 특약 자료를 불러오는 중입니다.";
    try {
      const token = await getAccessToken();
      const res = await fetch(API_BASE + "/api/insurance/plans", {
        headers: token ? { Authorization: "Bearer " + token } : {}, cache: "no-store"
      });
      if (!res.ok) throw new Error(res.status === 401 ? "로그인 후 다시 조회해 주세요." : "특약 자료를 불러올 수 없습니다.");
      const { plans } = await res.json();
      if (seq !== request || !dialog.open) return;
      catalog = [...plans, ...window.getReviewedInsurancePlans()];
      insurer.replaceChildren(new Option("보험사 선택", ""));
      const companies = [...new Set(catalog.map(p => p.insurer))];
      for (const company of companies) insurer.add(new Option(company, company));
      const preset = catalog.find(p => p.id === requestedId);
      if (preset) insurer.value = preset.insurer;
      listProducts();
      if (preset) { product.value = preset.id; displayProduct(); }
      status.textContent = catalog.length
        ? "특약 자료를 확인한 보험사 " + companies.length + "곳 · 주계약 " + catalog.length + "개"
        : "특약 자료를 확인한 상품이 없습니다.";
      el("plan-fields").hidden = !catalog.length;
    } catch (error) {
      if (seq !== request || !dialog.open) return;
      status.textContent = error.message || "특약 자료를 불러올 수 없습니다.";
      el("plan-retry").hidden = false;
    }
  }

  document.addEventListener("click", event => {
    const entry = event.target.closest("[data-open-plan]");
    if (!entry) return;
    requestedId = entry.dataset.openPlan;
    dialog.showModal();
    load();
  });
  insurer.onchange = listProducts;
  product.onchange = displayProduct;
  options.onchange = displaySummary;
  el("plan-close").onclick = () => dialog.close();
  el("plan-retry").onclick = load;
  window.addEventListener("storage", event => {
    if (dialog.open && (!event.key || event.key === PRODUCTS_KEY)) load();
  });
  el("plan-download").onclick = () => {
    if (!active) return;
    const chosen = selectedOptions();
    const lines = [
      "보험 상담용 구성안", active.insurer, active.name, active.version,
      "", "주계약", active.base, "", "선택한 특약",
      ...(chosen.length ? chosen.flatMap(item => [...item.names, item.condition, ""]) : ["주계약만 선택됨"]),
      "", "보험사 자료 확인일 " + active.checked, active.url,
      "가입 가능 여부와 보험료는 보험사가 가입 조건과 선택한 조합을 확인한 뒤 결정합니다."
    ];
    const url = URL.createObjectURL(new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = active.insurer + "-보험구성안.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
})();
