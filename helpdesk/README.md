# Helpdesk · Hostinger par lagane ke steps

Helpdesk website ke apne pages se jawab deta hai (RAG). Visitor sawaal puchta hai, `api.php` site ke sabse milte-julte passages dhundhta hai, aur Gemini un passages se jawab likhta hai. Gemini key sirf server par rehti hai.

```
public_html/                 ← yeh repo
  helpdesk.js, helpdesk.css  ← chat panel, har page par
  helpdesk/
    api.php                  ← chat yahan sawaal bhejta hai
    build.php                ← site padh kar index banata hai
    lib.php                  ← dono ka shared code
    studio-facts.md          ← jo baatein website par nahi likhi
    data/index.json          ← build.php banata hai
    .htaccess                ← api.php aur build.php ke alawa sab band
helpdesk-config.php          ← Gemini key. public_html ke BAHAR
helpdesk-storage/            ← rate limit counters, apne aap banta hai
```

## Pehli baar

1. Hostinger par **Web Hosting** plan (Premium ya Business) lein. Website Builder mein PHP nahi chalta.
2. Saari files `public_html` mein upload karein (File Manager ya Git se).
3. `helpdesk/config.sample.php` ko copy karke **public_html ke bagal wale folder** mein `helpdesk-config.php` naam se rakhein, andar nahi. Usmein apni Gemini key paste karein.
4. Index banayein. Do tareeke hain:
   - **SSH se:** `cd public_html && php helpdesk/build.php`
   - **Browser se:** config mein `admin_token` ek lambi random string rakhein, phir kholein `https://aapka-domain/helpdesk/build.php?token=WOH_STRING`
5. Website kholein, corner mein headset dabayein, aur ek sawaal puchein.

## Jab website ka text badle

`build.php` dobara chalayein. Jo passages nahi badle, unki embeddings dobara nahi banti, isliye yeh jaldi aur sasta hai.

`studio-facts.md` badalne ke baad kuch chalane ki zaroorat nahi. Woh har sawaal ke saath seedha padha jaata hai.

## Kuch galat ho toh

| Chat mein dikhe | Matlab |
|---|---|
| "I cannot answer just now" | Key nahi mili, `index.json` nahi bana, ya Gemini band hai. Hostinger ka error log dekhein (`helpdesk:` se shuru hone wali lines). |
| "That is a lot of questions" | Rate limit. Config mein `rate_per_10min`, `rate_per_day`, `daily_cap` badal sakte hain. |
| Gemini model band ho gaya | Config mein `chat_model` / `embed_model` ka naam badlein. `embed_model` badla toh `build.php` dobara chalayein. |
