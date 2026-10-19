/* ============================================================
   THE HELPDESK · a chat that answers from the studio's own pages.
   it opens from the headset in the corner, or puts a headset there
   on pages that have no corner buttons, and hands over to WhatsApp,
   a call or the enquiry form whenever a person is wanted.
   the conversation follows the visitor from page to page, and
   closing the helpdesk clears it, so it always reopens fresh
   ============================================================ */
(function(){
'use strict';

/* ============================================================
   CONFIGURE ME · the same studio details the pages carry
   ============================================================ */
var CONFIG = {
  endpoint: 'helpdesk/api.php',
  whatsappNumber: '+917680981326',
  phone: '+917680981326',
  /* the page whose enquiry panel takes the conversation on */
  enquiryPage: 'index.html#enquire'
};

var KEY = 'taa-helpdesk', HANDOFF = 'taa-handoff', MAX_LEN = 800;
var GREETING = 'Hello, and welcome to The Alchemy Atelier. Ask me about our services, how a project runs, or how to begin.';
var SUGGEST = [
  'What services do you offer?',
  'How does a project begin?',
  'Is the first consultation free?',
  'Can you design just one room?'
];

var $ = function(s,c){return (c||document).querySelector(s);};
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var ss = {
  get:function(k){try{return JSON.parse(sessionStorage.getItem(k));}catch(e){return null;}},
  set:function(k,v){try{sessionStorage.setItem(k, JSON.stringify(v));}catch(e){}}
};

var msgs = ss.get(KEY);
if (!Array.isArray(msgs)) msgs = [];
var busy = false, last = null;
/* counts conversations, so an answer that lands after a close is dropped */
var gen = 0;

/* ---------- the panel ---------- */
var ICON_SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>';
var ICON_HEAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5V11a7 7 0 0 1 14 0v1.5"/><rect x="3" y="12.5" width="4" height="6" rx="1.6"/><rect x="17" y="12.5" width="4" height="6" rx="1.6"/><path d="M19 18.5v.4a2.6 2.6 0 0 1-2.6 2.6H14"/></svg>';
/* the same marks the home page's corner buttons wear */
var ICON_BOOK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/></svg>';
var ICON_CALL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5L16 12l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4 6.2 2 2 0 0 1 6 4z"/></svg>';
var ICON_WA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37s-1.04 1.02-1.04 2.48 1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35M12.04 21.5h-.01a9.4 9.4 0 0 1-4.79-1.31l-.34-.2-3.56.93.95-3.47-.22-.36a9.38 9.38 0 0 1-1.44-5.01c0-5.18 4.22-9.4 9.42-9.4a9.35 9.35 0 0 1 6.65 2.76 9.32 9.32 0 0 1 2.75 6.65c0 5.18-4.22 9.41-9.41 9.41M20.5 3.49A11.75 11.75 0 0 0 12.04 0C5.5 0 .18 5.32.18 11.86c0 2.09.55 4.13 1.59 5.93L.08 24l6.35-1.66a11.83 11.83 0 0 0 5.6 1.43h.01c6.54 0 11.86-5.32 11.86-11.86 0-3.17-1.23-6.15-3.4-8.42"/></svg>';

var box = document.createElement('div');
box.className = 'hd';
box.hidden = true;
box.innerHTML =
  '<div class="hd__card" role="dialog" aria-modal="true" aria-labelledby="hdTtl">' +
    '<div class="hd__head">' +
      '<p class="hd__eyebrow">Ask the atelier</p>' +
      '<h2 class="hd__ttl" id="hdTtl">Helpdesk</h2>' +
      '<button class="hd__close" type="button" aria-label="Close the helpdesk">&times;</button>' +
    '</div>' +
    '<div class="hd__log" role="log" aria-live="polite" aria-label="Conversation"></div>' +
    '<div class="hd__people">' +
      '<span class="hd__people-lbl">Talk to a person</span>' +
      '<a class="hd__person" data-to="wa" href="#" target="_blank" rel="noopener">WhatsApp</a>' +
      '<a class="hd__person" data-to="call" href="#">Call</a>' +
      '<button class="hd__person" data-to="enq" type="button">Send an enquiry</button>' +
    '</div>' +
    '<form class="hd__form" novalidate>' +
      '<label class="hd__sr" for="hdIn">Your question</label>' +
      '<textarea id="hdIn" rows="1" maxlength="' + MAX_LEN + '" placeholder="Ask a question" autocomplete="off"></textarea>' +
      '<button class="hd__send" type="submit" aria-label="Send">' + ICON_SEND + '</button>' +
    '</form>' +
    '<p class="hd__note">Answers are written by AI from the studio&rsquo;s website and can miss things. For anything that matters, ask the studio.</p>' +
  '</div>';
document.body.appendChild(box);

var card   = $('.hd__card', box),
    log    = $('.hd__log', box),
    form   = $('.hd__form', box),
    input  = $('#hdIn', box),
    sendB  = $('.hd__send', box),
    people = $('.hd__people', box),
    waA    = $('[data-to="wa"]', box),
    callA  = $('[data-to="call"]', box);

callA.href = 'tel:' + CONFIG.phone;

/* ---------- writing into the log ---------- */
function esc(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
/* the little formatting a reply may carry: **bold**, "- " lists, paragraphs */
function format(text){
  var html = '', list = false;
  esc(text).split(/\n/).forEach(function(line){
    var t = line.trim();
    var item = /^[-*•]\s+/.test(t);
    if (item && !list){ html += '<ul>'; list = true; }
    if (!item && list){ html += '</ul>'; list = false; }
    if (!t) return;
    t = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    html += item ? '<li>' + t.replace(/^[-*•]\s+/, '') + '</li>' : '<p>' + t + '</p>';
  });
  return html + (list ? '</ul>' : '');
}

function bubble(m){
  var el = document.createElement('div');
  el.className = 'hd__msg hd__msg--' + (m.role === 'user' ? 'me' : 'them') + (m.error ? ' hd__msg--err' : '');
  if (m.role === 'user'){
    el.textContent = m.text;
  } else {
    el.innerHTML = format(m.text);
    /* the pages the answer came from, only ever this site's own */
    var src = (m.sources || []).filter(function(s){
      return s && /^[a-z0-9-]+\.html(#[\w-]+)?$/i.test(s.url);
    });
    if (src.length){
      var p = document.createElement('p');
      p.className = 'hd__src';
      p.appendChild(document.createTextNode('Read more: '));
      src.forEach(function(s, i){
        if (i) p.appendChild(document.createTextNode(' · '));
        var a = document.createElement('a');
        a.href = s.url;
        a.textContent = s.label;
        p.appendChild(a);
      });
      el.appendChild(p);
    }
  }
  return el;
}

function suggestions(){
  var wrap = document.createElement('div');
  wrap.className = 'hd__sugs';
  SUGGEST.forEach(function(q){
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'hd__sug';
    b.textContent = q;
    b.addEventListener('click', function(){ ask(q); });
    wrap.appendChild(b);
  });
  return wrap;
}

function render(){
  log.innerHTML = '';
  log.appendChild(bubble({role:'model', text:GREETING}));
  if (!msgs.length) log.appendChild(suggestions());
  msgs.forEach(function(m){ log.appendChild(bubble(m)); });
  var lastM = msgs[msgs.length-1];
  people.classList.toggle('hd__people--on', !!(lastM && (lastM.handoff || lastM.error)));
  syncWa();
  log.scrollTop = log.scrollHeight;
}

function typing(on){
  var t = $('.hd__typing', log);
  if (on && !t){
    t = document.createElement('div');
    t.className = 'hd__msg hd__msg--them hd__typing';
    t.setAttribute('aria-label', 'The helpdesk is writing');
    t.innerHTML = '<span></span><span></span><span></span>';
    log.appendChild(t);
    log.scrollTop = log.scrollHeight;
  }
  if (!on && t) t.remove();
}

/* ---------- handing over to a person ---------- */
function asked(){
  return msgs.filter(function(m){ return m.role === 'user'; }).map(function(m){ return m.text; });
}
function syncWa(){
  var q = asked(), line = 'Hi, I came across The Alchemy Atelier website.';
  if (q.length) line += ' I was asking the helpdesk: ' + q[q.length-1];
  waA.href = 'https://wa.me/' + CONFIG.whatsappNumber.replace(/\D/g,'') + '?text=' + encodeURIComponent(line);
}
/* what the visitor asked travels into the enquiry, so it is not said twice */
function summary(){
  var q = asked().slice(-6);
  return q.length ? 'From the helpdesk, I asked:\n- ' + q.join('\n- ') + '\n\n' : '';
}
$('[data-to="enq"]', box).addEventListener('click', function(){
  var text = summary();
  close(true);
  if (typeof window.TAA_openEnquiry === 'function'){
    window.TAA_openEnquiry(text);
  } else {
    ss.set(HANDOFF, text);
    window.location.href = CONFIG.enquiryPage;
  }
});

/* ---------- asking ---------- */
function failText(status, code){
  if (status === 429 || code === 'limit')
    return 'That is a lot of questions in a short while. Give it a few minutes, or reach the studio directly with the buttons below.';
  if (code === 'too_long')
    return 'That is a little long for me. Could you ask it in a shorter way?';
  return 'I cannot answer just now. The studio is quickest on WhatsApp or a call, just below.';
}

function save(){ ss.set(KEY, msgs.slice(-30)); }

/* a fresh desk: nothing said, nothing waiting */
function reset(){
  gen++;
  msgs = [];
  busy = false;
  sendB.disabled = false;
  input.value = '';
  grow();
  try{ sessionStorage.removeItem(KEY); }catch(e){}
}

function ask(text){
  text = String(text || '').trim().slice(0, MAX_LEN);
  if (!text || busy) return;
  msgs.push({role:'user', text:text});
  save();
  render();
  input.value = '';
  grow();

  busy = true;
  sendB.disabled = true;
  typing(true);
  var mine = gen;

  /* only the real turns go to the server; failures stay on this side */
  var payload = msgs.filter(function(m){ return !m.error; }).slice(-12)
                    .map(function(m){ return {role:m.role, text:m.text}; });

  fetch(CONFIG.endpoint, {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'Accept':'application/json'},
    credentials: 'same-origin',
    body: JSON.stringify({messages: payload})
  }).then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(d){ return {ok:r.ok, status:r.status, d:d}; });
  }).then(function(res){
    if (mine !== gen) return;
    if (res.ok && res.d && res.d.reply){
      msgs.push({role:'model', text:res.d.reply, sources:res.d.sources || [], handoff:!!res.d.handoff});
    } else {
      msgs.push({role:'model', error:true, text:failText(res.status, res.d && res.d.error)});
    }
  }).catch(function(){
    if (mine === gen) msgs.push({role:'model', error:true, text:failText(0)});
  }).then(function(){
    if (mine !== gen) return;
    busy = false;
    sendB.disabled = false;
    typing(false);
    save();
    render();
    if (!box.hidden) input.focus({preventScroll:true});
  });
}

form.addEventListener('submit', function(e){ e.preventDefault(); ask(input.value); });
/* enter sends, shift and enter starts a new line */
input.addEventListener('keydown', function(e){
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); ask(input.value); }
});
/* the box grows with what is typed, up to a few lines */
function grow(){
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 140) + 'px';
}
input.addEventListener('input', grow);

/* ---------- opening and closing ---------- */
function open(opener){
  last = opener || document.activeElement;
  render();
  box.hidden = false;
  requestAnimationFrame(function(){
    box.classList.add('is-open');
    document.documentElement.classList.add('hd-locked');
    input.focus({preventScroll:true});
  });
}
function close(keepFocus){
  reset();
  box.classList.remove('is-open');
  document.documentElement.classList.remove('hd-locked');
  setTimeout(function(){ box.hidden = true; }, reduced ? 0 : 420);
  if (!keepFocus && last && last.focus) last.focus({preventScroll:true});
}

$('.hd__close', box).addEventListener('click', function(){ close(); });
box.addEventListener('click', function(e){ if (e.target === box) close(); });
document.addEventListener('keydown', function(e){
  if (e.key === 'Escape' && !box.hidden) close();
});
/* the tab key stays inside the panel while it is up */
card.addEventListener('keydown', function(e){
  if (e.key !== 'Tab') return;
  var f = Array.prototype.filter.call(card.querySelectorAll('button,textarea,a[href]'), function(el){
    return !el.disabled && el.offsetParent !== null;
  });
  if (!f.length) return;
  var first = f[0], lastEl = f[f.length-1];
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); lastEl.focus(); }
  else if (!e.shiftKey && document.activeElement === lastEl){ e.preventDefault(); first.focus(); }
});

/* ---------- the way in ----------
   the headset in the corner opens the helpdesk. it is caught before the
   page's own handler, which stays as the fallback if this file fails to load.
   pages without corner buttons get the home page's four of their own:
   book, the helpdesk, call and WhatsApp */
document.addEventListener('click', function(e){
  var b = e.target.closest && e.target.closest('#fabMail, [data-opens-helpdesk]');
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  open(b);
}, true);

if (!document.getElementById('fabMail')){
  var dock = document.createElement('div');
  dock.className = 'hd-dock';
  var waText = 'Hi, I came across The Alchemy Atelier website and would like to discuss a project.';
  /* booking lives in the home page's panel, which #book opens on arrival */
  dock.innerHTML =
    '<a class="hd-fab" href="index.html#book" aria-label="Book a consultation with The Alchemy Atelier">' +
      '<span class="hd-fab__lbl" aria-hidden="true">Book a consultation</span>' + ICON_BOOK + '</a>' +
    '<button class="hd-fab" type="button" aria-label="Open the studio helpdesk" aria-haspopup="dialog" data-opens-helpdesk>' +
      '<span class="hd-fab__lbl" aria-hidden="true">Helpdesk</span>' + ICON_HEAD + '</button>' +
    '<a class="hd-fab" href="tel:' + CONFIG.phone + '" aria-label="Call the studio">' +
      '<span class="hd-fab__lbl" aria-hidden="true">Call now</span>' + ICON_CALL + '</a>' +
    '<a class="hd-fab hd-fab--wa" target="_blank" rel="noopener" aria-label="Chat with The Alchemy Atelier on WhatsApp" href="https://wa.me/' +
      CONFIG.whatsappNumber.replace(/\D/g,'') + '?text=' + encodeURIComponent(waText) + '">' +
      '<span class="hd-fab__lbl" aria-hidden="true">WhatsApp</span>' + ICON_WA + '</a>';
  document.body.appendChild(dock);
}

window.TAA_helpdesk = { open: open, close: close };
})();
