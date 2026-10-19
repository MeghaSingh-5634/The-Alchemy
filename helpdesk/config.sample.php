<?php
/* ============================================================
   HELPDESK CONFIG · copy this file to helpdesk-config.php in the
   folder ABOVE public_html (next to it, not inside it), then paste
   the Gemini key. it is never served, and never goes into git.
   every line except the key is optional
   ============================================================ */
return [
    'gemini_api_key' => 'PASTE_YOUR_GEMINI_KEY_HERE',

    /* the models. if Google retires one, change the name here */
    'chat_model'     => 'gemini-3.5-flash-lite',
    'embed_model'    => 'gemini-embedding-2',

    /* set to a long random string to rebuild the index from a browser:
       https://your-domain/helpdesk/build.php?token=THIS_STRING
       left empty, the builder only runs over SSH */
    'admin_token'    => '',

    /* questions allowed: per visitor in ten minutes, per visitor in a day,
       and for the whole site in a day, so the bill has a ceiling */
    'rate_per_10min' => 20,
    'rate_per_day'   => 80,
    'daily_cap'      => 1500,
];
