"use strict";

// =====================================================
// VARIÁVEIS
// =====================================================

// --- elementos: navegação ---
const navToggle = document.getElementById("navToggle");
const mobileNav = document.getElementById("mobileNav");
const navLinks = document.querySelectorAll(".main-nav a, .mobile-nav a[href^='#']:not(.btn)");
const sections = document.querySelectorAll("main section[id]");

// --- elementos: status da loja e horários ---
const shopStatus = document.getElementById("shopStatus");
const shopStatusText = document.getElementById("shopStatusText");
const hoursRows = document.querySelectorAll(".hours-row");
const nextSlotLabels = document.querySelectorAll("[data-proximo]");

// --- elementos: agendamento ---
const bookingForm = document.getElementById("bookingForm");
const dateInput = document.getElementById("data");
const nameInput = document.getElementById("nome");
const phoneInput = document.getElementById("telefone");
const slotsBox = document.getElementById("slots");
const slotsNote = document.getElementById("slotsNote");
const bookingResult = document.getElementById("bookingResult");

// --- elementos: galeria e rodapé ---
const workModal = document.getElementById("workModal");
const workModalImg = document.getElementById("workModalImg");
const yearEl = document.getElementById("year");

// --- dados da barbearia ---
// horário por dia da semana (0 = domingo): [abre, fecha] ou null quando fechado
const openingHours = {
  0: null,
  1: [9, 20],
  2: [9, 20],
  3: [9, 20],
  4: [9, 20],
  5: [9, 20],
  6: [9, 18],
};

const barbers = ["Rafa", "Dani", "Léo"];

const services = {
  corte: { name: "Corte", price: 60, minutes: 45 },
  barba: { name: "Barba", price: 45, minutes: 30 },
  combo: { name: "Corte + barba", price: 95, minutes: 75 },
  sobrancelha: { name: "Sobrancelha", price: 20, minutes: 15 },
  infantil: { name: "Corte infantil", price: 45, minutes: 30 },
  pezinho: { name: "Pezinho", price: 15, minutes: 15 },
};

const SLOT_MINUTES = 30;
const MIN_NOTICE_MINUTES = 30;
const DAYS_AHEAD = 30;
const BUSY_PERCENT = 35;

const weekdayNames = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira",
  "quinta-feira", "sexta-feira", "sábado",
];
const weekdayShort = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const monthNames = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

// =====================================================
// FUNÇÕES
// =====================================================

// --- datas e horas ---
function pad(number) {
  return String(number).padStart(2, "0");
}

// "2026-11-14" no fuso local (toISOString usaria UTC e poderia errar o dia)
function toDateKey(date) {
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function fromDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isSameDay(a, b) {
  return toDateKey(a) === toDateKey(b);
}

function formatTime(hour, minute) {
  return minute === 0 ? hour + "h" : hour + "h" + pad(minute);
}

function formatSlot(slot) {
  const [hour, minute] = slot.split(":").map(Number);
  return formatTime(hour, minute);
}

function formatLongDate(date) {
  return weekdayNames[date.getDay()] + ", " + date.getDate() + " de " + monthNames[date.getMonth()];
}

// --- horário de funcionamento e status ---
function getShopStatus(now) {
  const hours = openingHours[now.getDay()];
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  if (hours && minutesNow >= hours[0] * 60 && minutesNow < hours[1] * 60) {
    return { open: true, text: "Aberto agora, fecha às " + formatTime(hours[1], 0) };
  }

  if (hours && minutesNow < hours[0] * 60) {
    return { open: false, text: "Fechado agora, abre hoje às " + formatTime(hours[0], 0) };
  }

  for (let offset = 1; offset <= 7; offset++) {
    const date = addDays(now, offset);
    const nextHours = openingHours[date.getDay()];
    if (nextHours) {
      const when = offset === 1 ? "amanhã" : weekdayNames[date.getDay()];
      return { open: false, text: "Fechado agora, abre " + when + " às " + formatTime(nextHours[0], 0) };
    }
  }

  return { open: false, text: "Fechado agora" };
}

function updateShopStatus() {
  const status = getShopStatus(new Date());
  shopStatusText.textContent = status.text;
  shopStatus.classList.toggle("is-open", status.open);
  shopStatus.classList.toggle("is-closed", !status.open);
}

function highlightToday() {
  const today = String(new Date().getDay());
  hoursRows.forEach(function (row) {
    row.classList.toggle("is-today", row.dataset.dia.split(" ").includes(today));
  });
}

// --- horários disponíveis ---
function getSlotsForDate(date) {
  const hours = openingHours[date.getDay()];
  if (!hours) return [];

  const slots = [];
  const closesAt = hours[1] * 60;
  for (let minutes = hours[0] * 60; minutes + SLOT_MINUTES <= closesAt; minutes += SLOT_MINUTES) {
    slots.push(pad(Math.floor(minutes / 60)) + ":" + pad(minutes % 60));
  }
  return slots;
}

function isSlotInPast(date, slot) {
  const [hour, minute] = slot.split(":").map(Number);
  const slotTime = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
  return slotTime.getTime() < Date.now() + MIN_NOTICE_MINUTES * 60 * 1000;
}

// ocupação simulada: o mesmo dia, barbeiro e horário sempre dão o mesmo resultado (hash FNV-1a)
function isSlotTaken(date, barber, slot) {
  const text = toDateKey(date) + "|" + barber + "|" + slot;
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100 < BUSY_PERCENT;
}

function isSlotFree(date, barber, slot) {
  if (isSlotInPast(date, slot)) return false;
  if (barber === "qualquer") {
    return barbers.some(function (name) {
      return !isSlotTaken(date, name, slot);
    });
  }
  return !isSlotTaken(date, barber, slot);
}

function findNextFreeSlot(barber) {
  const today = new Date();
  for (let offset = 0; offset <= 7; offset++) {
    const date = addDays(today, offset);
    const slot = getSlotsForDate(date).find(function (candidate) {
      return isSlotFree(date, barber, candidate);
    });
    if (slot) return { date: date, slot: slot };
  }
  return null;
}

function describeNextSlot(result) {
  if (!result) return "sem horários esta semana";

  const today = new Date();
  let when;
  if (isSameDay(result.date, today)) {
    when = "hoje";
  } else if (isSameDay(result.date, addDays(today, 1))) {
    when = "amanhã";
  } else {
    when = weekdayShort[result.date.getDay()] + ", " + result.date.getDate() + "/" + pad(result.date.getMonth() + 1);
  }
  return when + " às " + formatSlot(result.slot);
}

function showNextSlots() {
  nextSlotLabels.forEach(function (label) {
    label.textContent = describeNextSlot(findNextFreeSlot(label.dataset.proximo));
  });
}

// --- formulário de agendamento ---
function getSelectedValue(name) {
  const checked = bookingForm.querySelector('input[name="' + name + '"]:checked');
  return checked ? checked.value : "";
}

function setDateLimits() {
  const today = new Date();
  dateInput.min = toDateKey(today);
  dateInput.max = toDateKey(addDays(today, DAYS_AHEAD));
}

// começa na primeira data que ainda tem horário livre
function setDefaultDate() {
  const today = new Date();
  for (let offset = 0; offset <= DAYS_AHEAD; offset++) {
    const date = addDays(today, offset);
    const hasFreeSlot = getSlotsForDate(date).some(function (slot) {
      return isSlotFree(date, "qualquer", slot);
    });
    if (hasFreeSlot) {
      dateInput.value = toDateKey(date);
      return;
    }
  }
}

function renderSlots() {
  const barber = getSelectedValue("barbeiro");
  const previousSlot = getSelectedValue("horario");

  slotsBox.replaceChildren();
  slotsNote.textContent = "";

  if (!dateInput.value) {
    slotsNote.textContent = "Escolha uma data para ver os horários.";
    return;
  }

  const date = fromDateKey(dateInput.value);
  const slots = getSlotsForDate(date);

  if (slots.length === 0) {
    slotsNote.textContent = "Não abrimos neste dia. Escolha outra data.";
    return;
  }

  let freeCount = 0;
  slots.forEach(function (slot) {
    const free = isSlotFree(date, barber, slot);
    if (free) freeCount += 1;

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "horario";
    input.id = "slot-" + slot.replace(":", "");
    input.value = slot;
    input.disabled = !free;
    input.checked = free && slot === previousSlot;

    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.textContent = formatSlot(slot);

    slotsBox.append(input, label);
  });

  if (freeCount === 0) {
    const who = barber === "qualquer" ? "nenhum barbeiro" : barber;
    slotsNote.textContent = "Sem horários livres neste dia com " + who + ". Tente outra data ou outro barbeiro.";
  }
}

function selectOption(name, value) {
  const input = bookingForm.querySelector('input[name="' + name + '"][value="' + value + '"]');
  if (!input) return;
  input.checked = true;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function isValidPhone(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}

function showError(id, message) {
  const errorEl = document.getElementById("err-" + id);
  if (errorEl) errorEl.textContent = message;

  const field = document.getElementById(id);
  if (field) field.setAttribute("aria-invalid", "true");
}

function clearErrors() {
  bookingForm.querySelectorAll(".field-error").forEach(function (el) {
    el.textContent = "";
  });
  bookingForm.querySelectorAll("[aria-invalid]").forEach(function (el) {
    el.removeAttribute("aria-invalid");
  });
}

function validateBooking() {
  let valid = true;
  const slot = getSelectedValue("horario");

  if (!dateInput.value) {
    showError("data", "Escolha uma data.");
    valid = false;
  }

  if (!slot) {
    showError("horario", "Escolha um horário disponível.");
    valid = false;
  } else if (dateInput.value && !isSlotFree(fromDateKey(dateInput.value), getSelectedValue("barbeiro"), slot)) {
    // o tempo passou desde que a lista foi desenhada
    showError("horario", "Esse horário acabou de ficar indisponível. Escolha outro.");
    renderSlots();
    valid = false;
  }

  if (nameInput.value.trim().length < 2) {
    showError("nome", "Digite seu nome.");
    valid = false;
  }

  if (!isValidPhone(phoneInput.value)) {
    showError("telefone", "Digite um telefone com DDD.");
    valid = false;
  }

  return valid;
}

function showBookingResult() {
  const service = services[getSelectedValue("servico")];
  const barber = getSelectedValue("barbeiro");
  const date = fromDateKey(dateInput.value);
  const firstName = nameInput.value.trim().split(" ")[0];
  const withWho = barber === "qualquer" ? "o primeiro barbeiro livre" : barber;

  const title = document.createElement("strong");
  title.textContent = "Agendamento simulado, " + firstName + "!";

  const summary = document.createElement("p");
  summary.textContent = service.name + " com " + withWho + ", " + formatLongDate(date) + ", às " + formatSlot(getSelectedValue("horario")) + ".";

  const details = document.createElement("p");
  details.textContent = "Duração prevista: " + service.minutes + " min. Valor: R$ " + service.price + ".";

  const notice = document.createElement("p");
  notice.textContent = "Este site é uma demonstração: nenhum dado foi enviado.";

  bookingResult.replaceChildren(title, summary, details, notice);
  bookingResult.classList.add("is-visible");
  bookingResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// --- navegação ---
function setMenuOpen(open) {
  mobileNav.classList.toggle("is-open", open);
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
}

function setActiveLink(id) {
  navLinks.forEach(function (link) {
    link.classList.toggle("is-current", link.getAttribute("href") === "#" + id);
  });
}

// --- galeria ---
function openPhoto(button) {
  const photo = button.querySelector("img");
  if (!photo.getAttribute("src")) return; // foto ainda não adicionada

  workModalImg.src = photo.src;
  workModalImg.alt = photo.alt;
  workModal.showModal();
}

// --- rodapé ---
function setFooterYear() {
  yearEl.textContent = new Date().getFullYear();
}

// =====================================================
// RODAR FUNÇÕES
// =====================================================
setFooterYear();
updateShopStatus();
highlightToday();
setDateLimits();
setDefaultDate();
renderSlots();
showNextSlots();
setInterval(updateShopStatus, 60 * 1000);

// =====================================================
// CÓDIGO
// =====================================================

// --- menu mobile: abrir, fechar, fechar ao clicar num link e com Esc ---
navToggle.addEventListener("click", function () {
  setMenuOpen(!mobileNav.classList.contains("is-open"));
});

mobileNav.querySelectorAll("a").forEach(function (link) {
  link.addEventListener("click", function () {
    setMenuOpen(false);
  });
});

document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && mobileNav.classList.contains("is-open")) {
    setMenuOpen(false);
    navToggle.focus();
  }
});

// --- link ativo na navegação, conforme a seção visível ---
if ("IntersectionObserver" in window) {
  const navObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setActiveLink(entry.target.id);
      });
    },
    { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
  );
  sections.forEach(function (section) {
    navObserver.observe(section);
  });
}

// --- botões "Agendar" (serviços e equipe) que já preenchem o formulário ---
document.querySelectorAll("[data-servico]").forEach(function (button) {
  button.addEventListener("click", function () {
    selectOption("servico", button.dataset.servico);
  });
});

document.querySelectorAll("[data-barbeiro]").forEach(function (button) {
  button.addEventListener("click", function () {
    selectOption("barbeiro", button.dataset.barbeiro);
  });
});

// --- agendamento: redesenhar horários quando muda a data ou o barbeiro ---
dateInput.addEventListener("change", renderSlots);

bookingForm.querySelectorAll('input[name="barbeiro"]').forEach(function (input) {
  input.addEventListener("change", renderSlots);
});

// --- agendamento: validar e confirmar ---
bookingForm.addEventListener("submit", function (event) {
  event.preventDefault();
  clearErrors();
  bookingResult.classList.remove("is-visible");

  if (!validateBooking()) {
    const firstInvalid = bookingForm.querySelector('[aria-invalid="true"]');
    if (firstInvalid) firstInvalid.focus();
    return;
  }

  showBookingResult();
  bookingForm.reset();
  setDefaultDate();
  renderSlots();
});

// --- galeria: ampliar foto e fechar o modal ---
document.querySelectorAll(".work-photo").forEach(function (button) {
  button.addEventListener("click", function () {
    openPhoto(button);
  });
});

// fecha ao clicar em qualquer lugar que não seja a própria foto
workModal.addEventListener("click", function (event) {
  if (event.target !== workModalImg) workModal.close();
});
