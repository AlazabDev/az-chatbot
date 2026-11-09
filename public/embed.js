/*!
 * عزبوت — كود تضمين الشات بوت في أي موقع.
 * الاستخدام:
 *   <script src="https://azabot.lovable.app/embed.js" defer></script>
 * خيارات إضافية على وسم السكربت:
 *   data-position="right|left"   موضع الزر العائم (الافتراضي: right)
 *   data-z-index="999999"        ترتيب الطبقة
 */
(function () {
  if (window.__azabotEmbedLoaded) return;
  window.__azabotEmbedLoaded = true;

  var script =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName("script");
      for (var i = all.length - 1; i >= 0; i--) {
        if (all[i].src && all[i].src.indexOf("embed.js") !== -1) return all[i];
      }
      return null;
    })();

  var origin = script ? new URL(script.src, location.href).origin : location.origin;
  var position = (script && script.getAttribute("data-position")) || "right";
  var zIndex = (script && script.getAttribute("data-z-index")) || "2147483000";

  // Keep every launcher state tightly bounded so the iframe never blocks the host page.
  var CLOSED = { width: "124px", height: "96px" };
  var EXPANDED = { width: "420px", height: "154px" };
  var OPEN_DESKTOP = { width: "420px", height: "min(680px, 92vh)" };

  var iframe = document.createElement("iframe");
  iframe.src = origin + "/embed";
  iframe.title = "عزبوت — المساعد الذكي";
  iframe.setAttribute("allow", "microphone; camera; clipboard-write; autoplay");
  iframe.setAttribute("allowtransparency", "true");
  iframe.style.cssText = [
    "position:fixed",
    "bottom:0",
    position === "left" ? "left:0" : "right:0",
    "border:0",
    "display:block",
    "overflow:hidden",
    "background:transparent",
    "color-scheme:normal",
    "z-index:" + zIndex,
    "width:" + CLOSED.width,
    "height:" + CLOSED.height,
    "max-width:100vw",
    "transition:width .2s ease,height .2s ease",
  ].join(";");

  function isMobile() {
    return window.innerWidth < 520;
  }

  function apply(state) {
    if (state === "collapsed") {
      iframe.style.width = CLOSED.width;
      iframe.style.height = CLOSED.height;
      return;
    }
    if (state === "expanded") {
      iframe.style.width = isMobile() ? "100vw" : EXPANDED.width;
      iframe.style.height = EXPANDED.height;
      return;
    }
    if (isMobile()) {
      iframe.style.width = "100vw";
      iframe.style.height = "100dvh";
    } else {
      iframe.style.width = OPEN_DESKTOP.width;
      iframe.style.height = OPEN_DESKTOP.height;
    }
  }

  var widgetState = "collapsed";
  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    var data = event.data;
    if (!data || data.source !== "azabot") return;
    if (
      data.type === "layout" &&
      (data.state === "collapsed" || data.state === "expanded" || data.state === "open")
    ) {
      widgetState = data.state;
    } else if (data.type === "open") widgetState = "open";
    else if (data.type === "close") widgetState = "collapsed";
    else if (data.type !== "ready") return;
    apply(widgetState);
  });

  window.addEventListener("resize", function () {
    apply(widgetState);
  });

  function mount() {
    document.body.appendChild(iframe);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
