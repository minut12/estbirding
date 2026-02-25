(function () {
  var KEY = "estbirding.speciesMeta.v1";

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
    return {
      name: name,
      ebirdCode: typeof raw?.ebirdCode === "string" ? raw.ebirdCode.trim() : "",
      avatarUrl: typeof raw?.avatarUrl === "string" ? raw.avatarUrl.trim() : "",
      rarityLevel: toRarityLevel(raw),
    };
  }

  function loadSpeciesMeta() {
    var raw = safeParse(localStorage.getItem(KEY));
    var out = {};
    Object.keys(raw).forEach(function (name) {
      out[name] = sanitize(name, raw[name] || {});
    });
    try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (e) {}
    return out;
  }

  function getSpeciesMeta(name) {
    var map = loadSpeciesMeta();
    return map[name] || { name: name, rarityLevel: "none" };
  }

  function rarityBadge(level) {
    if (level === "rare") return "R";
    if (level === "super") return "SR";
    if (level === "mega") return "MR";
    return "";
  }

  window.loadSpeciesMetaShared = loadSpeciesMeta;
  window.getSpeciesMetaShared = getSpeciesMeta;
  window.getRarityBadgeText = rarityBadge;
})();
