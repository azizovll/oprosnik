// ===== Код для Google Apps Script =====
// Вставьте этот код в: Google Таблица → Расширения → Apps Script
// Пароль для админ-панели. ОБЯЗАТЕЛЬНО поменяйте на свой!
const ADMIN_KEY = "smenite-parol-123";

const S_SURVEYS = "_опросы";
const S_RESP = "_ответы";
const SURVEY_HEADERS = ["id", "title", "description", "target", "active", "questions", "created"];
const RESP_HEADERS = ["time", "surveyId", "person", "category", "group", "answers"];
const QTYPES = ["radio", "checkbox", "scale", "text", "textarea"];
const TARGETS = ["all", "boys", "girls"];
const CAT_RU = { boys: "Парни", girls: "Девушки" };

// ---------- HTTP ----------
function doGet(e) {
  try {
    const p = e.parameter || {};
    if (p.action === "surveys") return json_(publicSurveys_(String(p.person || "")));
    return json_({ ok: false, error: "Неизвестное действие" });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.action === "submit") return json_(withLock_(function () { return submit_(b); }));
    if (b.key !== ADMIN_KEY) return json_({ ok: false, error: "Неверный пароль" });
    switch (b.action) {
      case "adminList": return json_(adminList_());
      case "results": return json_(results_(String(b.surveyId)));
      case "saveSurvey": return json_(withLock_(function () { return saveSurvey_(b.survey); }));
      case "deleteSurvey": return json_(withLock_(function () { return deleteSurvey_(String(b.surveyId)); }));
    }
    return json_({ ok: false, error: "Неизвестное действие" });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

// ---------- Хранилище ----------
function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.appendRow(headers);
    s.setFrozenRows(1);
  }
  return s;
}

function rows_(s) {
  const last = s.getLastRow();
  if (last < 2) return [];
  return s.getRange(2, 1, last - 1, s.getLastColumn()).getValues();
}

function readSurveys_() {
  return rows_(sheet_(S_SURVEYS, SURVEY_HEADERS)).map(function (r, i) {
    let qs = [];
    try { qs = JSON.parse(r[5] || "[]"); } catch (e) {}
    return {
      row: i + 2, id: String(r[0]), title: String(r[1]), description: String(r[2]),
      target: String(r[3]), active: r[4] === true || String(r[4]).toUpperCase() === "TRUE",
      questions: qs, created: r[6]
    };
  }).filter(function (s) { return s.id; });
}

function readResponses_() {
  return rows_(sheet_(S_RESP, RESP_HEADERS)).map(function (r) {
    let a = {};
    try { a = JSON.parse(r[5] || "{}"); } catch (e) {}
    return {
      time: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      surveyId: String(r[1]), person: String(r[2]), category: String(r[3]), group: String(r[4]), answers: a
    };
  });
}

function publicView_(s) {
  return { id: s.id, title: s.title, description: s.description, target: s.target, active: s.active, questions: s.questions };
}

// ---------- Ученики ----------
function publicSurveys_(person) {
  const done = {};
  if (person) readResponses_().forEach(function (r) { if (r.person === person) done[r.surveyId] = true; });
  const list = readSurveys_().filter(function (s) { return s.active; }).reverse().map(function (s) {
    const v = publicView_(s);
    v.answered = !!done[s.id];
    return v;
  });
  return { ok: true, surveys: list };
}

function submit_(b) {
  const person = String(b.person || "").trim().slice(0, 200);
  const category = String(b.category || "");
  const group = String(b.group || "").slice(0, 200);
  if (!person) throw new Error("Не указано имя");
  if (!CAT_RU[category]) throw new Error("Неверная категория");

  const s = readSurveys_().filter(function (x) { return x.id === String(b.surveyId); })[0];
  if (!s) throw new Error("Опрос не найден");
  if (!s.active) throw new Error("Опрос закрыт");
  if (s.target !== "all" && s.target !== category) throw new Error("Этот опрос не для вашей категории");

  const already = readResponses_().some(function (r) { return r.surveyId === s.id && r.person === person; });
  if (already) throw new Error("Вы уже прошли этот опрос");

  const input = b.answers || {};
  const clean = {};
  s.questions.forEach(function (q) {
    let v = input[q.id];
    if (q.type === "checkbox") {
      v = (Array.isArray(v) ? v : []).map(String).filter(function (x) { return q.options.indexOf(x) !== -1; });
      if (q.required && !v.length) throw new Error("Не отвечен вопрос: " + q.label);
    } else {
      v = v == null ? "" : String(v).trim().slice(0, 3000);
      if (q.type === "radio" && v && q.options.indexOf(v) === -1) v = "";
      if (q.type === "scale" && v && !(+v >= 1 && +v <= (q.max || 5))) v = "";
      if (q.required && !v) throw new Error("Не отвечен вопрос: " + q.label);
    }
    clean[q.id] = v;
  });

  const now = new Date();
  sheet_(S_RESP, RESP_HEADERS).appendRow([now, s.id, safe_(person), category, safe_(group), JSON.stringify(clean)]);
  appendReadable_(s, now, person, category, group, clean);
  return { ok: true };
}

// Отдельный понятный лист для каждого опроса — удобно смотреть прямо в Таблице
function appendReadable_(s, now, person, category, group, answers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const suffix = " (" + s.id + ")";
  let sh = ss.getSheets().filter(function (x) { return x.getName().slice(-suffix.length) === suffix; })[0];
  if (!sh) {
    const title = s.title.replace(/[\\\/\?\*\[\]:]/g, " ").slice(0, 80);
    sh = ss.insertSheet(title + suffix);
    sh.appendRow(["Время", "ФИО", "Категория", "Группа"]);
    sh.setFrozenRows(1);
  }
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  s.questions.forEach(function (q) {
    if (headers.indexOf(q.label) === -1) {
      headers.push(q.label);
      sh.getRange(1, headers.length).setValue(q.label);
    }
  });
  const byLabel = {};
  s.questions.forEach(function (q) {
    const v = answers[q.id];
    byLabel[q.label] = Array.isArray(v) ? v.join(", ") : v;
  });
  const row = headers.map(function (h, i) {
    if (i === 0) return now;
    if (i === 1) return safe_(person);
    if (i === 2) return CAT_RU[category];
    if (i === 3) return safe_(group);
    return safe_(byLabel[h] == null ? "" : byLabel[h]);
  });
  sh.appendRow(row);
}

function safe_(v) {
  v = String(v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

// ---------- Админ ----------
function adminList_() {
  const counts = {};
  readResponses_().forEach(function (r) { counts[r.surveyId] = (counts[r.surveyId] || 0) + 1; });
  const list = readSurveys_().reverse().map(function (s) {
    const v = publicView_(s);
    v.count = counts[s.id] || 0;
    return v;
  });
  return { ok: true, surveys: list };
}

function results_(id) {
  const s = readSurveys_().filter(function (x) { return x.id === id; })[0];
  if (!s) throw new Error("Опрос не найден");
  const rs = readResponses_().filter(function (r) { return r.surveyId === id; });
  return { ok: true, survey: publicView_(s), responses: rs };
}

function saveSurvey_(input) {
  if (!input) throw new Error("Нет данных");
  const title = String(input.title || "").trim().slice(0, 200);
  if (!title) throw new Error("Введите название");
  const target = TARGETS.indexOf(input.target) !== -1 ? input.target : "all";
  const questions = (input.questions || []).map(function (q) {
    const type = QTYPES.indexOf(q.type) !== -1 ? q.type : "text";
    return {
      id: String(q.id || Utilities.getUuid().slice(0, 8)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 20),
      type: type,
      label: String(q.label || "").trim().slice(0, 500),
      required: !!q.required,
      options: (type === "radio" || type === "checkbox")
        ? (q.options || []).map(function (o) { return String(o).trim().slice(0, 200); }).filter(String)
        : [],
      max: type === "scale" ? (+q.max === 10 ? 10 : 5) : undefined,
      minLabel: type === "scale" ? String(q.minLabel || "").slice(0, 100) : undefined,
      maxLabel: type === "scale" ? String(q.maxLabel || "").slice(0, 100) : undefined
    };
  }).filter(function (q) { return q.id && q.label; });
  if (!questions.length) throw new Error("Добавьте хотя бы один вопрос");

  const sh = sheet_(S_SURVEYS, SURVEY_HEADERS);
  const existing = readSurveys_().filter(function (x) { return x.id === String(input.id || ""); })[0];
  const values = [
    existing ? existing.id : Utilities.getUuid().slice(0, 8),
    title,
    String(input.description || "").slice(0, 1000),
    target,
    !!input.active,
    JSON.stringify(questions),
    existing ? existing.created : new Date()
  ];
  if (existing) sh.getRange(existing.row, 1, 1, values.length).setValues([values]);
  else sh.appendRow(values);
  return { ok: true, id: values[0] };
}

function deleteSurvey_(id) {
  const s = readSurveys_().filter(function (x) { return x.id === id; })[0];
  if (!s) throw new Error("Опрос не найден");
  sheet_(S_SURVEYS, SURVEY_HEADERS).deleteRow(s.row);
  return { ok: true };
}

// ---------- Утилиты ----------
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
