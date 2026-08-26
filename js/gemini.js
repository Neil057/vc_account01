// ─── Gemini API Integration ───────────────────────────────────────────────────

const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-1.5-flash',
];

// ─── Prompt (精心設計的15條日本稅制規則) ──────────────────────────────────────
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
  - Common chains: ファミリーマート→全家; セブン-イレブン→7-ELEVEN; ローソン→羅森; マクドナルド→麥當勞.

Rule 9 - Items:
  - List the 1-3 most significant purchased items.
  - Provide both Japanese original and Traditional Chinese translation.
  - For supermarkets/convenience stores with many items, describe as "便利商店購物" / "超市購物".

Rule 10 - Category (pick EXACTLY one):
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
  "items": "Items in Traditional Chinese, comma-separated (max 3)",
  "itemsJa": "Items in Japanese original, comma-separated (max 3)",
  "amountJPY": 0,
  "taxType": "内税",
  "category": "餐飲",
  "paymentMethod": "現金",
  "date": "YYYY-MM-DD",
  "notes": ""
}`;

// ─── Gemini API Client ────────────────────────────────────────────────────────
const Gemini = {
  async analyzeReceipt(base64, mimeType = 'image/jpeg') {
    const settings = Storage.getSettings();
    if (!settings.geminiApiKey) {
      throw new Error('請先在「設定」頁面填入 Gemini API Key');
    }

    let lastErr;
    for (const model of GEMINI_MODELS) {
      try {
        const result = await this._call(settings.geminiApiKey, model, base64, mimeType);
        // Apply exchange rate
        result.amountTWD = Math.round((result.amountJPY || 0) * settings.exchangeRate);
        return result;
      } catch (e) {
        lastErr = e;
        console.warn(`[Gemini] ${model} failed:`, e.message);
      }
    }
    throw lastErr || new Error('辨識失敗，請稍後重試');
  },

  async _call(apiKey, model, base64, mimeType) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: RECEIPT_PROMPT }
          ]
        }],
        generationConfig: { temperature: 0.05, maxOutputTokens: 1024 }
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${res.status}`;
      if (res.status === 400 && msg.includes('API_KEY')) throw new Error('API Key 無效，請重新確認');
      if (res.status === 429) throw new Error('請求頻率過高，請稍後再試');
      throw new Error(msg);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini 未回傳結果');

    // Strip markdown code fences if present
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { throw new Error('無法解析 AI 回傳的格式，請重試'); }

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
