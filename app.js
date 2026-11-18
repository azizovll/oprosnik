const app = document.getElementById("app");
const whoami = document.getElementById("whoami");
document.getElementById("siteTitle").textContent = SITE_TITLE;
document.title = SITE_TITLE;

let me = loadMe();

function loadMe() {
  try {
    const m = JSON.parse(localStorage.getItem("me"));
    if (m && allPeople().some(p => p.name === m.name)) return m;
  } catch (e) {}
  return null;
}
function saveMe(m) {
  try { m ? localStorage.setItem("me", JSON.stringify(m)) : localStorage.removeItem("me"); } catch (e) {}
}

function renderWho() {
  if (!me) { whoami.innerHTML = "Выберите себя из списка"; return; }
  whoami.innerHTML = `Вы: <b>${esc(me.name)}</b> · ${esc(TARGETS[me.category])} · ${esc(me.group)}
    — <a href="#" id="changeMe">сменить</a>`;
  document.getElementById("changeMe").onclick = e => {
    e.preventDefault();
    me = null; saveMe(null); renderWho(); showPicker({});
  };
}

// ---------- Выбор себя ----------
function showPicker(step) {
  if (step.group == null) {
    app.innerHTML = `<div class="card"><div class="q-label">Выберите вашу группу</div>
      <div class="options">${GROUPS.map((g, i) =>
        `<button class="option pick" data-g="${i}">${esc(g.name)}</button>`).join("")}</div></div>`;
    app.querySelectorAll("[data-g]").forEach(b => b.onclick = () => showPicker({ group: +b.dataset.g }));
    return;
  }
  if (!step.category) {
    app.innerHTML = `<div class="card"><div class="q-label">${esc(GROUPS[step.group].name)} — кто вы?</div>
      <div class="cat-grid">
        <button class="cat-btn" data-c="boys">🙋‍♂️<span>Пацаны</span></button>
        <button class="cat-btn" data-c="girls">🙋‍♀️<span>Девушки</span></button>
      </div>
      <button class="link-btn" id="back">← Назад</button></div>`;
    app.querySelectorAll("[data-c]").forEach(b => b.onclick = () => showPicker({ ...step, category: b.dataset.c }));
    document.getElementById("back").onclick = () => showPicker({});
    return;
  }
  const g = GROUPS[step.group];
  const names = [...g[step.category]].sort((a, b) => a.localeCompare(b, "ru"));
  app.innerHTML = `<div class="card"><div class="q-label">Найдите себя</div>
    <input type="text" id="search" placeholder="Начните вводить фамилию...">
    <div class="options names" id="names"></div>
    <button class="link-btn" id="back">← Назад</button></div>`;
  const list = document.getElementById("names");
  const draw = filter => {
    const f = filter.toLowerCase();
    list.innerHTML = names.filter(n => n.toLowerCase().includes(f))
      .map(n => `<button class="option pick" data-n="${esc(n)}">${esc(n)}</button>`).join("")
      || `<p class="muted">Никого не найдено</p>`;
    list.querySelectorAll("[data-n]").forEach(b => b.onclick = () => {
      me = { name: b.dataset.n, group: g.name, category: step.category };
      saveMe(me); renderWho(); showList();
    });
  };
  draw("");
  document.getElementById("search").oninput = e => draw(e.target.value);
  document.getElementById("back").onclick = () => showPicker({ group: step.group });
}

// ---------- Список опросов ----------
async function showList() {
  app.innerHTML = `<p class="muted center">Загрузка опросов...</p>`;
  let surveys;
  try {
    surveys = (await apiGet({ action: "surveys", person: me.name })).surveys;
  } catch (e) {
    app.innerHTML = `<div class="card"><p>Не удалось загрузить опросы: ${esc(e.message)}</p>
      <button class="btn" id="retry">Попробовать ещё раз</button></div>`;
    document.getElementById("retry").onclick = showList;
    return;
  }
  surveys = surveys.filter(s => s.target === "all" || s.target === me.category);
  if (!surveys.length) {
    app.innerHTML = `<div class="card done"><div class="done-icon">🌙</div><h2>Пока нет опросов</h2>
      <p class="muted">Загляните позже.</p></div>`;
    return;
  }
  app.innerHTML = surveys.map((s, i) => `
    <div class="card survey-card">
      <div>
        <div class="si-title">${esc(s.title)}</div>
        ${s.description ? `<div class="muted small">${esc(s.description)}</div>` : ""}
        <div class="muted small">${s.questions.length} вопр.</div>
      </div>
      ${s.answered
        ? `<span class="pill on">✓ Пройден</span>`
        : `<button class="btn btn-sm" data-i="${i}">Пройти</button>`}
    </div>`).join("");
  app.querySelectorAll("[data-i]").forEach(b => b.onclick = () => showSurvey(surveys[+b.dataset.i]));
}

// ---------- Прохождение опроса ----------
function showSurvey(s) {
  app.innerHTML = `
    <button class="link-btn" id="back">← К списку опросов</button>
    <div class="card"><h2>${esc(s.title)}</h2>${s.description ? `<p class="muted">${esc(s.description)}</p>` : ""}</div>
    <form id="form" novalidate>
      ${s.questions.map(questionHTML).join("")}
      <button class="btn" type="submit" id="submit">Отправить</button>
      <p class="status muted" id="status"></p>
    </form>`;
  window.scrollTo(0, 0);
  document.getElementById("back").onclick = showList;
  const form = document.getElementById("form");
  form.onsubmit = async e => {
    e.preventDefault();
    const { answers, missing } = readAnswers(form, s.questions);
    form.querySelectorAll(".question").forEach(card => {
      const bad = missing.includes(card.dataset.qid);
      card.classList.toggle("invalid", bad);
      card.querySelector(".error").classList.toggle("hidden", !bad);
    });
    if (missing.length) {
      form.querySelector(".invalid").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const btn = document.getElementById("submit");
    const status = document.getElementById("status");
    btn.disabled = true; btn.textContent = "Отправка..."; status.textContent = "";
    try {
      await apiPost({ action: "submit", surveyId: s.id, person: me.name, category: me.category, group: me.group, answers });
      app.innerHTML = `<div class="card done"><div class="done-icon">✅</div><h2>Спасибо!</h2>
        <p class="muted">Ваш ответ сохранён.</p><br><button class="btn" id="toList">К списку опросов</button></div>`;
      document.getElementById("toList").onclick = showList;
      window.scrollTo(0, 0);
    } catch (err) {
      status.textContent = "Ошибка: " + err.message;
      btn.disabled = false; btn.textContent = "Отправить";
    }
  };
}

renderWho();
me ? showList() : showPicker({});
