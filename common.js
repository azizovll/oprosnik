// Общие функции для сайта и админки
const TARGETS = { all: "Все", boys: "Парни", girls: "Девушки" };
const QTYPES = {
  radio: "Один вариант",
  checkbox: "Несколько вариантов",
  scale: "Шкала (оценка)",
  text: "Короткий ответ",
  textarea: "Развёрнутый ответ"
};

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function checkUrl() {
  if (!SCRIPT_URL.startsWith("https://")) throw new Error("В config.js не указана ссылка SCRIPT_URL");
}

async function apiGet(params) {
  checkUrl();
  const res = await fetch(SCRIPT_URL + "?" + new URLSearchParams(params));
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Ошибка сервера");
  return data;
}

async function apiPost(body) {
  checkUrl();
  // text/plain — чтобы не было предварительного CORS-запроса
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Ошибка сервера");
  return data;
}

function allPeople() {
  return GROUPS.flatMap(g => [
    ...g.boys.map(name => ({ name, group: g.name, category: "boys" })),
    ...g.girls.map(name => ({ name, group: g.name, category: "girls" }))
  ]);
}

function peopleFor(target) {
  return allPeople().filter(p => target === "all" || p.category === target);
}

function questionHTML(q, i) {
  const name = "q_" + q.id;
  let body = "";
  if (q.type === "text") {
    body = `<input type="text" name="${name}" maxlength="300">`;
  } else if (q.type === "textarea") {
    body = `<textarea name="${name}" rows="4" maxlength="3000"></textarea>`;
  } else if (q.type === "radio" || q.type === "checkbox") {
    body = `<div class="options">${(q.options || []).map(o =>
      `<label class="option"><input type="${q.type}" name="${name}" value="${esc(o)}"><span>${esc(o)}</span></label>`
    ).join("")}</div>`;
  } else if (q.type === "scale") {
    const max = q.max || 5;
    let items = "";
    for (let k = 1; k <= max; k++) {
      items += `<label class="scale-item"><input type="radio" name="${name}" value="${k}"><span>${k}</span></label>`;
    }
    body = `<div class="scale">${items}</div>
      <div class="scale-labels"><span>${esc(q.minLabel)}</span><span>${esc(q.maxLabel)}</span></div>`;
  }
  return `<div class="card question" data-qid="${esc(q.id)}">
    <div class="q-label">${i + 1}. ${esc(q.label)}${q.required ? '<span class="req"> *</span>' : ""}</div>
    ${body}
    <div class="error hidden">Пожалуйста, ответьте на этот вопрос</div>
  </div>`;
}

function readAnswers(form, questions) {
  const answers = {};
  const missing = [];
  questions.forEach(q => {
    const name = "q_" + q.id;
    let v;
    if (q.type === "checkbox") {
      v = [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(x => x.value);
    } else if (q.type === "radio" || q.type === "scale") {
      const c = form.querySelector(`input[name="${name}"]:checked`);
      v = c ? c.value : "";
    } else {
      v = form.elements[name].value.trim();
    }
    const empty = Array.isArray(v) ? v.length === 0 : v === "";
    if (q.required && empty) missing.push(q.id);
    answers[q.id] = v;
  });
  return { answers, missing };
}
