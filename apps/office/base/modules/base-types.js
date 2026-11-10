/*
 * base-types.js  (BS5)
 * Field types, formatting, conversion, validation and auto-number helpers for Base.
 * No DOM. Safe to load in Node for helper tests.
 *   Types: text, number, date, bool (BS1) + choice, email, phone, link, currency, long, picture, id (BS5).
 * API: BaseTypes.TYPES, .ALL, .opts(), .label(type), .parseType(s), .isEmpty(f, v),
 *      .formatCurrency(v), .parseCurrency(s), .formatSearch(f, v), .hrefFor(v),
 *      .queryGroup(type), .sortType(type), .isNumeric(type),
 *      .defaultValue(f), .cast(v, toType), .convert(v, fromType, toType),
 *      .previewRetype(table, field, toType), .fillAutoIds(table, field),
 *      .nextId(field), .validate(table, field, value, rowId), .validateRow(table, row),
 *      .formatWarn(field, value), .previewText(f, v)
 */
(function (root) {
  var TYPES = {
    text: 1, number: 1, date: 1, bool: 1,
    choice: 1, email: 1, phone: 1, link: 1, currency: 1, long: 1, picture: 1, id: 1
  };
  var ALL = [
    { value: "text", label: "Text" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "bool", label: "Yes/No" },
    { value: "choice", label: "Choice" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone" },
    { value: "link", label: "Link" },
    { value: "currency", label: "Currency (₹)" },
    { value: "long", label: "Long text" },
    { value: "picture", label: "Picture" },
    { value: "id", label: "Auto-number ID" }
  ];
  var LABELS = {};
  ALL.forEach(function (o) { LABELS[o.value] = o.label; });

  function opts() { return ALL.slice(); }
  function label(t) { return LABELS[t] || "Text"; }
  function parseType(s) {
    s = String(s || "").trim().toLowerCase();
    if (!s || /^te?xt$/.test(s)) return "text";
    if (/^num/.test(s)) return "number";
    if (/^date/.test(s)) return "date";
    if (/^(yes|bool|y\/n|check)/.test(s)) return "bool";
    if (/^choice|^drop/.test(s)) return "choice";
    if (/^email|^e-mail/.test(s)) return "email";
    if (/^phone|^tel/.test(s)) return "phone";
    if (/^link|^url|^web/.test(s)) return "link";
    if (/^curr|^rupee|^inr|^₹/.test(s)) return "currency";
    if (/^long|^memo|^note/.test(s)) return "long";
    if (/^pic|^image|^photo/.test(s)) return "picture";
    if (/^id$|^auto|^serial/.test(s)) return "id";
    return TYPES[s] ? s : null;
  }
  function isNumeric(t) { return t === "number" || t === "currency" || t === "id"; }
  function queryGroup(t) {
    if (t === "currency" || t === "id") return "number";
    if (t === "email" || t === "phone" || t === "link" || t === "long") return "text";
    if (TYPES[t]) return t;
    return "text";
  }
  function sortType(t) { return isNumeric(t) ? "number" : (t === "bool" ? "bool" : "text"); }

  function isEmpty(f, v) {
    var t = f && f.type;
    if (t === "bool") return false;
    if (t === "number" || t === "currency" || t === "id") return v === "" || v == null || (typeof v === "number" && isNaN(v));
    if (t === "picture") return !v;
    return v == null || String(v).trim() === "";
  }

  function formatCurrency(v) {
    if (v === "" || v == null || isNaN(+v)) return "";
    try {
      return "₹" + Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (e) {
      var n = Number(v), s = (Math.round(n * 100) / 100).toFixed(2);
      return "₹" + s;
    }
  }
  function parseCurrency(s) {
    if (s === "" || s == null) return "";
    if (typeof s === "number") return isNaN(s) ? "" : s;
    var t = String(s).replace(/₹/g, "").replace(/,/g, "").trim();
    if (t === "") return "";
    var n = Number(t);
    return isNaN(n) ? null : n;
  }

  function formatSearch(f, v) {
    if (f.type === "bool") return v ? "yes" : "no";
    if (f.type === "picture") return "";
    if (f.type === "currency") {
      var n = (v === "" || v == null || isNaN(+v)) ? "" : String(+v);
      var pretty = formatCurrency(v);
      return (n + " " + pretty).trim();
    }
    if (f.type === "long") return String(v == null ? "" : v);
    return String(v == null ? "" : v);
  }

  function hrefFor(v) {
    v = String(v == null ? "" : v).trim();
    if (!v) return "";
    if (/^(javascript|data|vbscript|file):/i.test(v)) return "";
    if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
    if (v.indexOf("@") > 0 && v.indexOf(":") < 0 && v.indexOf(" ") < 0) return "mailto:" + v;
    if (/^\+?[\d\s().-]{7,}$/.test(v)) return "tel:" + v.replace(/\s+/g, "");
    return "https://" + v.replace(/^\/\//, "");
  }

  function defaultValue(f) {
    if (!f) return "";
    if (f.type === "id") return null;
    if (f.type === "bool") {
      if (f.def === true || f.def === "true" || /^yes$/i.test(String(f.def || ""))) return true;
      return false;
    }
    if (f.def == null || f.def === "") return f.type === "picture" ? "" : (isNumeric(f.type) ? "" : "");
    if (f.type === "currency" || f.type === "number") {
      var n = parseCurrency(f.def);
      return n == null ? "" : n;
    }
    return f.def;
  }

  function nextId(field) {
    var n = field && field.next;
    if (typeof n !== "number" || !isFinite(n) || n < 1) n = 1;
    n = Math.floor(n);
    if (field) field.next = n + 1;
    return n;
  }
  function fillAutoIds(table, field) {
    var n = 1;
    (table.rows || []).forEach(function (r) {
      if (!r.v) r.v = {};
      r.v[field.id] = n++;
    });
    field.next = n;
    return n;
  }

  function str(v) { return v == null ? "" : String(v); }
  function asBool(v) {
    if (v === true || v === false) return v;
    return /^(yes|true|y|1)$/i.test(String(v).trim());
  }

  /* Soft coerce a typed-in or imported value to a type (no "lost" flag). */
  function cast(v, toType) {
    if (toType === "number" || toType === "currency" || toType === "id") {
      if (v === "" || v == null) return "";
      var n = typeof v === "number" ? v : parseCurrency(v);
      return n == null || (typeof n === "number" && isNaN(n)) ? "" : n;
    }
    if (toType === "bool") return asBool(v);
    if (toType === "picture") return typeof v === "string" ? v : "";
    if (toType === "date") {
      var s = str(v).trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : (s === "" ? "" : s);
    }
    if (v === true) return "Yes";
    if (v === false) return "No";
    return v == null ? "" : String(v);
  }

  function convert(v, fromType, toType) {
    if (fromType === toType) return { value: v, lost: false };
    if (isEmpty({ type: fromType }, v) && toType !== "bool") return { value: toType === "bool" ? false : "", lost: false };
    if (toType === "picture") return { value: "", lost: !isEmpty({ type: fromType }, v) };
    if (fromType === "picture") return { value: "", lost: !!v };
    if (toType === "id") return { value: "", lost: false, fill: true };
    if (toType === "bool") {
      if (fromType === "bool") return { value: !!v, lost: false };
      var s = str(v).trim();
      if (s === "") return { value: false, lost: false };
      if (/^(yes|true|y|1|no|false|n|0)$/i.test(s)) return { value: asBool(s), lost: false };
      return { value: false, lost: true };
    }
    if (toType === "number" || toType === "currency") {
      if (fromType === "bool") return { value: v ? 1 : 0, lost: false };
      var n = typeof v === "number" ? v : parseCurrency(v);
      if (n == null || (typeof n === "number" && isNaN(n))) return { value: "", lost: !isEmpty({ type: fromType }, v) };
      return { value: n, lost: false };
    }
    if (toType === "date") {
      var d = str(v).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return { value: d, lost: false };
      return { value: "", lost: d !== "" };
    }
    /* to text-like: text, email, phone, link, long, choice */
    if (fromType === "bool") return { value: v ? "Yes" : "No", lost: false };
    if (fromType === "currency") return { value: isEmpty({ type: "currency" }, v) ? "" : String(v), lost: false };
    if (fromType === "number" || fromType === "id") return { value: v == null || v === "" ? "" : String(v), lost: false };
    return { value: str(v), lost: false };
  }

  function previewRetype(table, field, toType) {
    var total = 0, kept = 0, lost = 0, samples = [], fill = toType === "id";
    (table.rows || []).forEach(function (r) {
      var v = r.v ? r.v[field.id] : "";
      if (isEmpty(field, v) && field.type !== "bool") return;
      total++;
      var c = convert(v, field.type, toType);
      if (c.fill) { kept++; return; }
      if (c.lost) { lost++; if (samples.length < 3) samples.push(previewText(field, v)); }
      else kept++;
    });
    return { total: total, kept: kept, lost: lost, samples: samples, fill: fill };
  }

  function uniqueKey(f, v) {
    if (isNumeric(f.type)) return String(+v);
    return String(v == null ? "" : v).trim().toLowerCase();
  }
  function isDup(table, field, value, rowId) {
    if (!field.unique || isEmpty(field, value)) return false;
    var key = uniqueKey(field, value);
    return (table.rows || []).some(function (r) {
      if (rowId && r.id === rowId) return false;
      return !isEmpty(field, r.v && r.v[field.id]) && uniqueKey(field, r.v[field.id]) === key;
    });
  }

  var EMAIL = /^\S+@\S+\.\S+$/;
  function formatWarn(field, value) {
    if (isEmpty(field, value)) return "";
    var t = field.type, s = str(value).trim();
    if (t === "email") {
      return EMAIL.test(s) ? "" : "“" + field.name + "” does not look like an email address.";
    }
    if (t === "phone") {
      var digits = s.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15 ? "" : "“" + field.name + "” does not look like a phone number.";
    }
    if (t === "link") {
      if (/^(javascript|data|vbscript):/i.test(s)) return "“" + field.name + "” is not a safe link.";
      if (!hrefFor(s)) return "“" + field.name + "” does not look like a link.";
      if (/\s/.test(s) && !/^https?:\/\//i.test(s)) return "“" + field.name + "” does not look like a link.";
      var h = hrefFor(s);
      return h ? "" : "“" + field.name + "” does not look like a link.";
    }
    return "";
  }

  function validate(table, field, value, rowId) {
    var out = { error: "", warn: "", block: false };
    if (field.required && isEmpty(field, value)) {
      out.error = "“" + field.name + "” is required.";
    }
    if (field.unique && isDup(table, field, value, rowId)) {
      out.error = "“" + field.name + "” must be unique. That value is already used.";
      out.block = true;
    }
    var w = formatWarn(field, value);
    if (w) out.warn = w;
    return out;
  }
  function validateRow(table, row) {
    var errors = [], warns = [];
    (table.fields || []).forEach(function (f) {
      var r = validate(table, f, row.v ? row.v[f.id] : "", row.id);
      if (r.error) errors.push(r.error);
      if (r.warn) warns.push(r.warn);
    });
    return { errors: errors, warns: warns };
  }

  function previewText(f, v) {
    if (f.type === "bool") return v ? "Yes" : "No";
    if (f.type === "picture") return v ? "(picture)" : "—";
    if (f.type === "currency") return formatCurrency(v) || "—";
    if (f.type === "long") {
      var line = str(v).split(/\r?\n/)[0];
      return line === "" ? "—" : (line.length > 60 ? line.slice(0, 57) + "…" : line);
    }
    var s = str(v);
    if (s === "") return "—";
    return s.length > 60 ? s.slice(0, 57) + "…" : s;
  }

  function firstLine(v) {
    return str(v).split(/\r?\n/)[0];
  }

  var api = {
    TYPES: TYPES, ALL: ALL, opts: opts, label: label, parseType: parseType,
    isEmpty: isEmpty, isNumeric: isNumeric, queryGroup: queryGroup, sortType: sortType,
    formatCurrency: formatCurrency, parseCurrency: parseCurrency, formatSearch: formatSearch,
    hrefFor: hrefFor, defaultValue: defaultValue, nextId: nextId, fillAutoIds: fillAutoIds,
    cast: cast, convert: convert, previewRetype: previewRetype, formatWarn: formatWarn,
    validate: validate, validateRow: validateRow, previewText: previewText, firstLine: firstLine,
    uniqueKey: uniqueKey
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BaseTypes = api;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
