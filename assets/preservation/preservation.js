/*!
 * Preservation runtime — The Wedding of April & Ages
 *
 * The original page is driven by its own (preserved) scripts: Elementor, Happy Addons,
 * WeddingPress, Element Pack and the "CUI" guestbook plugin. This file only supplies what
 * the browser save could not contain:
 *
 *   1. A local stand-in for the WordPress server (admin-ajax.php / wp-comments-post.php),
 *      so the ORIGINAL guestbook script keeps working: it loads the archived comments and
 *      accepts new wishes, which are stored in this browser (localStorage) and clearly
 *      marked as local. Nothing is ever sent to the internet.
 *   2. Handlers for four Elementor widgets whose code is lazy-loaded from the server and was
 *      therefore not saved: Gallery lightbox, Video, Counter and Form.
 *
 * Loaded right after jQuery, before every other plugin.
 */
(function ($, w, d) {
  "use strict";
  var POST_ID = "92432";
  var STORE_KEY = "april-ages:guestbook-local:v1";
  var RSVP_KEY = "april-ages:rsvp-local:v1";

  /* ------------------------------------------------------------------ autoplay */
  // The original music script calls audio.play() on page load. Browsers block that until the
  // guest interacts; the song then starts from the "Open Invitation" click exactly as before.
  // Mark every media play() promise as handled; the promise itself is returned unchanged, so
  // callers that handle it still can. Error/playing events are unaffected.
  if (w.HTMLMediaElement && HTMLMediaElement.prototype.play) {
    var nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      var p = nativePlay.apply(this, arguments);
      if (p && typeof p.catch === "function") p.catch(function () {});
      return p;
    };
  }

  /* ------------------------------------------------------------------ hero intro video */
  // The hero's animated intro (trees -> gate -> photo) is an Elementor "play once" background
  // video. Elementor starts it on page load, while the guest is still on the cover, so it had
  // usually finished (and been hidden, leaving the static fallback picture) before anyone
  // pressed "Open Invitation". The vendor's own script reveals the hero title 10 s AFTER that
  // click, so the intended sequence starts at the click. Hold the video at its first frame
  // until the invitation is opened, then play it from the start.
  //
  // If the original video cannot be played (missing, or the host sent something that is not a
  // video), a RECREATED intro is shown instead: the original final picture (the section's own
  // fallback image) is revealed zone by zone - gate & castle, left trees, right trees, flowers -
  // and ends exactly on that picture. This is a reconstruction, not the original video.
  var invitationOpened = false, introState = "unknown", heroSection = null;
  function isHeroVideo(el) {
    return el && el.classList && el.classList.contains("elementor-background-video-hosted");
  }
  function heroVideos() { return d.querySelectorAll("video.elementor-background-video-hosted"); }
  function sectionOf(v) { return v.closest(".elementor-section, .elementor-element"); }
  d.addEventListener("play", function (e) {
    var v = e.target;
    if (!invitationOpened && isHeroVideo(v)) {
      v.pause();
      try { v.currentTime = 0; } catch (err) {}
    }
  }, true);
  d.addEventListener("error", function (e) {
    var t = e.target, v = isHeroVideo(t) ? t : (t && t.parentNode && isHeroVideo(t.parentNode) ? t.parentNode : null);
    if (!v || !v.getAttribute("src")) return;
    introState = "bad"; heroSection = sectionOf(v);
    if (heroSection) heroSection.classList.add("pres-intro-pending");
  }, true);
  d.addEventListener("loadeddata", function (e) {
    if (isHeroVideo(e.target)) introState = "ok";
  }, true);
  d.addEventListener("playing", function (e) {
    if (isHeroVideo(e.target)) { var s = sectionOf(e.target); if (s) s.classList.remove("pres-intro-pending"); }
  }, true);

  function recreateIntro(section) {
    if (!section || section.getAttribute("data-pres-intro")) return;
    section.setAttribute("data-pres-intro", "1");
    Array.prototype.forEach.call(section.querySelectorAll("video.elementor-background-video-hosted"), function (v) {
      try { v.pause(); } catch (err) {} v.style.display = "none";
    });
    section.classList.remove("pres-intro-pending");
    var cs = getComputedStyle(section), img = cs.backgroundImage;
    if (!img || img === "none") return;
    if (w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var wrap = d.createElement("div");
    wrap.className = "pres-intro"; wrap.setAttribute("aria-hidden", "true");
    ["wash", "gate", "left", "right", "bottom", "seal"].forEach(function (name) {
      var l = d.createElement("div");
      l.className = "pres-intro__layer pres-intro--" + name;
      l.style.backgroundImage = img;
      l.style.backgroundSize = cs.backgroundSize;
      l.style.backgroundPosition = cs.backgroundPosition;
      l.style.backgroundRepeat = "no-repeat";
      wrap.appendChild(l);
    });
    var anchor = section.querySelector(":scope > .elementor-container") || section.firstChild;
    section.insertBefore(wrap, anchor);
    section.classList.add("pres-intro-running");
    setTimeout(function () {
      section.classList.remove("pres-intro-running");
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }, 7600);
  }

  d.addEventListener("click", function (e) {
    if (invitationOpened || !e.target.closest || !e.target.closest("#tombol-buka")) return;
    invitationOpened = true;
    Array.prototype.forEach.call(heroVideos(), function (v) {
      var section = sectionOf(v);
      if (introState === "bad" || v.error || !v.getAttribute("src")) { recreateIntro(section); return; }
      v.style.display = "";
      try { v.currentTime = 0; } catch (err) {}
      var p = v.play(); if (p && p.catch) p.catch(function () {});
      if (introState !== "ok") {
        // still unknown: keep the stage clear and give the real video a moment to start
        if (section) section.classList.add("pres-intro-pending");
        setTimeout(function () {
          if (introState !== "ok" || v.error || v.paused) recreateIntro(section);
        }, 1500);
      }
    });
  }, true);

  /* ------------------------------------------------------------------ storage */
  function load(key) { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { return []; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; } }

  /* ------------------------------------------------------------------ helpers */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function autop(t) { // WordPress-style paragraphs
    return t.trim().split(/\n\s*\n/).map(function (p) { return "<p>" + esc(p).replace(/\n/g, "<br>\n") + "</p>"; }).join("\n");
  }
  function parseQuery(s) {
    var o = {}; (s || "").replace(/^\?/, "").split("&").forEach(function (kv) {
      if (!kv) return; var i = kv.indexOf("="); var k = decodeURIComponent((i < 0 ? kv : kv.slice(0, i)).replace(/\+/g, " "));
      o[k] = i < 0 ? "" : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " "));
    }); return o;
  }
  // Indonesian relative time, matching WordPress human_time_diff() + " lalu"
  function relTime(ts) {
    var s = Math.max(60, (Date.now() - ts) / 1000), n;
    if (s < 3600) { n = Math.round(s / 60); return n + " menit lalu"; }
    if (s < 86400) { n = Math.round(s / 3600); return n + " jam lalu"; }
    if (s < 86400 * 30) { n = Math.round(s / 86400); return n + " hari lalu"; }
    if (s < 86400 * 365) { n = Math.round(s / (86400 * 30)); return n + " bulan lalu"; }
    n = Math.floor(s / (86400 * 365)); var m = Math.round((s % (86400 * 365)) / (86400 * 30));
    return n + " tahun" + (m ? ", " + m + " bulan" : "") + " lalu";
  }
  var STATUS = { "Hadir": "hadir", "Tidak hadir": "tidak_hadir", "Masih Ragu": "masih_ragu" };
  function markSvg(slug) { // reuse the exact icon the original server rendered for that status
    var el = d.querySelector(".cui-item-comment:not(.cui-local-comment) .cui-post-author-" + slug);
    return el ? el.innerHTML : "";
  }
  function commentHTML(c) {
    var slug = STATUS[c.status] || "";
    return '<li class="comment depth-' + (c.parent ? 2 : 1) + ' cui-item-comment cui-local-comment" data-likes="0" id="cui-item-comment-' + c.id + '">' +
      '<div id="cui-comment-' + c.id + '" class="cui-comment cui-clearfix">' +
      '<div class="cui-comment-avatar"><img src="assets/img/tema-17-icon-1-1.png"> </div>' +
      '<div class="cui-comment-content"><div class="cui-comment-info">' +
      '<a class="cui-commenter-name" title="' + esc(c.name) + '">' + esc(c.name) + '</a>' +
      '<span class="cui-post-author-mark cui-post-author-' + slug + '">' + markSvg(slug) + '</span>' +
      '<span class="pres-local-badge" title="Ucapan ini ditulis setelah undangan diarsipkan dan hanya tersimpan di perangkat/browser ini.">tersimpan di perangkat ini</span>' +
      '</div><div class="cui-comment-text">' + autop(c.text) + '</div>' +
      '<div class="cui-comment-actions"><span class="cui-comment-time"><i class="far fa-clock"></i> ' + relTime(c.ts) + ' </span>' +
      (c.parent ? "" : '<a class="cui-reply-link" id="cui-reply-link-' + c.id + '" href="?comment_id=' + c.id + '&amp;post_id=' + POST_ID + '">Reply</a>') +
      '</div></div></div></li>';
  }

  /* ------------------------------------------------------------------ server stand-in */
  var archiveHTML = null; // the 236 archived comments, captured from the page itself
  function captureArchive() {
    if (archiveHTML === null) {
      var t = d.getElementById("cui-archive-" + POST_ID);
      archiveHTML = t ? t.innerHTML : "";
    }
    return archiveHTML;
  }
  function commentsResponse() {
    var $tmp = $("<ul>").html(captureArchive());
    var local = load(STORE_KEY);
    // local top-level wishes newest first, replies appended under their parent
    local.filter(function (c) { return !c.parent; }).sort(function (a, b) { return a.ts - b.ts; })
      .forEach(function (c) { $tmp.prepend(commentHTML(c)); });
    local.filter(function (c) { return c.parent; }).sort(function (a, b) { return a.ts - b.ts; })
      .forEach(function (c) {
        var $p = $tmp.find("#cui-item-comment-" + c.parent);
        if (!$p.length) return;
        if (!$p.children("ul.children").length) $p.append('<ul class="children"></ul>');
        $p.children("ul.children").append(commentHTML(c));
      });
    return $tmp.html();
  }
  function handle(url, data) {
    var q = typeof data === "string" ? parseQuery(data) : (data || {});
    if (/wp-comments-post\.php/.test(url)) {
      var name = (q.author || "").trim(), text = (q.comment || "").trim();
      if (!name || text.length < 2) return [200, "error"];
      var list = load(STORE_KEY);
      if (list.some(function (c) { return c.name === name && c.text === text; })) return [409, "duplicate"];
      var c = { id: 900000000 + Date.now() % 100000000, parent: parseInt(q.comment_parent || "0", 10) || 0,
                name: name, text: text, status: q.konfirmasi || "", ts: Date.now() };
      list.push(c);
      if (!save(STORE_KEY, list)) return [500, "error"];
      return [200, commentHTML(c)];
    }
    if (q.action === "get_comments") return [200, commentsResponse()];
    return [200, "0"]; // what admin-ajax.php answers for unknown actions
  }
  // A jQuery transport that answers every WordPress back-end request locally.
  $.ajaxTransport("+*", function (opts) {
    if (!/(admin-ajax\.php|wp-comments-post\.php|wp-json\/|wp-content\/plugins\/)/.test(opts.url || "")) return;
    return {
      send: function (_h, done) {
        var r = handle(opts.url, opts.data);
        // the original server took a moment; keep the plugin's loading state visible briefly
        w.setTimeout(function () { done(r[0], r[0] === 200 ? "success" : "error", { text: r[1] }); }, 350);
      },
      abort: function () {}
    };
  });

  /* ------------------------------------------------------------------ lightbox */
  function openLightbox(items, index) {
    var id = "elementor-lightbox-slideshow-preserved";
    $("#" + id).remove();
    var slides = items.map(function (it) {
      return '<div class="elementor-lightbox-item swiper-slide"><div class="swiper-zoom-container">' +
        '<img class="elementor-lightbox-image" src="' + esc(it.url) + '" alt="' + esc(it.title) + '" draggable="false"></div></div>';
    }).join("");
    var $dlg = $(
      '<div id="' + id + '" class="dialog-widget dialog-lightbox-widget dialog-type-buttons dialog-type-lightbox elementor-lightbox" role="dialog" aria-modal="true">' +
      '<div class="dialog-widget-content dialog-lightbox-widget-content">' +
      '<div class="dialog-header dialog-lightbox-header"></div>' +
      '<div class="dialog-message dialog-lightbox-message">' +
      '<div class="swiper elementor-slideshow__container">' +
      '<div class="elementor-slideshow__header elementor-lightbox-prevent-close">' +
      '<i class="eicon-share-arrow" role="button" tabindex="0" aria-label="Share"></i>' +
      '<i class="eicon-zoom-in-bold" role="button" tabindex="0" aria-label="Zoom"></i>' +
      '<i class="eicon-frame-expand" role="button" tabindex="0" aria-label="Fullscreen"></i>' +
      '<span class="elementor-slideshow__counter"></span>' +
      '<div class="elementor-slideshow__share-menu"><div class="elementor-slideshow__share-links">' +
      '<a class="pres-download" href="#" download><i class="eicon-download-bold"></i>Download image</a></div></div>' +
      '</div>' +
      '<div class="swiper-wrapper">' + slides + '</div>' +
      '<div class="elementor-swiper-button elementor-swiper-button-prev elementor-lightbox-prevent-close" role="button" tabindex="0" aria-label="Previous"><i class="eicon-chevron-left"></i></div>' +
      '<div class="elementor-swiper-button elementor-swiper-button-next elementor-lightbox-prevent-close" role="button" tabindex="0" aria-label="Next"><i class="eicon-chevron-right"></i></div>' +
      '<div class="elementor-slideshow__footer elementor-lightbox-prevent-close"><div class="elementor-slideshow__title"></div><div class="elementor-slideshow__description"></div></div>' +
      '</div></div>' +
      '<div class="dialog-close-button dialog-lightbox-close-button" role="button" tabindex="0" aria-label="Close"><i class="eicon-close"></i></div>' +
      '</div></div>').appendTo(d.body);
    var $c = $dlg.find(".elementor-slideshow__container");
    function update(i) {
      $c.find(".elementor-slideshow__counter").text((i + 1) + " / " + items.length);
      $c.find(".elementor-slideshow__title").text(items[i].title || "");
      $c.find(".pres-download").attr("href", items[i].url);
    }
    var sw = new w.Swiper($c[0], {
      initialSlide: index, loop: false, zoom: true, keyboard: { enabled: true },
      navigation: { prevEl: $c.find(".elementor-swiper-button-prev")[0], nextEl: $c.find(".elementor-swiper-button-next")[0] },
      on: { slideChange: function () { update(this.activeIndex); } }
    });
    update(index);
    $dlg.hide().fadeIn(300);
    function close() {
      if (d.fullscreenElement && d.exitFullscreen) d.exitFullscreen();
      $(d).off("keyup.preslb");
      $dlg.fadeOut(300, function () { sw.destroy(true, true); $dlg.remove(); });
    }
    $dlg.on("click", ".dialog-lightbox-close-button", close);
    $dlg.on("click", ".elementor-lightbox-item", function (e) {
      if (e.target === this) close(); else $c.toggleClass("elementor-slideshow--ui-hidden");
    });
    $dlg.on("click", ".eicon-zoom-in-bold, .eicon-zoom-out-bold", function () {
      var on = !$c.hasClass("elementor-slideshow--zoom-mode");
      $c.toggleClass("elementor-slideshow--zoom-mode", on);
      $(this).toggleClass("eicon-zoom-in-bold", !on).toggleClass("eicon-zoom-out-bold", on);
      on ? sw.zoom.in() : sw.zoom.out();
    });
    $dlg.on("click", ".eicon-frame-expand, .eicon-frame-minimize", function () {
      var on = !d.fullscreenElement;
      if (on && $dlg[0].requestFullscreen) $dlg[0].requestFullscreen(); else if (!on && d.exitFullscreen) d.exitFullscreen();
      $c.toggleClass("elementor-slideshow--fullscreen-mode", on);
      $(this).toggleClass("eicon-frame-expand", !on).toggleClass("eicon-frame-minimize", on);
    });
    $dlg.on("click", ".eicon-share-arrow", function (e) { e.stopPropagation(); $c.toggleClass("elementor-slideshow--share-mode"); });
    $dlg.on("click", ".elementor-slideshow__share-menu", function (e) { if (e.target === this) $c.removeClass("elementor-slideshow--share-mode"); });
    $(d).on("keyup.preslb", function (e) { if (e.key === "Escape") close(); });
  }
  $(d).on("click", "a[data-preserved-lightbox]", function (e) {
    e.preventDefault();
    var group = $(this).attr("data-preserved-lightbox");
    var $all = $('a[data-preserved-lightbox="' + group + '"]');
    var items = $all.map(function () { return { url: this.getAttribute("href"), title: this.getAttribute("data-elementor-lightbox-title") || "" }; }).get();
    openLightbox(items, $all.index(this));
  });

  /* ------------------------------------------------------------------ widgets */
  function inView(el, cb, margin) {
    if (!("IntersectionObserver" in w)) return cb();
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { io.disconnect(); cb(); } }); }, { rootMargin: margin || "0px" });
    io.observe(el);
  }
  $(function () {
    // Portrait mask: use the original if it loads, otherwise the reconstruction (see preservation.css)
    var masked = d.querySelector(".elementor-element-53b103b9 .elementor-widget-container img");
    if (masked) {
      var mi = getComputedStyle(masked).webkitMaskImage || getComputedStyle(masked).maskImage || "";
      var mu = (mi.match(/url\(["']?([^"')]+)["']?\)/) || [])[1];
      if (!mu) d.documentElement.classList.add("pres-mask-fallback");
      else { var t = new Image(); t.onerror = function () { d.documentElement.classList.add("pres-mask-fallback"); }; t.src = mu; }
    }

    // Counter widget (Elementor counter: numerator on first view)
    $('[data-preserved-widget="counter"] .elementor-counter-number').each(function () {
      var $n = $(this), el = this;
      inView(el, function () {
        if (!$.fn.numerator) { $n.text($n.data("to-value")); return; }
        $n.numerator({ toValue: $n.data("to-value"), fromValue: $n.data("from-value") || 0, duration: $n.data("duration") || 2000,
          delimiter: $n.data("delimiter") || "", rounding: 0 });
      }, "-50px");
    });

    // Gallery: images are already laid out (masonry geometry preserved from the save)
    $('[data-preserved-widget="gallery"] .e-gallery-image').addClass("e-gallery-image-loaded");

    // Video widget (YouTube "pilagest 2025"). Prefer a local copy if one has been added.
    $('[data-preserved-widget="video"] iframe[data-local-video]').each(function () {
      var ifr = this, src = ifr.getAttribute("data-local-video");
      var probe = d.createElement("video");
      probe.preload = "metadata"; probe.muted = true;
      probe.onloadedmetadata = function () {
        var v = d.createElement("video");
        v.className = "elementor-video"; v.src = src; v.controls = true; v.muted = true; v.loop = true;
        v.autoplay = true; v.playsInline = true; v.setAttribute("playsinline", "");
        ifr.parentNode.replaceChild(v, ifr);
      };
      probe.onerror = function () { /* keep the YouTube embed (needs internet) */ };
      probe.src = src;
    });

    // RSVP form (Elementor Pro form -> stored locally instead of the vendor's Google Sheet)
    $('[data-preserved-widget="form"] form').each(function () {
      var $f = $(this);
      $f.on("submit", function (e) {
        e.preventDefault();
        $f.find(".elementor-message").remove();
        var bad = $f.find("[required]").filter(function () {
          if (this.type === "radio") return !$f.find('[name="' + this.name + '"]:checked').length;
          return !String($(this).val() || "").trim();
        });
        $f.find(".elementor-error").removeClass("elementor-error");
        if (bad.length) {
          bad.closest(".elementor-field-group").addClass("elementor-error");
          bad[0].reportValidity && bad[0].reportValidity();
          return;
        }
        var entry = { ts: Date.now() };
        $f.serializeArray().forEach(function (p) { if (!/post_id|form_id|referer_title|queried_id/.test(p.name)) entry[p.name] = p.value; });
        var list = load(RSVP_KEY); list.push(entry); save(RSVP_KEY, list);
        var $btn = $f.find('[type="submit"]').addClass("elementor-form-waiting").prop("disabled", true);
        setTimeout(function () {
          $btn.removeClass("elementor-form-waiting").prop("disabled", false);
          $f.trigger("reset");
          $f.append('<div class="elementor-message elementor-message-success" role="alert">Your submission was successful.' +
            ' <span class="pres-local-note">(tersimpan di perangkat ini)</span></div>');
        }, 400);
      });
    });
  });

  /* ------------------------------------------------------------------ export helpers */
  // For whoever keeps this archive: window.exportLocalGuestbook() downloads any wishes
  // that were written in this browser after the site was archived.
  w.exportLocalGuestbook = function () {
    var blob = new Blob([JSON.stringify({ guestbook: load(STORE_KEY), rsvp: load(RSVP_KEY) }, null, 2)], { type: "application/json" });
    var a = d.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "april-ages-local-entries.json"; a.click();
  };
})(jQuery, window, document);
