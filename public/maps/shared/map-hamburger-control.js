(function () {
  function ensureStyles() {
    if (document.getElementById("mapHamburgerControlStyles")) return;
    var style = document.createElement("style");
    style.id = "mapHamburgerControlStyles";
    style.textContent = [
      ".map-hamburger-leaflet.leaflet-control{margin-top:8px;margin-left:12px;z-index:3000;}",
      ".map-hamburger-btn{width:44px;height:44px;display:flex;align-items:center;justify-content:center;",
      "border:1px solid #cbd5e1;background:#fff;border-radius:12px;cursor:pointer;",
      "box-shadow:0 6px 18px rgba(0,0,0,.12);font-size:22px;line-height:1;",
      "color:#111;-webkit-tap-highlight-color:transparent;}",
      ".map-hamburger-btn:focus{outline:2px solid #94a3b8;outline-offset:2px;}",
    ].join("");
    document.head.appendChild(style);
  }

  window.initMapHamburgerControl = function initMapHamburgerControl(opts) {
    if (!window.L || !opts || !opts.map || typeof opts.onClick !== "function") return null;
    ensureStyles();

    var Control = L.Control.extend({
      options: { position: "topleft" },
      onAdd: function () {
        var container = L.DomUtil.create("div", "leaflet-bar map-hamburger-leaflet");
        var button = L.DomUtil.create("button", "map-hamburger-btn", container);
        button.type = "button";
        button.title = opts.title || "Nimekiri";
        button.setAttribute("aria-label", opts.ariaLabel || "Nimekiri");
        button.innerHTML = opts.iconSvg || (
          '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
          '<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
          '</svg>'
        );

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);
        L.DomEvent.on(button, "click", function (ev) {
          L.DomEvent.preventDefault(ev);
          L.DomEvent.stopPropagation(ev);
          opts.onClick();
        });
        return container;
      },
    });

    var control = new Control();
    opts.map.addControl(control);
    return control;
  };
})();
