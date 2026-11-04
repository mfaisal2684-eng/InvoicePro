/* =========================================================
   InvoicePro - script.js
   ========================================================= */

'use strict';

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);

let itemIdCounter = 0;

/* ---------- Gemini API config ----------
   Email draft aur Terms generate karne ke liye apni Gemini API key yahan daalo.
   Key ke bina baaki invoice features bilkul sahi chalenge.
   NOTE: Frontend me key daalna secure nahi hai. Production me apne backend se call karo. */
const API_KEY = '';
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const MAX_RETRIES = 4;

/* =========================================================
   Gemini API
   ========================================================= */
async function callGeminiApi(userPrompt, systemPrompt) {
  if (!API_KEY) {
    return 'Error: Gemini API key set nahi hai. script.js me API_KEY daalo.';
  }

  const payload = {
    contents: [{ parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
  };

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await fetch(`${GEMINI_API_URL}?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || 'Error: Could not generate content.';
      }

      // Rate limit par exponential backoff ke saath retry
      if (response.status === 429 && i < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000));
        continue;
      }
      return `Error: API call failed with status ${response.status}.`;
    } catch (err) {
      if (i === MAX_RETRIES - 1) return 'Error: Network request failed after multiple retries.';
      await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
  return 'Error: Failed to get a response from the AI service.';
}

function setLoading(isLoading, buttonId, loadingText, defaultHtml) {
  const button = $(buttonId);
  if (!button) return;
  if (isLoading) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> ${loadingText}`;
  } else {
    button.disabled = false;
    button.innerHTML = defaultHtml;
  }
}

async function generateTermsAndConditions() {
  const buttonId = 'generateTermsButton';
  const defaultHtml = '<span>✨</span> Generate terms';
  setLoading(true, buttonId, 'Generating...', defaultHtml);

  const total = $('totalDisplay').textContent;
  const itemsSummary = getItems()
    .map((item) => `${item.description} (₹${item.price} x ${item.quantity})`)
    .join(', ');

  const systemPrompt =
    "You are a professional financial assistant. Generate a concise, formal, and positive 'Payment Terms and Conditions' paragraph for an invoice. The text should be suitable for a B2B transaction and focus on clarity. Keep it to one short paragraph. Do not use markdown (like bolding or lists).";
  const userQuery = `The invoice total is ${total} and includes services: ${itemsSummary}. Please provide professional payment terms.`;

  const terms = await callGeminiApi(userQuery, systemPrompt);
  $('termsAndConditionsDisplay').textContent = terms.trim();

  setLoading(false, buttonId, '', defaultHtml);
}

async function draftInvoiceEmail() {
  const buttonId = 'draftEmailButton';
  const defaultHtml = '<span>✨</span> Draft email';
  setLoading(true, buttonId, 'Generating...', defaultHtml);

  const clientName = $('clientNameInput').value;
  const businessName = $('businessNameInput').value;
  const invoiceNumber = $('invoiceNumberInput').value;
  const total = $('totalDisplay').textContent;
  const paymentTerms = $('termsAndConditionsDisplay').textContent;
  const itemsSummary = getItems().map((item) => item.description).join(', ');

  const systemPrompt =
    "You are a professional executive assistant. Your task is to draft a concise, professional email to a client for an attached invoice. Include placeholders like '[Client Contact Name]' and '[Your Name/Title]'. The tone should be polite and action-oriented. Include a subject line at the very start, followed by two blank lines, then the body of the email. Do not use markdown like bolding or bullets.";
  const userQuery = `Draft an email for Invoice ${invoiceNumber} from ${businessName} to ${clientName} for services: ${itemsSummary}. The total amount due is ${total}. Key payment terms: ${paymentTerms}.`;

  const emailDraft = await callGeminiApi(userQuery, systemPrompt);

  setLoading(false, buttonId, '', defaultHtml);
  $('emailContentDisplay').textContent = emailDraft.trim();
  showEmailModal();
}

/* =========================================================
   Modal
   ========================================================= */
function showEmailModal() {
  $('emailModal').classList.remove('hidden');
}

function hideEmailModal() {
  $('emailModal').classList.add('hidden');
}

async function copyEmailContent() {
  const content = $('emailContentDisplay').textContent;
  try {
    await navigator.clipboard.writeText(content);
  } catch (e) {
    // Fallback purane browsers ke liye
    const ta = document.createElement('textarea');
    ta.value = content;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  const btn = $('copyEmailButton');
  btn.textContent = 'Copied!';
  btn.classList.add('btn-green');
  setTimeout(() => {
    btn.textContent = 'Copy text';
    btn.classList.remove('btn-green');
  }, 1500);
}

/* =========================================================
   Line items
   ========================================================= */
function addItem(description = 'New Service/Product', quantity = 1, price = 1000) {
  const container = $('itemsContainer');
  const newId = itemIdCounter++;

  const card = document.createElement('div');
  card.className = 'item-card';
  card.id = `item-${newId}`;

  const fields = document.createElement('div');
  fields.className = 'item-fields';

  const descInput = document.createElement('input');
  descInput.type = 'text';
  descInput.placeholder = 'Description';
  descInput.value = description;
  descInput.dataset.field = 'description';

  const qtyPrice = document.createElement('div');
  qtyPrice.className = 'qty-price';

  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.min = '0';
  qtyInput.placeholder = 'Qty';
  qtyInput.value = quantity;
  qtyInput.dataset.field = 'quantity';

  const priceInput = document.createElement('input');
  priceInput.type = 'number';
  priceInput.min = '0';
  priceInput.placeholder = 'Price (₹)';
  priceInput.value = price;
  priceInput.dataset.field = 'price';

  [descInput, qtyInput, priceInput].forEach((el) => el.addEventListener('input', updateInvoice));

  qtyPrice.append(qtyInput, priceInput);
  fields.append(descInput, qtyPrice);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-item';
  removeBtn.setAttribute('aria-label', 'Remove item');
  removeBtn.textContent = '🗑';
  removeBtn.addEventListener('click', () => removeItem(newId));

  card.append(fields, removeBtn);
  container.appendChild(card);
  updateInvoice();
}

function removeItem(id) {
  const el = $(`item-${id}`);
  if (el) {
    el.remove();
    updateInvoice();
  }
}

function getItems() {
  const items = [];
  document.querySelectorAll('#itemsContainer > .item-card').forEach((card) => {
    const description = card.querySelector('[data-field="description"]').value;
    const quantity = parseFloat(card.querySelector('[data-field="quantity"]').value) || 0;
    const price = parseFloat(card.querySelector('[data-field="price"]').value) || 0;
    if (description) {
      items.push({ description, quantity, price, amount: quantity * price });
    }
  });
  return items;
}

/* =========================================================
   Formatting
   ========================================================= */
function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

// Table columns ke liye bina ₹ symbol ke
function formatNumberINR(amount) {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/* =========================================================
   Main update
   ========================================================= */
function updateInvoice() {
  // 1. Basic info
  $('businessNameDisplay').textContent = $('businessNameInput').value;
  $('businessAddressDisplay').textContent = $('businessAddressInput').value;
  $('businessGstinDisplay').textContent = $('businessGstinInput').value.toUpperCase().trim();

  $('clientNameDisplay').textContent = $('clientNameInput').value;
  $('clientAddressDisplay').textContent = $('clientAddressInput').value;

  const clientGstin = $('clientGstinInput').value.toUpperCase().trim();
  if (clientGstin) {
    $('clientGstinDisplay').textContent = clientGstin;
    $('clientGstinLine').classList.remove('hidden');
  } else {
    $('clientGstinLine').classList.add('hidden');
  }

  $('invoiceNumberDisplay').textContent = $('invoiceNumberInput').value;

  const dateValue = $('dateInput').value;
  if (dateValue) {
    // "YYYY-MM-DD" ko local date maano taaki timezone se din na badle
    const [y, m, d] = dateValue.split('-').map(Number);
    $('dateDisplay').textContent = new Date(y, m - 1, d).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  // 2. Items table
  const items = getItems();
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const tbody = $('invoiceItemsTable');
  tbody.innerHTML = '';

  items.forEach((item) => {
    const row = tbody.insertRow();
    row.insertCell(0).textContent = item.description;
    row.insertCell(1).textContent = item.quantity.toFixed(0);
    row.insertCell(2).textContent = formatNumberINR(item.price);
    row.insertCell(3).textContent = formatNumberINR(item.amount);
    row.cells[0].className = 'left';
    row.cells[1].className = 'right';
    row.cells[2].className = 'right';
    row.cells[3].className = 'right amount';
  });

  if (items.length === 0) {
    const row = tbody.insertRow();
    const cell = row.insertCell(0);
    cell.colSpan = 4;
    cell.className = 'left empty';
    cell.textContent = 'No items added yet.';
  }

  // 3. Totals (pehle discount, phir discounted amount par tax)
  const taxRate = parseFloat($('taxRateInput').value) || 0;
  const discountRate = parseFloat($('discountRateInput').value) || 0;

  const discountAmount = subtotal * (discountRate / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * (taxRate / 100);
  const total = afterDiscount + taxAmount;

  $('subtotalDisplay').textContent = formatINR(subtotal);
  $('discountRateDisplay').textContent = discountRate.toFixed(0);
  $('discountDisplay').textContent = `- ${formatINR(discountAmount)}`;
  $('taxRateDisplay').textContent = taxRate.toFixed(0);
  $('taxDisplay').textContent = formatINR(taxAmount);
  $('totalDisplay').textContent = formatINR(total);
}

/* =========================================================
   Logo
   ========================================================= */
function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) {
    removeLogo();
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    $('logoDisplay').src = e.target.result;
    $('logoDisplay').classList.remove('hidden');
    $('logoPlaceholder').classList.add('hidden');
    $('removeLogoButton').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function removeLogo() {
  $('logoDisplay').removeAttribute('src');
  $('logoDisplay').classList.add('hidden');
  $('logoPlaceholder').classList.remove('hidden');
  $('removeLogoButton').classList.add('hidden');
  $('logoInput').value = '';
}

/* =========================================================
   PDF
   ========================================================= */
function downloadPDF() {
  const element = $('invoicePreview');
  const invoiceNum = $('invoiceNumberInput').value || 'Invoice';
  const termsBtn = $('generateTermsButton');

  // PDF me "Generate terms" button nahi dikhna chahiye
  termsBtn.classList.add('hidden');

  const opt = {
    margin: [0.4, 0.4, 0.4, 0.4],
    filename: `${invoiceNum}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
    jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
  };

  html2pdf()
    .from(element)
    .set(opt)
    .save()
    .finally(() => termsBtn.classList.remove('hidden'));
}

/* =========================================================
   Init
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  // Aaj ki date (local) set karo
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  $('dateInput').value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  // Saare static inputs ko live update se jodo
  [
    'businessNameInput', 'businessAddressInput', 'businessGstinInput',
    'clientNameInput', 'clientAddressInput', 'clientGstinInput',
    'invoiceNumberInput', 'dateInput', 'taxRateInput', 'discountRateInput',
  ].forEach((id) => $(id).addEventListener('input', updateInvoice));

  // Buttons
  $('addItemButton').addEventListener('click', () => addItem());
  $('logoInput').addEventListener('change', handleLogoUpload);
  $('removeLogoButton').addEventListener('click', removeLogo);
  $('draftEmailButton').addEventListener('click', draftInvoiceEmail);
  $('generateTermsButton').addEventListener('click', generateTermsAndConditions);
  $('downloadPdfButton').addEventListener('click', downloadPDF);
  $('printButton').addEventListener('click', () => window.print());
  $('copyEmailButton').addEventListener('click', copyEmailContent);
  $('closeModalButton').addEventListener('click', hideEmailModal);
  $('closeModalX').addEventListener('click', hideEmailModal);
  $('emailModal').addEventListener('click', (e) => {
    if (e.target === $('emailModal')) hideEmailModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideEmailModal();
  });

  // Default items
  addItem('Web Design Service', 1, 15000);
  addItem('Monthly Hosting Fee', 3, 500);
  updateInvoice();
});
