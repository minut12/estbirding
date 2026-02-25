(function () {
  var KEY = "estbirding.speciesMeta.v1";
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
    return {
      name: normalizeUiText(name),
      ebirdCode: typeof raw?.ebirdCode === "string" ? normalizeUiText(raw.ebirdCode) : "",
      avatarUrl: typeof raw?.avatarUrl === "string" ? normalizeUiText(raw.avatarUrl) : "",
      rarityLevel: rarityLevel,
    };
  }

  function loadSpeciesMeta() {
    var raw = safeParse(localStorage.getItem(KEY));
    var out = {};
    Object.keys(raw).forEach(function (name) {
      var clean = normalizeUiText(name);
      if (!clean) return;
      out[clean] = sanitize(clean, raw[name] || {});
    });
    try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (e) {}
    return out;
  }

  function getSpeciesMeta(name) {
    var map = loadSpeciesMeta();
    var clean = normalizeUiText(name);
    return map[clean] || { name: clean, rarityLevel: "none" };
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
  window.getRarityBadgeText = rarityBadge;
  window.getRarityBadgeHtml = rarityBadgeHtml;
  window.fixMojibake = fixMojibake;
  window.normalizeUiText = normalizeUiText;
})();
