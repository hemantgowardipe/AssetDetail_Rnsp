(() => {
  "use strict";

  // Ceiling on how long first paint may be held for the summary tab's own data.
  // Past it the page shows with its loading placeholders: a slow or stalled API
  // must delay the page, never hide it.
  const PRELOAD_DATA_WAIT_MS = 2000;
  // The veil's own ceiling, above the data wait, so the two cannot deadlock.
  const PRELOAD_MAX_HOLD_MS = 4000;

  /*
   * Hide the UI until initialization finishes, so the static table markup in
   * AssetDetails.html does not flash up before the loaders replace it - the
   * "table appears, vanishes, comes back with data" sequence.
   *
   * QafLibrary.holdFirstPaint (library.js) is the shared implementation: it
   * injects the rule itself rather than trusting the <style> block in
   * AssetDetails.html's <head> (when the portal mounts only this page's body
   * markup that block never ships and the veil silently does nothing), and it
   * reveals the page on its own timeout so a stalled API can never leave it
   * hidden. The local fallback below keeps that guarantee if library.js is
   * missing.
   */
  const preloadVeil = createPreloadVeil();

  function createPreloadVeil() {
    if (window.QafLibrary && typeof window.QafLibrary.holdFirstPaint === "function") {
      return window.QafLibrary.holdFirstPaint({
        selectors: [".qaf-navdock", ".asset-serial-page"],
        timeout: PRELOAD_MAX_HOLD_MS
      });
    }
    return { release: () => {} };
  }

  function releasePreload() {
    preloadVeil.release();
  }

  function resolveApiBaseUrl() {
    function normalizeBaseUrl(value) {
      const text = String(value || "").trim().replace(/^['"]+|['"]+$/g, "");
      return text.replace(/\/+$/, "");
    }

    try {
      const raw = window.localStorage && window.localStorage.getItem("env");
      const direct = normalizeBaseUrl(raw);
      if (direct && !/^[\[{]/.test(direct)) return direct;

      const parsed = tryParseJson(raw);
      if (typeof parsed === "string") return normalizeBaseUrl(parsed);
      if (parsed && typeof parsed === "object") {
        return normalizeBaseUrl(
          parsed.baseUrl ||
            parsed.BaseUrl ||
            parsed.apiUrl ||
            parsed.API_BASE_URL ||
            parsed.url ||
            parsed.URL ||
            parsed.env ||
            ""
        );
      }
    } catch (_error) {
      // Keep API calls relative if env is unavailable.
    }
    return "";
  }

  const API_BASE_URL = resolveApiBaseUrl();
  const ASSET_OBJECT_ID = "EAsset_Master";
  const ASSET_FORM_OBJECT_ID = "5bf876e9-6038-4536-bf37-e39b74a171c3";
  const ASSET_MASTER_REPOSITORY = "EAsset_Master";
  const RELATIONSHIP_TYPE_REPOSITORY = "Relationship_Type";
  const FILTERED_LIST_PAGE_SIZE = 500;
  const PAGE_ACCESS_NEW_LP = ["11", "22-3", "22-1", "22-2"];
  const EDIT_ACCESS_NEW_LP = ["11", "22-3"];
  const SELECTED_ASSET_STORAGE_KEY = "asset-selected-for-serial-summary";
  const HISTORY_REPOSITORY = {
    repositoryName: "EAsset History",
    repositoryObjectKey: "EAsset_History"
  };
  const ALLOCATION_REPOSITORY = {
    repositoryName: "EAsset Allocation",
    repositoryObjectKey: "EAsset_Allocation"
  };
  const TICKETS_RNSP_NAME = "ASSET_TKT_REC_SMRY";
  const DEPENDENCY_RNSP_NAME = "Asset_Dependency";
  const ADD_RELATIONSHIP_TYPE_RNSP_NAME = "Asset_Dependency_Add_Relationship";
  const ASSET_DEPENDENCY_FILTER_RNSP_NAME = "Asset_Dependency_Filter";
  const ASSET_DEPENDENCY_EASSET_DATA_RNSP_NAME = "Asset_Dependency_EAsset_Data";
  /* Asset_Relationship repository — target of the Add Relationship save.
     Only the repository NAME is a constant: the objectID and every fieldID
     are read from that tenant's own object metadata at runtime, because
     both differ per tenant. */
  const ASSET_RELATIONSHIP_REPOSITORY = "Asset_Relationship";
  /* Internal-name candidates per logical field. Matching is done on a
     normalized token, so "SourceAsset", "Source Asset" and "source_asset"
     all resolve to the same field whatever the tenant named it. */
  const ASSET_RELATIONSHIP_FIELD_ALIASES = {
    relationshipId: [
      "RelationshipID",
      "Relationship ID",
      "AssetRelationshipID",
      "Asset Relationship ID",
      "RelationshipNo",
      "RelationshipNumber"
    ],
    sourceAsset: ["SourceAsset", "Source Asset", "SourceCI", "Source CI", "ParentAsset", "Parent Asset"],
    relationshipType: ["RelationshipType", "Relationship Type", "RelationType"],
    reverseRelationship: [
      "ReverseRelationship",
      "Reverse Relationship",
      "ReverseRelationshipType",
      "Reverse Relationship Type",
      "InverseRelationship",
      "Inverse Relationship"
    ],
    childAsset: [
      "ChildAsset",
      "Child Asset",
      "DestinationAsset",
      "Destination Asset",
      "DestinationCI",
      "Destination CI",
      "TargetAsset",
      "Target Asset"
    ]
  };
  const ALLOCATION_API_FIELD_LIST = [
    "RecordID",
    "Type",
    "Category",
    "AssetID",
    "Employee",
    "FromDate",
    "ToDate",
    "Remarks",
    "CreatedByName"
  ];
  const ui = {
    backLink: document.getElementById("backToAssetDetails"),
    tabs: Array.from(document.querySelectorAll(".asset-tab")),
    panels: Array.from(document.querySelectorAll(".tab-panel")),
    assetIdValue: document.getElementById("assetIdValue"),
    serialNumberValue: document.getElementById("serialNumberValue"),
    summarySections: document.getElementById("summarySections"),
    otherDetailContent: document.getElementById("otherDetailContent"),
    assetEditBtn: document.getElementById("assetEditBtn"),
    allocationSection: document.getElementById("allocationSection"),
    summaryTabRegion: document.getElementById("summaryTabRegion"),
    otherDetailCard: document.getElementById("otherDetailCard"),
    historyCard: document.getElementById("historyCard"),
    allocationTableHeadRow: document.getElementById("allocationTableHeadRow"),
    allocationTableBody: document.getElementById("allocationTableBody"),
    allocationTable: document.getElementById("allocationTable"),
    historyLogTableHeadRow: document.getElementById("historyLogTableHeadRow"),
    historyLogTableBody: document.getElementById("historyLogTableBody"),
    historyLogTable: document.getElementById("historyLogTable"),
    historyLogSection: document.getElementById("historyLogSection"),
    historyCommentModal: document.getElementById("historyCommentModal"),
    ticketsSection: document.getElementById("ticketsSection"),
    ticketsTableHeadRow: document.getElementById("ticketsTableHeadRow"),
    ticketsTableBody: document.getElementById("ticketsTableBody"),
    ticketsTable: document.getElementById("ticketsTable"),
    dependencyCard: document.getElementById("dependencyCard"),
    dependencyViewport: document.getElementById("dependencyViewport"),
    dependencyWorld: document.getElementById("dependencyWorld"),
    dependencyEdges: document.getElementById("dependencyEdges"),
    dependencyZoomLevel: document.getElementById("depZoomLevel"),
    dependencyEmptyState: document.getElementById("dependencyEmptyState"),
    dependencyLoadingState: document.getElementById("dependencyLoadingState"),
    depZoomIn: document.getElementById("depZoomIn"),
    depZoomOut: document.getElementById("depZoomOut"),
    depFitView: document.getElementById("depFitView"),
    dependencyViewButtons: Array.from(document.querySelectorAll("#depViewButtons .dep-view-btn")),
    addRelationshipBtn: document.getElementById("addRelationshipBtn"),
    addRelationshipModal: document.getElementById("addRelationshipModal"),
    relSourceCiValue: document.getElementById("relSourceCiValue"),
    relTypeRow: document.getElementById("relTypeRow"),
    relTypePanel: document.getElementById("relTypePanel"),
    relTypeTableBody: document.getElementById("relTypeTableBody"),
    relTypeSelectedValue: document.getElementById("relTypeSelectedValue"),
    relDestRow: document.getElementById("relDestRow"),
    relDestLabel: document.getElementById("relDestLabel"),
    relDestPanel: document.getElementById("relDestPanel"),
    relDestList: document.getElementById("relDestList"),
    relDestHint: document.getElementById("relDestHint"),
    relDestPageInfo: document.getElementById("relDestPageInfo"),
    relTypeFilterSelect: document.getElementById("relTypeFilterSelect"),
    relCategoryFilterSelect: document.getElementById("relCategoryFilterSelect"),
    relCancelBtn: document.getElementById("relCancelBtn"),
    relAddBtn: document.getElementById("relAddBtn")
  };
  const state = {
    employeeNameById: {},
    qafUserNameById: {},
    allocationRowsRaw: [],
    allocationSortState: { columnKey: null, columnIndex: null, direction: null },
    ticketsRowsRaw: [],
    ticketsColumns: [],
    ticketsSortState: { columnKey: null, columnIndex: null, direction: null },
    historyRowsRaw: [],
    historyColumns: [],
    historySortState: { columnKey: null, columnIndex: null, direction: null },
    otherDetailSectionsRaw: [],
    otherDetailSortStates: {},
    activeAllocationMenuRecordKey: null,
    allocationRepoContext: null,
    masterObjectMeta: null,
    latestDetailsForAllocation: null,
    allocationMenuPositionRaf: 0,
    pageDetails: null,
    currentUserIsAssetManager: false,
    tabLoaded: {
      summaryPanel: false,
      otherDetailPanel: false,
      historyPanel: false,
      dependencyPanel: false
    },
    tabLoadPromises: {
      summaryPanel: null,
      otherDetailPanel: null,
      historyPanel: null,
      dependencyPanel: null
    },
    dependencyRowsRaw: [],
    dependencyGraph: {
      nodes: [],
      edges: [],
      rootId: null,
      model: null,
      currentView: "hierarchy",
      scale: 1,
      panX: 0,
      panY: 0
    }
  };

  const ALLOCATION_GRID_COLUMNS = [
    { key: "Type", label: "Type", isDate: false },
    { key: "Category", label: "Category", isDate: false },
    { key: "Asset Name", label: "Asset Name", isDate: false },
    { key: "Employee", label: "Employee", isDate: false },
    { key: "From Date", label: "From Date", isDate: true },
    { key: "To Date", label: "To Date", isDate: true },
    { key: "Remarks", label: "Remarks", isDate: false },
    { key: "CreatedBy", label: "Created By", isDate: false }
  ];

  const ALLOCATION_ROW_ACTION_ITEMS = [
    { key: "view", label: "View", icon: "fa fa-eye" },
    { key: "edit", label: "Edit", icon: "fa fa-pencil" }
  ];

  let allocationGridEventsBound = false;
  let ticketsGridEventsBound = false;
  let historyGridEventsBound = false;
  let otherDetailGridEventsBound = false;

  const ALLOCATION_TABLE_RESIZE_KEY = "assetSerialAllocationTable";
  const TICKETS_TABLE_RESIZE_KEY = "assetSerialTicketsTable";
  const HISTORY_TABLE_RESIZE_KEY = "assetSerialHistoryLogTable";
  // Column set the audit log falls back to before (or without) a response - the
  // loading header, the empty state and renderHistoryGrid all read it, so the
  // header never changes shape between those states.
  const HISTORY_DEFAULT_COLUMNS = ["Asset", "Employees", "Action Date", "Status", "Comments"];
  const OTHER_DETAIL_TABLE_RESIZE_KEY_PREFIX = "assetSerialOtherDetailTable";
  /** Drag-resize clamp range for table columns, matching TABLE_COL_MAX_WIDTH /
   *  the 100px floor used by setupAssetReqColumnResize on the Requisition page. */
  const COLUMN_RESIZE_MIN_WIDTH = 90;
  const COLUMN_RESIZE_MAX_WIDTH = 640;
  const TICKETS_WRAP_MIN_LENGTH = 30;
  const HISTORY_COMMENT_MORE_MIN_LENGTH = 40;
  const TICKETS_DATE_ONLY_COLUMNS = ["Created Date"];

  function getUrlParamCaseInsensitive(name) {
    const params = new URLSearchParams(window.location.search || "");
    const target = String(name || "").toLowerCase();
    for (const [key, value] of params.entries()) {
      if (String(key || "").toLowerCase() === target) {
        return String(value || "").trim();
      }
    }
    return "";
  }

  function getQueryParams() {
    return {
      recordId: getUrlParamCaseInsensitive("recordId"),
      serialNumber: getUrlParamCaseInsensitive("serialNumber"),
      assetName: getUrlParamCaseInsensitive("assetName")
    };
  }

  function getStoredSelectedAsset() {
    try {
      const raw = sessionStorage.getItem(SELECTED_ASSET_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  function parseLookupLabel(value) {
    if (value == null) return "";
    const text = String(value).trim();
    if (!text) return "";
    const split = text.split(";#");
    return split.length > 1 ? String(split[1] || "").trim() : text;
  }

  function extractLookupId(value) {
    if (value == null) return "";
    const text = String(value).trim();
    if (!text) return "";
    const split = text.split(";#");
    return String(split[0] || "").trim();
  }

  function tryParseJson(input) {
    try {
      return JSON.parse(input);
    } catch (_error) {
      return null;
    }
  }

  function normalizeNewLpEntry(value) {
    return String(value == null ? "" : value)
      .trim()
      .replace(/^["']+|["']+$/g, "");
  }

  function readNewLpEntries() {
    if (window.QafNavDock && typeof window.QafNavDock.parseNewLpEntries === "function") {
      return window.QafNavDock.parseNewLpEntries();
    }

    let raw = "";
    try {
      raw = localStorage.getItem("NewLP") || "";
    } catch (_error) {
      raw = "";
    }

    if (!raw) {
      try {
        const userKeyRaw = localStorage.getItem("user_key");
        if (userKeyRaw) {
          const userKey = tryParseJson(userKeyRaw);
          if (userKey && userKey.NewLP != null) raw = userKey.NewLP;
        }
      } catch (_error2) {
        // Fall through.
      }
    }

    if (!raw) return [];

    if (Array.isArray(raw)) {
      return raw.map(normalizeNewLpEntry).filter(Boolean);
    }

    const asString = String(raw).trim();
    if (!asString) return [];

    const parsedJson = tryParseJson(asString);
    if (Array.isArray(parsedJson)) {
      return parsedJson.map(normalizeNewLpEntry).filter(Boolean);
    }

    return asString
      .split(",")
      .map(normalizeNewLpEntry)
      .filter(Boolean);
  }

  function hasAnyNewLp(entries, allowedList) {
    const list = Array.isArray(entries) ? entries : [];
    const allowed = Array.isArray(allowedList) ? allowedList : [];
    for (let i = 0; i < allowed.length; i += 1) {
      const needle = normalizeNewLpEntry(allowed[i]);
      if (!needle) continue;
      for (let j = 0; j < list.length; j += 1) {
        if (normalizeNewLpEntry(list[j]) === needle) return true;
      }
    }
    return false;
  }

  function buildUnauthorizedRedirectUrl() {
    let ma = "";
    try {
      ma = String(localStorage.getItem("ma") || "").trim();
    } catch (_error) {
      ma = "";
    }

    if (!ma) return "/not-found?unauthorized=un";

    if (!/^https?:\/\//i.test(ma)) {
      const protocol = (window.location && window.location.protocol) || "https:";
      ma = protocol + "//" + ma.replace(/^\/+/, "");
    }

    try {
      return new URL(ma).origin + "/not-found?unauthorized=un";
    } catch (_error2) {
      return "https://" + String(localStorage.getItem("ma") || "").replace(/^\/+/, "") + "/not-found?unauthorized=un";
    }
  }

  function isPageAuthorized() {
    return hasAnyNewLp(readNewLpEntries(), PAGE_ACCESS_NEW_LP);
  }

  if (!isPageAuthorized()) {
    window.location.replace(buildUnauthorizedRedirectUrl());
    return;
  }

  function getUserKeyPayload() {
    const parsed = tryParseJson(localStorage.getItem("user_key") || "");
    const parsedValue =
      parsed && typeof parsed.value === "string" ? tryParseJson(parsed.value) : parsed && parsed.value;
    return (
      (parsedValue && typeof parsedValue === "object" && parsedValue) ||
      (parsed && typeof parsed === "object" && parsed) ||
      {}
    );
  }

  function getCurrentEmployeeGuid() {
    const payload = getUserKeyPayload();
    return String(payload.employeeguid || payload.EmployeeGUID || "").trim().toLowerCase();
  }

  function canShowMasterEditButton() {
    const entries = readNewLpEntries();
    if (hasAnyNewLp(entries, EDIT_ACCESS_NEW_LP)) return true;
    if (hasAnyNewLp(entries, ["22-1"])) return false;
    if (hasAnyNewLp(entries, ["22-2"])) return Boolean(state.currentUserIsAssetManager);
    return false;
  }

  function getAuthHeaders() {
    const payload = getUserKeyPayload();
    return {
      "Content-Type": "application/json",
      employeeguid: payload.employeeguid || payload.EmployeeGUID || "",
      hrzemail: payload.hrzemail || payload.Email || "",
      hrzempid: payload.hrzempid || payload.EmployeeID || "",
      // Outbound request header only - NOT display formatting. Left as-is on
      // purpose: changing it may change what the API returns. Display conversion
      // is driven entirely by CS_SETTING.TimeZone (see the DATE / TIME ENGINE).
      lngs: payload.lngs || "Asia/Kolkata"
    };
  }

  async function fetchJson(url, signal) {
    const response = await fetch(url, {
      method: "POST",
      headers: getAuthHeaders(),
      signal
    });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }
    return response.json();
  }

  function getQafService() {
    try {
      if (window.QafService && typeof window.QafService.GetItems === "function") {
        return window.QafService;
      }
      if (
        window.parent &&
        window.parent !== window &&
        window.parent.QafService &&
        typeof window.parent.QafService.GetItems === "function"
      ) {
        return window.parent.QafService;
      }
    } catch (_error) {
      // Cross-frame access may be blocked.
    }
    return null;
  }

  function getQafPageService() {
    try {
      if (window.QafPageService) return window.QafPageService;
      if (window.parent && window.parent !== window && window.parent.QafPageService) {
        return window.parent.QafPageService;
      }
    } catch (_error) {
      // Cross-frame access may be blocked.
    }
    return null;
  }

  function promiseWithAbort(signal, promise) {
    if (!signal) return Promise.resolve(promise);
    if (signal.aborted) {
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
      signal.addEventListener("abort", onAbort, { once: true });
      Promise.resolve(promise)
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", onAbort));
    });
  }

  function syncBundleEnvUrl() {
    const base = String(API_BASE_URL || "").trim();
    if (!base) return "";
    try {
      window.localStorage.setItem("env", base);
      const qaf = getQafService();
      if (qaf && typeof qaf.SetEnvUrl === "function") {
        qaf.SetEnvUrl(base);
      }
    } catch (_error) {
      // Ignore storage errors.
    }
    return base;
  }

  async function apiGetItems(objectName, fieldList, whereClause, options, signal) {
    const fields = Array.isArray(fieldList)
      ? fieldList.map((field) => String(field || "").trim()).filter(Boolean)
      : [];
    const opts = options || {};
    const pageSize = opts.pageSize || FILTERED_LIST_PAGE_SIZE;
    const pageNumber = opts.pageNumber || 1;
    const orderBy = opts.orderBy || "";
    const isAscending = opts.isAscending !== false;
    const where = String(whereClause || "").trim();
    const params = new URLSearchParams({
      objectName,
      fieldList: fields.join(","),
      orderBy,
      whereClause: where,
      pageSize: String(pageSize),
      pageNumber: String(pageNumber),
      isAscending: String(isAscending)
    });

    if (where) {
      const qaf = getQafService();
      // Simple equality filters (e.g. AssetID='{guid}') match working portal/script.js behavior via bundle GetItems.
      if (qaf && typeof qaf.GetItems === "function" && /^[A-Za-z_][A-Za-z0-9_]*='[^']*'$/.test(where)) {
        try {
          return await promiseWithAbort(
            signal,
            qaf.GetItems(objectName, fields, pageSize, pageNumber, where, orderBy, isAscending)
          );
        } catch (error) {
          if (error && error.name === "AbortError") throw error;
        }
      }
      return fetchJson(`${API_BASE_URL}/api/GetRecordsForFields?${params.toString()}`, signal);
    }

    const qaf = getQafService();
    if (qaf && typeof qaf.GetItems === "function") {
      try {
        return await promiseWithAbort(
          signal,
          qaf.GetItems(objectName, fields, pageSize, pageNumber, "", orderBy, isAscending)
        );
      } catch (error) {
        if (error && error.name === "AbortError") throw error;
      }
    }
    return fetchJson(`${API_BASE_URL}/api/GetRecordsForFields?${params.toString()}`, signal);
  }

  async function apiObjectGet(objectID, signal) {
    const objectIdText = String(objectID || "").trim();
    if (!objectIdText) return null;
    const params = new URLSearchParams({ option: "object", objectID: objectIdText });
    const payload = await fetchJson(`${API_BASE_URL}/api/ObjectGet?${params.toString()}`, signal);
    const rows = normalizeRecords(payload);
    return rows[0] || (payload && typeof payload === "object" ? payload : null);
  }

  async function apiViewGet(objectID, signal) {
    const objectIdText = String(objectID || "").trim();
    if (!objectIdText) return [];
    const params = new URLSearchParams({ objectID: objectIdText });
    const payload = await fetchJson(`${API_BASE_URL}/api/ViewGet?${params.toString()}`, signal);
    return normalizeRecords(payload);
  }

  function looksLikeRecordRow(item) {
    if (!item || typeof item !== "object") return false;
    if (item.RecordID != null && String(item.RecordID).trim()) return true;
    if (Array.isArray(item.RecordFieldValues) && item.RecordFieldValues.length) return true;
    return false;
  }

  function deepFindRecordArray(value, depth, seen) {
    if (depth > 8 || value == null || typeof value !== "object") return null;
    if (seen.has(value)) return null;
    seen.add(value);
    if (Array.isArray(value)) {
      if (value.length && value.every((item) => looksLikeRecordRow(item))) return value;
      for (let i = 0; i < value.length; i += 1) {
        const inner = deepFindRecordArray(value[i], depth + 1, seen);
        if (inner) return inner;
      }
      return null;
    }
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
      const inner = deepFindRecordArray(value[keys[i]], depth + 1, seen);
      if (inner) return inner;
    }
    return null;
  }

  function normalizeRecords(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || payload === false) return [];
    const list =
      payload.data ||
      payload.Data ||
      payload.records ||
      payload.Records ||
      payload.result ||
      payload.Result ||
      payload.rows ||
      payload.Rows ||
      payload.items ||
      payload.Items ||
      payload.value ||
      payload.Value;
    if (Array.isArray(list)) return list;
    if (list && typeof list === "object" && Array.isArray(list.data)) return list.data;
    const deep = deepFindRecordArray(payload, 0, new Set());
    return Array.isArray(deep) ? deep : [];
  }

  function flattenRecord(row) {
    if (!row || typeof row !== "object") return {};
    const out = { ...row };
    const rfv = Array.isArray(row.RecordFieldValues) ? row.RecordFieldValues : [];
    for (let i = 0; i < rfv.length; i += 1) {
      const item = rfv[i] || {};
      const key = String(item.FieldInternalName || item.dsNm || item.dn || "").trim();
      if (!key) continue;
      const value = item.UGFieldValue ?? item.UGFfieldValue ?? item.FieldValue ?? item.Value ?? "";
      if (out[key] == null || out[key] === "") {
        out[key] = value;
      }
    }
    return out;
  }

  function getRecordIDFromRow(row) {
    if (!row || typeof row !== "object") return "";
    const direct = row.RecordID ?? row.RecordId ?? row.recordID ?? row.ID ?? row.id;
    if (direct != null && String(direct).trim()) return String(direct).trim();
    const values = Array.isArray(row.RecordFieldValues) ? row.RecordFieldValues : [];
    for (let i = 0; i < values.length; i += 1) {
      const item = values[i] || {};
      const fieldName = String(item.FieldInternalName || "").trim().toLowerCase();
      if (fieldName !== "recordid") continue;
      const value = item.UGFieldValue ?? item.UGFfieldValue ?? item.FieldValue ?? item.Value ?? "";
      const text = String(value || "").trim();
      if (text) return text;
    }
    return "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ==========================================================================
   * DATE / TIME ENGINE
   * --------------------------------------------------------------------------
   * Contract:
   *   - Every DateTime returned by any API is UTC.
   *   - The offset applied for display comes from LocalStorage CS_SETTING.TimeZone,
   *     e.g. "0d87b7dc-...;#(UTC+5:30) Chennai, Kolkata, Mumbai, New Delhi".
   *     Only the "(UTC+5:30)" part is used; the GUID and the display name are ignored.
   *   - The clock style comes from LocalStorage TimeFormat ("12 Hour" / "24 Hour").
   *   - Output is always DD/MM/YYYY, with hh:mm:ss AM/PM (12 Hour) or
   *     HH:mm:ss (24 Hour).
   *   - Fields flagged DateOnly:true by ObjectGet render the calendar date only,
   *     with NO offset applied (see formatUserDate).
   * There is no hardcoded timezone anywhere below.
   * ========================================================================== */

  // Used only when TimeFormat is absent or unreadable in LocalStorage.
  const DEFAULT_TIME_FORMAT_IS_24_HOUR = true;

  let userDateSettingsCache = null;

  function readLocalStorageValue(key) {
    try {
      if (!window.localStorage) return "";
      const value = window.localStorage.getItem(key);
      return value == null ? "" : String(value);
    } catch (_error) {
      return "";
    }
  }

  function stripWrappingQuotes(value) {
    return String(value == null ? "" : value)
      .trim()
      .replace(/^['"]+|['"]+$/g, "")
      .trim();
  }

  /**
   * Extracts the UTC offset from a timezone setting string.
   * Accepts "(UTC+5:30)", "(UTC+05:30)", "(UTC-8:00)", "(GMT+10:30)", "(UTC)".
   * Everything else in the string (GUID prefix, ";#", city names) is ignored.
   * @returns {number|null} offset in minutes, or null when none is present.
   */
  function parseUtcOffsetMinutes(rawTimeZone) {
    const text = stripWrappingQuotes(rawTimeZone);
    if (!text) return null;
    const match = /\(\s*(?:UTC|GMT)\s*([+-])\s*(\d{1,2})\s*(?:[:.]\s*(\d{1,2}))?\s*\)/i.exec(text);
    if (match) {
      const sign = match[1] === "-" ? -1 : 1;
      const hours = Number(match[2]) || 0;
      const minutes = match[3] != null ? Number(match[3]) || 0 : 0;
      const total = sign * (hours * 60 + minutes);
      return Number.isFinite(total) ? total : null;
    }
    // "(UTC)" / "(GMT)" with no signed offset means zero.
    if (/\(\s*(?:UTC|GMT)\s*\)/i.test(text)) return 0;
    return null;
  }

  /**
   * CS_SETTING may be stored as plain JSON, as a JSON string inside a JSON string,
   * or wrapped in a { value: ... } envelope. Returns every object worth inspecting.
   */
  function getCsSettingObjects() {
    const objects = [];
    try {
      let parsed = tryParseJson(readLocalStorageValue("CS_SETTING") || "");
      if (typeof parsed === "string") parsed = tryParseJson(parsed);
      if (parsed && typeof parsed === "object") {
        objects.push(parsed);
        if (typeof parsed.value === "string") {
          const inner = tryParseJson(parsed.value);
          if (inner && typeof inner === "object") objects.push(inner);
        } else if (parsed.value && typeof parsed.value === "object") {
          objects.push(parsed.value);
        }
      }
    } catch (_error) {
      // Ignore storage / parse issues and fall back to defaults.
    }
    return objects;
  }

  function pickCsSettingField(objects, names) {
    for (let i = 0; i < objects.length; i += 1) {
      const source = objects[i];
      if (!source || typeof source !== "object") continue;
      for (let n = 0; n < names.length; n += 1) {
        const value = source[names[n]];
        if (value != null && String(value).trim() !== "") return String(value);
      }
    }
    return "";
  }

  /** Reads (and memoises) the user's timezone offset and clock style. */
  function getUserDateSettings() {
    if (userDateSettingsCache) return userDateSettingsCache;

    const csObjects = getCsSettingObjects();

    let offsetMinutes = parseUtcOffsetMinutes(
      pickCsSettingField(csObjects, ["TimeZone", "timeZone", "Timezone", "timezone"])
    );
    // Fallbacks: raw CS_SETTING text (when it is not valid JSON), then a
    // standalone TimeZone key if the host app writes one.
    if (offsetMinutes == null) offsetMinutes = parseUtcOffsetMinutes(readLocalStorageValue("CS_SETTING"));
    if (offsetMinutes == null) offsetMinutes = parseUtcOffsetMinutes(readLocalStorageValue("TimeZone"));
    if (offsetMinutes == null) offsetMinutes = 0; // No setting configured -> show UTC as-is.

    let timeFormatRaw = stripWrappingQuotes(readLocalStorageValue("TimeFormat"));
    if (!timeFormatRaw) {
      timeFormatRaw = stripWrappingQuotes(pickCsSettingField(csObjects, ["TimeFormat", "timeFormat"]));
    }
    const is24Hour = timeFormatRaw ? /24/.test(timeFormatRaw) : DEFAULT_TIME_FORMAT_IS_24_HOUR;

    userDateSettingsCache = { offsetMinutes, is24Hour };
    return userDateSettingsCache;
  }

  /** Drops the memoised settings so the next render re-reads LocalStorage. */
  function invalidateUserDateSettings() {
    userDateSettingsCache = null;
  }

  // The "storage" event only fires for OTHER tabs. If the host app lets the user
  // change their timezone or clock style in THIS tab, it should call
  // window.AssetSerialDetails.refreshDateSettings() afterwards, then re-render.
  try {
    window.AssetSerialDetails = window.AssetSerialDetails || {};
    window.AssetSerialDetails.refreshDateSettings = invalidateUserDateSettings;
  } catch (_error) {
    // Ignore environments where the global is not writable.
  }

  try {
    // Fires when another tab changes the settings.
    window.addEventListener("storage", (event) => {
      const key = event && event.key;
      if (!key || key === "CS_SETTING" || key === "TimeFormat" || key === "TimeZone") {
        invalidateUserDateSettings();
      }
    });
  } catch (_error) {
    // Ignore environments without window events.
  }

  function padTwo(value) {
    return String(value).padStart(2, "0");
  }

  /**
   * Parses a DateTime value into the UTC instant it represents.
   * Supported inputs:
   *   - "M/D/YYYY h:mm:ss AM/PM"   month-first, e.g. "7/28/2026 5:14:39 AM"
   *   - "YYYY-MM-DDTHH:mm:ss"      no zone suffix -> treated as UTC
   *   - ISO strings with "Z" or an explicit +HH:mm / -HH:mm offset
   *   - "/Date(1690000000000)/"    .NET serialised dates
   *   - "DD/MM/YYYY HH:mm:ss"      display strings produced by this page
   *   - Date objects and epoch numbers
   * @returns {{date: Date, hasTime: boolean}|null}
   */
  function parseApiDateValue(input) {
    if (input == null || input === "") return null;

    if (input instanceof Date) {
      return Number.isNaN(input.getTime()) ? null : { date: input, hasTime: true };
    }
    if (typeof input === "number" && Number.isFinite(input)) {
      const fromEpoch = new Date(input);
      return Number.isNaN(fromEpoch.getTime()) ? null : { date: fromEpoch, hasTime: true };
    }

    const text = String(input).trim();
    if (!text) return null;

    // .NET: /Date(1690000000000)/ or /Date(1690000000000+0530)/
    const dotNet = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(text);
    if (dotNet) {
      const fromTicks = new Date(Number(dotNet[1]));
      return Number.isNaN(fromTicks.getTime()) ? null : { date: fromTicks, hasTime: true };
    }

    // ISO-8601: 2026-07-28T05:24:37 (bare = UTC), optionally with Z or an offset.
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,7}))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(
      text
    );
    if (iso) {
      const hasTime = iso[4] != null;
      const zone = iso[8] || "";
      if (zone) {
        // An explicit zone is authoritative; let the engine resolve it.
        const zoned = new Date(text.replace(" ", "T"));
        return Number.isNaN(zoned.getTime()) ? null : { date: zoned, hasTime };
      }
      const millis = iso[7] != null ? Number(String(iso[7]).slice(0, 3).padEnd(3, "0")) : 0;
      const utc = new Date(
        Date.UTC(
          Number(iso[1]),
          Number(iso[2]) - 1,
          Number(iso[3]),
          hasTime ? Number(iso[4]) : 0,
          iso[5] != null ? Number(iso[5]) : 0,
          iso[6] != null ? Number(iso[6]) : 0,
          millis
        )
      );
      return Number.isNaN(utc.getTime()) ? null : { date: utc, hasTime };
    }

    // Slash format, with or without a time part and AM/PM suffix.
    const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\s,]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(?:([AaPp])\.?[Mm]\.?)?)?$/.exec(
      text
    );
    if (slash) {
      const first = Number(slash[1]);
      const second = Number(slash[2]);
      const year = Number(slash[3]);

      // The API sends month-first (MM/DD/YYYY). A first component above 12 can
      // only be a day, which also lets this page's own DD/MM/YYYY display
      // strings round-trip correctly when grids re-parse them for sorting.
      const monthFirst = !(first > 12 && second <= 12);
      const month = monthFirst ? first : second;
      const day = monthFirst ? second : first;
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;

      const hasTime = slash[4] != null;
      let hours = hasTime ? Number(slash[4]) : 0;
      const minutes = slash[5] != null ? Number(slash[5]) : 0;
      const seconds = slash[6] != null ? Number(slash[6]) : 0;
      const meridiem = slash[7] ? slash[7].toLowerCase() : "";
      if (meridiem === "p" && hours < 12) hours += 12;
      if (meridiem === "a" && hours === 12) hours = 0;

      const utc = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
      if (Number.isNaN(utc.getTime())) return null;
      // Reject impossible calendar dates such as 31/02/2026.
      if (utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
      return { date: utc, hasTime };
    }

    const fallback = new Date(text);
    return Number.isNaN(fallback.getTime()) ? null : { date: fallback, hasTime: true };
  }

  /**
   * Converts a parsed UTC value into the calendar/clock parts to display.
   * @param {boolean} applyOffset false for DateOnly fields, where shifting the
   *        instant could roll the calendar date onto the previous or next day.
   */
  function getUserZoneParts(input, applyOffset) {
    const parsed = parseApiDateValue(input);
    if (!parsed) return null;
    // A value carrying no time component has no instant to shift.
    const shiftMinutes = applyOffset && parsed.hasTime ? getUserDateSettings().offsetMinutes : 0;
    const shifted = new Date(parsed.date.getTime() + shiftMinutes * 60000);
    if (Number.isNaN(shifted.getTime())) return null;
    return {
      day: shifted.getUTCDate(),
      month: shifted.getUTCMonth() + 1,
      year: shifted.getUTCFullYear(),
      hours: shifted.getUTCHours(),
      minutes: shifted.getUTCMinutes(),
      seconds: shifted.getUTCSeconds(),
      hasTime: parsed.hasTime
    };
  }

  /**
   * DateOnly output: DD/MM/YYYY.
   * The timezone offset is deliberately NOT applied here. A DateOnly value means
   * a calendar date rather than an instant, so shifting it could move
   * "28/07/2026" to the 27th or 29th for users on negative or large offsets.
   */
  function formatUserDate(input) {
    const parts = getUserZoneParts(input, false);
    if (!parts) return "";
    return `${padTwo(parts.day)}/${padTwo(parts.month)}/${parts.year}`;
  }

  /**
   * DateTime output, converted from UTC to the user's offset:
   *   12 Hour -> DD/MM/YYYY hh:mm:ss AM/PM
   *   24 Hour -> DD/MM/YYYY HH:mm:ss
   */
  function formatUserDateTime(input, includeSeconds = true) {
    const parts = getUserZoneParts(input, true);
    if (!parts) return "";
    const datePart = `${padTwo(parts.day)}/${padTwo(parts.month)}/${parts.year}`;
    const secondsPart = includeSeconds ? `:${padTwo(parts.seconds)}` : "";

    if (getUserDateSettings().is24Hour) {
      return `${datePart} ${padTwo(parts.hours)}:${padTwo(parts.minutes)}${secondsPart}`;
    }

    const meridiem = parts.hours >= 12 ? "PM" : "AM";
    const hour12 = parts.hours % 12 === 0 ? 12 : parts.hours % 12;
    return `${datePart} ${padTwo(hour12)}:${padTwo(parts.minutes)}${secondsPart} ${meridiem}`;
  }

  /** Returns the UTC instant for a value, for sorting and comparisons. */
  function tryParseDateValue(input) {
    const parsed = parseApiDateValue(input);
    return parsed ? parsed.date : null;
  }

  // Kept as an alias: every API DateTime is UTC, so there is no separate path.
  function tryParseUtcDateValue(input) {
    return tryParseDateValue(input);
  }

  function formatDisplayDateTime(input) {
    return formatUserDateTime(input, true);
  }

  function isDateFieldMeta(fieldMeta) {
    if (!fieldMeta || typeof fieldMeta !== "object") return false;
    return getFieldTypeToken(fieldMeta) === "dte";
  }

  function isFieldDateOnly(fieldMeta) {
    return Boolean(fieldMeta && fieldMeta.DateOnly === true);
  }

  function isCurrencyFieldMeta(fieldMeta) {
    return Boolean(fieldMeta && fieldMeta.IsCurrency === true);
  }

  function getStoredCurrencyIcon() {
    function normalizeIcon(value) {
      return String(value == null ? "" : value)
        .trim()
        .replace(/^['"]+|['"]+$/g, "");
    }

    try {
      const direct = normalizeIcon(readLocalStorageValue("CurrencyIcon"));
      if (direct) return direct;

      // Shares the CS_SETTING reader used by the date settings.
      const candidates = getCsSettingObjects();
      for (let i = 0; i < candidates.length; i += 1) {
        const icon = normalizeIcon(candidates[i].CurrencyIcon || candidates[i].currencyIcon);
        if (icon) return icon;
      }

      const userRaw = readLocalStorageValue("user_key");
      let userParsed = tryParseJson(userRaw || "");
      const userPayload =
        userParsed && typeof userParsed.value === "string"
          ? tryParseJson(userParsed.value)
          : userParsed && userParsed.value && typeof userParsed.value === "object"
            ? userParsed.value
            : userParsed && typeof userParsed === "object"
              ? userParsed
              : null;
      if (userPayload && typeof userPayload === "object") {
        const icon = normalizeIcon(userPayload.CurrencyIcon || userPayload.currencyIcon);
        if (icon) return icon;
      }
    } catch (_error) {
      // Ignore storage access issues.
    }
    return "";
  }

  function formatCurrencyFieldValue(raw, currencyIcon) {
    const text = String(raw == null ? "" : raw).trim();
    if (!text) return "";
    const icon = String(currencyIcon || "").trim();
    const normalized = text.replace(/,/g, "").trim();
    const amount = Number(normalized);
    if (Number.isFinite(amount)) {
      const formattedAmount = amount.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      return icon ? `${icon} ${formattedAmount}` : formattedAmount;
    }
    return icon ? `${icon} ${text}` : text;
  }

  function formatDateValueForDisplay(raw, options = {}) {
    const text = String(raw == null ? "" : raw).trim();
    if (!text || text === "-") return "";
    const label = String(options.label || options.columnLabel || "").trim();
    const internalName = String(options.internalName || "").trim();
    const objectMeta = options.objectMeta || null;
    const fieldMeta =
      internalName && objectMeta ? getObjectFieldMeta(objectMeta, internalName) : null;
    const isDate = isDateFieldMeta(fieldMeta) || isDateLikeFieldName(label);
    if (!isDate) return text;
    // Every API DateTime is UTC, so there is no longer a "forceUtc" distinction.
    if (isFieldDateOnly(fieldMeta)) {
      // ObjectGet DateOnly:true -> calendar date only, no time, no offset shift.
      return formatUserDate(text) || text;
    }
    return formatUserDateTime(text, options.includeSeconds === true) || text;
  }

  function isDateLikeFieldName(label) {
    const t = normalizeFieldToken(String(label || ""));
    if (!t) return false;
    if (t.includes("date")) return true;
    if (t.includes("datetime")) return true;
    if (t.includes("timestamp")) return true;
    const spaced = String(label || "").toLowerCase();
    if (/\breceived\s+on\b/.test(spaced)) return true;
    return false;
  }

  function formatDisplayIfDateLike(columnLabel, raw, options = {}) {
    return formatDateValueForDisplay(raw, {
      label: columnLabel,
      internalName: options.internalName,
      objectMeta: options.objectMeta,
      includeSeconds: options.includeSeconds
    });
  }

  function normalizePortalOrigin(value) {
    let text = String(value || "").trim().replace(/^['"]+|['"]+$/g, "");
    if (!text) return "";
    if (!/^https?:\/\//i.test(text)) {
      const protocol = (window.location && window.location.protocol) || "https:";
      text = `${protocol}//${text.replace(/^\/+/, "")}`;
    }
    try {
      return new URL(text).origin.replace(/\/+$/, "");
    } catch (_error) {
      return text.replace(/\/+$/, "");
    }
  }

  function resolveAttachmentBaseUrl() {
    try {
      const fromMa = normalizePortalOrigin(window.localStorage && window.localStorage.getItem("ma"));
      if (fromMa) return fromMa;
    } catch (_error) {
      // Ignore storage limitations.
    }
    return API_BASE_URL || "";
  }

  function getObjectFieldMeta(objectMeta, internalName) {
    const target = normalizeFieldToken(internalName);
    if (!target) return null;
    const fields = getObjectFields(objectMeta);
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i] || {};
      const internal = normalizeFieldInternalName(field);
      if (normalizeFieldToken(internal) !== target) continue;
      return field;
    }
    return null;
  }

  function getFieldTypeToken(fieldMeta) {
    if (!fieldMeta || typeof fieldMeta !== "object") return "";
    const candidates = [
      fieldMeta.DataType,
      fieldMeta.dataType,
      fieldMeta.FieldType,
      fieldMeta.fieldType,
      fieldMeta.Type,
      fieldMeta.type,
      fieldMeta.ControlType,
      fieldMeta.controlType,
      fieldMeta.ItemType,
      fieldMeta.itemType
    ];
    for (let i = 0; i < candidates.length; i += 1) {
      const token = normalizeFieldToken(candidates[i]);
      if (token) return token;
    }
    return "";
  }

  function isLinkOrAttachmentFieldMeta(fieldMeta) {
    const token = getFieldTypeToken(fieldMeta);
    if (!token) return false;
    if (token.includes("attachment")) return true;
    if (token.includes("fileupload")) return true;
    if (token === "link" || token.endsWith("link") || token.includes("hyperlink")) return true;
    if (token.includes("document") && !token.includes("documentid")) return true;
    return false;
  }

  function looksLikeAttachmentJsonValue(raw) {
    const text = String(raw == null ? "" : raw).trim();
    if (!text) return false;
    if (!/^[\[{]/.test(text) && !/"link"\s*:/i.test(text)) return false;
    return parseAttachmentList(text).length > 0;
  }

  function shouldRenderAsAttachmentField(raw, objectMeta, internalName) {
    if (isLinkOrAttachmentFieldMeta(getObjectFieldMeta(objectMeta, internalName))) return true;
    return looksLikeAttachmentJsonValue(raw);
  }

  function parseAttachmentList(rawValue) {
    const trimmed = String(rawValue == null ? "" : rawValue).trim();
    if (!trimmed) return [];

    const normalizeItem = (item) => {
      if (!item) return null;
      if (typeof item === "string") {
        const link = String(item || "").trim();
        return link ? { link, displayName: "" } : null;
      }
      if (typeof item !== "object") return null;
      const link = String(item.link || item.Link || item.url || item.Url || item.fileUrl || item.FileUrl || "").trim();
      if (!link) return null;
      return {
        link,
        displayName: String(item.displayName || item.DisplayName || item.name || item.Name || "").trim()
      };
    };

    const direct = typeof trimmed === "string" ? tryParseJson(trimmed) : trimmed;
    if (Array.isArray(direct)) {
      return direct.map(normalizeItem).filter(Boolean);
    }
    if (direct && typeof direct === "object") {
      const single = normalizeItem(direct);
      return single ? [single] : [];
    }

    const arrayStart = trimmed.indexOf("[");
    const arrayEnd = trimmed.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      const extracted = trimmed.slice(arrayStart, arrayEnd + 1);
      const extractedParsed = tryParseJson(extracted);
      if (Array.isArray(extractedParsed)) {
        return extractedParsed.map(normalizeItem).filter(Boolean);
      }
    }

    const linkMatch = trimmed.match(/"link"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (linkMatch && linkMatch[1]) {
      const displayMatch = trimmed.match(/"displayName"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
      return [
        {
          link: String(linkMatch[1]).replace(/\\"/g, '"').trim(),
          displayName: displayMatch && displayMatch[1] ? String(displayMatch[1]).replace(/\\"/g, '"').trim() : ""
        }
      ];
    }
    return [];
  }

  function getAttachmentFilenameFromLink(link) {
    const normalized = String(link || "").replace(/\\/g, "/").trim();
    if (!normalized) return "";
    const withoutQuery = normalized.split("?")[0];
    const parts = withoutQuery.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : normalized;
  }

  function buildAttachmentDownloadUrl(link) {
    const fileUrl = String(link || "").trim();
    if (!fileUrl) return "";
    if (/^https?:\/\//i.test(fileUrl) && /\/Attachment\/downloadfile\?/i.test(fileUrl)) {
      return fileUrl;
    }
    const base = resolveAttachmentBaseUrl() || window.location.origin;
    return `${String(base).replace(/\/+$/, "")}/Attachment/downloadfile?fileUrl=${encodeURIComponent(fileUrl)}`;
  }

  function buildAttachmentLinksHtml(rawValue) {
    const attachments = parseAttachmentList(rawValue);
    if (!attachments.length) return "N/A";

    const links = attachments
      .map((item) => {
        const link = String(item.link || "").trim();
        if (!link) return "";
        const displayName =
          String(item.displayName || "").trim() || getAttachmentFilenameFromLink(link) || link;
        const href = buildAttachmentDownloadUrl(link);
        if (!href || !displayName) return "";
        return `<a href="${escapeHtml(href)}" class="summary-attachment-link" target="_blank" rel="noopener noreferrer">${escapeHtml(
          displayName
        )}</a>`;
      })
      .filter(Boolean);

    return links.length ? links.join("<br>") : "N/A";
  }

  function formatFieldDisplayValue(raw, options = {}) {
    const label = String(options.label || options.columnLabel || "").trim();
    const internalName = String(options.internalName || "").trim();
    const objectMeta = options.objectMeta || null;
    const text = String(raw == null ? "" : raw).trim();

    if (shouldRenderAsAttachmentField(text, objectMeta, internalName)) {
      return { kind: "html", value: buildAttachmentLinksHtml(text) };
    }

    const display =
      label && text
        ? formatDisplayIfDateLike(label, text, {
            internalName,
            objectMeta,
            includeSeconds: options.includeSeconds
          })
        : label
          ? text || ""
          : "";

    if (options.applyCurrency && internalName && objectMeta && text) {
      const fieldMeta = getObjectFieldMeta(objectMeta, internalName);
      if (isCurrencyFieldMeta(fieldMeta)) {
        return { kind: "text", value: formatCurrencyFieldValue(text, getStoredCurrencyIcon()) };
      }
    }

    return { kind: "text", value: display };
  }

  function formatCellDisplayMarkup(raw, options = {}) {
    const formatted = formatFieldDisplayValue(raw, options);
    if (formatted.kind === "html") return formatted.value;
    return escapeHtml(formatted.value);
  }

  function applyFormattedFieldValue(element, formatted, hasLabel) {
    if (!element) return;
    if (!hasLabel) {
      element.textContent = "";
      return;
    }
    if (formatted.kind === "html") {
      element.innerHTML = formatted.value;
      return;
    }
    element.textContent = formatted.value || "";
  }

  function getValue(asset, keys) {
    if (!asset || !Array.isArray(keys) || !keys.length) return "";
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim();
      if (!key) continue;
      const direct = asset[key];
      if (direct == null) continue;
      const text = String(direct).trim();
      if (!text) continue;
      return parseLookupLabel(text);
    }
    return "";
  }

  /** Same key resolution as getValue(), but returns the value exactly as
   *  stored — keeping any "GUID;#DisplayValue" lookup prefix intact. */
  function getRawFieldValue(source, keys) {
    if (!source || !Array.isArray(keys) || !keys.length) return "";
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim();
      if (!key) continue;
      const direct = source[key];
      if (direct == null) continue;
      const text = String(direct).trim();
      if (!text) continue;
      return text;
    }
    return "";
  }

  function normalizeAssetDetails() {
    const params = getQueryParams();
    const storedAsset = getStoredSelectedAsset();
    const asset = storedAsset || {};
    const recordId = params.recordId || getValue(asset, ["__recordID"]) || getValue(asset, ["RecordID"]);
    const serialNumber =
      params.serialNumber ||
      getValue(asset, ["SerialNumber"]) ||
      getValue(asset, ["SerialNo."]);
    const assetName = params.assetName || getValue(asset, ["AssetName"]);

    return {
      asset,
      recordId,
      serialNumber,
      assetName
    };
  }

  function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    if (typeof value === "string") {
      const text = value.trim();
      if (!text) return [];
      if (text.startsWith("[") && text.endsWith("]")) {
        try {
          const parsed = JSON.parse(text);
          return Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
          return [];
        }
      }
    }
    return [];
  }

  function getAllocationValue(row, keys) {
    return getValue(row, keys);
  }

  function parseAssignedRecordIds(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value
        .map((entry) => entry && (entry.RecordID || entry.RecordId || entry.recordID || entry.ID || entry.id))
        .filter(Boolean)
        .map((id) => String(id).trim())
        .filter(Boolean);
    }
    const text = String(value).trim();
    if (!text) return [];
    if (text.startsWith("[") && text.endsWith("]")) {
      const parsed = tryParseJson(text);
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => entry && (entry.RecordID || entry.RecordId || entry.recordID || entry.ID || entry.id))
          .filter(Boolean)
          .map((id) => String(id).trim())
          .filter(Boolean);
      }
    }
    if (/^[0-9a-f-]{36}$/i.test(text)) return [text];
    return [];
  }

  async function fetchEmployeesMapByIds(recordIds, signal) {
    const uniqueIds = [...new Set((Array.isArray(recordIds) ? recordIds : []).filter(Boolean))];
    if (!uniqueIds.length) return {};
    const whereClause = uniqueIds
      .flatMap((id) => {
        const escaped = String(id).replace(/'/g, "''");
        return [
          `RecordID='${escaped}'`,
          `EmployeeGUID='${escaped}'`,
          `EmployeeID='${escaped}'`
        ];
      })
      .join("<OR>");
    try {
      const payload = await apiGetItems(
        "Employees",
        ["RecordID", "EmployeeID", "EmployeeGUID", "FirstName", "LastName"],
        whereClause,
        { pageSize: 100000 },
        signal
      );
      const rows = normalizeRecords(payload);
      return rows.reduce((acc, employee) => {
        const recordId = String((employee && employee.RecordID) || "").trim();
        const employeeGuid = String((employee && (employee.EmployeeGUID || employee.EmployeeGuid)) || "").trim();
        const employeeCode = String((employee && employee.EmployeeID) || "").trim();
        const fullName = `${employee.FirstName || ""} ${employee.LastName || ""}`.trim();
        const resolved = fullName || employeeCode || employeeGuid || recordId;
        if (recordId) acc[recordId] = resolved;
        if (employeeGuid) acc[employeeGuid] = resolved;
        if (employeeCode) acc[employeeCode] = resolved;
        return acc;
      }, {});
    } catch (_error) {
      return {};
    }
  }

  async function ensureEmployeeDirectoryForAllocation(rows, signal) {
    const ids = [];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const raw = getAllocationValueLoose(row, [
        "Employees",
        "Employee",
        "AssignedTo",
        "EmployeeName",
        "User",
        "Users"
      ]);
      parseAssignedRecordIds(raw).forEach((id) => ids.push(id));
    });
    const uniqueIds = [...new Set(ids)];
    const missingEmployees = uniqueIds.filter((id) => !state.employeeNameById[id]);
    if (missingEmployees.length) {
      const delta = await fetchEmployeesMapByIds(missingEmployees, signal);
      Object.assign(state.employeeNameById, delta);
    }
    const missingUsers = uniqueIds.filter((id) => !state.employeeNameById[id] && !state.qafUserNameById[id]);
    if (!missingUsers.length) return;
    const userDelta = await fetchQafUsersMapByIds(missingUsers, signal);
    Object.assign(state.qafUserNameById, userDelta);
  }

  async function ensureEmployeeDirectoryForSummary(asset, signal) {
    const ids = [];
    const directAssigned = getValue(asset, ["AssignedTo", "Assigned To", "Employee", "EmployeeName"]);
    parseAssignedRecordIds(directAssigned).forEach((id) => ids.push(id));
    const rfv = Array.isArray(asset && asset.RecordFieldValues) ? asset.RecordFieldValues : [];
    rfv.forEach((entry) => {
      const name = String(entry && (entry.FieldInternalName || entry.dsNm || entry.dn || "")).trim();
      if (!name) return;
      const token = normalizeFieldToken(name);
      if (token !== "assignedto" && token !== "assigned to" && token !== "employee") return;
      const raw = entry.UGFieldValue ?? entry.UGFfieldValue ?? entry.FieldValue ?? entry.Value ?? "";
      parseAssignedRecordIds(raw).forEach((id) => ids.push(id));
    });
    const missing = [...new Set(ids)].filter((id) => !state.employeeNameById[id]);
    if (!missing.length) return;
    const delta = await fetchEmployeesMapByIds(missing, signal);
    Object.assign(state.employeeNameById, delta);
  }

  async function fetchQafUsersMapByIds(recordIds, signal) {
    const uniqueIds = [...new Set((Array.isArray(recordIds) ? recordIds : []).filter(Boolean))];
    if (!uniqueIds.length) return {};
    const whereClause = uniqueIds
      .flatMap((id) => {
        const escaped = String(id).replace(/'/g, "''");
        return [
          `RecordID='${escaped}'`,
          `UserID='${escaped}'`,
          `EmployeeGUID='${escaped}'`,
          `EmployeeID='${escaped}'`
        ];
      })
      .join("<OR>");
    const objectNames = ["QAF_Users"];
    const fieldList = [
      "RecordID",
      "UserID",
      "EmployeeGUID",
      "EmployeeID",
      "FirstName",
      "LastName",
      "Name",
      "UserName",
      "DisplayName",
      "Email"
    ];
    for (let i = 0; i < objectNames.length; i += 1) {
      try {
        const payload = await apiGetItems(
          objectNames[i],
          fieldList,
          whereClause,
          { pageSize: 100000 },
          signal
        );
        const rows = normalizeRecords(payload);
        if (!rows.length) continue;
        const map = rows.reduce((acc, user) => {
          const recordId = String((user && user.RecordID) || "").trim();
          const userId = String((user && user.UserID) || "").trim();
          const employeeGuid = String((user && (user.EmployeeGUID || user.EmployeeGuid)) || "").trim();
          const employeeId = String((user && user.EmployeeID) || "").trim();
          const fullName = `${user.FirstName || ""} ${user.LastName || ""}`.trim();
          const resolved =
            fullName ||
            String(user.DisplayName || "").trim() ||
            String(user.Name || "").trim() ||
            String(user.UserName || "").trim() ||
            String(user.Email || "").trim() ||
            recordId ||
            userId ||
            employeeGuid ||
            employeeId;
          [recordId, userId, employeeGuid, employeeId].forEach((key) => {
            if (key) acc[key] = resolved;
          });
          return acc;
        }, {});
        if (Object.keys(map).length) return map;
      } catch (_error) {
        // Try next object name.
      }
    }
    return {};
  }

  async function ensureQafUsersDirectoryForSummary(asset, signal) {
    const ids = [];
    const direct = getValue(asset, ["AssetManager", "Asset Manager"]);
    parseAssignedRecordIds(direct).forEach((id) => ids.push(id));
    const rfv = Array.isArray(asset && asset.RecordFieldValues) ? asset.RecordFieldValues : [];
    rfv.forEach((entry) => {
      const label = String(entry && (entry.dsNm || entry.dn || entry.FieldName || entry.FieldInternalName || "")).trim();
      const token = normalizeFieldToken(label);
      if (token !== "asset manager" && token !== "assetmanager") return;
      const raw = entry.UGFieldValue ?? entry.UGFfieldValue ?? entry.FieldValue ?? entry.Value ?? "";
      parseAssignedRecordIds(raw).forEach((id) => ids.push(id));
    });
    const missing = [...new Set(ids)].filter((id) => !state.qafUserNameById[id]);
    if (!missing.length) return;
    let delta = await fetchQafUsersMapByIds(missing, signal);
    const unresolved = missing.filter((id) => !delta[id]);
    if (unresolved.length) {
      const employeesFallback = await fetchEmployeesMapByIds(unresolved, signal);
      delta = { ...delta, ...employeesFallback };
    }
    Object.assign(state.qafUserNameById, delta);
  }

  function collectAssetManagerIds(asset) {
    const ids = [];
    if (!asset || typeof asset !== "object") return ids;

    function pushLookupIds(rawValue) {
      const text = String(rawValue == null ? "" : rawValue).trim();
      if (!text) return;
      if (text.includes(";#")) {
        const lookupId = String(text.split(";#")[0] || "").trim();
        if (lookupId) ids.push(lookupId);
      }
      parseAssignedRecordIds(rawValue).forEach((id) => ids.push(id));
    }

    pushLookupIds(getValue(asset, ["AssetManager", "Asset Manager"]));
    const rfv = Array.isArray(asset.RecordFieldValues) ? asset.RecordFieldValues : [];
    rfv.forEach((entry) => {
      const label = String(entry && (entry.dsNm || entry.dn || entry.FieldName || entry.FieldInternalName || "")).trim();
      const token = normalizeFieldToken(label);
      if (token !== "asset manager" && token !== "assetmanager") return;
      const raw = entry.UGFieldValue ?? entry.UGFfieldValue ?? entry.FieldValue ?? entry.Value ?? "";
      pushLookupIds(raw);
    });

    return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  }

  async function fetchEmployeeGuidsForRecordIds(recordIds, signal) {
    const uniqueIds = [...new Set((Array.isArray(recordIds) ? recordIds : []).filter(Boolean))];
    const guids = new Set();
    if (!uniqueIds.length) return guids;

    uniqueIds.forEach((id) => {
      const normalized = String(id).trim().toLowerCase();
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
        guids.add(normalized);
      }
    });

    const whereClause = uniqueIds
      .flatMap((id) => {
        const escaped = String(id).replace(/'/g, "''");
        return [
          `RecordID='${escaped}'`,
          `UserID='${escaped}'`,
          `EmployeeGUID='${escaped}'`,
          `EmployeeID='${escaped}'`
        ];
      })
      .join("<OR>");

    const objectNames = ["QAF_Users", "Employees"];
    for (let i = 0; i < objectNames.length; i += 1) {
      const objectName = objectNames[i];
      const fieldList =
        objectName === "QAF_Users"
          ? ["RecordID", "UserID", "EmployeeGUID", "EmployeeID"]
          : ["RecordID", "EmployeeGUID", "EmployeeID"];
      try {
        const payload = await apiGetItems(objectName, fieldList, whereClause, { pageSize: 100000 }, signal);
        const rows = normalizeRecords(payload);
        rows.forEach((row) => {
          const employeeGuid = String((row && (row.EmployeeGUID || row.EmployeeGuid)) || "")
            .trim()
            .toLowerCase();
          if (!employeeGuid) return;
          const recordId = String((row && row.RecordID) || "").trim().toLowerCase();
          const userId = String((row && row.UserID) || "").trim().toLowerCase();
          const employeeId = String((row && row.EmployeeID) || "").trim().toLowerCase();
          [recordId, userId, employeeId, employeeGuid].forEach((key) => {
            if (!key) return;
            if (uniqueIds.some((id) => String(id).trim().toLowerCase() === key)) {
              guids.add(employeeGuid);
            }
          });
        });
      } catch (_error) {
        // Try next object name.
      }
    }

    return guids;
  }

  async function checkCurrentUserIsAssetManager(asset, signal) {
    const currentGuid = getCurrentEmployeeGuid();
    if (!currentGuid) return false;

    const managerIds = collectAssetManagerIds(asset);
    if (!managerIds.length) return false;

    for (let i = 0; i < managerIds.length; i += 1) {
      if (String(managerIds[i]).trim().toLowerCase() === currentGuid) return true;
    }

    const managerGuids = await fetchEmployeeGuidsForRecordIds(managerIds, signal);
    return managerGuids.has(currentGuid);
  }

  function formatAssignedToValue(rawValue) {
    const ids = parseAssignedRecordIds(rawValue);
    if (!ids.length) return parseLookupLabel(rawValue);
    const names = ids.map((id) => state.employeeNameById[id] || id).filter(Boolean);
    return names.join(", ");
  }

  function formatAssetManagerValue(rawValue) {
    const ids = parseAssignedRecordIds(rawValue);
    if (!ids.length) return parseLookupLabel(rawValue);
    const names = ids.map((id) => state.qafUserNameById[id] || id).filter(Boolean);
    return names.join(", ");
  }

  function getAllocationValueLoose(row, aliases) {
    const strict = getAllocationValue(row, aliases);
    if (strict) return strict;
    if (!row || typeof row !== "object") return "";
    const aliasTokens = (Array.isArray(aliases) ? aliases : [])
      .map((item) => normalizeFieldToken(item))
      .filter(Boolean);
    if (!aliasTokens.length) return "";
    const rowKeys = Object.keys(row);
    for (let i = 0; i < rowKeys.length; i += 1) {
      const key = rowKeys[i];
      const keyToken = normalizeFieldToken(key);
      if (!keyToken) continue;
      if (!aliasTokens.includes(keyToken)) continue;
      const value = row[key];
      const text = parseLookupLabel(value);
      if (String(text || "").trim()) return text;
    }
    return "";
  }

  function resolvePersonNameById(recordId) {
    const id = String(recordId || "").trim();
    if (!id) return "";
    return state.employeeNameById[id] || state.qafUserNameById[id] || "";
  }

  function formatAllocationEmployeeValue(rawValue) {
    const text = String(rawValue == null ? "" : rawValue).trim();
    if (!text) return "";
    if (/^[0-9a-f-]{36}$/i.test(text)) {
      return resolvePersonNameById(text) || text;
    }
    if (text.startsWith("[") && text.endsWith("]")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          const names = parsed
            .map((item) => {
              if (!item || typeof item !== "object") return "";
              const recordId = String(
                item.RecordID ||
                  item.RecordId ||
                  item.recordID ||
                  item.EmployeeGUID ||
                  item.EmployeeGuid ||
                  item.EmployeeID ||
                  item.ID ||
                  item.id ||
                  ""
              ).trim();
              return (
                String(
                  item.DisplayName ||
                    item.Name ||
                    item.EmployeeName ||
                    resolvePersonNameById(recordId) ||
                    recordId
                )
                  .trim()
              );
            })
            .filter(Boolean);
          if (names.length) return names.join(", ");
        }
      } catch (_error) {
        // Ignore parse failures and use raw text fallback.
      }
    }
    return parseLookupLabel(text);
  }

  function getAllocationRows(asset) {
    const candidates = [
      asset && asset.AssetAllocation,
      asset && asset.AssetAllocations,
      asset && asset.AllocationDetails,
      asset && asset.Allocations
    ];
    for (let i = 0; i < candidates.length; i += 1) {
      const arr = toArray(candidates[i]);
      if (arr.length) return arr;
    }
    return [];
  }

  async function resolveRepositoryContext(repositoryName, repositoryObjectKey, signal) {
    const candidates = [
      repositoryObjectKey,
      repositoryName,
      String(repositoryName || "").replace(/\s+/g, "_"),
      String(repositoryName || "").replace(/\s+/g, "")
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    for (let i = 0; i < candidates.length; i += 1) {
      try {
        const first = await apiObjectGet(candidates[i], signal);
        const objectID = String(
          (first && (first.ObjectID || first.ObjectId || first.InternalName || first.Name)) || candidates[i]
        ).trim();
        if (!objectID) continue;
        const fields = Array.isArray(first && first.Fields) ? first.Fields : [];
        const viewRows = await apiViewGet(objectID, signal);
        const viewID = String(((viewRows[0] || {}).ViewID) || "").trim();
        if (!viewID) continue;
        return { objectID, objectName: candidates[i], viewID, fields, object: first };
      } catch (_error) {
        // Try next candidate.
      }
    }
    return null;
  }

  function normalizeFieldLabel(text) {
    const value = String(text || "").trim();
    if (!value) return "";
    return value
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeFieldToken(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function resolveOtherDetailCellValue(row, column) {
    if (!row || !column) return "";
    const direct = row[column];
    if (direct != null && String(direct).trim() !== "") return String(direct);
    const target = normalizeFieldToken(column);
    if (!target) return "";
    const keys = Object.keys(row);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (normalizeFieldToken(key) !== target) continue;
      const value = row[key];
      if (value != null && String(value).trim() !== "") return String(value);
    }
    return "";
  }

  function pickFirstTextValue(record, keys) {
    if (!record || !Array.isArray(keys)) return "";
    for (let i = 0; i < keys.length; i += 1) {
      const key = String(keys[i] || "").trim();
      if (!key) continue;
      const value = record[key];
      if (value == null) continue;
      const text = String(value).trim();
      if (!text) continue;
      return text;
    }
    return "";
  }

  function buildParentFieldMapById(parentRecord) {
    const map = new Map();
    const fields = Array.isArray(parentRecord && parentRecord.RecordFieldValues)
      ? parentRecord.RecordFieldValues
      : [];
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i] || {};
      const fieldId = String(field.FieldID || field.FieldId || "").trim();
      if (!fieldId) continue;
      map.set(fieldId, field);
    }
    return map;
  }

  function inferChildRepositoryName(childLink, parentFieldMap) {
    const directName = pickFirstTextValue(childLink, [
      "ObjectName",
      "RepositoryName",
      "ChildObjectName",
      "FieldInternalName",
      "FieldName"
    ]);
    if (directName && !/recordfieldvalueschild/i.test(directName)) return parseLookupLabel(directName);

    const fieldId = String(childLink && (childLink.FieldID || childLink.FieldId) || "").trim();
    if (!fieldId) return "";
    const parentField = parentFieldMap.get(fieldId);
    if (!parentField) return "";
    const raw =
      parentField.UGFieldValue ??
      parentField.UGFfieldValue ??
      parentField.FieldValue ??
      parentField.Value ??
      "";
    return parseLookupLabel(raw);
  }

  function getChildLinks(parentRecord) {
    const candidates = [
      parentRecord && parentRecord.RecordFieldValuesChild,
      parentRecord && parentRecord.RecordFieldValueChild,
      parentRecord && parentRecord.ChildRecordFieldValues
    ];
    for (let i = 0; i < candidates.length; i += 1) {
      const rows = normalizeRecords(candidates[i]);
      if (rows.length) return rows;
      if (Array.isArray(candidates[i]) && candidates[i].length) return candidates[i];
    }
    return [];
  }

  function shouldHideOtherDetailField(label, internalName) {
    const ignore = new Set([
      "created by name",
      "created by",
      "last modified by",
      "modified by",
      "created date",
      "last modified date",
      "modified date",
      "createddate",
      "lastmodifieddate",
      "lastmodifiedby",
      "createdby"
    ]);
    const labelToken = normalizeFieldToken(label);
    const nameToken = normalizeFieldToken(internalName);
    return ignore.has(labelToken) || ignore.has(nameToken);
  }

  function toOtherDetailRowObject(flatChildRecord) {
    const rfv = Array.isArray(flatChildRecord && flatChildRecord.RecordFieldValues)
      ? flatChildRecord.RecordFieldValues
      : [];
    if (rfv.length) {
      const rowObj = {};
      rfv.forEach((entry) => {
        const label = normalizeFieldLabel(entry.dsNm || entry.dn || entry.FieldName || entry.FieldInternalName || "");
        const internalName = normalizeFieldLabel(entry.FieldInternalName || "");
        if (!label || shouldHideOtherDetailField(label, internalName)) return;
        const raw =
          entry.UGFieldValue ??
          entry.UGFfieldValue ??
          entry.FieldValue ??
          entry.Value ??
          "";
        const value = parseLookupLabel(raw);
        if (!String(value || "").trim()) return;
        rowObj[label] = value;
      });
      return rowObj;
    }

    const ignored = new Set([
      "RecordID",
      "RecordId",
      "ObjectID",
      "ObjectId",
      "ID",
      "id",
      "ParentRecordID",
      "ParentRecordId",
      "CreatedBy",
      "LastModifiedBy",
      "CreatedDate",
      "LastModifiedDate",
      "RecordFieldValues",
      "RecordFieldValuesChild",
      "RecordFieldValueChild"
    ]);
    const out = {};
    Object.keys(flatChildRecord || {})
      .filter((key) => !ignored.has(key))
      .forEach((key) => {
        const value = flatChildRecord[key];
        if (value == null || typeof value === "object") return;
        const text = parseLookupLabel(value);
        if (!String(text || "").trim()) return;
        const label = normalizeFieldLabel(key);
        if (!label || shouldHideOtherDetailField(label, key)) return;
        out[label] = text;
      });
    return out;
  }

  function getOtherDetailColumnsFromContext(repoContext) {
    const fields = Array.isArray(repoContext && repoContext.fields) ? repoContext.fields : [];
    const ignored = new Set(["recordid", "id", "parentrecordid"]);
    const columns = [];
    fields.forEach((field) => {
      const internalName = String(field.FieldInternalName || "").trim();
      const displayName = String(
        field.DisplayName || field.FieldName || field.Name || internalName
      ).trim();
      if (!displayName) return;
      if (ignored.has(normalizeFieldToken(internalName))) return;
      if (shouldHideOtherDetailField(displayName, internalName)) return;
      const label = normalizeFieldLabel(displayName);
      if (!label) return;
      if (!columns.includes(label)) columns.push(label);
    });
    return columns;
  }

  function getOtherDetailSectionKey(section, index) {
    const titleToken = normalizeFieldToken(section && section.title);
    return `otherDetail_${index}_${titleToken || "section"}`;
  }

  function getOtherDetailSortState(sectionKey) {
    return (
      state.otherDetailSortStates[sectionKey] || {
        columnKey: null,
        columnIndex: null,
        direction: null
      }
    );
  }

  function updateOtherDetailSortState(sectionKey, columnIndex, columnKey) {
    const current = getOtherDetailSortState(sectionKey);
    if (current.columnKey !== columnKey) {
      state.otherDetailSortStates[sectionKey] = { columnKey, columnIndex, direction: "asc" };
      return;
    }
    if (current.direction === "asc") {
      state.otherDetailSortStates[sectionKey] = { columnKey, columnIndex, direction: "desc" };
      return;
    }
    if (current.direction === "desc") {
      state.otherDetailSortStates[sectionKey] = { columnKey: null, columnIndex: null, direction: null };
      return;
    }
    state.otherDetailSortStates[sectionKey] = { columnKey, columnIndex, direction: "asc" };
  }

  function getSortedOtherDetailRows(rows, sectionKey) {
    const sourceRows = Array.isArray(rows) ? rows.slice() : [];
    const { columnKey, direction } = getOtherDetailSortState(sectionKey);
    if (!columnKey || !direction) return sourceRows;
    const multiplier = direction === "desc" ? -1 : 1;
    return sourceRows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const aValue = resolveOtherDetailCellValue(a.row, columnKey);
        const bValue = resolveOtherDetailCellValue(b.row, columnKey);
        const compared = compareTicketsSortValues(aValue, bValue, columnKey);
        if (compared !== 0) return compared * multiplier;
        return a.index - b.index;
      })
      .map((entry) => entry.row);
  }

  function renderOtherDetailSections(sections) {
    if (!ui.otherDetailContent) return;
    if (Array.isArray(sections)) {
      state.otherDetailSectionsRaw = sections;
    }
    const sectionsToRender = Array.isArray(sections) ? sections : state.otherDetailSectionsRaw || [];
    if (!sectionsToRender.length) {
      ui.otherDetailContent.innerHTML = '<p class="empty-note">No Record Found</p>';
      return;
    }
    ui.otherDetailContent.innerHTML = sectionsToRender
      .map((section, sectionIndex) => {
        const columns = Array.isArray(section.columns) && section.columns.length
          ? section.columns
          : ["Details"];
        const sectionKey = getOtherDetailSectionKey(section, sectionIndex);
        const sortState = getOtherDetailSortState(sectionKey);
        const activeKey = sortState.direction ? sortState.columnKey : null;
        const headerHtml = columns
          .map((column, columnIndex) => {
            const arrow =
              activeKey === column
                ? sortState.direction === "asc"
                  ? "↑"
                  : "↓"
                : "↕";
            return `<th class="is-sortable" data-other-detail-sort-index="${columnIndex}" data-other-detail-sort-key="${escapeHtml(
              column
            )}"><span class="th-label">${escapeHtml(column)}</span><span class="th-sort-icon" aria-hidden="true">${arrow}</span></th>`;
          })
          .join("");
        const sortedRows = getSortedOtherDetailRows(section.rows, sectionKey);
        const rowsHtml = sortedRows.length
          ? sortedRows
              .map(
                (row) =>
                  `<tr>${columns
                    .map((column) => {
                      const cellValue = resolveOtherDetailCellValue(row, column) || "";
                      const columnDef = Array.isArray(section.columnDefs)
                        ? section.columnDefs.find((entry) => entry.displayName === column)
                        : null;
                      const display = formatCellDisplayMarkup(cellValue, {
                        columnLabel: column,
                        internalName: columnDef && columnDef.internalName,
                        objectMeta: section.objectMeta
                      });
                      return `<td>${display}</td>`;
                    })
                    .join("")}</tr>`
              )
              .join("")
          : `<tr><td colspan="${columns.length}" class="history-log-empty">No Records Found</td></tr>`;
        return `
          <section class="other-detail-section">
            <h2 class="other-detail-title">${escapeHtml(section.title)}</h2>
            <div class="other-detail-table-wrap qaf-scrollbar-thin">
              <table class="other-detail-table" data-other-detail-section-key="${escapeHtml(
                sectionKey
              )}" data-resize-key="${OTHER_DETAIL_TABLE_RESIZE_KEY_PREFIX}_${sectionIndex}" aria-label="${escapeHtml(section.title)} details">
                <thead><tr>${headerHtml}</tr></thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </div>
          </section>
        `;
      })
      .join("");

    Array.from(ui.otherDetailContent.querySelectorAll(".other-detail-table")).forEach((table) => {
      refreshSerialGridTable(table);
    });
  }

  function onOtherDetailContentClick(event) {
    const sortHeader = event.target.closest("th[data-other-detail-sort-key]");
    if (!sortHeader) return;
    if (event.target.closest(".gt-col-resizer")) return;
    const table = sortHeader.closest(".other-detail-table");
    const sectionKey = table ? String(table.getAttribute("data-other-detail-section-key") || "").trim() : "";
    if (!sectionKey) return;
    const columnKey = sortHeader.getAttribute("data-other-detail-sort-key");
    const columnIndex = Number(sortHeader.getAttribute("data-other-detail-sort-index"));
    if (!columnKey || !Number.isFinite(columnIndex)) return;
    event.preventDefault();
    updateOtherDetailSortState(sectionKey, columnIndex, columnKey);
    renderOtherDetailSections(state.otherDetailSectionsRaw);
  }

  function bindOtherDetailGridEvents() {
    if (otherDetailGridEventsBound) return;
    otherDetailGridEventsBound = true;
    ui.otherDetailContent?.addEventListener("click", onOtherDetailContentClick);
  }

  function getObjectDisplayName(objectMeta, fallback) {
    return String(
      (objectMeta &&
        (objectMeta.DisplayName || objectMeta.ObjectDisplayName || objectMeta.Name || objectMeta.ObjectName)) ||
        fallback ||
        "Details"
    ).trim();
  }

  function getObjectInternalName(objectMeta, fallback) {
    return String(
      (objectMeta &&
        (objectMeta.InternalName ||
          objectMeta.ObjectName ||
          objectMeta.Name ||
          objectMeta.ObjectID ||
          objectMeta.ObjectId)) ||
        fallback ||
        ""
    ).trim();
  }

  function parseOSettings(rawSettings) {
    let parsed = rawSettings;
    for (let i = 0; i < 3 && typeof parsed === "string"; i += 1) {
      const next = tryParseJson(parsed);
      if (next == null) break;
      parsed = next;
    }
    if (Array.isArray(parsed)) return parsed.filter((item) => item && typeof item === "object");
    if (parsed && typeof parsed === "object") return [parsed];
    return [];
  }

  function getOSettingsSourcesFromObjectMeta(objectMeta) {
    const sources = [];
    getObjectFields(objectMeta).forEach((field) => {
      Object.keys(field || {}).forEach((key) => {
        if (normalizeFieldToken(key) !== "osettings") return;
        sources.push(field[key]);
      });
    });
    ["OSettings", "oSettings"].forEach((key) => {
      if (objectMeta && objectMeta[key] != null) sources.push(objectMeta[key]);
    });
    return sources;
  }

  function resolveMappedObjectsFromOSettings(objectMeta, categoryValue) {
    const category = parseLookupLabel(categoryValue);
    if (!category) return [];
    const categoryToken = normalizeFieldToken(category);
    const sources = getOSettingsSourcesFromObjectMeta(objectMeta);
    const mappedObjects = [];
    const seen = new Set();
    for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
      const settings = parseOSettings(sources[sourceIndex]);
      for (let i = 0; i < settings.length; i += 1) {
        const row = settings[i] || {};
        const keys = Object.keys(row);
        for (let j = 0; j < keys.length; j += 1) {
          if (normalizeFieldToken(keys[j]) !== categoryToken) continue;
          const mappedObject = parseLookupLabel(row[keys[j]]);
          const mappedToken = normalizeFieldToken(mappedObject);
          if (!mappedObject || seen.has(mappedToken)) continue;
          seen.add(mappedToken);
          mappedObjects.push(mappedObject);
        }
      }
    }
    return mappedObjects;
  }

  async function loadOtherDetailSectionForObject(mappedObjectName, assetRecordId) {
    const relatedObjectMeta = await apiObjectGet(mappedObjectName);
    if (!relatedObjectMeta) return null;
    const relatedObjectName = getObjectInternalName(relatedObjectMeta, mappedObjectName);
    const columns = getRelatedObjectColumns(relatedObjectMeta);
    if (!columns.length) return null;
    const relatedFieldList = [
      ...new Set([...columns.map((column) => column.internalName), "ParentRecordID"])
    ];
    const relatedPayload = await apiGetItems(
      relatedObjectName || mappedObjectName,
      relatedFieldList,
      `ParentRecordID='${escapeWhereValue(assetRecordId)}'`,
      { pageSize: FILTERED_LIST_PAGE_SIZE, pageNumber: 1 }
    );
    const rows = toOtherDetailsMappedRows(
      normalizeRecords(relatedPayload)
        .map((row) => flattenRecord(row))
        .filter((row) => fieldContainsRecordId(row, ["ParentRecordID", "ParentRecordId"], assetRecordId)),
      columns
    );
    return {
      title: getObjectDisplayName(relatedObjectMeta, mappedObjectName),
      objectMeta: relatedObjectMeta,
      columnDefs: columns,
      columns: columns.map((column) => column.displayName),
      rows
    };
  }

  function getRelatedObjectColumns(objectMeta) {
    return getObjectFields(objectMeta)
      .map((field) => {
        const internalName = normalizeFieldInternalName(field);
        const displayName = normalizeFieldLabel(
          field.DisplayName || field.FieldName || field.Name || internalName
        );
        return { internalName, displayName };
      })
      .filter((column) => {
        if (!column.internalName || !column.displayName) return false;
        const token = normalizeFieldToken(column.internalName);
        return token !== "recordid" && token !== "parentrecordid" && !shouldHideOtherDetailField(column.displayName, column.internalName);
      });
  }

  function toOtherDetailsMappedRows(records, columns) {
    return (Array.isArray(records) ? records : []).map((record) => {
      const flat = flattenRecord(record);
      const row = {};
      columns.forEach((column) => {
        const value = getSummaryValue(flat, column.internalName);
        row[column.displayName] = value ? String(value).trim() : "";
      });
      return row;
    });
  }

  async function loadOtherDetails(details) {
    if (!ui.otherDetailContent) return;
    bindOtherDetailGridEvents();
    ui.otherDetailContent.innerHTML = '<p class="empty-note">Loading...</p>';
    const assetRecordId = String(details.recordId || "").trim();
    if (!assetRecordId) {
      renderOtherDetailSections([]);
      return;
    }

    try {
      const masterRowsPayload = await apiGetItems(
        ASSET_MASTER_REPOSITORY,
        ["RecordID", "Category", "SubCategory", "ObjectID"],
        buildRecordIdWhereClause(assetRecordId),
        { pageSize: 1, pageNumber: 1 },
      );
      const masterRow = flattenRecord(normalizeRecords(masterRowsPayload)[0] || {});
      if (!Object.keys(masterRow).length) {
        renderOtherDetailSections([]);
        return;
      }
      const parentObjectMeta = await apiObjectGet(ASSET_MASTER_REPOSITORY);
      const mappingValue = parseLookupLabel(masterRow.SubCategory) ? masterRow.SubCategory : masterRow.Category;
      const mappedObjectNames = resolveMappedObjectsFromOSettings(parentObjectMeta, mappingValue);
      if (!mappedObjectNames.length) {
        renderOtherDetailSections([]);
        return;
      }
      const sections = [];
      for (let i = 0; i < mappedObjectNames.length; i += 1) {
        const section = await loadOtherDetailSectionForObject(mappedObjectNames[i], assetRecordId).catch(() => null);
        if (section) sections.push(section);
      }
      renderOtherDetailSections(sections);
    } catch (_error) {
      renderOtherDetailSections([]);
    }
  }

  function isHistoryRowForAsset(row, details) {
    const recordId = String(details.recordId || "").trim();
    const serial = String(details.serialNumber || "").trim().toLowerCase();
    const candidates = [
      row.Asset,
      row.AssetID,
      row.EAsset,
      row.EAssetMaster,
      row["EAsset Master"],
      row.RecordID,
      row.SerialNumber,
      row["SerialNo."],
      row.SerialNo
    ];
    const hasRecordMatch = recordId
      ? candidates.some((value) => {
          const id = extractLookupId(value);
          return id === recordId || String(value || "").includes(recordId);
        })
      : false;
    if (hasRecordMatch) return true;
    if (!serial) return false;
    return candidates.some((value) => String(parseLookupLabel(value || "")).trim().toLowerCase() === serial);
  }

  function toTimestamp(raw) {
    const d = tryParseDateValue(raw);
    if (!d) return 0;
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  function buildDynamicColumnsFromRows(rows, preferredOrder) {
    const preferred = Array.isArray(preferredOrder) ? preferredOrder : [];
    const ordered = [];
    const pushUnique = (label) => {
      const normalized = normalizeFieldToken(label);
      if (!normalized) return;
      const exists = ordered.some((item) => normalizeFieldToken(item) === normalized);
      if (!exists) ordered.push(label);
    };
    preferred.forEach(pushUnique);
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      Object.keys(row || {}).forEach((key) => pushUnique(normalizeFieldLabel(key)));
    });
    return ordered;
  }

  function buildDynamicColumnsFromRowKeys(rows, preferredOrder) {
    const preferred = Array.isArray(preferredOrder) ? preferredOrder : [];
    const ordered = [];
    const pushUnique = (key) => {
      const text = String(key || "").trim();
      if (!text) return;
      const exists = ordered.some((item) => normalizeFieldToken(item) === normalizeFieldToken(text));
      if (!exists) ordered.push(text);
    };
    preferred.forEach(pushUnique);
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      Object.keys(row || {}).forEach((key) => pushUnique(key));
    });
    return ordered;
  }

  function normalizeFieldInternalName(field) {
    return String(
      field &&
        (field.InternalName ||
          field.FieldInternalName ||
          field.Name ||
          field.FieldName ||
          field.DisplayName ||
          field)
    ).trim();
  }

  function getObjectFields(objectMeta) {
    return Array.isArray(objectMeta && objectMeta.Fields) ? objectMeta.Fields : [];
  }

  function getFieldDisplayName(objectMeta, internalName) {
    const target = normalizeFieldToken(internalName);
    const fields = getObjectFields(objectMeta);
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i] || {};
      const internal = normalizeFieldInternalName(field);
      if (normalizeFieldToken(internal) !== target) continue;
      return normalizeFieldLabel(field.DisplayName || field.FieldName || field.Name || internalName);
    }
    return normalizeFieldLabel(internalName);
  }

  function parseSectionsField(rawSections) {
    const parsed = typeof rawSections === "string" ? tryParseJson(rawSections) : rawSections;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return Object.values(parsed).filter((item) => item && typeof item === "object");
    return [];
  }

  function normalizeColumnsData(columnsData) {
    if (!columnsData || typeof columnsData !== "object") return [];
    return Object.keys(columnsData)
      .sort((a, b) => {
        const order = ["first", "second", "third", "fourth", "fifth"];
        const ai = order.indexOf(String(a).toLowerCase());
        const bi = order.indexOf(String(b).toLowerCase());
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        return String(a).localeCompare(String(b));
      })
      .map((key) => ({
        key,
        fields: toArray(columnsData[key])
          .map((field) => String(field || "").trim())
          .filter(Boolean)
      }))
      .filter((column) => column.fields.length);
  }

  function getSectionId(section) {
    return String(section && (section.id || section.Id || section.ID) || "").trim();
  }

  function isChildTableFieldMeta(field) {
    const dataType = String(field && (field.DataType || field.dataType) || "")
      .trim()
      .toUpperCase();
    return dataType === "TBL";
  }

  function getChildTableFieldNameTokens(objectMeta) {
    const tokens = new Set();
    getObjectFields(objectMeta).forEach((field) => {
      if (!isChildTableFieldMeta(field)) return;
      const token = normalizeFieldToken(normalizeFieldInternalName(field));
      if (token) tokens.add(token);
    });
    return tokens;
  }

  function filterSummarySectionColumns(columns, objectMeta) {
    const childTableTokens = getChildTableFieldNameTokens(objectMeta);
    return (Array.isArray(columns) ? columns : [])
      .map((column) => ({
        ...column,
        fields: (Array.isArray(column.fields) ? column.fields : [])
          .map((field) => String(field || "").trim())
          .filter((field) => field && !childTableTokens.has(normalizeFieldToken(field)))
      }))
      .filter((column) => column.fields.length);
  }

  function getSectionFieldNamesFromObjectMeta(objectMeta, sectionId) {
    const target = String(sectionId || "").trim().toLowerCase();
    if (!target) return [];
    return getObjectFields(objectMeta)
      .filter((field) => {
        if (field && field.IsFramework === true) return false;
        if (isChildTableFieldMeta(field)) return false;
        const fieldSectionId = String(field.SectionID || field.SectionId || field.sectionID || "").trim().toLowerCase();
        return fieldSectionId === target;
      })
      .sort(
        (a, b) =>
          Number(a.FormSequence ?? a.formSequence ?? 0) - Number(b.FormSequence ?? b.formSequence ?? 0)
      )
      .map((field) => normalizeFieldInternalName(field))
      .filter(Boolean);
  }

  function buildColumnsFromSectionFields(fieldNames, columnCount) {
    const names = (Array.isArray(fieldNames) ? fieldNames : [])
      .map((field) => String(field || "").trim())
      .filter(Boolean);
    if (!names.length) return [];
    const count = Math.max(1, Number(columnCount) || 1);
    if (count <= 1) return [{ key: "first", fields: names }];
    const columnKeys = ["first", "second", "third", "fourth", "fifth"].slice(0, count);
    const columns = columnKeys.map((key) => ({ key, fields: [] }));
    names.forEach((field, index) => {
      columns[index % count].fields.push(field);
    });
    return columns.filter((column) => column.fields.length);
  }

  function resolveSummarySectionColumns(section, objectMeta) {
    const columnsData = section.columnsData || section.ColumnsData;
    const columnsFromData = normalizeColumnsData(columnsData);
    const columns = columnsFromData.length
      ? columnsFromData
      : buildColumnsFromSectionFields(
          getSectionFieldNamesFromObjectMeta(objectMeta, getSectionId(section)),
          Number(section.columns ?? section.Columns ?? 1) || 1
        );
    return filterSummarySectionColumns(columns, objectMeta);
  }

  function getSummarySectionsFromObject(objectMeta) {
    return parseSectionsField(objectMeta && objectMeta.Sections)
      .map((section) => ({
        ...section,
        id: getSectionId(section),
        sequence: Number(section.sequence ?? section.Sequence ?? 0),
        name: String(section.name || section.Name || "").trim(),
        columns: resolveSummarySectionColumns(section, objectMeta)
      }))
      .filter((section) => section.columns.length)
      .sort((a, b) => a.sequence - b.sequence);
  }

  function getSummaryFieldListFromSections(sections) {
    const fields = ["RecordID", "SerialNumber", "SerialNo", "SerialNo.", "AssetName", "Category", "SubCategory", "ObjectID"];
    (Array.isArray(sections) ? sections : []).forEach((section) => {
      section.columns.forEach((column) => {
        column.fields.forEach((field) => fields.push(field));
      });
    });
    return [...new Set(fields.map((field) => String(field || "").trim()).filter(Boolean))];
  }

  function escapeWhereValue(value) {
    return String(value || "").replace(/'/g, "''");
  }

  function buildRecordIdWhereClause(recordId) {
    const escaped = escapeWhereValue(recordId);
    return escaped ? `RecordID='${escaped}'` : "";
  }

  /** Lookup link filter used by EAsset_Allocation (portal matches AssetID to master RecordID). */
  function buildAssetIdLinkWhereClause(recordId) {
    const escaped = escapeWhereValue(recordId);
    return escaped ? `AssetID='${escaped}'` : "";
  }

  /** Lookup filter for EAsset_History (portal matches Asset to master RecordID). */
  function buildAssetHistoryWhereClause(recordId) {
    const escaped = escapeWhereValue(recordId);
    return escaped ? `Asset='${escaped}'` : "";
  }

  function getRawFieldValueLoose(row, aliases) {
    if (!row || typeof row !== "object") return "";
    const aliasTokens = (Array.isArray(aliases) ? aliases : [aliases])
      .map((item) => normalizeFieldToken(item))
      .filter(Boolean);
    if (!aliasTokens.length) return "";
    const keys = Object.keys(row);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (!aliasTokens.includes(normalizeFieldToken(key))) continue;
      const value = row[key];
      if (value == null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return "";
  }

  function fieldContainsRecordId(row, fieldNames, recordId) {
    const id = String(recordId || "").trim();
    if (!id || !row || typeof row !== "object") return false;
    const names = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
    return names.some((fieldName) => {
      const raw = getRawFieldValueLoose(row, [fieldName]);
      if (!raw) return false;
      return extractLookupId(raw) === id || String(raw).includes(id);
    });
  }

  async function fetchAssetMasterObjectMeta(signal) {
    if (state.masterObjectMeta) return state.masterObjectMeta;
    const meta = await apiObjectGet(ASSET_MASTER_REPOSITORY, signal);
    state.masterObjectMeta = meta || {};
    return state.masterObjectMeta;
  }

  async function fetchAssetMasterRecord(recordId, fieldList, signal) {
    const whereClause = buildRecordIdWhereClause(recordId);
    if (!whereClause) return null;
    const payload = await apiGetItems(
      ASSET_MASTER_REPOSITORY,
      fieldList,
      whereClause,
      { pageSize: 1, pageNumber: 1 },
      signal
    );
    const rows = normalizeRecords(payload).map((row) => flattenRecord(row));
    return rows[0] || null;
  }

  function mapHistoryRow(flatRow, details) {
    const assetLookup =
      flatRow.Asset || flatRow.AssetID || flatRow.EAsset || flatRow.EAssetMaster || flatRow["EAsset Master"];
    const out = {};
    out.Asset =
      parseLookupLabel(assetLookup) ||
      getValue(flatRow, ["AssetName"]) ||
      details.assetName ||
      details.serialNumber ||
      "";
    const rawEmployee = getAllocationValueLoose(flatRow, ["Employees", "Employee", "EmployeeName", "AssignedTo", "User", "Users"]);
    out.Employees = formatAllocationEmployeeValue(rawEmployee) || "";
    out["Action Date"] =
      getAllocationValueLoose(flatRow, ["ActionDate", "Action Date", "Created Date", "CreatedDate"]) ||
      "";
    out.Status = getAllocationValueLoose(flatRow, ["Status", "ActionStatus", "ItemStatus", "Event", "Action"]) || "";
    out.Comments = getAllocationValueLoose(flatRow, ["Comments", "Comment"]) || "";
    return out;
  }

  async function fetchRepositoryHistoryRows(repoConfig, details, signal) {
    const payload = await apiGetItems(
      repoConfig.repositoryObjectKey,
      ["Asset", "Employees", "ActionDate", "Status", "Comments"],
      buildAssetHistoryWhereClause(details.recordId),
      { pageSize: 100000, pageNumber: 1, isAscending: true },
      signal
    );
    const filteredRows = normalizeRecords(payload).map((row) => flattenRecord(row));
    await ensureEmployeeDirectoryForAllocation(filteredRows, signal);
    const mappedRows = filteredRows.map((row) => mapHistoryRow(row, details));
    const columns = buildDynamicColumnsFromRows(
      mappedRows,
      ["Asset", "Employees", "Action Date", "Status", "Comments"]
    );
    return { rows: mappedRows, columns };
  }

  function isHistoryDateColumn(column) {
    return isTicketsDateColumn(column);
  }

  function isHistoryCommentsColumn(column) {
    const token = normalizeFieldToken(column);
    return token === "comments" || token === "comment";
  }

  function formatHistoryCommentCellDisplay(raw) {
    const text = String(raw == null ? "" : raw).trim();
    if (!text) return "";
    if (text.length <= HISTORY_COMMENT_MORE_MIN_LENGTH) {
      return escapeHtml(text);
    }
    const prefix = text.slice(0, HISTORY_COMMENT_MORE_MIN_LENGTH);
    return (
      escapeHtml(prefix) +
      `<button type="button" class="history-log-comment-more" data-full-comment="${escapeHtml(
        text
      )}" aria-label="Show full comment">...more</button>`
    );
  }

  function formatHistoryCellDisplay(column, raw) {
    if (isHistoryCommentsColumn(column)) {
      return formatHistoryCommentCellDisplay(raw);
    }
    const text = String(raw == null ? "" : raw).trim();
    if (!text) return "";
    if (isHistoryDateColumn(column)) {
      return formatCellDisplayMarkup(raw, {
        columnLabel: column,
        includeSeconds: true
      });
    }
    return escapeHtml(text);
  }

  function enrichHistoryRowSortValues(row, columns) {
    if (!row || typeof row !== "object") return row;
    const sortValues = {};
    (Array.isArray(columns) ? columns : []).forEach((column) => {
      const raw = resolveOtherDetailCellValue(row, column);
      if (isHistoryDateColumn(column)) {
        const parsed = parseSortDateValue(raw);
        sortValues[column] = parsed != null ? parsed : raw;
      } else {
        sortValues[column] = raw;
      }
    });
    row.__sortValues = sortValues;
    return row;
  }

  function getSortedHistoryRows(sourceRows, columns) {
    const rows = Array.isArray(sourceRows) ? sourceRows.slice() : [];
    const { columnKey, direction } = state.historySortState || {};
    if (!columnKey || !direction) {
      return rows;
    }

    const multiplier = direction === "desc" ? -1 : 1;
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const aValue =
          a.row && a.row.__sortValues && Object.prototype.hasOwnProperty.call(a.row.__sortValues, columnKey)
            ? a.row.__sortValues[columnKey]
            : resolveOtherDetailCellValue(a.row, columnKey);
        const bValue =
          b.row && b.row.__sortValues && Object.prototype.hasOwnProperty.call(b.row.__sortValues, columnKey)
            ? b.row.__sortValues[columnKey]
            : resolveOtherDetailCellValue(b.row, columnKey);
        const compared = compareTicketsSortValues(aValue, bValue, columnKey);
        if (compared !== 0) return compared * multiplier;
        return a.index - b.index;
      })
      .map((entry) => entry.row);
  }

  function updateHistorySortState(columnIndex, columnKey) {
    const current = state.historySortState || {};
    if (current.columnKey !== columnKey) {
      state.historySortState = { columnKey, columnIndex, direction: "asc" };
      return;
    }
    if (current.direction === "asc") {
      state.historySortState = { columnKey, columnIndex, direction: "desc" };
      return;
    }
    if (current.direction === "desc") {
      state.historySortState = { columnKey: null, columnIndex: null, direction: null };
      return;
    }
    state.historySortState = { columnKey, columnIndex, direction: "asc" };
  }

  function renderHistoryTableHead(columns) {
    if (!ui.historyLogTableHeadRow) return;
    const cols = Array.isArray(columns) ? columns : [];
    const activeKey =
      state.historySortState && state.historySortState.direction
        ? state.historySortState.columnKey
        : null;
    const activeDirection = state.historySortState ? state.historySortState.direction : null;
    ui.historyLogTableHeadRow.innerHTML = cols
      .map((column, index) => {
        const arrow =
          activeKey === column
            ? activeDirection === "asc"
              ? "↑"
              : "↓"
            : "↕";
        return `<th class="is-sortable" data-history-sort-index="${index}" data-history-sort-key="${escapeHtml(
          column
        )}"><span class="th-label">${escapeHtml(column)}</span><span class="th-sort-icon" aria-hidden="true">${arrow}</span></th>`;
      })
      .join("");
  }

  function renderHistoryTableBody(sortedRows, columns) {
    if (!ui.historyLogTableBody) return;
    const cols = Array.isArray(columns) ? columns : [];
    if (!sortedRows.length) {
      ui.historyLogTableBody.innerHTML =
        `<tr><td colspan="${Math.max(cols.length, 1)}" class="history-log-empty">No Record Found</td></tr>`;
      return;
    }
    ui.historyLogTableBody.innerHTML = sortedRows
      .map(
        (row) => `<tr>
          ${cols
            .map((column) => {
              const raw = resolveOtherDetailCellValue(row, column) || "";
              const display = formatHistoryCellDisplay(column, raw);
              const cellClass = isHistoryCommentsColumn(column) ? " history-log-comment-cell" : "";
              return `<td class="${cellClass.trim()}">${display}</td>`;
            })
            .join("")}
        </tr>`
      )
      .join("");
  }

  function renderHistoryGrid(dataset) {
    if (!ui.historyLogTableBody || !ui.historyLogTableHeadRow) return;
    const sourceRows = Array.isArray(dataset && dataset.rows) ? dataset.rows : state.historyRowsRaw || [];
    const columns = Array.isArray(dataset && dataset.columns) && dataset.columns.length
      ? dataset.columns
      : state.historyColumns.length
        ? state.historyColumns
        : HISTORY_DEFAULT_COLUMNS;
    if (dataset && Array.isArray(dataset.rows)) {
      state.historyRowsRaw = sourceRows;
    }
    state.historyColumns = columns;
    sourceRows.forEach((row) => enrichHistoryRowSortValues(row, columns));
    const sortedRows = getSortedHistoryRows(sourceRows, columns);
    renderHistoryTableHead(columns);
    renderHistoryTableBody(sortedRows, columns);
    refreshSerialGridTable(ui.historyLogTable, { resizeStorageKey: HISTORY_TABLE_RESIZE_KEY });
  }

  function renderHistoryRows(dataset) {
    renderHistoryGrid(dataset);
  }

  function openHistoryCommentModal(fullText) {
    if (!ui.historyCommentModal) return;
    const body = ui.historyCommentModal.querySelector(".history-comment-modal__body");
    if (body) {
      body.textContent = String(fullText || "").trim();
    }
    ui.historyCommentModal.hidden = false;
    document.body.classList.add("history-comment-modal-open");
    const closeBtn = ui.historyCommentModal.querySelector(".history-comment-modal__close");
    if (closeBtn) closeBtn.focus();
  }

  function closeHistoryCommentModal() {
    if (!ui.historyCommentModal) return;
    ui.historyCommentModal.hidden = true;
    document.body.classList.remove("history-comment-modal-open");
  }

  function onHistorySectionClick(event) {
    const moreBtn = event.target.closest(".history-log-comment-more");
    if (moreBtn) {
      event.preventDefault();
      openHistoryCommentModal(moreBtn.getAttribute("data-full-comment") || "");
      return;
    }
    const sortHeader = event.target.closest("th[data-history-sort-key]");
    if (!sortHeader || !ui.historyLogTableHeadRow || !ui.historyLogTableHeadRow.contains(sortHeader)) return;
    if (event.target.closest(".gt-col-resizer")) return;
    const columnKey = sortHeader.getAttribute("data-history-sort-key");
    const columnIndex = Number(sortHeader.getAttribute("data-history-sort-index"));
    if (!columnKey || !Number.isFinite(columnIndex)) return;
    event.preventDefault();
    updateHistorySortState(columnIndex, columnKey);
    renderHistoryGrid({ rows: state.historyRowsRaw, columns: state.historyColumns });
  }

  function bindHistoryGridEvents() {
    if (historyGridEventsBound) return;
    historyGridEventsBound = true;
    ui.historyLogSection?.addEventListener("click", onHistorySectionClick);
    ui.historyCommentModal?.addEventListener("click", (event) => {
      if (event.target.closest(".history-comment-modal__close")) {
        event.preventDefault();
        closeHistoryCommentModal();
        return;
      }
      if (event.target.classList.contains("history-comment-modal__backdrop")) {
        closeHistoryCommentModal();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && ui.historyCommentModal && !ui.historyCommentModal.hidden) {
        closeHistoryCommentModal();
      }
    });
  }

  async function loadHistoryRows(details) {
    bindHistoryGridEvents();
    if (ui.historyLogTableBody && ui.historyLogTableHeadRow) {
      // Same header markup the loaded table uses (sortable cells, sort icons,
      // GridTable attached), not a plain <th> stand-in, so the header does not
      // visibly re-render when the rows arrive.
      const loadingColumns = state.historyColumns && state.historyColumns.length
        ? state.historyColumns
        : HISTORY_DEFAULT_COLUMNS;
      renderHistoryTableHead(loadingColumns);
      ui.historyLogTableBody.innerHTML =
        `<tr><td colspan="${Math.max(loadingColumns.length, 1)}" class="history-log-empty">Loading...</td></tr>`;
      refreshSerialGridTable(ui.historyLogTable, { resizeStorageKey: HISTORY_TABLE_RESIZE_KEY });
    }
    const assetRecordId = String(details.recordId || "").trim();
    if (!assetRecordId) {
      state.historyRowsRaw = [];
      renderHistoryGrid({ rows: [], columns: HISTORY_DEFAULT_COLUMNS });
      return;
    }
    const historyDataset = await fetchRepositoryHistoryRows(HISTORY_REPOSITORY, details).catch(
      () => ({ rows: [], columns: HISTORY_DEFAULT_COLUMNS })
    );
    const rows = Array.isArray(historyDataset.rows) ? historyDataset.rows.slice().reverse() : [];
    state.historyRowsRaw = rows;
    renderHistoryGrid({ rows, columns: historyDataset.columns });
  }

  function getRnspBaseUrl() {
    try {
      const fromEnv = String(localStorage.getItem("env") || "").trim();
      if (fromEnv) {
        return fromEnv.replace(/\/+$/, "");
      }
    } catch (_error) {
      // Ignore storage limitations.
    }
    return String(API_BASE_URL || resolveApiBaseUrl() || "")
      .trim()
      .replace(/\/+$/, "");
  }

  function buildRnspHeaders() {
    const payload = getUserKeyPayload();
    let lngs = "en";
    try {
      lngs = String(localStorage.getItem("lngs") || payload.lngs || "en").trim() || "en";
    } catch (_error) {
      lngs = String(payload.lngs || "en").trim() || "en";
    }
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      EmployeeGUID: payload.EmployeeGUID || payload.employeeguid || "",
      Hrzemail: payload.Email || payload.hrzemail || "",
      HrzempId: payload.EmployeeID || payload.hrzempid || "",
      lngs: lngs
    };
  }

  function parseRnspResponse(raw) {
    let data = raw;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (_error) {
        return [];
      }
    }
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (_error2) {
        return [];
      }
    }
    return normalizeRecords(data);
  }

  /** True for a row-shaped object (not an array, not a primitive). */
  function isRnspRecordObject(item) {
    return Boolean(item) && typeof item === "object" && !Array.isArray(item);
  }

  /**
   * Collects EVERY record array in an RNSP payload instead of stopping at
   * the first one. Some RNSPs return their result split into batches
   * (0-99, 100-199, ... 500-513) — either as an array of arrays or as
   * sibling keys — and taking only the first batch silently truncates the
   * result set.
   */
  function collectRnspRecordBatches(value, depth, seen, out) {
    if (depth > 8 || value == null || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      // An array of plain objects is a batch of records: take it whole.
      if (value.length && value.every(isRnspRecordObject)) {
        out.push(value);
        return;
      }
      for (let i = 0; i < value.length; i += 1) {
        collectRnspRecordBatches(value[i], depth + 1, seen, out);
      }
      return;
    }

    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
      collectRnspRecordBatches(value[keys[i]], depth + 1, seen, out);
    }
  }

  /**
   * Same as parseRnspResponse, but returns the COMPLETE result set: every
   * batch in the payload is concatenated in order, so nothing is dropped
   * past the first 100 rows. No slicing or internal paging is applied.
   */
  function parseRnspResponseAllBatches(raw) {
    let data = raw;
    for (let i = 0; i < 2 && typeof data === "string"; i += 1) {
      try {
        data = JSON.parse(data);
      } catch (_error) {
        return [];
      }
    }

    const batches = [];
    collectRnspRecordBatches(data, 0, new Set(), batches);
    if (!batches.length) return normalizeRecords(data);

    const rows = [];
    batches.forEach((batch) => {
      batch.forEach((row) => rows.push(row));
    });
    return rows;
  }

  /**
   * Generic {base_url}/api/rnsp caller used by the Add Relationship form
   * (Relationship Type dropdown + Type/Category filters). Mirrors the
   * request/response shape already used by fetchAssetDependencyRows /
   * fetchAssetTicketsSummary above, but takes the RNSP "Name" and "Args"
   * dynamically so it can be reused for multiple RNSP definitions.
   *
   * Pass options.allBatches to receive the complete result set when the
   * RNSP splits its rows into batches.
   */
  async function fetchRnspRows(rnspName, args, signal, options) {
    const allBatches = Boolean(options && options.allBatches);
    const base = getRnspBaseUrl();
    if (!base) {
      console.warn(
        "[Asset Dependency] No base URL resolved from localStorage 'env'; RNSP call '" + rnspName + "' skipped."
      );
      return [];
    }
    const url = `${base}/api/rnsp`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: buildRnspHeaders(),
        body: JSON.stringify({
          Name: rnspName,
          Args: args || {}
        }),
        signal
      });
      if (!response.ok) {
        console.warn("[Asset Dependency] RNSP call '" + rnspName + "' failed with status", response.status);
        return [];
      }
      const raw = await response.json();
      return allBatches ? parseRnspResponseAllBatches(raw) : parseRnspResponse(raw);
    } catch (error) {
      console.warn("[Asset Dependency] RNSP call '" + rnspName + "' threw an error:", error);
      return [];
    }
  }

  async function fetchAssetTicketsSummary(assetRecordId, signal) {
    const base = getRnspBaseUrl();
    if (!base) return [];
    const url = `${base}/api/rnsp`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: buildRnspHeaders(),
        body: JSON.stringify({
          Name: TICKETS_RNSP_NAME,
          Args: { AssetRecordID: String(assetRecordId || "").trim() }
        }),
        signal
      });
      const raw = await response.json();
      return parseRnspResponse(raw);
    } catch (_error) {
      return [];
    }
  }

  /* ------------------------------------------------------------------
     Asset Dependency tab
  ------------------------------------------------------------------ */

  const DEPENDENCY_DEFAULT_NODE_HALF_W = 115;
  const DEPENDENCY_DEFAULT_NODE_HALF_H = 32;
  const DEPENDENCY_ARROW_GAP = 6;
  const DEPENDENCY_LABEL_OFFSET = 12;
  /* Smallest vertical distance any child node may have from the pinned
     parent node, so the parent always reads as the top of the graph. */
  const DEPENDENCY_MIN_CHILD_GAP_Y = 120;

  async function fetchAssetDependencyRows(recordId, signal) {
    const base = getRnspBaseUrl();
    if (!base) {
      console.warn("[Asset Dependency] No base URL resolved from localStorage 'env'; RNSP call skipped.");
      return [];
    }
    const url = `${base}/api/rnsp`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: buildRnspHeaders(),
        body: JSON.stringify({
          Name: DEPENDENCY_RNSP_NAME,
          Args: { SelectedRecordIDParam: String(recordId || "").trim() }
        }),
        signal
      });
      if (!response.ok) {
        console.warn("[Asset Dependency] RNSP call failed with status", response.status);
        return [];
      }
      const raw = await response.json();
      return parseRnspResponse(raw);
    } catch (error) {
      console.warn("[Asset Dependency] RNSP call threw an error:", error);
      return [];
    }
  }

  function buildDependencyGraphModel(rows, rootName) {
    const list = Array.isArray(rows) ? rows : [];
    const nodesByName = new Map();
    const edges = [];

    function ensureNode(name) {
      const key = String(name == null ? "" : name).trim();
      if (!key) return null;
      if (!nodesByName.has(key)) {
        nodesByName.set(key, {
          id: key,
          name: key,
          x: 0,
          y: 0,
          level: null,
          halfW: DEPENDENCY_DEFAULT_NODE_HALF_W,
          halfH: DEPENDENCY_DEFAULT_NODE_HALF_H
        });
      }
      return nodesByName.get(key);
    }

    // The asset currently open on this page (resolved from
    // SelectedRecordIDParam via loadParentAssetDetails -> assetName) must
    // always be the graph's root, no matter how the relationship rows
    // connect it to other assets. Rows are processed BEFORE root
    // resolution so we can look for the current asset among the real
    // nodes the relationships produced, rather than registering a new,
    // disconnected node for it up front (which would visually detach the
    // root from its own relationship chain whenever the row text doesn't
    // match the asset's plain Name field exactly).
    const normalizedRootName = String(rootName || "").trim();

    list.forEach((row) => {
      const sourceName =
        getValue(row, ["SourceAsset", "Source Asset"]) || row.SourceAsset || "";
      const childName =
        getValue(row, ["ChildAsset", "Child Asset"]) || row.ChildAsset || "";
      const label =
        getValue(row, ["RelationshipType", "Relationship Type"]) || row.RelationshipType || "";
      const sourceNode = ensureNode(sourceName);
      const childNode = ensureNode(childName);
      if (!sourceNode || !childNode) return;
      edges.push({ source: sourceNode.id, target: childNode.id, label: String(label || "").trim() });
    });

    let nodes = Array.from(nodesByName.values());
    if (!nodes.length) {
      return { nodes: [], edges: [], rootId: null, levels: [] };
    }

    // Resolve which existing node represents the currently opened asset.
    // Relationship rows sometimes label an asset with an ID/code prefix
    // baked into the text (e.g. "AST-022-Backup Linux Server") even
    // though the asset's own Name field is just "Backup Linux Server", so
    // an exact match isn't always possible. Try progressively looser
    // matches against the REAL nodes already in the graph first.
    const normalizedRoot = normalizedRootName.toLowerCase();
    let root = null;
    if (normalizedRoot) {
      // 1) Exact match (case/whitespace-insensitive).
      root = nodes.find((node) => node.name.trim().toLowerCase() === normalizedRoot);

      // 2) Composite "<code>-<Name>" or "<Name>-<code>" style label —
      //    match either side against the plain asset name.
      if (!root) {
        root = nodes.find((node) => {
          const n = node.name.trim().toLowerCase();
          return n.endsWith("-" + normalizedRoot) || n.startsWith(normalizedRoot + "-");
        });
      }

      // 3) Loosest fallback — substring match in either direction.
      if (!root) {
        root = nodes.find((node) => {
          const n = node.name.trim().toLowerCase();
          return n.includes(normalizedRoot) || normalizedRoot.includes(n);
        });
      }
    }

    if (!root && normalizedRootName) {
      // Nothing in the fetched relationship rows even loosely resembles
      // the current asset — as a last resort, register it as its own
      // (currently unconnected) root rather than letting a different node
      // stand in for it.
      root = ensureNode(normalizedRootName);
      nodes = Array.from(nodesByName.values());
    }
    if (!root) {
      // Reached solely when we don't know the current asset's name at
      // all. Prefer a node that is nobody's child over a "most
      // connections" guess, since a node that is someone's child can
      // never legitimately stand in for the open asset as root.
      const sourceCounts = new Map();
      const targetIds = new Set();
      edges.forEach((edge) => {
        sourceCounts.set(edge.source, (sourceCounts.get(edge.source) || 0) + 1);
        targetIds.add(edge.target);
      });
      let bestCount = -1;
      nodes.forEach((node) => {
        if (targetIds.has(node.id)) return;
        const count = sourceCounts.get(node.id) || 0;
        if (count > bestCount) {
          bestCount = count;
          root = node;
        }
      });
    }
    if (!root) root = nodes[0];

    // Level/depth is based on how many relationship hops a node is away
    // from the root — walked in EITHER direction (Source->Child or
    // Child->Source). The row data doesn't always list the opened asset
    // as the "Source" side of every relationship it's part of; if we only
    // ever walked Source->Child, everything on the other side of the root
    // would be unreachable and get flattened into a single row instead of
    // cascading level by level beneath it. Arrow direction for rendering
    // still comes from the original `edges` array, untouched below.
    const undirectedAdjacency = new Map();
    nodes.forEach((node) => undirectedAdjacency.set(node.id, []));
    edges.forEach((edge) => {
      if (undirectedAdjacency.has(edge.source)) undirectedAdjacency.get(edge.source).push(edge.target);
      if (undirectedAdjacency.has(edge.target)) undirectedAdjacency.get(edge.target).push(edge.source);
    });

    const levels = [];
    const visited = new Set();
    root.level = 0;
    visited.add(root.id);
    levels[0] = [root];

    let frontier = [root.id];
    let depth = 0;
    while (frontier.length) {
      const next = [];
      frontier.forEach((id) => {
        (undirectedAdjacency.get(id) || []).forEach((neighborId) => {
          if (visited.has(neighborId)) return;
          visited.add(neighborId);
          const neighborNode = nodesByName.get(neighborId);
          neighborNode.level = depth + 1;
          if (!levels[depth + 1]) levels[depth + 1] = [];
          levels[depth + 1].push(neighborNode);
          next.push(neighborId);
        });
      });
      frontier = next;
      depth += 1;
    }

    // Anything left over here has no relationship path to root at all
    // (a genuinely separate component) — not merely a reversed edge,
    // which is now handled above.
    const unreached = nodes.filter((node) => !visited.has(node.id));
    if (unreached.length) {
      const extraLevel = levels.length;
      unreached.forEach((node) => {
        node.level = extraLevel;
      });
      levels[extraLevel] = unreached;
    }

    return { nodes, edges, rootId: root.id, levels };
  }

  /* ---------------- Layout algorithms for the 3 view modes ---------------- */

  /* The parent (source) asset is always the top-most node: every layout
     places level 0 above level 1, level 1 above level 2, and so on. */
  function layoutDependencyView(model) {
    const LEVEL_GAP_Y = 200;
    const NODE_GAP_X = 280;
    const START_Y = 160;
    const CENTER_X = 1200;

    (model.levels || []).forEach((levelNodes, levelIndex) => {
      if (!levelNodes || !levelNodes.length) return;
      const totalWidth = (levelNodes.length - 1) * NODE_GAP_X;
      levelNodes.forEach((node, index) => {
        node.y = START_Y + levelIndex * LEVEL_GAP_Y;
        node.x = CENTER_X - totalWidth / 2 + index * NODE_GAP_X;
      });
    });
  }

  function layoutHierarchyView(model) {
    const LEVEL_GAP_Y = 190;
    const NODE_GAP_X = 260;
    const START_Y = 140;
    const CENTER_X = 1200;

    (model.levels || []).forEach((levelNodes, levelIndex) => {
      if (!levelNodes || !levelNodes.length) return;
      const totalWidth = (levelNodes.length - 1) * NODE_GAP_X;
      levelNodes.forEach((node, index) => {
        node.y = START_Y + levelIndex * LEVEL_GAP_Y;
        node.x = CENTER_X - totalWidth / 2 + index * NODE_GAP_X;
      });
    });
  }

  function layoutNetworkView(model) {
    const CENTER_X = 1200;
    const ROOT_Y = 200;
    const RADIUS_STEP = 300;

    (model.levels || []).forEach((levelNodes, levelIndex) => {
      if (!levelNodes || !levelNodes.length) return;
      if (levelIndex === 0) {
        // The parent asset is pinned to the top of the graph.
        levelNodes.forEach((node) => {
          node.x = CENTER_X;
          node.y = ROOT_Y;
        });
        return;
      }
      // Remaining levels fan out on arcs below the parent, never above it.
      const radius = levelIndex * RADIUS_STEP;
      const count = levelNodes.length;
      const spread = Math.PI * 0.8;
      const start = Math.PI / 2 - spread / 2;
      levelNodes.forEach((node, index) => {
        const angle = count === 1 ? Math.PI / 2 : start + (spread * index) / (count - 1);
        node.x = CENTER_X + radius * Math.cos(angle);
        node.y = ROOT_Y + radius * Math.sin(angle);
      });
    });
  }

  /**
   * Safety net for every layout: guarantees the parent (root) node stays
   * strictly above all other nodes and horizontally centered over them, so
   * it can never end up beside or below its children.
   */
  function enforceRootOnTop(model) {
    if (!model || !Array.isArray(model.nodes) || !model.rootId) return;
    const root = model.nodes.find((node) => node.id === model.rootId);
    if (!root) return;
    const others = model.nodes.filter((node) => node.id !== model.rootId);
    if (!others.length) return;

    const MIN_GAP_Y = 150;
    let minY = Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    others.forEach((node) => {
      if (node.y < minY) minY = node.y;
      if (node.x < minX) minX = node.x;
      if (node.x > maxX) maxX = node.x;
    });

    if (root.y > minY - MIN_GAP_Y) root.y = minY - MIN_GAP_Y;
    root.x = (minX + maxX) / 2;
  }

  function applyDependencyLayout(model, view) {
    if (!model || !model.levels) return;
    if (view === "hierarchy") {
      layoutHierarchyView(model);
    } else if (view === "network") {
      layoutNetworkView(model);
    } else {
      layoutDependencyView(model);
    }
    // Applies to every view: the opened (parent) asset is pinned above all
    // other nodes so relationships always flow downward from it.
    enforceRootOnTop(model);
  }

  /* ---------------- Rendering ---------------- */

  /**
   * Finds the point where a ray from a rectangle's center (defined by
   * halfW/halfH) toward (dx, dy) exits the rectangle, plus an optional gap.
   * Used so edge lines/arrowheads stop at each node's border instead of
   * running into its center, and never overlap the node or its label.
   */
  function clipPointAtRectBoundary(centerX, centerY, halfW, halfH, dx, dy, gap) {
    const w = halfW + (gap || 0);
    const h = halfH + (gap || 0);
    if (dx === 0 && dy === 0) return { x: centerX, y: centerY };
    const tX = dx !== 0 ? w / Math.abs(dx) : Infinity;
    const tY = dy !== 0 ? h / Math.abs(dy) : Infinity;
    const t = Math.min(tX, tY);
    return { x: centerX + dx * t, y: centerY + dy * t };
  }

  function renderDependencyEdges(model) {
    if (!ui.dependencyEdges) return;
    Array.from(ui.dependencyEdges.querySelectorAll(".dependency-edge-path, .dependency-edge-label")).forEach((el) =>
      el.remove()
    );

    const nodesById = new Map((model.nodes || []).map((node) => [node.id, node]));

    (model.edges || []).forEach((edge) => {
      const fromNode = nodesById.get(edge.source);
      const toNode = nodesById.get(edge.target);
      if (!fromNode || !toNode) return;

      // Arrows must always point downward, so the line is drawn from the
      // upper node to the lower one and the arrowhead (marker-end) lands
      // on the node that sits lower in the graph.
      const pointsUp = toNode.y < fromNode.y;
      const source = pointsUp ? toNode : fromNode;
      const target = pointsUp ? fromNode : toNode;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      if (dx === 0 && dy === 0) return;

      const sourceHalfW = source.halfW || DEPENDENCY_DEFAULT_NODE_HALF_W;
      const sourceHalfH = source.halfH || DEPENDENCY_DEFAULT_NODE_HALF_H;
      const targetHalfW = target.halfW || DEPENDENCY_DEFAULT_NODE_HALF_W;
      const targetHalfH = target.halfH || DEPENDENCY_DEFAULT_NODE_HALF_H;

      // Start point: where the line leaves the source node's border.
      const start = clipPointAtRectBoundary(source.x, source.y, sourceHalfW, sourceHalfH, dx, dy, DEPENDENCY_ARROW_GAP);
      // End point: where the line reaches the target node's border, approached
      // from the target's side so the arrowhead points squarely at it.
      const end = clipPointAtRectBoundary(target.x, target.y, targetHalfW, targetHalfH, -dx, -dy, DEPENDENCY_ARROW_GAP);

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M${start.x},${start.y} L${end.x},${end.y}`);
      path.setAttribute("class", "dependency-edge-path");
      ui.dependencyEdges.appendChild(path);

      if (edge.label) {
        // Offset the label perpendicular to the line (rather than a fixed
        // vertical shift) so it clears the line/arrowhead at any angle and
        // never sits on top of the connection itself.
        const lineLength = Math.sqrt(dx * dx + dy * dy) || 1;
        const normalX = -dy / lineLength;
        const normalY = dx / lineLength;
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", String(midX + normalX * DEPENDENCY_LABEL_OFFSET));
        text.setAttribute("y", String(midY + normalY * DEPENDENCY_LABEL_OFFSET));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("class", "dependency-edge-label");
        text.textContent = edge.label;
        ui.dependencyEdges.appendChild(text);
      }
    });
  }

  function measureDependencyNodeSizes() {
    if (!ui.dependencyWorld) return;
    Array.from(ui.dependencyWorld.querySelectorAll(".dependency-node")).forEach((el) => {
      const nodeId = el.dataset.id;
      const node = state.dependencyGraph.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const rect = el.getBoundingClientRect();
      const scale = state.dependencyGraph.scale || 1;
      if (rect.width && rect.height) {
        node.halfW = rect.width / scale / 2;
        node.halfH = rect.height / scale / 2;
      }
    });
  }

  function renderDependencyGraph(model) {
    if (!ui.dependencyWorld) return;
    Array.from(ui.dependencyWorld.querySelectorAll(".dependency-node")).forEach((el) => el.remove());

    state.dependencyGraph.nodes = Array.isArray(model.nodes) ? model.nodes : [];
    state.dependencyGraph.edges = Array.isArray(model.edges) ? model.edges : [];
    state.dependencyGraph.rootId = model.rootId || null;

    const hasNodes = state.dependencyGraph.nodes.length > 0;
    if (ui.dependencyEmptyState) ui.dependencyEmptyState.hidden = hasNodes;

    state.dependencyGraph.nodes.forEach((node) => {
      const isRoot = node.id === model.rootId;
      const el = document.createElement("div");
      // The parent asset keeps its "is-root" highlight for the whole
      // lifetime of the graph and is flagged as fixed so drag handling
      // can refuse to move it.
      el.className = "dependency-node" + (isRoot ? " is-root is-fixed" : "");
      el.dataset.id = node.id;
      if (isRoot) el.dataset.fixed = "1";
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      el.innerHTML = `<div class="dependency-node-label" title="${escapeHtml(node.name)}">${escapeHtml(
        node.name
      )}</div>`;
      el.addEventListener("mousedown", startDependencyNodeDrag);
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        Array.from(ui.dependencyWorld.querySelectorAll(".dependency-node")).forEach((n) =>
          n.classList.remove("is-selected")
        );
        el.classList.add("is-selected");
      });
      ui.dependencyWorld.appendChild(el);
    });

    // Node border sizes are only known after layout, so measure real DOM
    // dimensions before drawing edges to keep arrows flush with each pill.
    measureDependencyNodeSizes();
    renderDependencyEdges(model);
  }

  function updateDependencyZoomTransform() {
    if (!ui.dependencyWorld) return;
    const { scale, panX, panY } = state.dependencyGraph;
    ui.dependencyWorld.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    if (ui.dependencyZoomLevel) {
      ui.dependencyZoomLevel.textContent = `${Math.round(scale * 100)}%`;
    }
  }

  function dependencyZoomIn() {
    state.dependencyGraph.scale = Math.min(2, state.dependencyGraph.scale + 0.1);
    updateDependencyZoomTransform();
  }

  function dependencyZoomOut() {
    state.dependencyGraph.scale = Math.max(0.4, state.dependencyGraph.scale - 0.1);
    updateDependencyZoomTransform();
  }

  function dependencyResetZoom() {
    state.dependencyGraph.scale = 1;
    state.dependencyGraph.panX = 0;
    state.dependencyGraph.panY = 0;
    updateDependencyZoomTransform();
  }

  /**
   * Calculates the bounding box of every node (using their real measured
   * half-width/height) and sets pan/scale so the whole graph is centered
   * and fully visible inside the viewport, without the user needing to
   * zoom out or pan manually. Used on initial load, on view switches, and
   * by the "Fit graph" toolbar button.
   */
  function fitDependencyGraphToView() {
    if (!ui.dependencyViewport) return;
    const nodes = state.dependencyGraph.nodes || [];

    if (!nodes.length) {
      dependencyResetZoom();
      return;
    }

    const padding = 90;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    nodes.forEach((node) => {
      const halfW = (node.halfW || DEPENDENCY_DEFAULT_NODE_HALF_W) + padding;
      const halfH = (node.halfH || DEPENDENCY_DEFAULT_NODE_HALF_H) + padding;
      minX = Math.min(minX, node.x - halfW);
      maxX = Math.max(maxX, node.x + halfW);
      minY = Math.min(minY, node.y - halfH);
      maxY = Math.max(maxY, node.y + halfH);
    });

    const graphWidth = Math.max(1, maxX - minX);
    const graphHeight = Math.max(1, maxY - minY);

    const viewportWidth = ui.dependencyViewport.clientWidth || graphWidth;
    const viewportHeight = ui.dependencyViewport.clientHeight || graphHeight;

    const scaleX = viewportWidth / graphWidth;
    const scaleY = viewportHeight / graphHeight;
    const scale = Math.max(0.4, Math.min(1.2, Math.min(scaleX, scaleY)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    state.dependencyGraph.scale = scale;
    state.dependencyGraph.panX = viewportWidth / 2 - centerX * scale;
    state.dependencyGraph.panY = viewportHeight / 2 - centerY * scale;

    updateDependencyZoomTransform();
  }

  let dependencyDraggingNode = null;
  let dependencyDragOffsetX = 0;
  let dependencyDragOffsetY = 0;
  let dependencyIsPanning = false;
  let dependencyPanStartX = 0;
  let dependencyPanStartY = 0;

  function startDependencyNodeDrag(event) {
    // The parent asset is fixed at the top of the graph and cannot be
    // dragged beside or below its children.
    if (event.currentTarget && event.currentTarget.dataset.fixed === "1") {
      dependencyDraggingNode = null;
      return;
    }
    dependencyDraggingNode = event.currentTarget;

    const nodeId = dependencyDraggingNode.dataset.id;
    const node = state.dependencyGraph.nodes.find((n) => n.id === nodeId);
    if (!node || !ui.dependencyViewport) return;

    const viewportRect = ui.dependencyViewport.getBoundingClientRect();
    const { scale, panX, panY } = state.dependencyGraph;
    const mouseWorldX = (event.clientX - viewportRect.left - panX) / scale;
    const mouseWorldY = (event.clientY - viewportRect.top - panY) / scale;

    // node.x/node.y always represent the node's CENTER (that's what the
    // CSS `translate(-50%, -50%)` and the edge-drawing code both assume),
    // so track the offset from the mouse to that center — not to the
    // element's top-left corner — to avoid the two drifting apart.
    dependencyDragOffsetX = mouseWorldX - node.x;
    dependencyDragOffsetY = mouseWorldY - node.y;

    document.addEventListener("mousemove", dependencyDragNode);
    document.addEventListener("mouseup", stopDependencyNodeDrag);
  }

  function dependencyDragNode(event) {
    if (!dependencyDraggingNode || !ui.dependencyViewport) return;

    const nodeId = dependencyDraggingNode.dataset.id;
    const node = state.dependencyGraph.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const viewportRect = ui.dependencyViewport.getBoundingClientRect();
    const { scale, panX, panY } = state.dependencyGraph;
    const mouseWorldX = (event.clientX - viewportRect.left - panX) / scale;
    const mouseWorldY = (event.clientY - viewportRect.top - panY) / scale;

    node.x = mouseWorldX - dependencyDragOffsetX;
    node.y = mouseWorldY - dependencyDragOffsetY;

    // A child can never be dragged level with or above the parent asset,
    // which stays pinned at the top of the graph.
    const rootNode = state.dependencyGraph.nodes.find((n) => n.id === state.dependencyGraph.rootId);
    if (rootNode && node.id !== rootNode.id) {
      const minY = rootNode.y + DEPENDENCY_MIN_CHILD_GAP_Y;
      if (node.y < minY) node.y = minY;
    }

    dependencyDraggingNode.style.left = `${node.x}px`;
    dependencyDraggingNode.style.top = `${node.y}px`;

    renderDependencyEdges({
      nodes: state.dependencyGraph.nodes,
      edges: state.dependencyGraph.edges
    });
  }

  function stopDependencyNodeDrag() {
    dependencyDraggingNode = null;
    document.removeEventListener("mousemove", dependencyDragNode);
    document.removeEventListener("mouseup", stopDependencyNodeDrag);
  }

  function applyDependencyViewChange(view) {
    const model = state.dependencyGraph.model;
    if (!model) return;
    state.dependencyGraph.currentView = view;
    (ui.dependencyViewButtons || []).forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
    applyDependencyLayout(model, view);
    renderDependencyGraph(model);
    fitDependencyGraphToView();
  }

  let dependencyGridEventsBound = false;

  function bindDependencyGraphEvents() {
    if (dependencyGridEventsBound) return;
    dependencyGridEventsBound = true;

    if (ui.depZoomIn) ui.depZoomIn.addEventListener("click", dependencyZoomIn);
    if (ui.depZoomOut) ui.depZoomOut.addEventListener("click", dependencyZoomOut);
    if (ui.depFitView) ui.depFitView.addEventListener("click", fitDependencyGraphToView);

    (ui.dependencyViewButtons || []).forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = String(btn.dataset.view || "dependency").trim();
        applyDependencyViewChange(view);
      });
    });

    if (ui.dependencyViewport) {
      ui.dependencyViewport.addEventListener("mousedown", (event) => {
        if (event.target.closest(".dependency-node")) return;
        dependencyIsPanning = true;
        dependencyPanStartX = event.clientX - state.dependencyGraph.panX;
        dependencyPanStartY = event.clientY - state.dependencyGraph.panY;
        ui.dependencyViewport.classList.add("is-dragging");
      });

      ui.dependencyViewport.addEventListener(
        "wheel",
        (event) => {
          event.preventDefault();
          if (event.deltaY < 0) {
            dependencyZoomIn();
          } else {
            dependencyZoomOut();
          }
        },
        { passive: false }
      );
    }

    document.addEventListener("mousemove", (event) => {
      if (!dependencyIsPanning) return;
      state.dependencyGraph.panX = event.clientX - dependencyPanStartX;
      state.dependencyGraph.panY = event.clientY - dependencyPanStartY;
      updateDependencyZoomTransform();
    });

    document.addEventListener("mouseup", () => {
      dependencyIsPanning = false;
      if (ui.dependencyViewport) ui.dependencyViewport.classList.remove("is-dragging");
    });

    // Keep the graph centered if the viewport size changes (e.g. the
    // window is resized) while the Asset Dependency tab is visible.
    window.addEventListener("resize", () => {
      if (!ui.dependencyCard || ui.dependencyCard.hidden) return;
      if (!(state.dependencyGraph.nodes || []).length) return;
      fitDependencyGraphToView();
    });
  }

  async function loadDependencyRows(details) {
    bindDependencyGraphEvents();

    if (ui.dependencyEmptyState) ui.dependencyEmptyState.hidden = true;
    if (ui.dependencyLoadingState) ui.dependencyLoadingState.hidden = false;

    const recordId = String(
      (details && details.recordId) || getUrlParamCaseInsensitive("recordId") || ""
    ).trim();
    if (!recordId) {
      console.warn("[Asset Dependency] No recordId found on page details or in URL query string.");
      state.dependencyRowsRaw = [];
      state.dependencyGraph.model = null;
      if (ui.dependencyLoadingState) ui.dependencyLoadingState.hidden = true;
      renderDependencyGraph({ nodes: [], edges: [], rootId: null });
      return;
    }

    const rows = await fetchAssetDependencyRows(recordId).catch(() => []);
    state.dependencyRowsRaw = Array.isArray(rows) ? rows : [];

    if (ui.dependencyLoadingState) ui.dependencyLoadingState.hidden = true;

    // details.assetName is the name of the asset matching SelectedRecordIDParam
    // (recordId) — i.e. the asset currently open on this page. This is what
    // pins the root of the dependency graph, regardless of how the fetched
    // relationship rows connect it to other assets.
    const rootName = (details && details.assetName) || "";
    const model = buildDependencyGraphModel(state.dependencyRowsRaw, rootName);
    state.dependencyGraph.model = model;
    // Hierarchy View is the default so the opened asset sits at the top
    // with its relationships flowing downward.
    const view = state.dependencyGraph.currentView || "hierarchy";
    (ui.dependencyViewButtons || []).forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
    applyDependencyLayout(model, view);
    renderDependencyGraph(model);
    fitDependencyGraphToView();
  }

  function getTicketsColumnsFromRows(rows) {
    return buildDynamicColumnsFromRowKeys(rows, []);
  }

  function enrichTicketsRowSortValues(row, columns) {
    if (!row || typeof row !== "object") return row;
    const sortValues = {};
    (Array.isArray(columns) ? columns : []).forEach((column) => {
      const raw = resolveOtherDetailCellValue(row, column);
      if (isTicketsDateColumn(column)) {
        const parsed = parseSortDateValue(raw);
        sortValues[column] = parsed != null ? parsed : raw;
      } else {
        sortValues[column] = raw;
      }
    });
    row.__sortValues = sortValues;
    return row;
  }

  function compareTicketsSortValues(aValue, bValue, columnKey) {
    if (isTicketsDateColumn(columnKey)) {
      const aDate = parseSortDateValue(aValue);
      const bDate = parseSortDateValue(bValue);
      if (aDate != null && bDate != null) return aDate - bDate;
      if (aDate != null) return 1;
      if (bDate != null) return -1;
    }

    const aNumeric = parseNumericSortValue(aValue);
    const bNumeric = parseNumericSortValue(bValue);
    if (aNumeric != null && bNumeric != null) {
      return aNumeric - bNumeric;
    }

    const aText = String(aValue ?? "").toLowerCase();
    const bText = String(bValue ?? "").toLowerCase();
    return aText.localeCompare(bText, undefined, { numeric: true, sensitivity: "base" });
  }

  function getSortedTicketsRows(sourceRows, columns) {
    const rows = Array.isArray(sourceRows) ? sourceRows.slice() : [];
    const { columnKey, direction } = state.ticketsSortState || {};
    if (!columnKey || !direction) {
      return rows;
    }

    const multiplier = direction === "desc" ? -1 : 1;
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const aValue =
          a.row && a.row.__sortValues && Object.prototype.hasOwnProperty.call(a.row.__sortValues, columnKey)
            ? a.row.__sortValues[columnKey]
            : resolveOtherDetailCellValue(a.row, columnKey);
        const bValue =
          b.row && b.row.__sortValues && Object.prototype.hasOwnProperty.call(b.row.__sortValues, columnKey)
            ? b.row.__sortValues[columnKey]
            : resolveOtherDetailCellValue(b.row, columnKey);
        const compared = compareTicketsSortValues(aValue, bValue, columnKey);
        if (compared !== 0) return compared * multiplier;
        return a.index - b.index;
      })
      .map((entry) => entry.row);
  }

  function updateTicketsSortState(columnIndex, columnKey) {
    const current = state.ticketsSortState || {};
    if (current.columnKey !== columnKey) {
      state.ticketsSortState = { columnKey, columnIndex, direction: "asc" };
      return;
    }
    if (current.direction === "asc") {
      state.ticketsSortState = { columnKey, columnIndex, direction: "desc" };
      return;
    }
    if (current.direction === "desc") {
      state.ticketsSortState = { columnKey: null, columnIndex: null, direction: null };
      return;
    }
    state.ticketsSortState = { columnKey, columnIndex, direction: "asc" };
  }

  function renderTicketsTableHead(columns) {
    if (!ui.ticketsTableHeadRow) return;
    const cols = Array.isArray(columns) ? columns : [];
    const activeKey =
      state.ticketsSortState && state.ticketsSortState.direction
        ? state.ticketsSortState.columnKey
        : null;
    const activeDirection = state.ticketsSortState ? state.ticketsSortState.direction : null;
    ui.ticketsTableHeadRow.innerHTML = cols
      .map((column, index) => {
        const arrow =
          activeKey === column
            ? activeDirection === "asc"
              ? "↑"
              : "↓"
            : "↕";
        return `<th class="is-sortable" data-tickets-sort-index="${index}" data-tickets-sort-key="${escapeHtml(
          column
        )}"><span class="th-label">${escapeHtml(column)}</span><span class="th-sort-icon" aria-hidden="true">${arrow}</span></th>`;
      })
      .join("");
  }

  function ticketsRowNeedsWrap(row, columns) {
    return (Array.isArray(columns) ? columns : []).some((column) => {
      const raw = resolveOtherDetailCellValue(row, column);
      const text = String(raw == null ? "" : raw).trim();
      return text.length > TICKETS_WRAP_MIN_LENGTH;
    });
  }

  function renderTicketsTableBody(sortedRows, columns) {
    if (!ui.ticketsTableBody) return;
    const cols = Array.isArray(columns) ? columns : [];
    if (!sortedRows.length) {
      ui.ticketsTableBody.innerHTML =
        `<tr><td colspan="${Math.max(cols.length, 1)}" class="tickets-empty">No Record Found</td></tr>`;
      return;
    }
    ui.ticketsTableBody.innerHTML = sortedRows
      .map((row) => {
        const wrapClass = ticketsRowNeedsWrap(row, cols) ? " tickets-table__row--wrap" : "";
        return `<tr class="${wrapClass.trim()}">
          ${cols
            .map((column) => {
              const raw = resolveOtherDetailCellValue(row, column);
              const display = formatTicketsCellDisplay(column, raw);
              return `<td>${display}</td>`;
            })
            .join("")}
        </tr>`;
      })
      .join("");
  }

  function renderTicketsGrid(dataset) {
    if (!ui.ticketsTableBody || !ui.ticketsTableHeadRow) return;
    const sourceRows = Array.isArray(dataset && dataset.rows) ? dataset.rows : state.ticketsRowsRaw || [];
    const columns = Array.isArray(dataset && dataset.columns) && dataset.columns.length
      ? dataset.columns
      : getTicketsColumnsFromRows(sourceRows);
    state.ticketsColumns = columns;
    sourceRows.forEach((row) => enrichTicketsRowSortValues(row, columns));
    const sortedRows = getSortedTicketsRows(sourceRows, columns);
    renderTicketsTableHead(columns);
    renderTicketsTableBody(sortedRows, columns);
    refreshSerialGridTable(ui.ticketsTable, { resizeStorageKey: TICKETS_TABLE_RESIZE_KEY });
  }

  async function loadTicketsRows(details) {
    bindTicketsGridEvents();
    if (ui.ticketsTableBody && ui.ticketsTableHeadRow) {
      // Tickets columns come from the response, so there is nothing to restore
      // on a first load - but the head is no longer wiped either: on a reload it
      // keeps the columns already on screen instead of collapsing the table to a
      // single "Loading..." cell and rebuilding it a moment later.
      const knownColumns = Array.isArray(state.ticketsColumns) ? state.ticketsColumns : [];
      if (knownColumns.length) renderTicketsTableHead(knownColumns);
      const loadingSpan = Math.max(ui.ticketsTableHeadRow.children.length, 1);
      ui.ticketsTableBody.innerHTML =
        `<tr><td colspan="${loadingSpan}" class="tickets-empty">Loading...</td></tr>`;
    }
    const assetRecordId = String(details.recordId || "").trim();
    if (!assetRecordId) {
      state.ticketsRowsRaw = [];
      renderTicketsGrid({ rows: [], columns: [] });
      return;
    }
    let rows = [];
    try {
      rows = await fetchAssetTicketsSummary(assetRecordId);
    } catch (_error) {
      rows = [];
    }
    const columns = getTicketsColumnsFromRows(rows);
    state.ticketsRowsRaw = rows;
    renderTicketsGrid({ rows, columns });
  }

  function onTicketsSectionClick(event) {
    const sortHeader = event.target.closest("th[data-tickets-sort-key]");
    if (!sortHeader || !ui.ticketsTableHeadRow || !ui.ticketsTableHeadRow.contains(sortHeader)) return;
    if (event.target.closest(".gt-col-resizer")) return;
    const columnKey = sortHeader.getAttribute("data-tickets-sort-key");
    const columnIndex = Number(sortHeader.getAttribute("data-tickets-sort-index"));
    if (!columnKey || !Number.isFinite(columnIndex)) return;
    event.preventDefault();
    updateTicketsSortState(columnIndex, columnKey);
    renderTicketsGrid({ rows: state.ticketsRowsRaw, columns: state.ticketsColumns });
  }

  function bindTicketsGridEvents() {
    if (ticketsGridEventsBound) return;
    ticketsGridEventsBound = true;
    ui.ticketsSection?.addEventListener("click", onTicketsSectionClick);
  }

  function mapAllocationRow(flatRow, details) {
    const out = {};
    const allocationRecordId = getRecordIDFromRow(flatRow);
    out.__recordID = allocationRecordId;
    out.__recordKey = allocationRecordId ? `RecordID:${allocationRecordId}` : "";
    out.Type = getAllocationValueLoose(flatRow, ["Type"]) || getValue(details.asset, ["Type"]) || "";
    out.Category = getAllocationValueLoose(flatRow, ["Category"]) || getValue(details.asset, ["Category"]) || "";
    out["Asset Name"] =
      getAllocationValueLoose(flatRow, ["AssetID", "Asset", "Asset Name"]) ||
      getAllocationValueLoose(flatRow, ["AssetName", "Asset Name"]) ||
      details.assetName ||
      details.serialNumber ||
      "";
    out.Employee = formatAllocationEmployeeValue(
      getAllocationValueLoose(flatRow, ["Employee", "AssignedTo", "EmployeeName", "User", "Users"])
    ) || "";
    out["From Date"] = getAllocationValueLoose(flatRow, [
      "FromDate",
      "From Date",
      "AllocationFromDate",
      "StartDate",
      "Start Date"
    ]) || "";
    out["To Date"] = getAllocationValueLoose(flatRow, [
      "ToDate",
      "To Date",
      "AllocationToDate",
      "EndDate",
      "End Date"
    ]) || "";
    out.Remarks = getAllocationValueLoose(flatRow, ["Remarks", "Remark", "Comments", "Comment"]) || "";
    out.CreatedBy = getAllocationValueLoose(flatRow, ["CreatedByName", "CreatedBy", "Created By"]) || "";
    const ignored = new Set([
      "recordid",
      "record id",
      "id",
      "objectid",
      "object id",
      "parentrecordid",
      "parent record id",
      "createdbyname",
      "created by name",
      "created by guid",
      "createdbyguid",
      "createddate",
      "created by",
      "createdby",
      "remarks",
      "remark",
      "lastmodifieddate",
      "last modified date",
      "lastmodifiedby",
      "last modified by",
      "dr mode",
      "drmode",
      "recordfieldvalues",
      "recordfieldvalueschild",
      "recordfieldvaluechild"
    ]);
    Object.keys(flatRow || {}).forEach((key) => {
      const value = flatRow[key];
      if (value == null || typeof value === "object") return;
      const label = normalizeFieldLabel(key);
      const token = normalizeFieldToken(label);
      if (!label || ignored.has(token)) return;
      if (shouldHideOtherDetailField(label, key)) return;
      const parsed = parseLookupLabel(value);
      if (!String(parsed || "").trim()) return;
      if (!Object.prototype.hasOwnProperty.call(out, label)) {
        out[label] = parsed;
      }
    });
    return out;
  }

  function parseSortDateValue(value) {
    const d = tryParseUtcDateValue(value) || tryParseDateValue(value);
    if (!d) return null;
    const time = d.getTime();
    return Number.isNaN(time) ? null : time;
  }

  function formatUtcToUserDateDisplay(raw) {
    const text = String(raw == null ? "" : raw).trim();
    if (!text) return "";
    // Date-only column: calendar date, no offset shift.
    return formatUserDate(text) || text;
  }

  function formatUtcToUserDateTimeDisplay(raw, includeSeconds = true) {
    const text = String(raw == null ? "" : raw).trim();
    if (!text) return "";
    return formatUserDateTime(text, includeSeconds) || text;
  }

  function isTicketsDateColumn(column) {
    const token = normalizeFieldToken(column);
    if (!token) return false;
    if (token.includes("date")) return true;
    if (token.includes("datetime")) return true;
    return false;
  }

  function isTicketsDateOnlyColumn(column) {
    const token = normalizeFieldToken(column);
    if (!token) return false;
    if (TICKETS_DATE_ONLY_COLUMNS.some((name) => normalizeFieldToken(name) === token)) return true;
    return false;
  }

  function formatTicketsCellDisplay(column, raw) {
    const text = String(raw == null ? "" : raw).trim();
    if (!text) return "";
    if (!isTicketsDateColumn(column)) return escapeHtml(text);
    if (isTicketsDateOnlyColumn(column)) {
      return escapeHtml(formatUtcToUserDateDisplay(text));
    }
    return escapeHtml(formatUtcToUserDateTimeDisplay(text, true));
  }

  function destroySerialGridTableInstance(table) {
    if (!table || !table.__gridTableInstance) return;
    if (typeof table.__gridTableInstance.destroy === "function") {
      table.__gridTableInstance.destroy();
    }
    table.__gridTableInstance = null;
  }

  /**
   * Column adjustment for the allocation/tickets/history/other-detail tables is
   * delegated to GridTable (library.js) - the one engine allowed to own a table's
   * <colgroup>. It injects the .gt-col-resizer handles with their pipe separator,
   * draws the .gt-resize-line vertical guide while a column is being dragged,
   * snapshots every column at drag start so only the dragged border moves
   * (Excel-style), and persists widths per data-resize-key. Sorting stays with
   * this page (sortable: false) because these tables sort through their own
   * render, not by reordering DOM rows.
   *
   * Re-created rather than refreshed: create() caches one instance per table, so
   * a rebuilt <thead> needs a new instance to pick up fresh header cells.
   */
  function refreshSerialGridTable(table, options) {
    if (!table) return null;
    if (!window.GridTable || typeof window.GridTable.create !== "function") return null;
    installGridResizeGuideClamp();

    const opts = Object.assign({}, options || {});
    const storageKey =
      opts.resizeStorageKey || String(table.getAttribute("data-resize-key") || "").trim();

    destroySerialGridTableInstance(table);
    const instance = window.GridTable.create(
      table,
      Object.assign(
        {
          sortable: false,
          resizable: true,
          minWidth: COLUMN_RESIZE_MIN_WIDTH,
          maxWidth: COLUMN_RESIZE_MAX_WIDTH,
          headerSelector: "thead th",
          bodySelector: "tbody",
          noSortClass: "no-sort",
          noResizeClass: "no-resize"
        },
        opts,
        { resizeStorageKey: storageKey }
      )
    );
    table.__gridTableInstance = instance || null;
    return instance;
  }

  /**
   * Keeps GridTable's drag guide inside the table's own scroll window.
   *
   * library.js draws the .gt-resize-line as a position:fixed element sized from
   * table.getBoundingClientRect() - the WHOLE table, header plus every row. On
   * this page each table lives in a *-table-wrap capped at --asd-table-max-h and
   * scrolls, so a table taller (or wider) than its wrap made the guide run past
   * the wrap's edges and streak down the page while a column was being dragged.
   *
   * The guide is owned by library.js, so it is left to draw as it likes and then
   * clamped here, once per frame, to the wrap's *visible* box (padding box, via
   * clientTop/clientHeight, so the border and the scrollbar lane stay clear).
   * A rAF loop - not a mousemove listener - because library.js binds its own
   * mousemove at drag start, i.e. after any listener this page registered, so
   * only a post-frame pass is guaranteed to run last and win.
   */
  const GRID_RESIZE_GUIDE_SELECTOR = ".gt-resize-line";
  const GRID_TABLE_WRAP_SELECTOR =
    ".allocation-table-wrap, .tickets-table-wrap, .history-log-table-wrap, .other-detail-table-wrap";

  let gridResizeGuideFrame = 0;
  let gridResizeGuideBound = false;

  function getActiveGridResizeBounds() {
    const handle = document.querySelector(".gt-col-resizer.is-resizing");
    const wrap = handle && handle.closest(GRID_TABLE_WRAP_SELECTOR);
    if (!wrap) return null;
    const rect = wrap.getBoundingClientRect();
    const left = rect.left + wrap.clientLeft;
    const top = rect.top + wrap.clientTop;
    return {
      left,
      right: left + wrap.clientWidth,
      top,
      bottom: top + wrap.clientHeight
    };
  }

  function clampGridResizeGuide() {
    gridResizeGuideFrame = 0;
    const guide = document.querySelector(GRID_RESIZE_GUIDE_SELECTOR);
    // No guide in the DOM means the drag ended and library.js removed it.
    if (!guide) return;

    const bounds = getActiveGridResizeBounds();
    if (bounds) {
      const drawnTop = parseFloat(guide.style.top) || 0;
      const drawnHeight = parseFloat(guide.style.height) || 0;
      const top = Math.max(drawnTop, bounds.top);
      const bottom = Math.min(drawnTop + drawnHeight, bounds.bottom);
      guide.style.top = `${top}px`;
      guide.style.height = `${Math.max(0, bottom - top)}px`;

      // The dragged boundary can also be scrolled out sideways; hide rather
      // than pin it to an edge it no longer sits on.
      const left = parseFloat(guide.style.left);
      const outside =
        Number.isFinite(left) && (left < bounds.left - 1 || left > bounds.right + 1);
      guide.style.display = outside ? "none" : "";
    }

    gridResizeGuideFrame = requestAnimationFrame(clampGridResizeGuide);
  }

  function installGridResizeGuideClamp() {
    if (gridResizeGuideBound) return;
    gridResizeGuideBound = true;
    // Capture phase: the loop is queued before library.js's own mousedown
    // handler creates the guide, so the very first painted frame is clamped.
    document.addEventListener(
      "mousedown",
      (event) => {
        const target = event.target;
        if (!target || typeof target.closest !== "function") return;
        if (!target.closest(".gt-col-resizer")) return;
        if (!target.closest(GRID_TABLE_WRAP_SELECTOR)) return;
        if (gridResizeGuideFrame) return;
        gridResizeGuideFrame = requestAnimationFrame(clampGridResizeGuide);
      },
      true
    );
  }

  function parseNumericSortValue(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const text = String(value).trim();
    if (!text) return null;
    const normalized = text.replace(/,/g, "");
    if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  }

  function getAllocationColumnDef(columnKey) {
    return ALLOCATION_GRID_COLUMNS.find((col) => col.key === columnKey) || null;
  }

  function compareAllocationSortValues(aValue, bValue, columnKey) {
    const column = getAllocationColumnDef(columnKey);
    if (column && column.isDate) {
      const aDate = parseSortDateValue(aValue);
      const bDate = parseSortDateValue(bValue);
      if (aDate != null && bDate != null) return aDate - bDate;
      if (aDate != null) return 1;
      if (bDate != null) return -1;
    }

    const aNumeric = parseNumericSortValue(aValue);
    const bNumeric = parseNumericSortValue(bValue);
    if (aNumeric != null && bNumeric != null) {
      return aNumeric - bNumeric;
    }

    const aText = String(aValue ?? "").toLowerCase();
    const bText = String(bValue ?? "").toLowerCase();
    return aText.localeCompare(bText, undefined, { numeric: true, sensitivity: "base" });
  }

  function enrichAllocationRowSortValues(row) {
    if (!row || typeof row !== "object") return row;
    const sortValues = {};
    for (let i = 0; i < ALLOCATION_GRID_COLUMNS.length; i += 1) {
      const col = ALLOCATION_GRID_COLUMNS[i];
      const raw = resolveOtherDetailCellValue(row, col.key);
      if (col.isDate) {
        const parsed = parseSortDateValue(raw);
        sortValues[col.key] = parsed != null ? parsed : raw;
      } else {
        sortValues[col.key] = raw;
      }
    }
    row.__sortValues = sortValues;
    return row;
  }

  function getSortedAllocationRows(sourceRows) {
    const rows = Array.isArray(sourceRows) ? sourceRows.slice() : [];
    const { columnKey, direction } = state.allocationSortState || {};
    if (!columnKey || !direction) {
      return rows;
    }

    const multiplier = direction === "desc" ? -1 : 1;
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const aValue =
          a.row && a.row.__sortValues && Object.prototype.hasOwnProperty.call(a.row.__sortValues, columnKey)
            ? a.row.__sortValues[columnKey]
            : resolveOtherDetailCellValue(a.row, columnKey);
        const bValue =
          b.row && b.row.__sortValues && Object.prototype.hasOwnProperty.call(b.row.__sortValues, columnKey)
            ? b.row.__sortValues[columnKey]
            : resolveOtherDetailCellValue(b.row, columnKey);
        const compared = compareAllocationSortValues(aValue, bValue, columnKey);
        if (compared !== 0) return compared * multiplier;
        const aRepoIndex = a.row && a.row.__repoIndex != null ? a.row.__repoIndex : a.index;
        const bRepoIndex = b.row && b.row.__repoIndex != null ? b.row.__repoIndex : b.index;
        return aRepoIndex - bRepoIndex;
      })
      .map((entry) => entry.row);
  }

  function updateAllocationSortState(columnIndex, columnKey) {
    const current = state.allocationSortState || {};
    if (current.columnKey !== columnKey) {
      state.allocationSortState = { columnKey, columnIndex, direction: "asc" };
      return;
    }
    if (current.direction === "asc") {
      state.allocationSortState = { columnKey, columnIndex, direction: "desc" };
      return;
    }
    if (current.direction === "desc") {
      state.allocationSortState = { columnKey: null, columnIndex: null, direction: null };
      return;
    }
    state.allocationSortState = { columnKey, columnIndex, direction: "asc" };
  }

  function getRecordKeyFromAllocationRow(row) {
    const key = row && String(row.__recordKey || "").trim();
    if (key) return key;
    const id = row && String(row.__recordID || "").trim();
    return id ? `RecordID:${id}` : "";
  }

  function closeAllocationRowMenu() {
    if (!state.activeAllocationMenuRecordKey) return;
    state.activeAllocationMenuRecordKey = null;
    renderAllocationGrid();
  }

  function positionOpenAllocationRowMenu() {
    if (!ui.allocationTableBody) return;
    const menu = ui.allocationTableBody.querySelector(".row-actions__menu.is-open");
    if (!menu) return;
    menu.classList.remove("row-actions__menu--up", "row-actions__menu--align-right");
    const toggle = menu.previousElementSibling;
    if (!toggle || typeof toggle.getBoundingClientRect !== "function") return;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const toggleRect = toggle.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const menuWidth = Math.max(menuRect.width || 0, 126);
    const menuHeight = menuRect.height || 0;
    const margin = 8;

    let top = toggleRect.bottom - 6;
    let left = toggleRect.left + 4;

    if (top + menuHeight > viewportHeight - margin) {
      top = toggleRect.top - menuHeight + 6;
    }
    if (left + menuWidth > viewportWidth - margin) {
      left = toggleRect.right - menuWidth - 4;
    }

    top = Math.max(margin, top);
    left = Math.max(margin, left);

    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
  }

  function scheduleAllocationMenuPosition() {
    if (state.allocationMenuPositionRaf) {
      cancelAnimationFrame(state.allocationMenuPositionRaf);
    }
    state.allocationMenuPositionRaf = requestAnimationFrame(() => {
      state.allocationMenuPositionRaf = 0;
      positionOpenAllocationRowMenu();
    });
  }

  function renderAllocationTableHead() {
    if (!ui.allocationTableHeadRow) return;
    const columns = ALLOCATION_GRID_COLUMNS;
    const activeKey =
      state.allocationSortState && state.allocationSortState.direction
        ? state.allocationSortState.columnKey
        : null;
    const activeDirection = state.allocationSortState ? state.allocationSortState.direction : null;
    const headCells = columns
      .map((column, index) => {
        const arrow =
          activeKey === column.key
            ? activeDirection === "asc"
              ? "↑"
              : "↓"
            : "↕";
        return `<th class="is-sortable" data-allocation-sort-index="${index}" data-allocation-sort-key="${escapeHtml(
          column.key
        )}"><span class="th-label">${escapeHtml(column.label)}</span><span class="th-sort-icon" aria-hidden="true">${arrow}</span></th>`;
      })
      .join("");
    ui.allocationTableHeadRow.innerHTML = `<th class="row-actions-head no-sort no-resize" aria-label="Actions"></th>${headCells}`;
  }

  function isAssetItemStatusAllocated(details) {
    const asset = details && details.asset ? details.asset : {};
    const itemStatusValue = getValue(asset, ["ItemStatus", "Item Status", "Status"]);
    return normalizeFieldToken(itemStatusValue) === "allocated";
  }

  function getAllocationRowActionItems() {
    const details = state.pageDetails || state.latestDetailsForAllocation || null;
    if (isAssetItemStatusAllocated(details)) {
      return ALLOCATION_ROW_ACTION_ITEMS.filter((item) => item.key !== "edit");
    }
    return ALLOCATION_ROW_ACTION_ITEMS;
  }

  function renderAllocationTableBody(sortedRows) {
    if (!ui.allocationTableBody) return;
    const columns = ALLOCATION_GRID_COLUMNS;
    const colCount = columns.length + 1;
    if (!sortedRows.length) {
      ui.allocationTableBody.innerHTML = `<tr><td colspan="${colCount}" class="allocation-empty">No Record Found</td></tr>`;
      return;
    }
    ui.allocationTableBody.innerHTML = sortedRows
      .map((row) => {
        const recordKey = escapeHtml(getRecordKeyFromAllocationRow(row));
        const recordId = String((row && row.__recordID) || "").trim();
        const isMenuOpen = state.activeAllocationMenuRecordKey && getRecordKeyFromAllocationRow(row) === state.activeAllocationMenuRecordKey;
        const actionCell = recordId
          ? `<td class="row-actions" data-record-key="${recordKey}">
              <button class="row-actions__toggle" type="button" aria-label="Open actions" data-allocation-menu-toggle data-record-key="${recordKey}">
                <i class="fa fa-ellipsis-v" aria-hidden="true"></i>
              </button>
              <div class="row-actions__menu${isMenuOpen ? " is-open" : ""}" ${isMenuOpen ? "" : "hidden"}>
                ${getAllocationRowActionItems().map(
                  (item) =>
                    `<button type="button" class="row-actions__item" data-allocation-row-action="${escapeHtml(
                      item.key
                    )}" data-record-key="${recordKey}"><i class="${escapeHtml(item.icon)}" aria-hidden="true"></i><span>${escapeHtml(
                      item.label
                    )}</span></button>`
                ).join("")}
              </div>
            </td>`
          : `<td class="row-actions row-actions--empty" aria-hidden="true"></td>`;
        const cells = columns
          .map((column) => {
            const raw = resolveOtherDetailCellValue(row, column.key) || "";
            if (column.key === "Remarks") {
              const text = String(raw).trim();
              if (!text) {
                return `<td class="allocation-remarks-cell"></td>`;
              }
              const escaped = escapeHtml(text);
              return `<td class="allocation-remarks-cell"><span class="allocation-remarks-cell__text">${escaped}</span></td>`;
            }
            if (column.isDate) {
              const display = formatUtcToUserDateDisplay(raw) || String(raw).trim();
              return `<td>${escapeHtml(display)}</td>`;
            }
            const display = formatCellDisplayMarkup(raw, {
              columnLabel: column.label || column.key,
              internalName: column.key
            });
            return `<td>${display}</td>`;
          })
          .join("");
        return `<tr data-record-key="${recordKey}">${actionCell}${cells}</tr>`;
      })
      .join("");
  }

  function renderAllocationGrid() {
    if (!ui.allocationTableBody || !ui.allocationTableHeadRow) return;
    hideAllocationRemarksTooltip();
    renderAllocationTableHead();
    const sortedRows = getSortedAllocationRows(state.allocationRowsRaw || []);
    renderAllocationTableBody(sortedRows);
    scheduleAllocationMenuPosition();
    refreshSerialGridTable(ui.allocationTable, { resizeStorageKey: ALLOCATION_TABLE_RESIZE_KEY });
  }

  function getAllocationRepositoryTargets() {
    return [
      ALLOCATION_REPOSITORY.repositoryObjectKey,
      ALLOCATION_REPOSITORY.repositoryName,
      "EAsset_Allocation",
      "EAsset Allocation"
    ].filter(Boolean);
  }

  async function ensureAllocationRepoContext(signal) {
    if (state.allocationRepoContext && state.allocationRepoContext.objectID) {
      return state.allocationRepoContext;
    }
    const ctx = await resolveRepositoryContext(
      ALLOCATION_REPOSITORY.repositoryName,
      ALLOCATION_REPOSITORY.repositoryObjectKey,
      signal
    );
    if (ctx && ctx.objectID) {
      state.allocationRepoContext = ctx;
    }
    return state.allocationRepoContext;
  }

  function reloadAllocationAfterFormClose() {
    const details = state.latestDetailsForAllocation;
    if (!details) return;
    loadAllocationRows(details).catch(() => {
      state.allocationRowsRaw = [];
      renderAllocationGrid();
    });
  }

  async function openAllocationRecordView(recordId) {
    const id = String(recordId || "").trim();
    if (!id) return;
    const onDone = () => {
      reloadAllocationAfterFormClose();
    };
    const qafPageService = window.QafPageService || (window.parent && window.parent.QafPageService);
    if (qafPageService && typeof qafPageService.ViewItem === "function") {
      const targets = getAllocationRepositoryTargets();
      for (let i = 0; i < targets.length; i += 1) {
        try {
          qafPageService.ViewItem(targets[i], id, onDone);
          return;
        } catch (_error) {
          // Try next repository name.
        }
      }
    }
    const ctx = await ensureAllocationRepoContext();
    const objectID = String((ctx && ctx.objectID) || "").trim();
    const viewID = String((ctx && ctx.viewID) || "").trim();
    if (!objectID) return;
    const formUrl = new URL(`${window.location.origin}/workflow-engine/i-form`);
    formUrl.searchParams.set("mode", "view");
    formUrl.searchParams.set("objectID", objectID);
    formUrl.searchParams.set("recordID", id);
    if (viewID) formUrl.searchParams.set("viewID", viewID);
    formUrl.searchParams.set("drMode", "true");
    window.location.assign(formUrl.toString());
  }

  async function openAllocationRecordEdit(recordId) {
    const id = String(recordId || "").trim();
    if (!id) return;
    const onDone = () => {
      reloadAllocationAfterFormClose();
    };
    const qafPageService = window.QafPageService || (window.parent && window.parent.QafPageService);
    if (qafPageService && typeof qafPageService.EditItem === "function") {
      const targets = getAllocationRepositoryTargets();
      for (let i = 0; i < targets.length; i += 1) {
        try {
          qafPageService.EditItem(targets[i], id, onDone);
          return;
        } catch (_error) {
          // Try next repository name.
        }
      }
    }
    const ctx = await ensureAllocationRepoContext();
    const objectID = String((ctx && ctx.objectID) || "").trim();
    const viewID = String((ctx && ctx.viewID) || "").trim();
    if (!objectID) return;
    const formUrl = new URL(`${window.location.origin}/workflow-engine/i-form`);
    formUrl.searchParams.set("mode", "edit");
    formUrl.searchParams.set("objectID", objectID);
    formUrl.searchParams.set("recordID", id);
    if (viewID) formUrl.searchParams.set("viewID", viewID);
    window.location.assign(formUrl.toString());
  }

  function getRecordIdFromAllocationRecordKey(recordKey) {
    const text = String(recordKey || "");
    if (text.startsWith("RecordID:")) {
      return text.slice("RecordID:".length).trim();
    }
    return "";
  }

  async function handleAllocationRowAction(actionKey, recordKey) {
    const recordId = getRecordIdFromAllocationRecordKey(recordKey);
    if (!recordId) return;
    if (actionKey === "view") {
      await openAllocationRecordView(recordId);
      return;
    }
    if (actionKey === "edit") {
      const details = state.pageDetails || state.latestDetailsForAllocation || null;
      if (isAssetItemStatusAllocated(details)) return;
      await openAllocationRecordEdit(recordId);
    }
  }

  function onAllocationSectionClick(event) {
    const sortHeader = event.target.closest("th[data-allocation-sort-key]");
    if (sortHeader && ui.allocationTableHeadRow && ui.allocationTableHeadRow.contains(sortHeader)) {
      if (event.target.closest(".gt-col-resizer")) return;
      const columnKey = sortHeader.getAttribute("data-allocation-sort-key");
      const columnIndex = Number(sortHeader.getAttribute("data-allocation-sort-index"));
      if (!columnKey || !Number.isFinite(columnIndex)) return;
      event.preventDefault();
      updateAllocationSortState(columnIndex, columnKey);
      renderAllocationGrid();
      return;
    }

    const toggleButton = event.target.closest("button[data-allocation-menu-toggle]");
    if (toggleButton) {
      event.preventDefault();
      event.stopPropagation();
      const recordKey = String(toggleButton.getAttribute("data-record-key") || "");
      if (!recordKey) return;
      state.activeAllocationMenuRecordKey =
        state.activeAllocationMenuRecordKey === recordKey ? null : recordKey;
      renderAllocationGrid();
      return;
    }

    const actionButton = event.target.closest("button[data-allocation-row-action]");
    if (!actionButton) return;
    event.preventDefault();
    event.stopPropagation();
    const actionKey = String(actionButton.getAttribute("data-allocation-row-action") || "").trim().toLowerCase();
    const recordKey = String(actionButton.getAttribute("data-record-key") || "").trim();
    if (!actionKey || !recordKey) return;
    state.activeAllocationMenuRecordKey = null;
    renderAllocationGrid();
    handleAllocationRowAction(actionKey, recordKey).catch(() => {});
  }

  function onDocumentClickCloseAllocationMenu(event) {
    if (event.target.closest("#assetSerialDetailsAppHost .allocation-table .row-actions")) {
      return;
    }
    if (state.activeAllocationMenuRecordKey) {
      closeAllocationRowMenu();
    }
  }

  let allocationRemarksTooltipEl = null;

  function ensureAllocationRemarksTooltip() {
    if (!allocationRemarksTooltipEl) {
      allocationRemarksTooltipEl = document.createElement("div");
      allocationRemarksTooltipEl.className = "allocation-remarks-tooltip-float";
      allocationRemarksTooltipEl.setAttribute("role", "tooltip");
      allocationRemarksTooltipEl.hidden = true;
      const host = document.getElementById("assetSerialDetailsAppHost") || document.body;
      host.appendChild(allocationRemarksTooltipEl);
    }
    return allocationRemarksTooltipEl;
  }

  function hideAllocationRemarksTooltip() {
    if (!allocationRemarksTooltipEl) return;
    allocationRemarksTooltipEl.hidden = true;
  }

  function showAllocationRemarksTooltip(textEl) {
    const text = String((textEl && textEl.textContent) || "").trim();
    if (!text) {
      hideAllocationRemarksTooltip();
      return;
    }
    const tooltip = ensureAllocationRemarksTooltip();
    tooltip.textContent = text;
    tooltip.hidden = false;
    const anchorRect = textEl.getBoundingClientRect();
    const gap = 8;
    let top = anchorRect.bottom + gap;
    let left = anchorRect.left;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - tooltipRect.width - 8);
      tooltip.style.left = `${left}px`;
    }
    if (tooltipRect.bottom > window.innerHeight - 8) {
      top = Math.max(8, anchorRect.top - tooltipRect.height - gap);
      tooltip.style.top = `${top}px`;
    }
  }

  function onAllocationRemarksPointerOver(event) {
    const textEl = event.target.closest(".allocation-remarks-cell__text");
    if (!textEl || !ui.allocationTableBody || !ui.allocationTableBody.contains(textEl)) return;
    showAllocationRemarksTooltip(textEl);
  }

  function onAllocationRemarksPointerOut(event) {
    const textEl = event.target.closest(".allocation-remarks-cell__text");
    if (!textEl) return;
    hideAllocationRemarksTooltip();
  }

  function onAllocationMenuScroll() {
    hideAllocationRemarksTooltip();
    if (state.activeAllocationMenuRecordKey) {
      closeAllocationRowMenu();
    }
  }

  function onAllocationMenuResize() {
    hideAllocationRemarksTooltip();
    if (!state.activeAllocationMenuRecordKey) return;
    scheduleAllocationMenuPosition();
  }

  function bindAllocationGridEvents() {
    if (allocationGridEventsBound) return;
    allocationGridEventsBound = true;
    ui.allocationSection?.addEventListener("click", onAllocationSectionClick);
    ui.allocationSection?.addEventListener("pointerover", onAllocationRemarksPointerOver);
    ui.allocationSection?.addEventListener("pointerout", onAllocationRemarksPointerOut);
    document.addEventListener("click", onDocumentClickCloseAllocationMenu);
    window.addEventListener("scroll", onAllocationMenuScroll, { passive: true });
    window.addEventListener("resize", onAllocationMenuResize);
    ui.allocationSection
      ?.querySelector(".allocation-table-wrap")
      ?.addEventListener("scroll", onAllocationMenuScroll, { passive: true });
  }

  async function loadAllocationRows(details) {
    state.latestDetailsForAllocation = details;
    bindAllocationGridEvents();

    const allocationColCount = ALLOCATION_GRID_COLUMNS.length + 1;
    if (ui.allocationTableBody && ui.allocationTableHeadRow) {
      // Loading shows in the body only. Collapsing the head into a single
      // "Loading..." cell shrank the table to two columns and read as the table
      // disappearing, then re-appearing when the rows landed; rendering the real
      // head (and attaching GridTable to it) means the columns are already at
      // their final widths when the data arrives.
      renderAllocationTableHead();
      ui.allocationTableBody.innerHTML =
        `<tr><td colspan="${allocationColCount}" class="allocation-empty">Loading...</td></tr>`;
      refreshSerialGridTable(ui.allocationTable, { resizeStorageKey: ALLOCATION_TABLE_RESIZE_KEY });
    }

    const assetRecordId = String(details.recordId || "").trim();
    if (!assetRecordId) {
      state.allocationRowsRaw = [];
      renderAllocationGrid();
      return;
    }

    let rows = [];
    try {
      const payload = await apiGetItems(
        ALLOCATION_REPOSITORY.repositoryObjectKey,
        ALLOCATION_API_FIELD_LIST,
        buildAssetIdLinkWhereClause(assetRecordId),
        { pageSize: FILTERED_LIST_PAGE_SIZE, pageNumber: 1 }
      );
      const flatRows = normalizeRecords(payload)
        .map((row) => flattenRecord(row))
        .filter((row) => fieldContainsRecordId(row, ["AssetID", "Asset"], assetRecordId));
      await ensureEmployeeDirectoryForAllocation(flatRows);
      rows = flatRows.map((row, index) => {
        const mapped = mapAllocationRow(row, details);
        mapped.__repoIndex = index;
        return mapped;
      });
    } catch (_error) {
      rows = [];
    }

    rows.forEach((row) => enrichAllocationRowSortValues(row));
    state.allocationRowsRaw = rows;
    renderAllocationGrid();
  }

  function renderSummaryMeta(details) {
    ui.assetIdValue.textContent = details.recordId || "";
    ui.serialNumberValue.textContent = details.serialNumber || "";
  }

  async function openMasterEditForm(details) {
    if (!canShowMasterEditButton()) return;

    const recordId = String((details && details.recordId) || "").trim();
    if (!recordId) throw new Error("Missing asset record id.");

    const onEditDone = function () {
      state.tabLoaded.summaryPanel = false;
      loadParentAssetDetails(normalizeAssetDetails())
        .then(async (updated) => {
          state.pageDetails = updated;
          await ensureEmployeeDirectoryForSummary(updated.asset).catch(() => {});
          await ensureQafUsersDirectoryForSummary(updated.asset).catch(() => {});
          renderSummaryMeta(updated);
          renderSummaryFields(updated);
          loadAllocationRows(updated).catch(() => {});
          loadTicketsRows(updated).catch(() => {});
        })
        .catch(() => {});
    };

    const qafPageService = getQafPageService();
    if (qafPageService && typeof qafPageService.EditItem === "function") {
      qafPageService.EditItem(ASSET_MASTER_REPOSITORY, recordId, onEditDone);
      return;
    }

    const formUrl = new URL(`${window.location.origin}/workflow-engine/i-form`);
    formUrl.searchParams.set("mode", "edit");
    formUrl.searchParams.set("objectID", ASSET_FORM_OBJECT_ID);
    formUrl.searchParams.set("recordID", recordId);
    window.location.assign(formUrl.toString());
  }

  async function loadParentAssetDetails(details) {
    const recordId = String(details.recordId || "").trim();
    if (!recordId) return details;
    try {
      const objectMeta = await fetchAssetMasterObjectMeta();
      const sections = getSummarySectionsFromObject(objectMeta);
      const fieldList = getSummaryFieldListFromSections(sections);
      const flat = await fetchAssetMasterRecord(recordId, fieldList);
      if (!flat) return { ...details, objectMeta };
      const serialNumber =
        getSummaryValue(flat, "SerialNumber") ||
        getSummaryValue(flat, "SerialNo") ||
        getSummaryValue(flat, "SerialNo.") ||
        details.serialNumber;
      const assetName = getSummaryValue(flat, "AssetName") || details.assetName;
      return {
        ...details,
        serialNumber,
        assetName,
        objectMeta,
        asset: {
          ...(details.asset || {}),
          ...(flat || {})
        }
      };
    } catch (_error) {
      return details;
    }
  }

  function createSummaryCell(asset, fieldDef) {
    const col = document.createElement("div");
    col.className = "summary-col";

    const label = document.createElement("span");
    label.className = "summary-key";
    label.textContent = fieldDef.label || "";

    const value = document.createElement("span");
    value.className = "summary-value";
    const explicitValue = fieldDef && fieldDef.value != null ? String(fieldDef.value).trim() : "";
    const rawSummary =
      fieldDef.label && explicitValue
        ? explicitValue
        : fieldDef.label
          ? String(getValue(asset, fieldDef.keys || []) || "").trim()
          : "";
    const formatted = formatFieldDisplayValue(rawSummary, {
      label: fieldDef.label,
      internalName: fieldDef.internalName,
      objectMeta: fieldDef.objectMeta,
      applyCurrency: true
    });
    applyFormattedFieldValue(value, formatted, Boolean(fieldDef.label));

    // Fixed-height grid cells truncate with ellipsis; expose full text on hover.
    if (fieldDef.label) label.title = fieldDef.label;
    const valueText = String(value.textContent || "").trim();
    if (valueText && valueText !== "-") value.title = valueText;

    col.appendChild(label);
    col.appendChild(value);
    return col;
  }

  function getSummaryValue(asset, fieldName) {
    if (!asset || !fieldName) return "";
    const direct = asset[fieldName];
    if (direct != null && String(direct).trim() !== "") return parseLookupLabel(direct);
    const target = normalizeFieldToken(fieldName);
    const keys = Object.keys(asset);
    for (let i = 0; i < keys.length; i += 1) {
      if (normalizeFieldToken(keys[i]) !== target) continue;
      const value = asset[keys[i]];
      if (value != null && String(value).trim() !== "") return parseLookupLabel(value);
    }
    return "";
  }

  function buildSummaryFieldDef(details, objectMeta, internalName) {
    const label = getFieldDisplayName(objectMeta, internalName);
    const raw = getSummaryValue(details.asset, internalName);
    const token = normalizeFieldToken(label || internalName);
    const value =
      token === "assigned to" || token === "assignedto"
        ? formatAssignedToValue(raw)
        : token === "asset manager" || token === "assetmanager"
          ? formatAssetManagerValue(raw)
          : raw;
    return { label, value, internalName, objectMeta };
  }

  function renderSummaryFields(details) {
    if (!ui.summarySections) return;
    ui.summarySections.innerHTML = "";
    const objectMeta = details.objectMeta || state.masterObjectMeta || {};
    const sectionDefs = getSummarySectionsFromObject(objectMeta);
    if (!sectionDefs.length) {
      ui.summarySections.innerHTML = '<p class="empty-note">No Record Found</p>';
      return;
    }

    sectionDefs.forEach((sectionDef) => {
      const section = document.createElement("section");
      section.className = "detail-section";

      if (sectionDef.name) {
        const title = document.createElement("h2");
        title.className = "detail-section-title";
        title.textContent = sectionDef.name;
        section.appendChild(title);
      }

      // Column-flow layout: fields fill 5 rows top-to-bottom, then wrap into a
      // new column reached via the horizontal scrollbar (CSS: .detail-section-grid).
      const ROWS_PER_COLUMN = 5;
      const grid = document.createElement("div");
      grid.className = "detail-section-grid";

      const fieldNames = [];
      sectionDef.columns.forEach((column) => {
        (column.fields || []).forEach((internalName) => {
          if (internalName) fieldNames.push(internalName);
        });
      });

      // 5 is a MAX rows-per-column, not a fixed row count: size the grid's row
      // tracks to however many fields actually exist (capped at the max), so a
      // column with fewer fields doesn't reserve empty row height below them.
      const rowTrackCount = Math.max(Math.min(fieldNames.length, ROWS_PER_COLUMN), 1);
      grid.style.gridTemplateRows = `repeat(${rowTrackCount}, var(--asd-cell-h))`;

      // Render only the actual fields (no blank filler rows). Since columns are
      // no longer always a full 5 cells, the "last row of a column" / "last
      // column" border edges can't rely on CSS nth-child math anymore, so mark
      // them explicitly here.
      const lastColumnIndex = fieldNames.length
        ? Math.floor((fieldNames.length - 1) / ROWS_PER_COLUMN)
        : 0;
      fieldNames.forEach((internalName, index) => {
        const cell = createSummaryCell(
          details.asset,
          buildSummaryFieldDef(details, objectMeta, internalName)
        );
        const isLastRowInColumn = (index + 1) % ROWS_PER_COLUMN === 0 || index === fieldNames.length - 1;
        if (isLastRowInColumn) cell.classList.add("is-column-end");
        if (Math.floor(index / ROWS_PER_COLUMN) === lastColumnIndex) cell.classList.add("is-last-column");
        grid.appendChild(cell);
      });

      section.appendChild(grid);

      ui.summarySections.appendChild(section);
    });
  }

  function syncAssetEditBtnVisibility(targetPanelId) {
    if (!ui.assetEditBtn) return;
    const recordText = ui.assetIdValue ? String(ui.assetIdValue.textContent || "").trim() : "";
    const hasRecordId = Boolean(recordText);
    const show = hasRecordId && targetPanelId === "summaryPanel" && canShowMasterEditButton();
    ui.assetEditBtn.hidden = !show;
    ui.assetEditBtn.style.display = show ? "" : "none";
  }

  function activateTab(targetPanelId) {
    ui.tabs.forEach((tab) => {
      const isActive = tab.getAttribute("data-tab-target") === targetPanelId;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });

    ui.panels.forEach((panel) => {
      const isActive = panel.id === targetPanelId;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });

    if (ui.summaryTabRegion) {
      ui.summaryTabRegion.hidden = targetPanelId !== "summaryPanel";
    }
    if (ui.otherDetailCard) {
      ui.otherDetailCard.hidden = targetPanelId !== "otherDetailPanel";
    }
    if (ui.historyCard) {
      ui.historyCard.hidden = targetPanelId !== "historyPanel";
    }
    if (ui.dependencyCard) {
      ui.dependencyCard.hidden = targetPanelId !== "dependencyPanel";
    }

    syncAssetEditBtnVisibility(targetPanelId);
    ensureTabDataLoaded(targetPanelId);
  }

  function bindTabs() {
    ui.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const targetPanelId = String(tab.getAttribute("data-tab-target") || "").trim();
        if (!targetPanelId) return;
        activateTab(targetPanelId);
      });
    });
  }

  function ensureTabDataLoaded(targetPanelId) {
    const details = state.pageDetails;
    if (!details) return;
    if (state.tabLoaded[targetPanelId]) return;
    if (state.tabLoadPromises[targetPanelId]) return;

    const finish = (loader) => {
      const pending = Promise.resolve()
        .then(loader)
        .then(() => {
          state.tabLoaded[targetPanelId] = true;
        })
        .finally(() => {
          state.tabLoadPromises[targetPanelId] = null;
        });
      state.tabLoadPromises[targetPanelId] = pending;
    };

    if (targetPanelId === "summaryPanel") {
      finish(async () => {
        await Promise.all([
          loadAllocationRows(details).catch(() => {
            state.allocationRowsRaw = [];
            renderAllocationGrid();
          }),
          loadTicketsRows(details).catch(() => {
            state.ticketsRowsRaw = [];
            renderTicketsGrid({ rows: [], columns: [] });
          })
        ]);
      });
      return;
    }

    if (targetPanelId === "otherDetailPanel") {
      finish(async () => {
        await loadOtherDetails(details).catch(() => {
          renderOtherDetailSections([]);
        });
      });
      return;
    }

    if (targetPanelId === "historyPanel") {
      finish(async () => {
        await loadHistoryRows(details).catch(() => {
          state.historyRowsRaw = [];
          renderHistoryGrid({ rows: [], columns: [] });
        });
      });
      return;
    }

    if (targetPanelId === "dependencyPanel") {
      finish(async () => {
        await loadDependencyRows(details).catch(() => {
          state.dependencyRowsRaw = [];
          renderDependencyGraph({ nodes: [], edges: [] });
        });
      });
    }
  }

  /**
   * Holds first paint until a tab's initial load has rendered, so the page shows
   * up once - populated - instead of showing empty tables that re-render a
   * moment later when the API answers.
   *
   * Capped by design: a slow or stalled request may delay the page, never hide
   * it. When the cap wins, the tables simply appear in their loading state and
   * fill in as before.
   */
  function waitForTabFirstLoad(panelId, maxMs) {
    const pending = state.tabLoadPromises[panelId];
    if (!pending || typeof pending.then !== "function") return Promise.resolve();
    return Promise.race([
      pending.catch(() => {}),
      new Promise((resolve) => {
        setTimeout(resolve, maxMs);
      })
    ]);
  }

  /* ------------------------------------------------------------------
     Add Relationship modal

     Relationship Type is populated dynamically from
     {base_url}/api/rnsp (Name: "Asset_Dependency_Add_Relationship").
     The Destination CI "Type"/"Category" filters are populated
     dynamically from {base_url}/api/rnsp (Name: "Asset_Dependency_Filter")
     and drive the Destination CI candidate list.

     Saving posts to {base_url}/api/SaveRecord with the
     Asset_Relationship objectID. Every lookup value is built as
     "GUID;#DisplayValue" from the actually selected records.
  ------------------------------------------------------------------ */

  state.relationship = {
    selectedType: null,
    // Which column of the selected pair the user clicked: "type" or
    // "inverse". Only affects which value stays displayed.
    selectedSide: "type",
    destinationOptions: [],
    selectedDestinationIds: new Set(),
    typeOptions: [],
    typeOptionsLoaded: false,
    typeOptionsLoading: false,
    filterRows: [],
    filterRowsLoaded: false,
    filterRowsLoading: false,
    filterSelectedType: "",
    filterSelectedCategory: "",
    destinationRequestToken: 0,
    isSaving: false
  };

  let addRelationshipEventsBound = false;

  function getRelationshipSourceCiLabel() {
    const details = state.pageDetails || {};
    const serialNumber = details.serialNumber ? String(details.serialNumber).trim() : "";
    const assetName = details.assetName ? String(details.assetName).trim() : "";
    if (serialNumber && assetName) return serialNumber + "-" + assetName;
    if (assetName) return assetName;
    if (serialNumber) return serialNumber;
    const fromIdEl = ui.assetIdValue ? String(ui.assetIdValue.textContent || "").trim() : "";
    if (fromIdEl) return fromIdEl;
    return details.recordId ? String(details.recordId).trim() : "";
  }

  /** Maps one Asset_Dependency_Add_Relationship RNSP row to a
   *  { type, inverse, guid } option. Lookup-formatted values
   *  ("guid;#Label") are split into their display label and their GUID so
   *  the GUID can be sent back in "GUID;#DisplayValue" form on save —
   *  nothing about the lookup is hardcoded. */
  function mapRelationshipTypeRow(row) {
    const typeKeys = ["RelationshipType", "Relationship Type", "RelationType", "Name"];
    const inverseKeys = [
      "ReverseRelationshipType",
      "Reverse Relationship Type",
      "ReverseRelationship",
      "Reverse Relationship",
      "InverseRelationshipType",
      "Inverse Relationship Type",
      "InverseRelationship",
      "Inverse Relationship"
    ];
    const type = getValue(row, typeKeys);
    const inverse = getValue(row, inverseKeys);

    // The Relationship_Type RecordID for this row. Both Relationship Type
    // and Reverse Relationship live on the same record, so this one
    // RecordID is what gets stored for both — never a GUID pulled out of
    // some other lookup value.
    let recordId = String(
      getRawFieldValue(row, ["RecordID", "RecordId", "ID", "GUID", "RelationshipTypeID"]) || ""
    ).trim();
    if (recordId.indexOf(";#") !== -1) recordId = extractLookupId(recordId);

    return { type, inverse, recordId, guid: recordId };
  }

  async function ensureRelationshipTypeOptionsLoaded() {
    if (state.relationship.typeOptionsLoaded || state.relationship.typeOptionsLoading) return;
    state.relationship.typeOptionsLoading = true;
    try {
      const rows = await fetchRnspRows(ADD_RELATIONSHIP_TYPE_RNSP_NAME, {});
      const seen = new Set();
      const options = [];
      rows.forEach((row) => {
        const mapped = mapRelationshipTypeRow(row);
        if (!mapped.type || seen.has(mapped.type)) return;
        seen.add(mapped.type);
        options.push(mapped);
      });
      state.relationship.typeOptions = options;
    } finally {
      state.relationship.typeOptionsLoaded = true;
      state.relationship.typeOptionsLoading = false;
    }
  }

  /** Raw Type value for one Asset_Dependency_Filter row, resolved down
   *  to its display label ("Server", "Software License", etc.) even
   *  when stored in lookup format ("guid;#Server"). */
  function getFilterRowType(row) {
    return getValue(row, ["Type", "AssetType", "CIType"]);
  }

  function getFilterRowCategory(row) {
    return getValue(row, ["Category", "AssetCategory", "CICategory", "SubCategory"]);
  }

  function getFilterRowName(row) {
    return getValue(row, ["AssetName", "Name", "CIName", "AssetNo", "SerialNumber"]);
  }

  function getFilterRowId(row) {
    const id = getValue(row, ["RecordID", "ID", "AssetID", "RecordId", "ObjectID"]);
    return String(id || getFilterRowName(row) || "").trim();
  }

  async function ensureDependencyFilterRowsLoaded() {
    if (state.relationship.filterRowsLoaded || state.relationship.filterRowsLoading) return;
    state.relationship.filterRowsLoading = true;
    try {
      const rows = await fetchRnspRows(ASSET_DEPENDENCY_FILTER_RNSP_NAME, {});
      state.relationship.filterRows = Array.isArray(rows) ? rows : [];
    } finally {
      state.relationship.filterRowsLoaded = true;
      state.relationship.filterRowsLoading = false;
    }
  }

  /* ------------------------------------------------------------------
     Custom dropdowns for the Destination CI "Type" / "Category" filters.

     Mirrors the Agent Performance Dashboard implementation: the native
     <select> is kept in the DOM (so existing value/change handling is
     untouched) and is visually replaced by a trigger + menu. The menu is
     capped at 4 visible rows by CSS and scrolls beyond that.
  ------------------------------------------------------------------ */
  function closeRelDestSelectMenus() {
    const openWraps = document.querySelectorAll(".rel-dest-custom-select.is-open");
    openWraps.forEach((wrap) => {
      wrap.classList.remove("is-open");
      wrap.classList.remove("is-drop-up");
      const menu = wrap.querySelector(".rel-dest-select-menu");
      const trigger = wrap.querySelector(".rel-dest-select-trigger");
      if (menu) menu.hidden = true;
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    });
  }

  function openRelDestSelectMenu(wrap) {
    closeRelDestSelectMenus();
    wrap.classList.add("is-open");
    const menu = wrap.querySelector(".rel-dest-select-menu");
    const trigger = wrap.querySelector(".rel-dest-select-trigger");
    if (menu) menu.hidden = false;
    if (trigger) trigger.setAttribute("aria-expanded", "true");

    // The modal body scrolls, so flip the menu above the trigger when
    // there is not enough room below it.
    if (menu && trigger) {
      const scroller = wrap.closest(".rel-modal__body");
      if (scroller) {
        const triggerRect = trigger.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        const spaceBelow = scrollerRect.bottom - triggerRect.bottom;
        const spaceAbove = triggerRect.top - scrollerRect.top;
        const needed = menu.offsetHeight + 8;
        if (spaceBelow < needed && spaceAbove > spaceBelow) {
          wrap.classList.add("is-drop-up");
        }
      }
    }
  }

  function syncRelDestCustomSelect(select) {
    const wrap = select && select.closest(".rel-dest-custom-select");
    if (!wrap) return;

    const label = wrap.querySelector(".rel-dest-select-trigger__label");
    const menu = wrap.querySelector(".rel-dest-select-menu");
    if (!label || !menu) return;

    const value = String(select.value == null ? "" : select.value);
    const selected = select.options[select.selectedIndex];
    const selectedText = selected ? selected.text : "";
    label.textContent = selectedText;
    if (selectedText) label.title = selectedText;
    else label.removeAttribute("title");

    menu.querySelectorAll(".rel-dest-select-option").forEach((btn) => {
      const isSelected = String(btn.getAttribute("data-value")) === value;
      btn.classList.toggle("is-selected", isSelected);
      btn.setAttribute("aria-selected", isSelected ? "true" : "false");
    });
  }

  function buildRelDestSelectMenu(select, menu) {
    menu.innerHTML = "";
    for (let i = 0; i < select.options.length; i += 1) {
      const opt = select.options[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rel-dest-select-option";
      btn.setAttribute("role", "option");
      btn.setAttribute("data-value", opt.value);
      btn.textContent = opt.text;
      btn.title = opt.text;
      btn.addEventListener("click", (event) => {
        // Same label-forwarding issue as the trigger: this button sits
        // inside the <label for="..."> for the native select, so without
        // preventDefault() the browser still fires a native click on the
        // hidden select after we've already applied the value ourselves.
        event.preventDefault();
        event.stopPropagation();
        select.value = opt.value;
        closeRelDestSelectMenus();
        select.dispatchEvent(new Event("change", { bubbles: true }));
        syncRelDestCustomSelect(select);
      });
      menu.appendChild(btn);
    }
  }

  function bindRelDestSelectOutsideClose() {
    if (document.__relDestSelectOutsideBound) return;
    document.__relDestSelectOutsideBound = true;
    document.addEventListener("click", closeRelDestSelectMenus);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeRelDestSelectMenus();
    });
  }

  function enhanceRelDestSelect(select) {
    if (!select) return;

    if (select.__relDestCustomEnhanced) {
      syncRelDestCustomSelect(select);
      return;
    }

    const wrap = select.closest(".rel-dest-select-wrap");
    if (!wrap) return;

    wrap.classList.add("rel-dest-custom-select");
    select.classList.add("rel-dest-select--native");

    const trigger = document.createElement("div");
    trigger.className = "rel-dest-select-trigger";
    trigger.setAttribute("role", "button");
    trigger.setAttribute("tabindex", "0");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");

    const label = document.createElement("span");
    label.className = "rel-dest-select-trigger__label";

    const chevron = document.createElement("span");
    chevron.className = "rel-dest-select__chevron";
    chevron.setAttribute("aria-hidden", "true");

    trigger.appendChild(label);
    trigger.appendChild(chevron);

    const menu = document.createElement("div");
    menu.className = "rel-dest-select-menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;

    wrap.appendChild(trigger);
    wrap.appendChild(menu);

    buildRelDestSelectMenu(select, menu);
    syncRelDestCustomSelect(select);

    trigger.addEventListener("click", (event) => {
      // The trigger lives inside the <label for="..."> for this select, so
      // without preventDefault() the browser still forwards this click to
      // the real (visually hidden, 1x1-clipped) native <select> and pops
      // its native dropdown at that clipped anchor point — that's what was
      // making the dropdown appear shifted/misaligned when opened.
      event.preventDefault();
      event.stopPropagation();
      if (wrap.classList.contains("is-open")) closeRelDestSelectMenus();
      else openRelDestSelectMenu(wrap);
    });

    trigger.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        event.stopPropagation();
        if (wrap.classList.contains("is-open")) closeRelDestSelectMenus();
        else openRelDestSelectMenu(wrap);
      } else if (event.key === "Escape") {
        closeRelDestSelectMenus();
      }
    });

    // Guards the rest of the <label for="..."> hit area (e.g. clicking the
    // "Type"/"Category" wording itself) against the same native
    // label-to-control click forwarding that the trigger/option fixes
    // above address — without this, that browser default action still
    // pops the hidden native select at its clipped anchor point.
    const parentLabel = select.closest("label");
    if (parentLabel && !parentLabel.__relDestLabelGuardBound) {
      parentLabel.addEventListener("click", (event) => {
        if (event.target === trigger || trigger.contains(event.target)) return;
        if (menu.contains(event.target)) return;
        event.preventDefault();
      });
      parentLabel.__relDestLabelGuardBound = true;
    }

    bindRelDestSelectOutsideClose();
    select.__relDestCustomEnhanced = true;
  }

  /** Rebuilds the custom menu after the underlying <option> list changed. */
  function refreshRelDestCustomSelect(select) {
    if (!select) return;
    if (!select.__relDestCustomEnhanced) {
      enhanceRelDestSelect(select);
      return;
    }
    const wrap = select.closest(".rel-dest-custom-select");
    const menu = wrap && wrap.querySelector(".rel-dest-select-menu");
    if (menu) buildRelDestSelectMenu(select, menu);
    syncRelDestCustomSelect(select);
  }

  function initRelDestFilterSelects() {
    enhanceRelDestSelect(ui.relTypeFilterSelect);
    enhanceRelDestSelect(ui.relCategoryFilterSelect);
  }

  /** Populates the Type filter dropdown with de-duplicated, dynamically
   *  fetched values (no hardcoded list). */
  function populateFilterTypeOptions() {
    if (!ui.relTypeFilterSelect) return;
    const rows = state.relationship.filterRows || [];
    const seen = new Set();
    const types = [];
    rows.forEach((row) => {
      const typeLabel = getFilterRowType(row);
      if (!typeLabel || seen.has(typeLabel)) return;
      seen.add(typeLabel);
      types.push(typeLabel);
    });
    const previous = state.relationship.filterSelectedType;
    ui.relTypeFilterSelect.innerHTML =
      '<option value="">All</option>' +
      types.map((typeLabel) => '<option value="' + escapeHtml(typeLabel) + '">' + escapeHtml(typeLabel) + "</option>").join("");
    ui.relTypeFilterSelect.value = types.includes(previous) ? previous : "";
    state.relationship.filterSelectedType = ui.relTypeFilterSelect.value;
    refreshRelDestCustomSelect(ui.relTypeFilterSelect);
  }

  /** Category options are scoped to the selected Type: comparing the
   *  post-";#" display value, per the Asset_Dependency_Filter rows.
   *  When called after a Type change, the previously selected Category is
   *  kept selected if it is still a valid option for the new Type — only
   *  falling back to "All" when it no longer applies — so that switching
   *  Type alone re-queries with the same Category the user had chosen. */
  function populateFilterCategoryOptions() {
    if (!ui.relCategoryFilterSelect) return;
    const rows = state.relationship.filterRows || [];
    const selectedType = state.relationship.filterSelectedType;
    const previousCategory = state.relationship.filterSelectedCategory;
    const seen = new Set();
    const categories = [];
    rows.forEach((row) => {
      if (selectedType && getFilterRowType(row) !== selectedType) return;
      const categoryLabel = getFilterRowCategory(row);
      if (!categoryLabel || seen.has(categoryLabel)) return;
      seen.add(categoryLabel);
      categories.push(categoryLabel);
    });
    ui.relCategoryFilterSelect.innerHTML =
      '<option value="">All</option>' +
      categories
        .map((categoryLabel) => '<option value="' + escapeHtml(categoryLabel) + '">' + escapeHtml(categoryLabel) + "</option>")
        .join("");
    ui.relCategoryFilterSelect.value = categories.includes(previousCategory) ? previousCategory : "";
    state.relationship.filterSelectedCategory = ui.relCategoryFilterSelect.value;
    refreshRelDestCustomSelect(ui.relCategoryFilterSelect);
  }

  /** Serial number for one Asset_Dependency_EAsset_Data row. */
  function getAssetDataRowSerialNumber(row) {
    return getValue(row, ["SerialNumber", "Serial Number", "Serial_No", "SerialNo"]);
  }

  /** Asset name for one Asset_Dependency_EAsset_Data row. */
  function getAssetDataRowAssetName(row) {
    return getValue(row, ["AssetName", "Asset Name", "Asset_Name", "Name"]);
  }

  /** Destination CI display label: "SerialNumber-AssetName".
   *  Falls back to whichever part is present when one side is blank. */
  function buildAssetDataRowLabel(row) {
    const serialNumber = String(getAssetDataRowSerialNumber(row) || "").trim();
    const assetName = String(getAssetDataRowAssetName(row) || "").trim();
    if (serialNumber && assetName) return serialNumber + "-" + assetName;
    return serialNumber || assetName || "";
  }

  /** Fetches the Destination CI candidates from {base_url}/api/rnsp
   *  (Name: "Asset_Dependency_EAsset_Data"). All three args are resolved
   *  at call time — never hardcoded:
   *    SelectedRecordIDParam = the asset currently open on this page
   *                            (page details, falling back to the URL),
   *    TypeParam             = the selected Type, or "ALL",
   *    CategoryParam         = the selected Category, or "ALL".
   *  A real selection is always sent verbatim, including values like "-". */
  async function fetchAssetDependencyEAssetData(typeParam, categoryParam) {
    const details = state.pageDetails || {};
    const selectedRecordId = String(
      details.recordId || getUrlParamCaseInsensitive("recordId") || ""
    ).trim();
    const type = String(typeParam == null ? "" : typeParam).trim();
    const category = String(categoryParam == null ? "" : categoryParam).trim();

    return fetchRnspRows(
      ASSET_DEPENDENCY_EASSET_DATA_RNSP_NAME,
      {
        SelectedRecordIDParam: selectedRecordId,
        // Empty means the dropdown is on "All"; anything else is passed through as-is.
        TypeParam: type || "ALL",
        CategoryParam: category || "ALL"
      },
      undefined,
      // The RNSP can return its rows in batches; every batch is kept, so
      // the full result set is displayed rather than just the first 100.
      { allBatches: true }
    );
  }

  /** Applies the currently selected Type/Category filter values to the
   *  Destination CI candidate list. Triggered automatically whenever the
   *  Type or Category dropdown changes. */
  async function applyDestinationFilter() {
    const typeVal = state.relationship.filterSelectedType || "";
    const categoryVal = state.relationship.filterSelectedCategory || "";
    const rootLabel = getRelationshipSourceCiLabel();

    // Guard against out-of-order responses when Update is clicked repeatedly.
    const requestToken = (state.relationship.destinationRequestToken || 0) + 1;
    state.relationship.destinationRequestToken = requestToken;

    if (ui.relDestList) {
      ui.relDestList.innerHTML = '<p class="rel-dest-empty">Loading...</p>';
    }
    if (ui.relDestPageInfo) ui.relDestPageInfo.textContent = "";

    const rows = await fetchAssetDependencyEAssetData(typeVal, categoryVal);
    if (state.relationship.destinationRequestToken !== requestToken) return;

    const seenIds = new Set();
    state.relationship.destinationOptions = (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
      const serialNumber = String(getAssetDataRowSerialNumber(row) || "").trim();
      const assetName = String(getAssetDataRowAssetName(row) || "").trim();
      const name = buildAssetDataRowLabel(row);
      if (!name || name === rootLabel) return acc;

      // EAsset_Master lookup GUID for this row, when the RNSP returns one.
      let guid = String(
        getRawFieldValue(row, ["RecordID", "RecordId", "AssetID", "AssetId", "ID", "GUID"]) || ""
      ).trim();
      if (guid.indexOf(";#") !== -1) guid = extractLookupId(guid);

      // Keyed on the RecordID when there is one, so two distinct assets
      // that happen to share a display label are both kept.
      const id = guid || name;
      if (seenIds.has(id)) return acc;
      seenIds.add(id);

      acc.push({ id, name, serialNumber, assetName, guid: guid || "" });
      return acc;
    }, []);
    renderDestinationList();
  }

  /* ------------------------------------------------------------------
     Relationship Type / Reverse Relationship

     Original accordion + pair table UI. Each table row is one
     Relationship Type / Reverse Relationship pair, so clicking a row
     selects exactly one relationship and keeps both fields in sync.
     Only the selected pair stays marked, and the collapsed row shows
     only that selection.
  ------------------------------------------------------------------ */

  function renderRelationshipTypeTable() {
    if (!ui.relTypeTableBody) return;
    const options = state.relationship.typeOptions || [];
    if (!options.length) {
      ui.relTypeTableBody.innerHTML =
        '<tr><td colspan="2" class="rel-type-table-empty">No Record Found</td></tr>';
      return;
    }
    ui.relTypeTableBody.innerHTML = options.map((option, index) => {
      const isSelected =
        state.relationship.selectedType && state.relationship.selectedType.type === option.type;
      return (
        '<tr data-rel-type="' +
        escapeHtml(option.type) +
        '" data-rel-index="' +
        index +
        '" class="' +
        (isSelected ? "is-selected" : "") +
        '">' +
        '<td data-rel-side="type">' +
        escapeHtml(option.type) +
        "</td>" +
        '<td data-rel-side="inverse">' +
        escapeHtml(option.inverse) +
        "</td>" +
        "</tr>"
      );
    }).join("");
  }

  /** Selects a single relationship pair. The user can click either the
   *  Relationship Type or the Reverse Relationship cell: whichever value
   *  they clicked is the one kept on screen, while the matching opposite
   *  value is resolved from the same row in the background. Both are
   *  stored with their own GUIDs on save. */
  function selectRelationshipType(typeValue, side) {
    const option = (state.relationship.typeOptions || []).find((item) => item.type === typeValue);
    if (!option) return;
    state.relationship.selectedType = option;
    state.relationship.selectedSide = side === "inverse" ? "inverse" : "type";
    state.relationship.selectedDestinationIds = new Set();
    collapseRelTypePanel();

    if (ui.relDestRow) {
      ui.relDestRow.disabled = false;
      ui.relDestRow.classList.remove("rel-accordion-row--disabled");
    }
    if (ui.relDestLabel) ui.relDestLabel.textContent = "Destination CIs";
    if (ui.relDestHint) ui.relDestHint.hidden = true;
    collapseRelDestPanel();
    state.relationship.destinationOptions = [];
    if (ui.relDestList) ui.relDestList.innerHTML = "";
    if (ui.relDestPageInfo) ui.relDestPageInfo.textContent = "";
    updateAddRelationshipButtonState();
  }

  function collapseRelTypePanel() {
    if (!ui.relTypeRow || !ui.relTypePanel) return;
    ui.relTypeRow.setAttribute("aria-expanded", "false");
    ui.relTypePanel.hidden = true;
    // Collapsed state shows only the value the user actually clicked —
    // the Relationship Type or its Reverse Relationship.
    if (ui.relTypeSelectedValue) {
      const selected = state.relationship.selectedType;
      if (!selected) {
        ui.relTypeSelectedValue.textContent = "";
      } else {
        ui.relTypeSelectedValue.textContent =
          state.relationship.selectedSide === "inverse" ? selected.inverse : selected.type;
      }
    }
  }

  async function expandRelTypePanel() {
    if (!ui.relTypeRow || !ui.relTypePanel) return;
    ui.relTypeRow.setAttribute("aria-expanded", "true");
    ui.relTypePanel.hidden = false;
    if (ui.relTypeSelectedValue) ui.relTypeSelectedValue.textContent = "";
    if (!state.relationship.typeOptionsLoaded) {
      if (ui.relTypeTableBody) {
        ui.relTypeTableBody.innerHTML =
          '<tr><td colspan="2" class="rel-type-table-empty">Loading...</td></tr>';
      }
      await ensureRelationshipTypeOptionsLoaded();
    }
    renderRelationshipTypeTable();
  }

  function toggleRelTypePanel() {
    if (!ui.relTypePanel) return;
    if (ui.relTypePanel.hidden) {
      expandRelTypePanel();
    } else {
      collapseRelTypePanel();
    }
  }

  function renderDestinationList() {
    if (!ui.relDestList) return;
    const options = state.relationship.destinationOptions || [];
    if (!options.length) {
      ui.relDestList.innerHTML = '<p class="rel-dest-empty">No Record Found</p>';
      if (ui.relDestPageInfo) ui.relDestPageInfo.textContent = "0";
      return;
    }
    ui.relDestList.innerHTML = options
      .map((option) => {
        const checked = state.relationship.selectedDestinationIds.has(option.id) ? "checked" : "";
        const inputId = "relDestOpt_" + escapeHtml(String(option.id));
        return (
          '<div class="rel-dest-item">' +
          '<input type="checkbox" id="' +
          inputId +
          '" data-rel-dest-id="' +
          escapeHtml(String(option.id)) +
          '" ' +
          checked +
          " />" +
          '<label for="' +
          inputId +
          '">' +
          escapeHtml(option.name) +
          "</label>" +
          "</div>"
        );
      })
      .join("");
    if (ui.relDestPageInfo) {
      // Total record count only — no "1 - 97 of 97" range.
      ui.relDestPageInfo.textContent = String(options.length);
    }
  }

  function updateAddRelationshipButtonState() {
    if (!ui.relAddBtn) return;
    const hasType = Boolean(state.relationship.selectedType);
    const hasDestination = state.relationship.selectedDestinationIds.size > 0;
    ui.relAddBtn.disabled = !(hasType && hasDestination) || Boolean(state.relationship.isSaving);
  }

  function collapseRelDestPanel() {
    if (!ui.relDestRow || !ui.relDestPanel) return;
    ui.relDestRow.setAttribute("aria-expanded", "false");
    ui.relDestPanel.hidden = true;
  }

  async function expandRelDestPanel() {
    if (!ui.relDestRow || ui.relDestRow.disabled || !ui.relDestPanel) return;
    ui.relDestRow.setAttribute("aria-expanded", "true");
    ui.relDestPanel.hidden = false;
    if (!state.relationship.filterRowsLoaded) {
      if (ui.relDestList) {
        ui.relDestList.innerHTML = '<p class="rel-dest-empty">Loading...</p>';
      }
      await ensureDependencyFilterRowsLoaded();
    }
    populateFilterTypeOptions();
    populateFilterCategoryOptions();
    // The Destination CI list loads automatically as soon as the panel
    // opens, using whatever Type / Category are currently selected.
    applyDestinationFilter().catch((error) => {
      console.warn("[Asset Dependency] Destination CI load failed:", error);
    });
  }

  function toggleRelDestPanel() {
    if (!ui.relDestRow || ui.relDestRow.disabled || !ui.relDestPanel) return;
    if (ui.relDestPanel.hidden) {
      expandRelDestPanel();
    } else {
      collapseRelDestPanel();
    }
  }

  function resetAddRelationshipModal() {
    state.relationship.selectedType = null;
    state.relationship.selectedSide = "type";
    state.relationship.destinationOptions = [];
    state.relationship.selectedDestinationIds = new Set();
    state.relationship.filterSelectedType = "";
    state.relationship.filterSelectedCategory = "";

    if (ui.relSourceCiValue) ui.relSourceCiValue.textContent = getRelationshipSourceCiLabel();
    if (ui.relTypeSelectedValue) ui.relTypeSelectedValue.textContent = "";
    collapseRelTypePanel();

    if (ui.relDestRow) {
      ui.relDestRow.disabled = true;
      ui.relDestRow.classList.add("rel-accordion-row--disabled");
    }
    if (ui.relDestLabel) ui.relDestLabel.textContent = "Destination CIs";
    if (ui.relDestHint) ui.relDestHint.hidden = false;
    collapseRelDestPanel();
    if (ui.relDestList) ui.relDestList.innerHTML = "";
    if (ui.relDestPageInfo) ui.relDestPageInfo.textContent = "";
    if (ui.relTypeFilterSelect) {
      ui.relTypeFilterSelect.innerHTML = '<option value="">All</option>';
      refreshRelDestCustomSelect(ui.relTypeFilterSelect);
    }
    if (ui.relCategoryFilterSelect) {
      ui.relCategoryFilterSelect.innerHTML = '<option value="">All</option>';
      refreshRelDestCustomSelect(ui.relCategoryFilterSelect);
    }
    renderRelationshipTypeTable();
    closeRelDestSelectMenus();
    updateAddRelationshipButtonState();
  }

  function openAddRelationshipModal() {
    if (!ui.addRelationshipModal) return;
    resetAddRelationshipModal();
    ui.addRelationshipModal.hidden = false;
    document.body.classList.add("rel-modal-open");
    if (ui.relTypeRow) ui.relTypeRow.focus();
  }

  function closeAddRelationshipModal() {
    if (!ui.addRelationshipModal) return;
    ui.addRelationshipModal.hidden = true;
    document.body.classList.remove("rel-modal-open");
  }

  /* ------------------------------------------------------------------
     Saving a relationship into the Asset_Relationship repository.

     Every field is a lookup, so each value is sent as
     "GUID;#DisplayValue". All GUIDs come from the actually selected
     records (page details for the source asset, the Relationship_Type
     row for the pair, the EAsset_Master row for the child asset).
  ------------------------------------------------------------------ */

  function generateRecordId() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
      }
    } catch (_error) {
      // Fall through to the manual generator below.
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const random = (Math.random() * 16) | 0;
      const value = char === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  /** Builds a "GUID;#DisplayValue" lookup value; returns "" when either
   *  half is missing so a malformed lookup is never sent. */
  function buildLookupValue(guid, displayValue) {
    const id = String(guid || "").trim();
    const label = String(displayValue || "").trim();
    if (!id || !label) return "";
    return id + ";#" + label;
  }

  /* ------------------------------------------------------------------
     Asset_Relationship schema (tenant-independent)

     Every tenant has its own objectID and its own fieldIDs for the same
     repository, so nothing here may be hardcoded. The schema is read once
     per page from the tenant's object metadata and cached.
  ------------------------------------------------------------------ */

  let assetRelationshipSchemaCache = null;
  let assetRelationshipSchemaPromise = null;

  /** Lowercases and strips every non-alphanumeric character, so
   *  "Source Asset", "SourceAsset" and "source_asset" compare equal. */
  function normalizeSchemaToken(value) {
    return String(value == null ? "" : value)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  /**
   * Reads the Asset_Relationship objectID and fieldIDs from the current
   * tenant's object metadata. Returns null when the repository or any
   * required field cannot be resolved, so a malformed payload is never
   * posted.
   */
  async function resolveAssetRelationshipSchema() {
    if (assetRelationshipSchemaCache) return assetRelationshipSchemaCache;
    if (assetRelationshipSchemaPromise) return assetRelationshipSchemaPromise;

    assetRelationshipSchemaPromise = (async () => {
      let meta = null;
      try {
        meta = await apiObjectGet(ASSET_RELATIONSHIP_REPOSITORY);
      } catch (error) {
        console.warn("[Asset Dependency] Could not read the Asset_Relationship metadata:", error);
        return null;
      }
      if (!meta) {
        console.warn("[Asset Dependency] The Asset_Relationship repository returned no metadata.");
        return null;
      }

      const objectID = String(meta.ObjectID || meta.ObjectId || meta.objectID || "").trim();

      // fieldID by normalized internal name, plus the metadata order so an
      // unnamed identifier field can be picked positionally as a fallback.
      const fieldIdByToken = new Map();
      const orderedFields = [];
      getObjectFields(meta).forEach((field) => {
        const fieldId = String((field && (field.FieldID || field.FieldId)) || "").trim();
        if (!fieldId) return;
        const token = normalizeSchemaToken(normalizeFieldInternalName(field));
        orderedFields.push({ fieldId, token });
        if (token && !fieldIdByToken.has(token)) fieldIdByToken.set(token, fieldId);
      });

      function pickFieldId(aliases) {
        for (let i = 0; i < aliases.length; i += 1) {
          const fieldId = fieldIdByToken.get(normalizeSchemaToken(aliases[i]));
          if (fieldId) return fieldId;
        }
        return "";
      }

      const fieldIDs = {
        relationshipId: pickFieldId(ASSET_RELATIONSHIP_FIELD_ALIASES.relationshipId),
        sourceAsset: pickFieldId(ASSET_RELATIONSHIP_FIELD_ALIASES.sourceAsset),
        relationshipType: pickFieldId(ASSET_RELATIONSHIP_FIELD_ALIASES.relationshipType),
        reverseRelationship: pickFieldId(ASSET_RELATIONSHIP_FIELD_ALIASES.reverseRelationship),
        childAsset: pickFieldId(ASSET_RELATIONSHIP_FIELD_ALIASES.childAsset)
      };

      // The leading identifier field is sent empty and is named differently
      // per tenant; when no alias matches, take the first field that is not
      // one of the four lookups, mirroring its position in the payload.
      if (!fieldIDs.relationshipId) {
        const used = new Set(
          [
            fieldIDs.sourceAsset,
            fieldIDs.relationshipType,
            fieldIDs.reverseRelationship,
            fieldIDs.childAsset
          ].filter(Boolean)
        );
        const spare = orderedFields.find((field) => !used.has(field.fieldId));
        fieldIDs.relationshipId = spare ? spare.fieldId : "";
      }

      const missing = [];
      if (!objectID) missing.push("objectID");
      ["sourceAsset", "relationshipType", "reverseRelationship", "childAsset"].forEach((key) => {
        if (!fieldIDs[key]) missing.push(key);
      });
      if (missing.length) {
        console.warn(
          "[Asset Dependency] Asset_Relationship metadata is missing: " + missing.join(", ")
        );
        return null;
      }

      assetRelationshipSchemaCache = { objectID, fieldIDs };
      return assetRelationshipSchemaCache;
    })();

    try {
      return await assetRelationshipSchemaPromise;
    } finally {
      // Allow a retry on the next save if resolution failed.
      if (!assetRelationshipSchemaCache) assetRelationshipSchemaPromise = null;
    }
  }

  /** Reads the RecordID off a repository row, tolerating lookup format. */
  function readRowRecordId(row) {
    let id = String(getRawFieldValue(row || {}, ["RecordID", "RecordId", "ID", "GUID"]) || "").trim();
    if (id.indexOf(";#") !== -1) id = extractLookupId(id);
    return id;
  }

  /**
   * Finds a RecordID in a repository by matching a row rather than trusting
   * the first result.
   *
   * A filtered GetItems call can silently come back unfiltered (the bundle
   * GetItems path only forwards simple equality filters), so every row is
   * re-checked with `matcher` before its RecordID is accepted. When the
   * filtered call yields no match, the repository is paged through and the
   * same matcher is applied. Nothing about the lookup is hardcoded.
   */
  async function findRecordIdByMatch(repository, fieldList, whereClause, matcher) {
    const attempts = [];
    if (whereClause) attempts.push({ where: whereClause, pageSize: 200, pageNumber: 1 });
    // Unfiltered sweep as a fallback, a few pages deep.
    for (let page = 1; page <= 5; page += 1) {
      attempts.push({ where: "", pageSize: FILTERED_LIST_PAGE_SIZE, pageNumber: page });
    }

    for (let i = 0; i < attempts.length; i += 1) {
      const attempt = attempts[i];
      let rows = [];
      try {
        const payload = await apiGetItems(repository, fieldList, attempt.where, {
          pageSize: attempt.pageSize,
          pageNumber: attempt.pageNumber
        });
        rows = normalizeRecords(payload).map((row) => flattenRecord(row));
      } catch (error) {
        console.warn("[Asset Dependency] Lookup in '" + repository + "' failed:", error);
        continue;
      }

      if (!rows.length) {
        // No more pages to sweep.
        if (!attempt.where) break;
        continue;
      }

      const match = rows.find((row) => {
        try {
          return Boolean(matcher(row));
        } catch (_error) {
          return false;
        }
      });
      if (match) {
        const id = readRowRecordId(match);
        if (id) return id;
      }

      // A short page means the repository is exhausted.
      if (!attempt.where && rows.length < attempt.pageSize) break;
    }

    return "";
  }

  function normalizeCompareText(value) {
    return String(value == null ? "" : value).trim().toLowerCase();
  }

  const RELATIONSHIP_TYPE_FIELD_KEYS = [
    "RelationshipType",
    "Relationship Type",
    "RelationType",
    "Name"
  ];

  /**
   * Resolves the Relationship_Type RecordID for ONE side of the selected
   * pair — the Relationship Type or the Reverse Relationship.
   *
   * Each side is resolved independently, because a tenant may store the
   * two directions either on a single record (both sides then share one
   * RecordID) or as two separate records (each side gets its own). The
   * record whose RelationshipType equals the label wins; when there is no
   * such record, the pair's own row RecordID is used. Results are cached
   * on the pair so repeat saves don't re-query.
   */
  async function resolveRelationshipSideGuid(pair, label) {
    if (!pair) return "";
    const text = String(label || "").trim();
    if (!text) return "";

    if (!pair.sideGuids) pair.sideGuids = {};
    const cacheKey = text.toLowerCase();
    if (pair.sideGuids[cacheKey]) return pair.sideGuids[cacheKey];

    const where = "RelationshipType='" + text.replace(/'/g, "''") + "'";
    const fields = [
      "RecordID",
      "RelationshipType",
      "ReverseRelationshipType",
      "ReverseRelationship"
    ];

    let recordId = await findRecordIdByMatch(RELATIONSHIP_TYPE_REPOSITORY, fields, where, (row) =>
      normalizeCompareText(getValue(row, RELATIONSHIP_TYPE_FIELD_KEYS)) === normalizeCompareText(text)
    );

    // Both directions on one record: fall back to the row the pair came from.
    if (!recordId) recordId = String(pair.recordId || "").trim();

    if (recordId) pair.sideGuids[cacheKey] = recordId;
    return recordId;
  }

  /** Resolves the EAsset_Master RecordID for a destination option when the
   *  asset-data RNSP did not already return one. Only called for the
   *  selected assets, and only when the GUID is actually missing. */
  async function resolveChildAssetGuid(option) {
    if (!option) return "";
    if (option.guid) return option.guid;

    const serialNumber = String(option.serialNumber || "").trim();
    const assetName = String(option.assetName || "").trim();
    if (!serialNumber && !assetName) return "";

    const fields = ["RecordID", "SerialNumber", "AssetName"];
    const where = serialNumber
      ? "SerialNumber='" + serialNumber.replace(/'/g, "''") + "'"
      : "AssetName='" + assetName.replace(/'/g, "''") + "'";

    const recordId = await findRecordIdByMatch(ASSET_MASTER_REPOSITORY, fields, where, (row) => {
      const rowSerial = normalizeCompareText(
        getValue(row, ["SerialNumber", "Serial Number", "SerialNo"])
      );
      const rowName = normalizeCompareText(getValue(row, ["AssetName", "Asset Name", "Name"]));
      if (serialNumber && assetName) {
        return rowSerial === normalizeCompareText(serialNumber) &&
          rowName === normalizeCompareText(assetName);
      }
      if (serialNumber) return rowSerial === normalizeCompareText(serialNumber);
      return rowName === normalizeCompareText(assetName);
    });

    if (recordId) option.guid = recordId;
    return recordId;
  }

  /**
   * Posts one Asset_Relationship record. The objectID comes from the
   * tenant's own metadata and the recordID is generated per record, so
   * nothing tenant-specific is baked in.
   */
  async function saveAssetRelationshipRecord(fieldValues, objectID) {
    const base = getRnspBaseUrl();
    if (!base) throw new Error("No base URL resolved from localStorage 'env'.");
    const targetObjectId = String(objectID || "").trim();
    if (!targetObjectId) throw new Error("No Asset_Relationship objectID resolved.");

    const response = await fetch(`${base}/api/SaveRecord`, {
      method: "POST",
      headers: buildRnspHeaders(),
      body: JSON.stringify({
        recordFieldValues: fieldValues,
        recordFieldValuesChild: [],
        objectID: targetObjectId,
        recordID: generateRecordId(),
        DrMode: false,
        createdByID: 10,
        lastModifiedBy: 10
      })
    });

    if (!response.ok) {
      throw new Error(`SaveRecord failed (${response.status})`);
    }
    return response.json().catch(() => null);
  }

  async function submitAddRelationship() {
    if (state.relationship.isSaving) return;

    const pair = state.relationship.selectedType;
    const details = state.pageDetails || {};
    const sourceGuid = String(details.recordId || "").trim();
    const sourceLabel = getRelationshipSourceCiLabel();
    const selectedIds = Array.from(state.relationship.selectedDestinationIds || []);
    const selectedOptions = (state.relationship.destinationOptions || []).filter((option) =>
      selectedIds.indexOf(option.id) !== -1
    );

    if (!pair || !selectedOptions.length) return;

    const sourceValue = buildLookupValue(sourceGuid, sourceLabel);
    if (!sourceValue) {
      console.warn(
        "[Asset Dependency] The opened asset has no RecordID or display label yet; save skipped."
      );
      return;
    }

    // Saving state is entered BEFORE the lookups, because resolving the
    // schema and the GUIDs involves network calls and the button must not
    // be clickable twice in the meantime.
    state.relationship.isSaving = true;
    if (ui.relAddBtn) ui.relAddBtn.disabled = true;

    let savedCount = 0;

    try {
      // objectID + fieldIDs for THIS tenant, read from its own metadata.
      const schema = await resolveAssetRelationshipSchema();
      if (!schema) {
        console.warn(
          "[Asset Dependency] Could not resolve the Asset_Relationship schema for this tenant; save skipped."
        );
        return;
      }

      // Each direction is resolved on its own: tenants that keep both
      // directions on one Relationship_Type record produce the same GUID
      // twice, tenants that split them produce two different GUIDs.
      const relationshipTypeGuid = await resolveRelationshipSideGuid(pair, pair.type);
      if (!relationshipTypeGuid) {
        console.warn(
          "[Asset Dependency] Could not resolve the Relationship_Type RecordID for '" +
            String(pair.type || "") +
            "'; save skipped."
        );
        return;
      }
      const reverseRelationshipGuid =
        (await resolveRelationshipSideGuid(pair, pair.inverse)) || relationshipTypeGuid;

      const relationshipTypeValue = buildLookupValue(relationshipTypeGuid, pair.type);
      const reverseRelationshipValue = buildLookupValue(reverseRelationshipGuid, pair.inverse);
      if (!relationshipTypeValue) {
        console.warn("[Asset Dependency] Missing relationship type lookup value; save skipped.");
        return;
      }

      // One Asset_Relationship record per selected destination CI.
      for (let i = 0; i < selectedOptions.length; i += 1) {
        const option = selectedOptions[i];
        const childGuid = await resolveChildAssetGuid(option);
        const childValue = buildLookupValue(childGuid, option.name);
        if (!childValue) {
          console.warn(
            "[Asset Dependency] Could not resolve the EAsset_Master RecordID for '" +
              option.name +
              "'; that relationship was skipped."
          );
          continue;
        }

        const fieldValues = [];
        // Leading identifier field, sent empty, when the tenant has one.
        if (schema.fieldIDs.relationshipId) {
          fieldValues.push({ fieldID: schema.fieldIDs.relationshipId, fieldValue: "" });
        }
        fieldValues.push({ fieldID: schema.fieldIDs.sourceAsset, fieldValue: sourceValue });
        fieldValues.push({ fieldID: schema.fieldIDs.relationshipType, fieldValue: relationshipTypeValue });
        fieldValues.push({
          fieldID: schema.fieldIDs.reverseRelationship,
          fieldValue: reverseRelationshipValue
        });
        fieldValues.push({ fieldID: schema.fieldIDs.childAsset, fieldValue: childValue });

        await saveAssetRelationshipRecord(fieldValues, schema.objectID);
        savedCount += 1;
      }

      if (!savedCount) {
        console.warn("[Asset Dependency] No Asset_Relationship record could be saved.");
        return;
      }

      closeAddRelationshipModal();
      // Single refresh after all records are saved, so the new
      // relationships appear immediately without extra round trips.
      try {
        await loadDependencyRows(state.pageDetails);
      } catch (_refreshError) {
        // The records are saved; a failed refresh must not surface as a
        // save failure.
      }
    } catch (error) {
      console.warn("[Asset Dependency] Saving the relationship failed:", error);
    } finally {
      state.relationship.isSaving = false;
      updateAddRelationshipButtonState();
    }
  }

  function bindAddRelationshipEvents() {
    if (addRelationshipEventsBound) return;
    addRelationshipEventsBound = true;

    initRelDestFilterSelects();

    if (ui.addRelationshipBtn) {
      ui.addRelationshipBtn.addEventListener("click", openAddRelationshipModal);
    }

    // Relationship Type and Reverse Relationship stay mirrored: choosing a
    // value in either dropdown selects the same pair in both.
    if (ui.relTypeRow) {
      ui.relTypeRow.addEventListener("click", toggleRelTypePanel);
    }

    // A click in either column selects that row's pair; the clicked
    // column decides which value stays visible.
    if (ui.relTypeTableBody) {
      ui.relTypeTableBody.addEventListener("click", (event) => {
        const row = event.target.closest("tr[data-rel-type]");
        if (!row) return;
        const cell = event.target.closest("td[data-rel-side]");
        const side = cell ? cell.getAttribute("data-rel-side") : "type";
        selectRelationshipType(row.getAttribute("data-rel-type"), side);
      });
    }

    if (ui.relDestRow) {
      ui.relDestRow.addEventListener("click", toggleRelDestPanel);
    }

    if (ui.relDestList) {
      ui.relDestList.addEventListener("change", (event) => {
        const checkbox = event.target.closest("input[data-rel-dest-id]");
        if (!checkbox) return;
        const id = checkbox.getAttribute("data-rel-dest-id");
        if (checkbox.checked) {
          state.relationship.selectedDestinationIds.add(id);
        } else {
          state.relationship.selectedDestinationIds.delete(id);
        }
        updateAddRelationshipButtonState();
      });
    }

    if (ui.relTypeFilterSelect) {
      ui.relTypeFilterSelect.addEventListener("change", () => {
        // Changing Type keeps whatever Category was already selected (when
        // still valid for the new Type) and immediately re-queries with the
        // new Type alongside that previously selected Category.
        state.relationship.filterSelectedType = ui.relTypeFilterSelect.value || "";
        populateFilterCategoryOptions();
        applyDestinationFilter().catch((error) => {
          console.warn("[Asset Dependency] Destination CI load failed:", error);
        });
      });
    }

    if (ui.relCategoryFilterSelect) {
      ui.relCategoryFilterSelect.addEventListener("change", () => {
        // Changing Category immediately re-queries with the current Type
        // alongside the newly selected Category.
        state.relationship.filterSelectedCategory = ui.relCategoryFilterSelect.value || "";
        applyDestinationFilter().catch((error) => {
          console.warn("[Asset Dependency] Destination CI load failed:", error);
        });
      });
    }

    if (ui.relAddBtn) {
      ui.relAddBtn.addEventListener("click", () => {
        if (ui.relAddBtn.disabled) return;
        submitAddRelationship().catch((error) => {
          console.warn("[Asset Dependency] Add Relationship failed:", error);
        });
      });
    }

    if (ui.addRelationshipModal) {
      ui.addRelationshipModal.addEventListener("click", (event) => {
        if (event.target.closest("[data-rel-close]")) {
          event.preventDefault();
          closeAddRelationshipModal();
        }
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && ui.addRelationshipModal && !ui.addRelationshipModal.hidden) {
        closeAddRelationshipModal();
      }
    });
  }

  function bindBackButton() {
    if (!ui.backLink || ui.backLink.dataset.backBound === "1") return;
    ui.backLink.dataset.backBound = "1";
    ui.backLink.addEventListener("click", (event) => {
      event.preventDefault();
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      const referrer = String(document.referrer || "").trim();
      if (referrer) {
        window.location.assign(referrer);
      }
    });
  }

  /* ------------------------------------------------------------------
     Ellipsis tooltips

     Any text this page truncates with an ellipsis - table cells, column
     headers, summary values, dropdown labels - exposes its full text as a
     native title on hover, so no value is readable only by widening a column.

     Resolved at hover time from a single delegated listener rather than
     stamped onto elements during render: these tables re-render on every
     sort, reload and filter, and whether a given cell is actually clipped
     changes with the widths the user drags. Reading it off the live layout is
     the only version that stays correct, and it costs nothing until a pointer
     enters an element.
  ------------------------------------------------------------------ */

  // Marks the titles this feature owns. A title the page set deliberately
  // elsewhere (summary cells, dependency nodes, select options) carries no
  // marker and is never read, rewritten or removed.
  const ELLIPSIS_TITLE_MARKER = "data-ellipsis-title";
  // Elements with a richer hover affordance of their own: the allocation
  // Remarks cell has a floating tooltip, the audit log Comments cell a
  // "...more" modal. A native title on top of those would double up.
  const ELLIPSIS_TITLE_SKIP_SELECTOR =
    ".allocation-remarks-cell, .history-log-comment-cell, .gt-col-resizer, .th-sort-icon";
  const ELLIPSIS_TITLE_MAX_DEPTH = 6;
  const ELLIPSIS_TITLE_MAX_CELL_CHILDREN = 12;

  let ellipsisTooltipsBound = false;
  let lastEllipsisHoverTarget = null;

  // "Ellipsed" is the actual test - not merely clipped. Requiring the ellipsis
  // (or a line clamp) also keeps scroll containers out of it: a table wrap
  // scrolls its table, so scrollWidth > clientWidth there means "scrollable",
  // not "truncated".
  function clipsWithEllipsis(style) {
    if (!style) return false;
    if (style.textOverflow === "ellipsis") return true;
    const clamp = style.webkitLineClamp || style.WebkitLineClamp;
    return Boolean(clamp && clamp !== "none");
  }

  function isEllipsisTruncated(el) {
    if (!el || el.nodeType !== 1) return false;
    if (!String(el.textContent || "").trim()) return false;
    let style = null;
    try {
      style = window.getComputedStyle(el);
    } catch (_error) {
      return false;
    }
    if (!clipsWithEllipsis(style)) return false;
    // 1px of slack: sub-pixel layout leaves scrollWidth a hair over clientWidth
    // on cells that are not actually clipped.
    if (el.scrollWidth - el.clientWidth > 1) return true;
    return el.scrollHeight - el.clientHeight > 1;
  }

  function getEllipsisTitleText(el) {
    return String(el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function isEllipsisTitleSkipped(el) {
    if (typeof el.closest !== "function") return true;
    if (el.closest(ELLIPSIS_TITLE_SKIP_SELECTOR)) return true;
    // A title the page set for its own reasons stays exactly as it is.
    return el.hasAttribute("title") && !el.hasAttribute(ELLIPSIS_TITLE_MARKER);
  }

  // Dropped when the element is no longer clipped - a column the user widened
  // must not keep offering a tooltip for text that is now fully visible.
  function clearStaleEllipsisTitle(el) {
    if (!el.hasAttribute(ELLIPSIS_TITLE_MARKER)) return;
    el.removeAttribute("title");
    el.removeAttribute(ELLIPSIS_TITLE_MARKER);
  }

  function findEllipsisTitleTarget(startEl) {
    let el = startEl;
    for (let depth = 0; el && el.nodeType === 1 && depth < ELLIPSIS_TITLE_MAX_DEPTH; depth += 1) {
      if (el === document.body || el === document.documentElement) break;
      if (!isEllipsisTitleSkipped(el)) {
        if (isEllipsisTruncated(el)) return el;
        clearStaleEllipsisTitle(el);
      }
      el = el.parentElement;
    }

    // Header cells hold their text in a child (.th-label) and pad around it, so
    // a pointer resting in that padding never walks through the clipped
    // element on the way up. Look down into the hovered cell for it.
    const cell = typeof startEl.closest === "function" ? startEl.closest("th, td") : null;
    if (!cell || isEllipsisTitleSkipped(cell)) return null;
    const children = cell.querySelectorAll("*");
    const limit = Math.min(children.length, ELLIPSIS_TITLE_MAX_CELL_CHILDREN);
    for (let i = 0; i < limit; i += 1) {
      const child = children[i];
      if (isEllipsisTitleSkipped(child)) continue;
      if (isEllipsisTruncated(child)) return child;
      clearStaleEllipsisTitle(child);
    }
    return null;
  }

  function onEllipsisTooltipPointerOver(event) {
    const target = event.target;
    if (!target || target.nodeType !== 1) return;
    // Pointer still inside the element resolved a moment ago: nothing to redo.
    if (target === lastEllipsisHoverTarget) return;
    lastEllipsisHoverTarget = target;

    const el = findEllipsisTitleTarget(target);
    if (!el) return;
    const text = getEllipsisTitleText(el);
    if (!text || el.getAttribute("title") === text) return;
    el.setAttribute("title", text);
    el.setAttribute(ELLIPSIS_TITLE_MARKER, "1");
  }

  // A drag (column resize above all) changes what is clipped under a pointer
  // that never left the element, so the memo is dropped rather than trusted.
  function onEllipsisTooltipPointerDown() {
    lastEllipsisHoverTarget = null;
  }

  function bindEllipsisTooltips() {
    if (ellipsisTooltipsBound) return;
    ellipsisTooltipsBound = true;
    // On document, not the app host: the comment and relationship modals, and
    // the nav dock, render outside it.
    document.addEventListener("pointerover", onEllipsisTooltipPointerOver);
    document.addEventListener("pointerdown", onEllipsisTooltipPointerDown, true);
    document.addEventListener("pointerup", onEllipsisTooltipPointerDown, true);
  }

  async function init() {
    try {
      bindEllipsisTooltips();
      syncBundleEnvUrl();
      bindTabs();
      bindBackButton();
      bindAddRelationshipEvents();
      const normalized = normalizeAssetDetails();
      const details = await loadParentAssetDetails(normalized);
      state.pageDetails = details;
      if (ui.assetEditBtn && String((details && details.recordId) || "").trim()) {
        ui.assetEditBtn.addEventListener("click", function () {
          openMasterEditForm(details).catch(function () {
            // Keep silent to avoid disturbing page rendering.
          });
        });
      }
      await ensureEmployeeDirectoryForSummary(details.asset);
      await ensureQafUsersDirectoryForSummary(details.asset);
      state.currentUserIsAssetManager = await checkCurrentUserIsAssetManager(details.asset).catch(() => false);
      renderSummaryMeta(details);
      syncAssetEditBtnVisibility("summaryPanel");
      renderSummaryFields(details);
      activateTab("summaryPanel");
      await waitForTabFirstLoad("summaryPanel", PRELOAD_DATA_WAIT_MS);
    } finally {
      releasePreload();
    }
  }

  init();
})();