(() => {
  const el = id => document.getElementById(id);
  const dialog = el("insurance-dialog");
  const list = el("ins-list"), detail = el("ins-detail");
  const insurer = el("ins-insurer"), source = el("ins-source"), query = el("ins-query");
  const status = el("ins-status"), results = el("ins-results"), pages = el("ins-pages");
  const attribution = el("ins-attribution");
  const interest = el("ins-interest");
  let customerMode = false;
  let page = 1, request = 0, timer, returnFocus;

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  async function read(path) {
    const token = await getAccessToken();
    const response = await fetch(API_BASE + "/api/insurance/products" + path, {
      headers: token ? { Authorization: "Bearer " + token } : {}, cache: "no-store"
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "조회에 실패했습니다.");
    return data;
  }
  function credit(data) {
    const link = node("a", data.sourceName + " 원문");
    link.href = data.sourceUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    attribution.replaceChildren(link);
    if (data.fetchedAt) attribution.append(" · 수집 " + new Date(data.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) + " KST");
  }
  function back() {
    detail.hidden = true;
    list.hidden = false;
    returnFocus?.focus();
  }
  function showRates(rates) {
    const filters = node("div", null, "ins-rate-filters");
    const table = node("table");
    function select(label, options) {
      const wrapper = node("label", label), input = node("select");
      input.setAttribute("aria-label", label);
      for (const [value, name] of options) input.add(new Option(name, value));
      wrapper.append(input);
      filters.append(wrapper);
      input.onchange = draw;
      return input;
    }
    function values(field) {
      return [...new Set(rates.map(r => r[field]).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "ko", { numeric: true })).map(v => [v, v]);
    }
    const coverage = select("담보", [["", "전체 담보"], ...values("coverage")]);
    const age = select("가입 연령", [["", "전체 연령"], ...values("age")]);
    const sex = select("성별", [["", "전체"], ["male", "남성"], ["female", "여성"]]);
    if (interest.value) coverage.value = interest.value;
    function draw() {
      const fields = [["coverage", "담보"], ["age", "연령"], ["male", "남성 보험료"], ["female", "여성 보험료"]]
        .filter(([key]) => !sex.value || !["male", "female"].includes(key) || key === sex.value);
      table.replaceChildren();
      const header = table.createTHead().insertRow();
      for (const [, label] of fields) header.append(node("th", label));
      const body = table.createTBody();
      for (const r of rates.filter(r => (!age.value || r.age === age.value) && (!coverage.value || r.coverage === coverage.value))) {
        const tr = body.insertRow();
        for (const [key] of fields) {
          const value = r[key];
          tr.insertCell().textContent = typeof value === "number" ? value.toLocaleString("ko-KR") + "원" : (value || "미공시");
        }
      }
      if (!body.rows.length) {
        const cell = body.insertRow().insertCell();
        cell.colSpan = fields.length;
        cell.textContent = "이 조건의 공시 보험료가 없습니다.";
      }
    }
    draw();
    detail.append(node("p", "금액은 선택한 조건의 공시 기준 보험료입니다.", "ins-meta"), filters, table);
  }
  async function showDetail(product, trigger) {
    clearTimeout(timer);
    const seq = ++request;
    returnFocus = trigger;
    list.hidden = true;
    detail.hidden = false;
    const closeDetail = node("button", "검색 결과로");
    closeDetail.onclick = () => { ++request; back(); };
    const message = node("p", "불러오는 중…");
    detail.replaceChildren(closeDetail, message);
    closeDetail.focus();
    try {
      const data = await read("/" + encodeURIComponent(product.id));
      if (seq !== request) return;
      const p = data.product;
      message.remove();
      detail.append(node("h3", p.name), node("p", [p.insurer, p.sector, p.type].filter(Boolean).join(" · "), "ins-meta"));
      if (p.source === "medical") {
        detail.append(node("p", "공시 기준일 " + p.asOf));
        showRates(p.rates);
      } else {
        detail.append(node("p", p.stopped ? "공시된 판매중단일 " + p.stopped : "판매 여부 미확인"));
        if (p.registered) detail.append(node("p", "등록일 " + p.registered, "ins-meta"));
      }
      credit(data);
    } catch (error) {
      if (seq === request) message.textContent = error.message || "상품 상세를 불러올 수 없습니다.";
    }
  }
  async function search() {
    const seq = ++request;
    clearTimeout(timer);
    detail.hidden = true;
    list.hidden = false;
    pages.hidden = true;
    results.replaceChildren();
    attribution.replaceChildren();
    status.textContent = "공시 상품을 불러오는 중…";
    const selected = insurer.value;
    const medical = source.value === "medical";
    el("ins-interest-label").hidden = !medical;
    const selectedCoverage = medical ? interest.value : "";
    const params = new URLSearchParams({ source: source.value, insurer: selected, q: query.value.trim(), page: String(page) });
    if (selectedCoverage) params.set("coverage", selectedCoverage);
    try {
      const data = await read("?" + params);
      if (seq !== request) return;
      credit(data);
      insurer.replaceChildren(new Option("전체 보험사", ""));
      data.insurers.forEach(name => insurer.add(new Option(name, name)));
      insurer.value = selected;
      if (medical) {
        interest.replaceChildren(new Option(customerMode ? "담보 선택" : "전체 담보", ""), ...(data.coverages || []).map(name => new Option(name, name)));
        interest.value = selectedCoverage;
      }
      const needsChoice = customerMode && !interest.value;
      const notices = {
        unconfigured: "공공데이터 인증키 설정이 필요합니다.",
        loading: "공시 자료를 갱신하고 있습니다.",
        error: "공시 자료를 갱신하지 못했습니다."
      };
      const messages = [notices[data.status]];
      if (data.fetchedAt && data.status !== "ready") messages.push("마지막으로 수집한 자료를 표시합니다.");
      if (data.fetchedAt) messages.push(needsChoice ? "관심 담보를 선택하면 해당 담보가 공시된 상품을 볼 수 있습니다." : data.total ? data.total.toLocaleString("ko-KR") + "개 상품" : "검색 결과가 없습니다.");
      status.textContent = messages.filter(Boolean).join(" ");
      for (const p of needsChoice ? [] : data.products) {
        const li = node("li"), button = node("button");
        button.append(node("strong", p.name), node("small", [p.insurer, p.type, p.asOf && "기준일 " + p.asOf, p.stopped && "판매중단 " + p.stopped].filter(Boolean).join(" · ")));
        button.onclick = () => showDetail(p, button);
        li.append(button);
        results.append(li);
      }
      const last = Math.ceil(data.total / data.pageSize);
      pages.hidden = needsChoice || last <= 1;
      el("ins-page").textContent = page + " / " + last;
      el("ins-prev").disabled = page <= 1;
      el("ins-next").disabled = page >= last;
      if (data.status === "loading" && dialog.open) timer = setTimeout(search, 10000);
    } catch (error) {
      if (seq === request) status.textContent = error.message || "서버에 연결할 수 없습니다.";
    }
  }
  function firstPage() { page = 1; search(); }
  el("ins-form").onsubmit = e => { e.preventDefault(); firstPage(); };
  source.onchange = () => { insurer.value = ""; interest.value = ""; firstPage(); };
  insurer.onchange = firstPage;
  interest.onchange = firstPage;
  el("ins-prev").onclick = () => { page--; search(); };
  el("ins-next").onclick = () => { page++; search(); };
  for (const button of document.querySelectorAll("[data-open-insurance], [data-customer-insurance]")) {
    button.onclick = () => {
      customerMode = button.hasAttribute("data-customer-insurance");
      el("insurance-title").textContent = customerMode ? "고객용 · 관심 담보로 상품 찾기" : "보험사별 공시 상품 조회";
      source.value = customerMode ? "medical" : "kdic";
      source.parentElement.hidden = customerMode;
      interest.replaceChildren(new Option("담보 선택", ""));
      insurer.value = "";
      query.value = "";
      dialog.showModal();
      firstPage();
    };
  }
  el("ins-close").onclick = () => dialog.close();
  dialog.onclose = () => { ++request; clearTimeout(timer); };
})();
