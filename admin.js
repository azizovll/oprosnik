const root = document.getElementById("admin");
let KEY = "";
try { KEY = sessionStorage.getItem("admin_key") || ""; } catch (e) {}
let surveys = [];

const call = (action, extra = {}) => apiPost({ action, key: KEY, ...extra });
const newId = () => Math.random().toString(36).slice(2, 10);

function loading(text = "Загрузка...") {
  root.innerHTML = `<p class="muted center">${esc(text)}</p>`;
}

// ---------- Вход ----------
function showLogin(msg = "") {
  root.innerHTML = `<div class="card">
    <form id="login" class="row">
      <input type="password" id="key" placeholder="Пароль администратора">
      <button class="btn btn-sm" type="submit">Войти</button>
    </form>
    <p class="muted small" style="margin-top:10px">${esc(msg)}</p></div>`;
  document.getElementById("login").onsubmit = async e => {
    e.preventDefault();
    KEY = document.getElementById("key").value.trim();
    if (!KEY) return;
    try {
      loading();
      await loadList();
      try { sessionStorage.setItem("admin_key", KEY); } catch (e) {}
    } catch (err) {
      showLogin(err.message);
    }
  };
}

// ---------- Список опросов ----------
async function loadList() {
  surveys = (await call("adminList")).surveys;
  renderList();
}

function renderList() {
  root.innerHTML = `
    <div class="toolbar">
      <button class="btn btn-sm" data-act="new">+ Новый опрос</button>
      <button class="btn btn-sm btn-secondary" data-act="people">Список людей</button>
      <button class="btn btn-sm btn-secondary" data-act="logout">Выйти</button>
    </div>
    ${surveys.length ? surveys.map(s => `
      <div class="card">
        <div class="si-top">
          <div>
            <div class="si-title">${esc(s.title)}</div>
            <div class="muted small">${esc(TARGETS[s.target])} · ${s.questions.length} вопр. ·
              ответили <b>${s.count}</b> из ${peopleFor(s.target).length}</div>
          </div>
          <span class="pill ${s.active ? "on" : "off"}">${s.active ? "Открыт" : "Закрыт"}</span>
        </div>
        <div class="row-btns">
          <button class="btn btn-sm" data-act="results" data-id="${esc(s.id)}">Результаты</button>
          <button class="btn btn-sm btn-secondary" data-act="edit" data-id="${esc(s.id)}">Изменить</button>
          <button class="btn btn-sm btn-secondary" data-act="toggle" data-id="${esc(s.id)}">${s.active ? "Закрыть" : "Открыть"}</button>
          <button class="btn btn-sm btn-danger" data-act="delete" data-id="${esc(s.id)}">Удалить</button>
        </div>
      </div>`).join("")
    : `<div class="card done"><p class="muted">Опросов пока нет. Нажмите «+ Новый опрос».</p></div>`}`;

  root.onclick = async e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const s = surveys.find(x => x.id === b.dataset.id);
    const act = b.dataset.act;
    if (act === "new") showEditor(null);
    else if (act === "people") showPeople();
    else if (act === "logout") { KEY = ""; try { sessionStorage.removeItem("admin_key"); } catch (e) {} showLogin(); }
    else if (act === "edit") showEditor(s);
    else if (act === "results") showResults(s.id);
    else if (act === "toggle") {
      b.disabled = true;
      try { await call("saveSurvey", { survey: { ...s, active: !s.active } }); await loadList(); }
      catch (err) { alert(err.message); b.disabled = false; }
    } else if (act === "delete") {
      if (!confirm(`Удалить опрос «${s.title}»? Ответы останутся в Google Таблице.`)) return;
      b.disabled = true;
      try { await call("deleteSurvey", { surveyId: s.id }); await loadList(); }
      catch (err) { alert(err.message); b.disabled = false; }
    }
  };
}

// ---------- Редактор опроса ----------
let draft = null;

function blankQuestion() {
  return { id: newId(), type: "radio", label: "", required: true, options: [], max: 5, minLabel: "", maxLabel: "" };
}

function showEditor(s) {
  draft = s
    ? JSON.parse(JSON.stringify(s))
    : { id: "", title: "", description: "", target: "all", active: true, questions: [blankQuestion()] };
  renderEditor();
}

function syncDraft() {
  draft.title = root.querySelector("#e-title").value.trim();
  draft.description = root.querySelector("#e-desc").value.trim();
  draft.target = root.querySelector("#e-target").value;
  draft.active = root.querySelector("#e-active").checked;
  root.querySelectorAll(".qedit").forEach((el, i) => {
    const q = draft.questions[i];
    q.label = el.querySelector(".qe-label").value.trim();
    q.type = el.querySelector(".qe-type").value;
    q.required = el.querySelector(".qe-req").checked;
    const opts = el.querySelector(".qe-options");
    if (opts) q.options = opts.value.split("\n").map(x => x.trim()).filter(Boolean);
    const max = el.querySelector(".qe-max");
    if (max) {
      q.max = +max.value;
      q.minLabel = el.querySelector(".qe-minl").value.trim();
      q.maxLabel = el.querySelector(".qe-maxl").value.trim();
    }
  });
}

function qEditHTML(q, i, n) {
  const extra = (q.type === "radio" || q.type === "checkbox")
    ? `<textarea class="qe-options" rows="4" placeholder="Варианты ответа — каждый с новой строки">${esc((q.options || []).join("\n"))}</textarea>`
    : q.type === "scale"
      ? `<div class="row">
          <select class="qe-max"><option value="5" ${q.max != 10 ? "selected" : ""}>от 1 до 5</option>
            <option value="10" ${q.max == 10 ? "selected" : ""}>от 1 до 10</option></select>
          <input type="text" class="qe-minl" placeholder="Подпись к 1 (напр. «Плохо»)" value="${esc(q.minLabel)}">
          <input type="text" class="qe-maxl" placeholder="Подпись к максимуму" value="${esc(q.maxLabel)}">
        </div>`
      : "";
  return `<div class="card qedit">
    <div class="si-top">
      <b>Вопрос ${i + 1}</b>
      <div class="row-btns tight">
        <button type="button" class="btn btn-sm btn-secondary" data-act="up" data-i="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="btn btn-sm btn-secondary" data-act="down" data-i="${i}" ${i === n - 1 ? "disabled" : ""}>↓</button>
        <button type="button" class="btn btn-sm btn-danger" data-act="delq" data-i="${i}">✕</button>
      </div>
    </div>
    <input type="text" class="qe-label" placeholder="Текст вопроса" value="${esc(q.label)}">
    <div class="row">
      <select class="qe-type">${Object.entries(QTYPES).map(([k, v]) =>
        `<option value="${k}" ${q.type === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      <label class="check"><input type="checkbox" class="qe-req" ${q.required ? "checked" : ""}> Обязательный</label>
    </div>
    ${extra}
  </div>`;
}

function renderEditor(msg = "") {
  const d = draft;
  root.innerHTML = `
    <button class="link-btn" data-act="cancel">← Назад к опросам</button>
    <div class="card">
      <h2>${d.id ? "Изменить опрос" : "Новый опрос"}</h2>
      <label class="field">Название<input type="text" id="e-title" value="${esc(d.title)}" placeholder="Например: Опрос про экскурсию"></label>
      <label class="field">Описание (необязательно)<textarea id="e-desc" rows="2">${esc(d.description)}</textarea></label>
      <div class="row">
        <label class="field grow">Для кого
          <select id="e-target">${Object.entries(TARGETS).map(([k, v]) =>
            `<option value="${k}" ${d.target === k ? "selected" : ""}>${v} (${peopleFor(k).length} чел.)</option>`).join("")}</select>
        </label>
        <label class="check"><input type="checkbox" id="e-active" ${d.active ? "checked" : ""}> Открыт для ответов</label>
      </div>
    </div>
    ${d.questions.map((q, i) => qEditHTML(q, i, d.questions.length)).join("")}
    <button class="btn btn-secondary" data-act="addq">+ Добавить вопрос</button>
    <br><br>
    <button class="btn" data-act="save">💾 Сохранить опрос</button>
    <p class="status error-text">${esc(msg)}</p>`;

  root.onchange = e => {
    if (e.target.classList.contains("qe-type")) { syncDraft(); renderEditor(); }
  };
  root.onclick = async e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const i = +b.dataset.i;
    if (act === "cancel") { root.onchange = null; renderList(); return; }
    syncDraft();
    const qs = draft.questions;
    if (act === "addq") { qs.push(blankQuestion()); renderEditor(); root.querySelector(".qedit:last-of-type .qe-label")?.focus(); }
    else if (act === "delq") { if (qs.length > 1 || confirm("Удалить единственный вопрос?")) { qs.splice(i, 1); renderEditor(); } }
    else if (act === "up" && i > 0) { [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]]; renderEditor(); }
    else if (act === "down" && i < qs.length - 1) { [qs[i + 1], qs[i]] = [qs[i], qs[i + 1]]; renderEditor(); }
    else if (act === "save") {
      const err = validate(draft);
      if (err) { renderEditor(err); return; }
      b.disabled = true; b.textContent = "Сохранение...";
      try {
        await call("saveSurvey", { survey: draft });
        root.onchange = null;
        loading();
        await loadList();
      } catch (er) { renderEditor("Ошибка: " + er.message); }
    }
  };
}

function validate(d) {
  if (!d.title) return "Введите название опроса";
  if (!d.questions.length) return "Добавьте хотя бы один вопрос";
  for (let i = 0; i < d.questions.length; i++) {
    const q = d.questions[i];
    if (!q.label) return `Вопрос ${i + 1}: введите текст вопроса`;
    if ((q.type === "radio" || q.type === "checkbox") && q.options.length < 2)
      return `Вопрос ${i + 1}: нужно минимум 2 варианта ответа`;
  }
  return "";
}

// ---------- Результаты ----------
let res = null;

async function showResults(id) {
  loading();
  try {
    const d = await call("results", { surveyId: id });
    res = { survey: d.survey, responses: d.responses, cat: "all", group: "all" };
    renderResults();
  } catch (err) {
    alert(err.message);
    renderList();
  }
}

function bar(label, n, total) {
  const p = total ? Math.round(n / total * 100) : 0;
  return `<div class="bar-row"><div class="bar-top"><span>${esc(label)}</span><span>${n} (${p}%)</span></div>
    <div class="bar"><div style="width:${p}%"></div></div></div>`;
}

function fmtAnswer(v) { return Array.isArray(v) ? v.join(", ") : (v == null ? "" : String(v)); }

function renderResults() {
  const { survey: s, responses } = res;
  const match = p => (res.cat === "all" || p.category === res.cat) && (res.group === "all" || p.group === res.group);
  const rs = responses.filter(match);
  const expected = peopleFor(s.target).filter(match);
  const answered = new Set(responses.map(r => r.person));
  const missing = expected.filter(p => !answered.has(p.name));
  const coverage = expected.length ? Math.round((expected.length - missing.length) / expected.length * 100) : 0;

  const chips = (key, items) => items.map(([v, l]) =>
    `<button class="chip ${res[key] === v ? "active" : ""}" data-act="filter" data-k="${key}" data-v="${esc(v)}">${esc(l)}</button>`).join("");

  let html = `
    <button class="link-btn" data-act="back">← Назад к опросам</button>
    <div class="card">
      <h2>${esc(s.title)}</h2>
      <div class="muted small">Для: ${esc(TARGETS[s.target])} · ${s.active ? "Открыт" : "Закрыт"}</div>
      ${s.target === "all" ? `<div class="chips">${chips("cat", [["all", "Все"], ["boys", TARGETS.boys], ["girls", TARGETS.girls]])}</div>` : ""}
      ${GROUPS.length > 1 ? `<div class="chips">${chips("group", [["all", "Все группы"], ...GROUPS.map(g => [g.name, g.name])])}</div>` : ""}
    </div>
    <div class="stats">
      <div class="card stat"><b>${rs.length}</b>ответили</div>
      <div class="card stat"><b>${missing.length}</b>не ответили</div>
      <div class="card stat"><b>${coverage}%</b>охват</div>
    </div>
    <div class="row-btns" style="margin-bottom:14px">
      <button class="btn btn-sm" data-act="csv">⬇ Скачать CSV</button>
      <button class="btn btn-sm btn-secondary" data-act="refresh">↻ Обновить</button>
    </div>`;

  s.questions.forEach((q, i) => {
    const vals = rs.map(r => ({ person: r.person, v: r.answers[q.id] }))
      .filter(x => x.v != null && x.v !== "" && !(Array.isArray(x.v) && !x.v.length));
    html += `<div class="card"><div class="q-label">${i + 1}. ${esc(q.label)}</div>
      <div class="muted small">Ответов: ${vals.length}</div>`;
    if (q.type === "scale") {
      const nums = vals.map(x => +x.v).filter(n => !isNaN(n));
      const avg = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : "—";
      html += `<p>Средняя оценка: <b>${avg}</b> из ${q.max || 5}</p>`;
      for (let k = q.max || 5; k >= 1; k--) html += bar(String(k), nums.filter(n => n === k).length, nums.length);
    } else if (q.type === "radio" || q.type === "checkbox") {
      const counts = {};
      (q.options || []).forEach(o => counts[o] = 0);
      vals.forEach(x => [].concat(x.v).forEach(o => counts[o] = (counts[o] || 0) + 1));
      Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([o, n]) => html += bar(o, n, vals.length));
    } else {
      html += vals.length
        ? `<div class="text-answers">${vals.map(x => `<p><b>${esc(x.person)}:</b> ${esc(x.v)}</p>`).join("")}</div>`
        : `<p class="muted">Нет ответов</p>`;
    }
    html += `</div>`;
  });

  html += `<div class="card"><div class="q-label">Не ответили (${missing.length})</div>
    ${missing.length ? `<div class="name-list">${missing.map(p =>
      `<span class="chip">${esc(p.name)} <span class="muted">· ${p.category === "boys" ? "Парень" : "Девушка"}</span></span>`).join("")}</div>`
      : `<p class="muted">Все ответили 🎉</p>`}</div>`;

  html += `<div class="card"><div class="q-label">Ответы по людям</div>
    ${rs.length ? rs.map(r => `<details class="person-answers"><summary>${esc(r.person)}
      <span class="muted small">· ${esc(new Date(r.time).toLocaleString("ru-RU"))}</span></summary>
      ${s.questions.map(q => `<p><span class="muted">${esc(q.label)}</span><br>${esc(fmtAnswer(r.answers[q.id])) || "—"}</p>`).join("")}
    </details>`).join("") : `<p class="muted">Пока никто не ответил</p>`}</div>`;

  root.innerHTML = html;
  root.onchange = null;
  root.onclick = e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "back") renderList();
    else if (act === "refresh") showResults(s.id);
    else if (act === "filter") { res[b.dataset.k] = b.dataset.v; renderResults(); }
    else if (act === "csv") downloadCSV(s, rs);
  };
}

function downloadCSV(s, rs) {
  const head = ["Время", "ФИО", "Категория", "Группа", ...s.questions.map(q => q.label)];
  const rows = rs.map(r => [
    new Date(r.time).toLocaleString("ru-RU"), r.person, TARGETS[r.category] || r.category, r.group,
    ...s.questions.map(q => fmtAnswer(r.answers[q.id]))
  ]);
  const csv = [head, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = s.title.replace(/[\\/:*?"<>|]/g, "_") + ".csv";
  a.click();
}

// ---------- Список людей ----------
function showPeople() {
  root.innerHTML = `<button class="link-btn" data-act="back">← Назад к опросам</button>
    <p class="muted small">Чтобы изменить список, отредактируйте файл people.js и заново опубликуйте сайт.</p>
    ${GROUPS.map(g => `<div class="card"><h2>${esc(g.name)}</h2>
      <div class="two-col">
        <div><div class="q-label">${TARGETS.boys} (${g.boys.length})</div><ol>${g.boys.map(n => `<li>${esc(n)}</li>`).join("")}</ol></div>
        <div><div class="q-label">Девушки (${g.girls.length})</div><ol>${g.girls.map(n => `<li>${esc(n)}</li>`).join("")}</ol></div>
      </div></div>`).join("")}`;
  root.onclick = e => { if (e.target.closest("[data-act=back]")) renderList(); };
}

// ---------- Старт ----------
if (KEY) {
  loading();
  loadList().catch(err => showLogin(err.message));
} else {
  showLogin();
}
