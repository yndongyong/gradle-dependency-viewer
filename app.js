const state = {
  text: "",
  parsed: null,
  activeConfig: "",
  selectedKey: "",
  expandedDepth: 1,
};

const els = {
  workspace: document.querySelector("#workspace"),
  content: document.querySelector("#content"),
  drawerLayer: document.querySelector("#drawerLayer"),
  drawerMask: document.querySelector("#drawerMask"),
  closeDrawerBtn: document.querySelector("#closeDrawerBtn"),
  drawerGrid: document.querySelector(".drawer-grid"),
  drawerResizer: document.querySelector("#drawerResizer"),
  fileInput: document.querySelector("#fileInput"),
  dropzone: document.querySelector(".dropzone"),
  dependencyCommand: document.querySelector("#dependencyCommand"),
  copyCommandBtn: document.querySelector("#copyCommandBtn"),
  configSelect: document.querySelector("#configSelect"),
  searchInput: document.querySelector("#searchInput"),
  kindFilter: document.querySelector("#kindFilter"),
  stats: document.querySelector("#stats"),
  rows: document.querySelector("#dependencyRows"),
  treeView: document.querySelector("#treeView"),
  pathGraph: document.querySelector("#pathGraph"),
  pathHint: document.querySelector("#pathHint"),
  resultTitle: document.querySelector("#resultTitle"),
  resultSub: document.querySelector("#resultSub"),
  expandBtn: document.querySelector("#expandBtn"),
};

els.fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  await loadDependencyFile(file);
});

els.drawerMask.addEventListener("click", closeDrawer);
els.closeDrawerBtn.addEventListener("click", closeDrawer);
els.drawerResizer.addEventListener("pointerdown", startDrawerResize);
els.drawerResizer.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const current = Number(els.drawerGrid.dataset.pathWidth || 70);
  const next = current + (event.key === "ArrowLeft" ? -5 : 5);
  setDrawerSplit(next);
});

els.copyCommandBtn.addEventListener("click", async () => {
  const command = els.dependencyCommand.textContent.trim();
  const copied = await copyText(command);
  if (!copied) selectCommandText();
  els.copyCommandBtn.textContent = copied ? "已复制" : "已选中";
  els.copyCommandBtn.classList.add("copied");
  window.setTimeout(() => {
    els.copyCommandBtn.textContent = "复制";
    els.copyCommandBtn.classList.remove("copied");
  }, 1400);
});

["dragenter", "dragover"].forEach((eventName) => {
  els.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    els.dropzone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  els.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    els.dropzone.classList.remove("dragging");
  });
});

els.dropzone.addEventListener("drop", async (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  await loadDependencyFile(file);
});

["dragover", "drop"].forEach((eventName) => {
  window.addEventListener(eventName, (event) => {
    event.preventDefault();
  });
});

els.configSelect.addEventListener("change", () => {
  state.activeConfig = els.configSelect.value;
  state.selectedKey = "";
  closeDrawer();
  render();
});
els.searchInput.addEventListener("input", render);
els.kindFilter.addEventListener("change", render);
els.expandBtn.addEventListener("click", () => {
  state.expandedDepth = state.expandedDepth === 1 ? 2 : 1;
  els.expandBtn.textContent = state.expandedDepth === 1 ? "展开两层" : "收起深层";
  renderTree();
});

function analyze() {
  state.parsed = parseGradleDependencies(state.text);
  state.activeConfig = pickDefaultConfig(state.parsed.configs);
  state.selectedKey = "";
  state.expandedDepth = 1;
  closeDrawer();
  render();
}

async function loadDependencyFile(file) {
  state.text = await file.text();
  analyze();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_error) {
      // file:// pages can reject Clipboard API, so fall through to the textarea copy path.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

function selectCommandText() {
  const range = document.createRange();
  range.selectNodeContents(els.dependencyCommand);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function parseGradleDependencies(text) {
  const configs = [];
  let current = null;
  let stack = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const configMatch = line.match(/^([A-Za-z][\w-]*)\s+-\s+(.+)$/);
    if (configMatch) {
      current = {
        name: configMatch[1],
        description: configMatch[2].trim(),
        roots: [],
        nodes: [],
      };
      configs.push(current);
      stack = [];
      continue;
    }

    if (!current) continue;
    const nodeMatch = line.match(/^((?:\|    |     )*)(\+---|\\---)\s+(.+)$/);
    if (!nodeMatch) continue;

    const depth = nodeMatch[1].length / 5;
    const parsed = parseDependencyNotation(nodeMatch[3].trim());
    const node = {
      id: `${current.name}:${current.nodes.length}`,
      depth,
      raw: nodeMatch[3].trim(),
      children: [],
      parent: null,
      ...parsed,
    };

    current.nodes.push(node);
    stack[depth] = node;
    stack = stack.slice(0, depth + 1);
    if (depth === 0) {
      current.roots.push(node);
    } else if (stack[depth - 1]) {
      node.parent = stack[depth - 1];
      stack[depth - 1].children.push(node);
    }
  }

  for (const config of configs) {
    config.summary = summarizeConfig(config);
  }

  return { configs };
}

function parseDependencyNotation(raw) {
  const flags = {
    repeated: /\(\*\)/.test(raw),
    constraint: /\(c\)/.test(raw),
    unresolved: /\(n\)/.test(raw) || /FAILED/i.test(raw),
  };
  const clean = raw.replace(/\s+\((?:\*|c|n)\)/g, "").replace(/\s+FAILED$/i, "").trim();
  const [leftRaw, selectedRaw] = clean.split(/\s+->\s+/);
  const left = leftRaw.trim();
  const selectedVersion = selectedRaw ? selectedRaw.trim() : "";

  if (left.startsWith("project ")) {
    return {
      type: "project",
      key: left,
      ga: left,
      name: left,
      requestedVersion: "",
      selectedVersion: selectedVersion || "",
      changed: Boolean(selectedVersion),
      ...flags,
    };
  }

  const parts = left.split(":");
  if (parts.length >= 3) {
    const requestedVersion = parts.pop();
    const ga = parts.join(":");
    return {
      type: "module",
      key: ga,
      ga,
      name: ga,
      requestedVersion,
      selectedVersion: selectedVersion || requestedVersion,
      changed: Boolean(selectedVersion && selectedVersion !== requestedVersion),
      ...flags,
    };
  }

  if (parts.length === 2 && selectedVersion) {
    return {
      type: "module",
      key: left,
      ga: left,
      name: left,
      requestedVersion: "",
      selectedVersion,
      changed: true,
      ...flags,
    };
  }

  return {
    type: "other",
    key: left,
    ga: left,
    name: left,
    requestedVersion: "",
    selectedVersion,
    changed: Boolean(selectedVersion),
    ...flags,
  };
}

function summarizeConfig(config) {
  const byKey = new Map();
  const directKeys = new Set(config.roots.map((node) => node.key));

  for (const node of config.nodes) {
    if (!byKey.has(node.key)) {
      byKey.set(node.key, {
        key: node.key,
        ga: node.ga,
        type: node.type,
        selectedVersions: new Set(),
        requestedVersions: new Set(),
        occurrences: 0,
        direct: false,
        changed: false,
        constraint: false,
        repeated: false,
        minDepth: Number.POSITIVE_INFINITY,
        paths: [],
        introducers: new Set(),
      });
    }
    const item = byKey.get(node.key);
    item.occurrences += 1;
    item.direct = item.direct || node.depth === 0 || directKeys.has(node.key);
    item.changed = item.changed || node.changed;
    item.constraint = item.constraint || node.constraint;
    item.repeated = item.repeated || node.repeated;
    item.minDepth = Math.min(item.minDepth, node.depth);
    if (node.requestedVersion) item.requestedVersions.add(node.requestedVersion);
    if (node.selectedVersion) item.selectedVersions.add(node.selectedVersion);
    const path = getPath(node);
    item.paths.push(path);
    if (path[0]) item.introducers.add(path[0].key);
  }

  const dependencies = Array.from(byKey.values()).map((item) => ({
    ...item,
    selectedVersions: Array.from(item.selectedVersions).sort(compareVersionish),
    requestedVersions: Array.from(item.requestedVersions).sort(compareVersionish),
    introducers: Array.from(item.introducers).sort(),
    conflict: item.changed || item.requestedVersions.size > 1 || item.selectedVersions.size > 1,
  }));

  dependencies.sort((a, b) => {
    if (a.conflict !== b.conflict) return a.conflict ? -1 : 1;
    if (a.direct !== b.direct) return a.direct ? -1 : 1;
    return a.key.localeCompare(b.key);
  });

  return {
    dependencies,
    totalNodes: config.nodes.length,
    uniqueModules: dependencies.length,
    directCount: config.roots.length,
    changedCount: dependencies.filter((item) => item.conflict).length,
    constraintCount: dependencies.filter((item) => item.constraint).length,
  };
}

function compareVersionish(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function getPath(node) {
  const path = [];
  let cursor = node;
  while (cursor) {
    path.unshift(cursor);
    cursor = cursor.parent;
  }
  return path;
}

function render() {
  const hasResult = Boolean(getActiveConfig());
  els.workspace.classList.toggle("empty", !hasResult);
  els.workspace.classList.toggle("analyzed", hasResult);
  els.content.classList.toggle("empty", !hasResult);
  renderConfigOptions();
  renderSummary();
  renderTable();
  renderPathGraph();
  renderTree();
}

function getActiveConfig() {
  return state.parsed?.configs.find((config) => config.name === state.activeConfig) || null;
}

function renderConfigOptions() {
  const configs = state.parsed?.configs || [];
  els.configSelect.innerHTML = configs
    .map((config) => `<option value="${escapeHtml(config.name)}">${escapeHtml(config.name)}</option>`)
    .join("");
  els.configSelect.value = state.activeConfig;
  els.configSelect.disabled = configs.length === 0;
}

function renderSummary() {
  const config = getActiveConfig();
  if (!config) {
    els.resultTitle.textContent = "";
    els.resultSub.textContent = "";
    els.stats.innerHTML = "";
    return;
  }

  els.resultTitle.textContent = config.name;
  els.resultSub.textContent = config.description;
  const stats = [
    ["依赖节点", config.summary.totalNodes],
    ["唯一库", config.summary.uniqueModules],
    ["直接依赖", config.summary.directCount],
    ["版本变化", config.summary.changedCount],
    ["约束", config.summary.constraintCount],
  ];
  els.stats.innerHTML = stats
    .map(([label, value]) => `<div class="stat"><b>${value}</b><p>${label}</p></div>`)
    .join("");
}

function filteredDependencies() {
  const config = getActiveConfig();
  if (!config) return [];
  const query = els.searchInput.value.trim().toLowerCase();
  const kind = els.kindFilter.value;
  return config.summary.dependencies.filter((item) => {
    const haystack = `${item.key} ${item.selectedVersions.join(" ")} ${item.requestedVersions.join(" ")}`.toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (kind === "conflict" && !item.conflict) return false;
    if (kind === "direct" && !item.direct) return false;
    if (kind === "transitive" && item.direct) return false;
    return true;
  });
}

function renderTable() {
  const deps = filteredDependencies();
  if (!deps.length) {
    els.rows.innerHTML = `<tr><td colspan="5">${state.parsed ? "没有匹配的依赖" : ""}</td></tr>`;
    return;
  }

  els.rows.innerHTML = deps
    .map((item) => {
      const selected = item.key === state.selectedKey ? " selected" : "";
      const source = item.direct ? `<span class="pill good">直接</span>` : `<span class="pill">间接</span>`;
      const conflict = item.conflict ? `<span class="pill warn">版本变化</span>` : "";
      const constraint = item.constraint ? `<span class="pill">constraint</span>` : "";
      return `<tr class="${selected}" data-key="${escapeHtml(item.key)}">
        <td><div class="coord">${escapeHtml(item.key)}</div>${conflict} ${constraint}</td>
        <td>${escapeHtml(item.selectedVersions.join(", ") || "-")}</td>
        <td>${escapeHtml(item.requestedVersions.join(", ") || "-")}</td>
        <td>${source} <span class="pill">${item.introducers.length} 条入口</span> <span class="pill">${item.occurrences} 次出现</span></td>
        <td>${item.minDepth === 0 ? "第一层" : `${item.minDepth + 1} 层`}</td>
      </tr>`;
    })
    .join("");

  els.rows.querySelectorAll("tr[data-key]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedKey = row.dataset.key;
      renderTable();
      renderPathGraph();
      openDrawer();
    });
  });
}

function pickDefaultConfig(configs) {
  return (
    configs.find((config) => config.name === "implementation")?.name ||
    configs.find((config) => config.name.toLowerCase().includes("implementation"))?.name ||
    configs[0]?.name ||
    ""
  );
}

function openDrawer() {
  els.drawerLayer.classList.remove("hidden");
  els.drawerLayer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  els.drawerLayer.classList.add("hidden");
  els.drawerLayer.setAttribute("aria-hidden", "true");
}

function startDrawerResize(event) {
  event.preventDefault();
  document.body.classList.add("resizing-drawer");
  window.addEventListener("pointermove", resizeDrawer);
  window.addEventListener("pointerup", stopDrawerResize, { once: true });
}

function resizeDrawer(event) {
  const rect = els.drawerGrid.getBoundingClientRect();
  const percent = ((event.clientX - rect.left) / rect.width) * 100;
  setDrawerSplit(percent);
}

function stopDrawerResize() {
  document.body.classList.remove("resizing-drawer");
  window.removeEventListener("pointermove", resizeDrawer);
}

function setDrawerSplit(percent) {
  const pathWidth = Math.min(85, Math.max(40, Math.round(percent)));
  const treeWidth = 100 - pathWidth;
  els.drawerGrid.dataset.pathWidth = String(pathWidth);
  els.drawerGrid.style.gridTemplateColumns = `minmax(260px, ${pathWidth}fr) 14px minmax(240px, ${treeWidth}fr)`;
}

function renderPathGraph() {
  const config = getActiveConfig();
  const item = config?.summary.dependencies.find((dep) => dep.key === state.selectedKey);
  if (!item) {
    els.pathHint.textContent = "选择一个库后显示从直接依赖到它的所有路径。";
    els.pathGraph.className = "graph empty";
    els.pathGraph.textContent = "还没有选择依赖";
    return;
  }

  els.pathHint.textContent = `${item.key} 的来源路径，最多显示 16 条。`;
  els.pathGraph.className = "graph";
  const paths = item.paths
    .sort((a, b) => a.length - b.length)
    .slice(0, 16);
  els.pathGraph.innerHTML = paths
    .map((path) => {
      const nodes = path
        .map((node, index) => {
          const cls = index === 0 ? " direct" : index === path.length - 1 ? " target" : "";
          const version = node.selectedVersion ? `:${node.selectedVersion}` : "";
          const changed = node.changed ? `<span class="pill warn">${escapeHtml(node.requestedVersion || "?")} -> ${escapeHtml(node.selectedVersion)}</span>` : "";
          return `<div class="node${cls}"><div class="coord">${escapeHtml(node.key)}${escapeHtml(version)}</div>${changed}</div>`;
        })
        .join(`<span class="arrow">→</span>`);
      return `<div class="path">${nodes}</div>`;
    })
    .join("");
}

function renderTree() {
  const config = getActiveConfig();
  if (!config) {
    els.treeView.className = "tree empty";
    els.treeView.textContent = "";
    return;
  }
  els.treeView.className = "tree";
  els.treeView.innerHTML = `<ul>${config.roots.map((node) => renderTreeNode(node)).join("")}</ul>`;
}

function renderTreeNode(node) {
  const label = treeLabel(node);
  if (!node.children.length) return `<li>${label}</li>`;
  const open = node.depth < state.expandedDepth ? " open" : "";
  return `<li><details${open}><summary>${label}</summary><ul>${node.children.map((child) => renderTreeNode(child)).join("")}</ul></details></li>`;
}

function treeLabel(node) {
  const version = node.selectedVersion ? `:${node.selectedVersion}` : "";
  const changed = node.changed ? ` <span class="pill warn">${escapeHtml(node.requestedVersion || "?")} -> ${escapeHtml(node.selectedVersion)}</span>` : "";
  const flags = [
    node.repeated ? `<span class="pill">重复省略</span>` : "",
    node.constraint ? `<span class="pill">constraint</span>` : "",
  ].join(" ");
  return `<span class="coord">${escapeHtml(node.key)}${escapeHtml(version)}</span> ${changed} ${flags}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

render();
