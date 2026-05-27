(function () {
  var DEFAULT_KEY = "estbirding.speciesMeta.v1";
  var RARILIIN_KEY = "estbirding.rariliin.speciesMeta.v1";
  var USA_CO_KEY = "estbirding.usa_co.speciesMeta.v1";
  var USA_PA_KEY = "estbirding.usa_pa.speciesMeta.v1";
  var USA_I70_KEY = "estbirding.usa_i70.speciesMeta.v1";
  function fixMojibake(s) {
    var v = String(s || "");
    if (!/[\u00C3\u00C2\u00E2]/.test(v)) return v;
    try {
      var bytes = new Uint8Array(v.length);
      for (var i = 0; i < v.length; i++) bytes[i] = v.charCodeAt(i) & 255;
      var decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      return decoded || v;
    } catch (e) {
      return v;
    }
  }
  function normalizeUiText(s) {
    return fixMojibake(s).replace(/\uFFFD/g, "").trim();
  }

  function getStorageKey() {
    try {
      var path = String((window.location && window.location.pathname) || "");
      if (path.indexOf("/maps/rariliin/") >= 0) return RARILIIN_KEY;
      if (path.indexOf("/maps/usa-co/") >= 0) return USA_CO_KEY;
      if (path.indexOf("/maps/usa-pa/") >= 0) return USA_PA_KEY;
      if (path.indexOf("/maps/usa-i70/") >= 0) return USA_I70_KEY;
    } catch (e) {}
    return DEFAULT_KEY;
  }

  function safeParse(value) {
    if (!value) return {};
    try {
      var parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return parsed;
    } catch (e) {
      return {};
    }
  }

  function toRarityLevel(raw) {
    var v = raw && typeof raw.rarityLevel === "string" ? raw.rarityLevel : "";
    if (v === "rare" || v === "super" || v === "mega" || v === "none") return v;
    if (raw && raw.isRarity === true) return "rare";
    return "none";
  }

  function sanitize(name, raw) {
    var rarityLevel = toRarityLevel(raw);
    var scientificName = typeof raw?.scientificName === "string" ? normalizeUiText(raw.scientificName) : "";
    var rariliinCode = typeof raw?.rariliinCode === "string" ? normalizeUiText(raw.rariliinCode) : "";
    var notificationNote = typeof raw?.notificationNote === "string" ? normalizeUiText(raw.notificationNote) : "";
    return {
      name: normalizeUiText(name),
      ebirdCode: typeof raw?.ebirdCode === "string" ? normalizeUiText(raw.ebirdCode) : "",
      avatarUrl: typeof raw?.avatarUrl === "string" ? normalizeUiText(raw.avatarUrl) : "",
      scientificName: scientificName,
      rariliinCode: rariliinCode,
      notificationNote: notificationNote,
      rarityLevel: rarityLevel,
    };
  }

  function loadSpeciesMeta() {
    var raw = safeParse(localStorage.getItem(getStorageKey()));
    var out = {};
    Object.keys(raw).forEach(function (name) {
      var clean = normalizeUiText(name);
      if (!clean) return;
      out[clean] = sanitize(clean, raw[name] || {});
    });
    try { localStorage.setItem(getStorageKey(), JSON.stringify(out)); } catch (e) {}
    return out;
  }

  function getSpeciesMeta(name) {
    var map = loadSpeciesMeta();
    var clean = normalizeUiText(name);
    return map[clean] || { name: clean, rarityLevel: "none" };
  }

  function resolveSpeciesMeta(name) {
    var map = loadSpeciesMeta();
    var clean = normalizeUiText(name);
    var meta = map[clean] || { name: clean, rarityLevel: "none" };
    return {
      name: meta.name || clean,
      ebirdCode: meta.ebirdCode || "",
      avatarUrl: meta.avatarUrl || "",
      scientificName: meta.scientificName || "",
      rariliinCode: meta.rariliinCode || "",
      notificationNote: meta.notificationNote || "",
      rarityLevel: meta.rarityLevel || "none",
      resolvedKey: clean,
      found: !!map[clean],
    };
  }

  function rarityBadge(level) {
    if (level === "rare") return "R";
    if (level === "super") return "SR";
    if (level === "mega") return "MR";
    return "";
  }
  function rarityBadgeHtml(level) {
    var txt = rarityBadge(level);
    if (!txt) return "";
    var cls = level === "mega" ? "rarity-mega" : (level === "super" ? "rarity-super" : "rarity-rare");
    return '<span class="rarity-badge ' + cls + '">' + txt + '</span>';
  }

  window.loadSpeciesMetaShared = loadSpeciesMeta;
  window.getSpeciesMetaShared = getSpeciesMeta;
  window.resolveSpeciesMetaShared = resolveSpeciesMeta;
  window.getRariliinSpeciesMetaShared = resolveSpeciesMeta;
  window.getRarityBadgeText = rarityBadge;
  window.getRarityBadgeHtml = rarityBadgeHtml;
  window.fixMojibake = fixMojibake;
  window.normalizeUiText = normalizeUiText;
})();
