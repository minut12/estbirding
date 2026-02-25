(function () {
  function formatDateEE(input) {
    if (input === null || input === undefined || input === "") return "";
    if (typeof input === "number") {
      var dn = new Date(input);
      if (isNaN(dn.getTime())) return String(input);
      return String(dn.getDate()).padStart(2, "0") + "." + String(dn.getMonth() + 1).padStart(2, "0") + "." + dn.getFullYear();
    }
    if (Object.prototype.toString.call(input) === "[object Date]") {
      if (isNaN(input.getTime())) return "";
      return String(input.getDate()).padStart(2, "0") + "." + String(input.getMonth() + 1).padStart(2, "0") + "." + input.getFullYear();
    }
    var raw = String(input).trim();
    var m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[3] + "." + m[2] + "." + m[1];
    var d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
  }

  function formatAgeEE(lastLoadedAt, nowInput) {
    if (lastLoadedAt === null || lastLoadedAt === undefined || lastLoadedAt === "") return "";
    var loadedAt = Object.prototype.toString.call(lastLoadedAt) === "[object Date]" ? lastLoadedAt : new Date(lastLoadedAt);
    if (isNaN(loadedAt.getTime())) return formatDateEE(lastLoadedAt);
    var now = nowInput
      ? (Object.prototype.toString.call(nowInput) === "[object Date]" ? nowInput : new Date(nowInput))
      : new Date();
    if (isNaN(now.getTime())) return formatDateEE(lastLoadedAt);
    var diffMs = Math.max(0, now.getTime() - loadedAt.getTime());
    var minutes = Math.floor(diffMs / 60000);
    if (minutes < 60) return minutes + " min";
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + " h";
    var days = Math.floor(hours / 24);
    if (days < 7) return days + " d";
    return formatDateEE(loadedAt);
  }

  window.formatDateEE = formatDateEE;
  window.formatAgeEE = formatAgeEE;
})();
