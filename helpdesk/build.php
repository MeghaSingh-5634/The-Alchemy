<?php
/* ============================================================
   BUILD THE INDEX · reads every page of the site, cuts it into
   passages, and stores a Gemini embedding for each in data/index.json.
   run it again whenever the words on the site change.

     php helpdesk/build.php          build, reusing unchanged passages
     php helpdesk/build.php --dry    print the passages, call nothing

   or from a browser, if admin_token is set in the config:
     https://your-domain/helpdesk/build.php?token=THE_TOKEN
   ============================================================ */
declare(strict_types=1);
require __DIR__ . '/lib.php';

$cli = PHP_SAPI === 'cli';
$cfg = hd_config();

if (!$cli) {
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    $t = (string) ($_GET['token'] ?? '');
    /* no token set, or the wrong one: the page is not there */
    if (strlen((string) $cfg['admin_token']) < 16 || !hash_equals((string) $cfg['admin_token'], $t)) {
        http_response_code(404);
        exit;
    }
}
@set_time_limit(600);

$say = function (string $s) { echo $s, "\n"; @ob_flush(); @flush(); };

$chunks = hd_collect();
$words  = array_sum(array_map(fn($c) => str_word_count($c['text']), $chunks));
$say(count($chunks) . ' passages, ' . $words . ' words, from ' . count(hd_pages()) . ' pages');

if ($cli && in_array('--dry', $argv ?? [], true)) {
    foreach ($chunks as $c) $say("\n── " . $c['page'] . ' – ' . $c['section'] . '  (' . $c['url'] . ")\n" . $c['text']);
    exit(0);
}

if ($cfg['gemini_api_key'] === '') {
    $say('No Gemini key found. Put it in helpdesk-config.php above public_html, or set GEMINI_API_KEY.');
    exit(1);
}

/* passages whose words have not changed keep the vector they already have */
$old = [];
$prev = hd_load_index();
if ($prev && ($prev['embed_model'] ?? '') === $cfg['embed_model'] && (int) ($prev['dims'] ?? 0) === (int) $cfg['embed_dims']) {
    foreach ($prev['chunks'] as $c) $old[$c['hash']] = $c['v'];
}

$made = 0;
foreach ($chunks as $k => $c) {
    $doc  = hd_doc_text($c);
    $hash = sha1($doc);
    $chunks[$k]['hash'] = $hash;
    if (isset($old[$hash])) { $chunks[$k]['v'] = $old[$hash]; continue; }

    /* a busy API is waited out a few times before giving up */
    for ($try = 1; ; $try++) {
        try {
            $v = hd_embed($cfg, $doc);
            break;
        } catch (RuntimeException $e) {
            if ($try >= 4 || !in_array($e->getCode(), [429, 500, 503], true)) {
                $say('Stopped at "' . $c['section'] . '": ' . $e->getMessage());
                $say('Nothing was written; the old index is untouched.');
                exit(1);
            }
            sleep(2 * $try);
        }
    }
    $chunks[$k]['v'] = array_map(fn($x) => round($x, 6), $v);
    $made++;
    $say('  embedded  ' . $c['page'] . ' – ' . $c['section']);
}

$index = [
    'built'       => gmdate('c'),
    'embed_model' => $cfg['embed_model'],
    'dims'        => (int) $cfg['embed_dims'],
    'chunks'      => array_values($chunks),
];

/* written beside the old one and swapped in, so a visitor never reads half a file */
if (!is_dir(dirname(HD_INDEX))) mkdir(dirname(HD_INDEX), 0755, true);
$tmp = HD_INDEX . '.tmp';
file_put_contents($tmp, json_encode($index, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
rename($tmp, HD_INDEX);

$say('Done: ' . $made . ' new, ' . (count($chunks) - $made) . ' reused. Saved to helpdesk/data/index.json');
