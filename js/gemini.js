// ─── Gemini API Integration ───────────────────────────────────────────────────

// ─── Dynamic Model Resolution ─────────────────────────────────────────────────
// Fetches the list of supported models from the API at runtime so the model
// picker on the scan page is always up to date instead of a hardcoded list.
// Results are cached per API key for the duration of the browser session.
const _modelCache = {};   // { [apiKey]: string[] }

/**
 * Returns an ordered list of Gemini flash model IDs, newest first, for the
 * user to pick from in the model dropdown. Calls ListModels API on first
 * use; subsequent calls use the in-memory cache. Falls back to a safe
 * default list if the API is unreachable.
 */
async function resolveGeminiModels(apiKey) {
  if (_modelCache[apiKey]) return _modelCache[apiKey];

  try {
    // The key goes in a header, never in the query string: a URL ends up in
    // browser history, the Referer header and any proxy/CDN log along the way.
    const url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100';
    const res = await fetch(url, { headers: { 'x-goog-api-key': apiKey } });
    if (!res.ok) throw new Error(`ListModels HTTP ${res.status}`);
    const data = await res.json();

    // Keep only models that support generateContent and contain "flash"
    const flashModels = (data.models || [])
      .filter(m =>
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent') &&
        m.name.includes('flash') &&
        !m.name.includes('lite')   // exclude lite variants (lower quality)
      )
      .map(m => m.name.replace('models/', ''));  // strip "models/" prefix

    // Sort by version numbers descending (e.g. 2.5 > 2.0 > 1.5)
    flashModels.sort((a, b) => {
      const toNum = s => {
        const m = s.match(/gemini-(\d+)\.(\d+)/);
        return m ? parseFloat(`${m[1]}.${m[2].padStart(3, '0')}`) : 0;
      };
      return toNum(b) - toNum(a);
    });

    if (flashModels.length === 0) throw new Error('No flash models found');
    console.info('[Gemini] Available flash models:', flashModels);
    _modelCache[apiKey] = flashModels;
    return flashModels;
  } catch (e) {
    console.warn('[Gemini] ListModels failed, using fallback:', e.message);
    const fallback = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    _modelCache[apiKey] = fallback;
    return fallback;
  }
}

// ─── Prompt (精心設計的15條日本稅制規則 + 表頭表身明細結構) ───────────────────
const RECEIPT_PROMPT = `You are an expert Japanese receipt (レシート) analyzer. Carefully examine this receipt image and return ONLY a valid JSON object with no markdown formatting.

=== JAPANESE TAX RULES (CRITICAL) ===

Rule 1 - 内税 / 税込 (uchizei / zeikomi):
  - The displayed price ALREADY INCLUDES tax.
  - Use the displayed price directly as the final amount paid.

Rule 2 - 外税 / 税別 / 税抜 (sotozei / zeibetsu / zeinuki):
  - The displayed price EXCLUDES tax.
  - For food & non-alcoholic drinks (食品): add 8% tax.
  - For all other items: add 10% tax.
  - Calculate: finalAmount = displayedPrice × (1 + taxRate).

Rule 3 - 免税 / Tax-Free (menzei):
  - Applied to foreign tourists (外国人旅行者) at qualifying stores.
  - Tax has been DEDUCTED from the displayed price.
  - Use the displayed amount directly (it is already the final amount after tax refund).

Rule 4 - Mixed Tax Rates:
  - A single receipt may simultaneously apply 8% (food items, marked ※ or 軽) and 10% (general items).
  - If both rates appear, look for separate subtotals (8%対象, 10%対象) and sum them for the total.

Rule 5 - Discounts & Coupons:
  - 割引 (waribiki): general discount
  - 値引 (nebiki): price reduction
  - クーポン: coupon discount
  - ポイント割引: loyalty point discount
  - ALWAYS use the final amount actually charged to the customer.
  - If a discount is shown as a negative amount, it has already been subtracted from the total.

Rule 6 - Total Amount (MOST IMPORTANT):
  - Always use the printed 合計 (total) / お会計 (amount due) / TOTAL as the authoritative final amount.
  - Cross-check by summing individual line items. If there is a discrepancy, ALWAYS trust the printed total.
  - Look for the largest amount near the words 合計, TOTAL, お会計, お支払.

Rule 7 - Date:
  - Japanese format: R6/2/23 means Reiwa 6 = 2024. R7 = 2025. R8 = 2026.
  - Western format: 2026/02/23 or 2026-02-23.
  - If date is not visible, use today's date.

Rule 8 - Store Name:
  - Extract the Japanese store name.
  - Translate to Traditional Chinese (繁體中文).
  - Common chains: ファミリーマート→全家; セブン-イレブン→7-ELEVEN; ローソン→羅森; マクドナルド→麥當勞; 西友→西友.

Rule 9 - Detailed Line Items (表身商品明細):
  - Extract ALL individual purchased items listed on the receipt.
  - For each item provide:
    * nameJa: Japanese product name as shown on receipt
    * nameZh: Traditional Chinese translated product name
    * amountJPY: price in JPY for this line item (number)
    * qty: quantity (integer, default 1)

Rule 10 - Category (pick EXACTLY one for the receipt):
  - 餐飲: restaurants, cafes, convenience store food, supermarket food & drinks, ramen, sushi, izakaya
  - 交通: trains (JR, 近鉄, etc.), buses, taxis, Suica/PASMO top-up, toll roads, ferry
  - 購物: clothing, electronics, souvenirs, cosmetics, 100-yen shops, department stores, non-food supermarket items
  - 門票: museums, amusement parks, castles, shrines with entry fee, tours, experiences
  - 住宿: hotels, ryokan, hostels, Airbnb
  - 藥品: pharmacies (薬局, マツキヨ, ツルハ, スギ薬局), medicine, supplements, health goods
  - 其他: anything that doesn't fit above

Rule 11 - Payment Method (pick EXACTLY one):
  - 現金: 現金, CASH, お釣り visible on receipt
  - 信用卡: クレジット, VISA, Mastercard, カード払い
  - Suica: Suica, PASMO, manaca, ICOCA, or any IC card
  - PayPay: PayPay, LINE Pay, メルペイ, d払い, any QR code payment
  - 其他: unclear or other method

Rule 12 - Tax Type Output:
  - Output exactly one of: 内税, 外税, 免税, 不明

Rule 13 - Amount Validation:
  - Before returning, verify: sum of items ≈ subtotal ≈ total (within rounding).
  - If something seems wrong, prefer the printed 合計 amount.

Rule 14 - Numbers:
  - amountJPY must be a positive integer (no decimals, no commas, no ¥ symbol).
  - If amount is unclear or zero, return 0.

Rule 15 - Notes field:
  - Only include if there is something noteworthy (e.g., "含8%食品稅及10%一般稅", "退稅收據", "折扣¥200").
  - Otherwise return empty string "".

=== RETURN FORMAT ===
Return ONLY this JSON object, no other text:
{
  "storeName": "Traditional Chinese store name",
  "storeNameJa": "Japanese store name (original)",
  "amountJPY": 0,
  "taxType": "内税",
  "category": "餐飲",
  "paymentMethod": "現金",
  "date": "YYYY-MM-DD",
  "notes": "",
  "items": [
    {
      "nameZh": "商品中文翻譯名稱",
      "nameJa": "商品日文原文名稱",
      "amountJPY": 0,
      "qty": 1
    }
  ]
}`;

// ─── Gemini API Client ────────────────────────────────────────────────────────
const Gemini = {
  DEFAULT_MODEL: 'gemini-3.6-flash',

  // Fetches the live list of selectable flash models for the model dropdown.
  async listModels() {
    const settings = Storage.getSettings();
    if (!settings.geminiApiKey) {
      throw new Error('請先在「設定」頁面填入 Gemini API Key');
    }
    return resolveGeminiModels(settings.geminiApiKey);
  },

  // Analyzes a receipt with exactly ONE model — the one the user picked in
  // the dropdown (or DEFAULT_MODEL). No automatic fallback to other models:
  // if this model fails, the caller sees the error and stops.
  async analyzeReceipt(base64, mimeType = 'image/jpeg', model = this.DEFAULT_MODEL) {
    const settings = Storage.getSettings();
    if (!settings.geminiApiKey) {
      throw new Error('請先在「設定」頁面填入 Gemini API Key');
    }

    const result = await this._call(settings.geminiApiKey, model, base64, mimeType);
    const rate = settings.exchangeRate || 0.21;

    // Compute Header TWD
    result.amountTWD = Math.round((result.amountJPY || 0) * rate);

    // Normalize items array (表身明細)
    if (!Array.isArray(result.items)) {
      result.items = [];
    }

    result.items = result.items.map(it => ({
      nameZh: it.nameZh || it.name || '商品',
      nameJa: it.nameJa || it.nameZh || '',
      amountJPY: Math.round(Number(it.amountJPY) || 0),
      amountTWD: Math.round((Number(it.amountJPY) || 0) * rate),
      qty: parseInt(it.qty, 10) || 1
    }));

    // Summary string for quick views
    result.itemsSummary = result.items.length > 0
      ? result.items.map(it => it.nameZh).join(', ')
      : (typeof result.items === 'string' ? result.items : '');

    return result;
  },

  async _call(apiKey, model, base64, mimeType) {
    // Key travels in the x-goog-api-key header below, not in the URL.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: RECEIPT_PROMPT }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${res.status}`;
      if (res.status === 400 && (msg.includes('API_KEY') || msg.includes('API key'))) throw new Error('API Key 無效或未開通，請重新確認');
      if (res.status === 429) throw new Error('請求頻率過高或額度用盡，請稍後再試');
      throw new Error(msg);
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini 未回傳結果');

    if (candidate.finishReason === 'MAX_TOKENS') {
      console.warn('[Gemini] Response truncated (MAX_TOKENS):', text);
      throw new Error('AI 回應被截斷（token 用盡），請重試');
    }

    // Strip markdown code fences if present
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch {
      console.warn('[Gemini] Failed to parse response as JSON:', text);
      throw new Error('無法解析 AI 回傳的格式，請重試');
    }

    if (typeof parsed.amountJPY !== 'number') throw new Error('辨識失敗：無法取得金額，請確認圖片清晰度');
    return parsed;
  },

  // ── Compress image before sending ──────────────────────
  async compress(file, maxWidth = 1280) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob => {
          const reader = new FileReader();
          reader.onload = () => resolve({
            base64: reader.result.split(',')[1],
            mimeType: 'image/jpeg',
            previewUrl: URL.createObjectURL(blob)
          });
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.88);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('圖片載入失敗')); };
      img.src = url;
    });
  }
};
