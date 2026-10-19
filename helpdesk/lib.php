<?php
/* ============================================================
   THE HELPDESK · shared by the endpoint and the index builder.
   reads the config, talks to Gemini, and turns the site's own
   pages into the short passages the helpdesk answers from
   ============================================================ */
declare(strict_types=1);

const HD_SITE  = __DIR__ . '/..';                 /* the site: the folder above this one */
const HD_INDEX = __DIR__ . '/data/index.json';
const HD_FACTS = __DIR__ . '/studio-facts.md';

/* ---------- config ----------
   the key is looked for outside public_html first, so it never sits where
   the web is served. an environment variable wins over both files */
function hd_config(): array {
    $cfg = [
        'gemini_api_key' => '',
        'chat_model'     => 'gemini-3.5-flash-lite',
        'embed_model'    => 'gemini-embedding-2',
        'embed_dims'     => 768,
        'api_base'       => 'https://generativelanguage.googleapis.com/v1beta',
        'admin_token'    => '',
        'storage_dir'    => '',
        'rate_per_10min' => 20,     /* one visitor */
        'rate_per_day'   => 80,     /* one visitor */
        'daily_cap'      => 1500,   /* every visitor together, so the bill has a ceiling */
    ];
    foreach ([dirname(__DIR__, 2) . '/helpdesk-config.php', __DIR__ . '/config.php'] as $f) {
        if (is_file($f)) {
            $c = require $f;
            if (is_array($c)) { $cfg = array_merge($cfg, $c); break; }
        }
    }
    $env = getenv('GEMINI_API_KEY');
    if ($env) $cfg['gemini_api_key'] = $env;
    if ($cfg['storage_dir'] === '') $cfg['storage_dir'] = dirname(__DIR__, 2) . '/helpdesk-storage';
    return $cfg;
}

/* somewhere writable for the rate counters: outside public_html if the
   host allows it, the system temp folder if not */
function hd_storage(array $cfg): string {
    foreach ([$cfg['storage_dir'], sys_get_temp_dir() . '/taa-helpdesk'] as $d) {
        if ((is_dir($d) || @mkdir($d, 0700, true)) && is_writable($d)) return $d;
    }
    return '';
}

/* ---------- Gemini ---------- */
function hd_gemini(array $cfg, string $model, string $method, array $body, int $timeout = 25): array {
    $ch = curl_init(rtrim($cfg['api_base'], '/') . '/models/' . rawurlencode($model) . ':' . $method);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'x-goog-api-key: ' . $cfg['gemini_api_key']],
        CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_UNICODE),
    ]);
    $raw  = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($raw === false) throw new RuntimeException('Gemini unreachable: ' . curl_error($ch), 0);
    $data = json_decode((string) $raw, true);
    if ($code !== 200 || !is_array($data)) {
        $why = is_array($data) ? ($data['error']['message'] ?? '') : substr((string) $raw, 0, 200);
        throw new RuntimeException('Gemini ' . $code . ': ' . $why, $code);
    }
    return $data;
}

/* one vector, scaled to unit length so a dot product is the cosine.
   documents go in as "title: … | text: …" and questions as
   "task: question answering | query: …", the way gemini-embedding-2 asks */
function hd_embed(array $cfg, string $text): array {
    $d = hd_gemini($cfg, $cfg['embed_model'], 'embedContent', [
        'model'                => 'models/' . $cfg['embed_model'],
        'content'              => ['parts' => [['text' => $text]]],
        'outputDimensionality' => (int) $cfg['embed_dims'],
    ], 20);
    $v = $d['embedding']['values'] ?? $d['embeddings'][0]['values'] ?? null;
    if (!is_array($v) || !$v) throw new RuntimeException('Gemini returned no embedding', 0);
    $n = sqrt(array_sum(array_map(fn($x) => $x * $x, $v))) ?: 1.0;
    return array_map(fn($x) => $x / $n, $v);
}

function hd_dot(array $a, array $b): float {
    $s = 0.0;
    foreach ($a as $i => $x) $s += $x * ($b[$i] ?? 0.0);
    return $s;
}

/* ============================================================
   READING THE SITE · every page in the folder, cut at its sections.
   the parts that are not knowledge are taken out first: the header,
   the footer, the floating buttons, the forms and dialogs, and the
   closing invitation every page repeats
   ============================================================ */
const HD_DROP_CLASSES  = ['hero', 'wa', 'enq', 'invite', 'filters', 'grid', 'ask__picked', 'ask__next'];
const HD_SKIP_HEADINGS = ['Also from the studio', 'Still being written'];
const HD_BLOCKS = ['p','div','li','ul','ol','h1','h2','h3','h4','h5','h6','figure','figcaption',
                   'article','section','blockquote','br','dt','dd','tr','table','aside'];

function hd_pages(): array {
    $files = glob(HD_SITE . '/*.html') ?: [];
    /* the home page first, then the rest in name order */
    usort($files, fn($a, $b) => [basename($a) !== 'index.html', $a] <=> [basename($b) !== 'index.html', $b]);
    return $files;
}

function hd_collect(): array {
    $chunks = [];
    foreach (hd_pages() as $f) {
        $html = (string) file_get_contents($f);
        foreach (hd_page_chunks($html, basename($f)) as $c) $chunks[] = $c;
        foreach (hd_work_chunks($html, basename($f)) as $c) $chunks[] = $c;
    }
    return $chunks;
}

function hd_page_chunks(string $html, string $file): array {
    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="utf-8" ?>' . $html, LIBXML_NOERROR | LIBXML_NOWARNING);
    libxml_clear_errors();
    $xp = new DOMXPath($dom);

    $title = trim($xp->evaluate('string(//title)'));
    $page  = trim(preg_replace('/\s*·\s*The Alchemy Atelier\s*$/u', '', $title)) ?: $file;
    if ($file === 'index.html') $page = 'Home';

    $drop = '//script|//style|//svg|//noscript|//template|//header|//nav|//footer|//form'
          . '|//*[@role="dialog"]|//*[@aria-hidden="true"]|//*[@hidden]|//*[@data-helpdesk-skip]';
    foreach (HD_DROP_CLASSES as $c) $drop .= '|//*[contains(concat(" ", normalize-space(@class), " "), " ' . $c . ' ")]';
    foreach (iterator_to_array($xp->query($drop)) as $n) {
        if ($n->parentNode) $n->parentNode->removeChild($n);
    }

    $out = [];
    foreach ($xp->query('//section') as $i => $sec) {
        /* a heading set over two lines is read as one; a section without
           one is named by its first words that are not a photograph */
        $h = $xp->query('(.//h1|.//h2)[1]', $sec)->item(0);
        $head = $h ? implode(' ', hd_lines($h)) : '';
        if (in_array($head, HD_SKIP_HEADINGS, true)) continue;

        $lines = hd_lines($sec);
        if (str_word_count(implode(' ', $lines)) < 12) continue;
        if ($head === '') {
            foreach ($lines as $l) if (strpos($l, 'Photo: ') !== 0) { $head = $l; break; }
        }

        $id  = $sec instanceof DOMElement ? $sec->getAttribute('id') : '';
        $url = $file . ($id !== '' ? '#' . $id : '');
        foreach (hd_split($lines, 200) as $j => $part) {
            $out[] = [
                'id'      => $file . ':' . $i . ':' . $j,
                'page'    => $page,
                'section' => $head !== '' ? $head : $page,
                'url'     => $url,
                'text'    => $part,
            ];
        }
    }
    return $out;
}

/* the words of a section as lines a reader would see, with the photographs
   described by their alt text, the step numbers and arrows left out */
function hd_lines(DOMNode $root): array {
    $buf = '';
    $walk = function (DOMNode $n) use (&$walk, &$buf) {
        foreach ($n->childNodes as $c) {
            if ($c instanceof DOMText) { $buf .= $c->nodeValue; continue; }
            if (!$c instanceof DOMElement) continue;
            $tag   = strtolower($c->tagName);
            $block = in_array($tag, HD_BLOCKS, true);
            if ($tag === 'img') {
                $alt = trim($c->getAttribute('alt'));
                if ($alt !== '') $buf .= "\nPhoto: " . $alt . "\n";
                continue;
            }
            $buf .= $block ? "\n" : ' ';
            $walk($c);
            $buf .= $block ? "\n" : ' ';
        }
    };
    $walk($root);

    $lines = [];
    foreach (preg_split('/\n+/u', $buf) as $l) {
        $l = trim(preg_replace('/\s+/u', ' ', $l));
        $l = trim(preg_replace('/^\d{1,2}\s+/u', '', $l));             /* "01 Discovery" → "Discovery" */
        if ($l === '' || preg_match('/^(\d{1,2}|→|View (project|service)\b.*|Start a project.*)$/u', $l)) continue;
        if ($lines && end($lines) === $l) continue;
        $lines[] = $l;
    }
    return $lines;
}

/* long sections are cut into passages of about $max words, on line breaks */
function hd_split(array $lines, int $max): array {
    $parts = [];
    $cur = [];
    $n = 0;
    foreach ($lines as $l) {
        $w = str_word_count($l);
        if ($cur && $n + $w > $max) { $parts[] = implode("\n", $cur); $cur = []; $n = 0; }
        $cur[] = $l;
        $n += $w;
    }
    if ($cur) $parts[] = implode("\n", $cur);
    return $parts;
}

/* the gallery keeps each project's note in its script, for the lightbox.
   each project becomes a passage of its own, two views of one joined */
function hd_work_chunks(string $html, string $file): array {
    $q = "'((?:[^'\\\\]|\\\\.)*)'";
    if (!preg_match_all('/\{\s*name:' . $q . ',\s*meta:' . $q . ',\s*note:' . $q . '\s*\}/su', $html, $m, PREG_SET_ORDER)) return [];
    $work = [];
    foreach ($m as $row) {
        [, $name, $meta, $note] = array_map('stripslashes', $row);
        $work[$name]['meta'] = $meta;
        $work[$name]['notes'][] = $note;
    }
    $out = [];
    $i = 0;
    foreach ($work as $name => $w) {
        $out[] = [
            'id'      => $file . ':work:' . $i++,
            'page'    => 'Gallery',
            'section' => $name,
            'url'     => $file . '#work',
            'text'    => 'Project: ' . $name . "\n" . $w['meta'] . "\n" . implode("\n", $w['notes']),
        ];
    }
    return $out;
}

function hd_doc_text(array $c): string {
    return 'title: ' . $c['page'] . ' – ' . $c['section'] . ' | text: ' . $c['text'];
}

function hd_load_index(): ?array {
    if (!is_file(HD_INDEX)) return null;
    $d = json_decode((string) file_get_contents(HD_INDEX), true);
    return is_array($d) && !empty($d['chunks']) ? $d : null;
}
