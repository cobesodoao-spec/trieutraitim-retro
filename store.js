// ==========================================================================
// RetroStore: Quản lý Dữ liệu Đa Chế Độ
// 1. Local Server (serve.ps1 -> /api/data & /api/upload-mp3)
// 2. GitHub Pages + GitHub Cloud API (Lưu site-db.json & Upload MP3 thẳng vào Repo!)
// 3. Offline Browser Fallback (localStorage + IndexedDB)
// ==========================================================================

(function () {
  const STORAGE_KEY = "trieutraitim_site_db_v1";
  const AUTH_SESSION_KEY = "trieutraitim_admin_logged_in";
  const GH_CONFIG_KEY = "trieutraitim_github_cloud_cfg";
  const IDB_NAME = "trieutraitim_mp3_idb";
  const IDB_STORE = "audio_files";

  const syncChannel = typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("trieutraitim_sync")
    : null;

  function buildDefaultDB() {
    return {
      version: 1,
      adminAuth: {
        username: "admin",
        password: "123456"
      },
      settings: {
        pageTitle: "Triệu Trái Tim (trieutraitim.info) - Nghe Nhạc Tuyển Chọn & Quà Tặng Âm Nhạc",
        brandTitle: "Triệu Trái Tim . Info",
        brandSubtitle: "Kết nối triệu trái tim yêu nhạc Việt ★ Góc kỷ niệm thế hệ 8x - 9x",
        playerGreeting: "Nửa Ngày Nửa Đêm Blog - Chúc bạn nghe nhạc vui vẻ",
        defaultSongIndex: 1,
        defaultStartOffset: 85,
        defaultCollapseBanner: false,
        defaultSnowFx: true,
        yahooId: "con_moe_keu_meo_meo",
        yahooNickDisplay: "Con mòe kêu meo\nmeo",
        yahooWelcomeMsg: "Chào đằng ấy! Chúc bạn nghe nhạc trên trieutraitim.info vui vẻ nha :D Bấm nút BUZZ! thử coi nè!",
        hitCounter: "01894208",
        onlineCount: 128,
        footerLine1: "Triệu Trái Tim (trieutraitim.info) — Phiên bản phục dựng giao diện Web Nghe Nhạc Xưa (2007 - 2009)",
        footerLine2: "Bấm vào bất kỳ bài hát nào để nghe nhạc, hoặc vào Admin CP để thêm bài hát & upload MP3 mới!"
      },
      songs: JSON.parse(JSON.stringify(window.RETRO_SONGS || [])),
      leftBooks: (window.LEFT_BOOKS || []).map((label, idx) => ({
        id: "book_" + (idx + 1),
        label: typeof label === "string" ? label : label.label,
        content: ""
      })),
      leftInfo: (window.LEFT_INFO || []).map((item, idx) => ({
        id: "info_" + (idx + 1),
        key: item.key || "custom",
        label: item.label,
        content: item.content || ""
      })),
      rightDiscover: (window.RIGHT_DISCOVER || []).map((label, idx) => ({
        id: "disc_" + (idx + 1),
        label: typeof label === "string" ? label : label.label,
        content: ""
      })),
      quickLinks: [
        { id: "ql_1", label: "mp3.zing.vn - Zing MP3", url: "https://zingmp3.vn" },
        { id: "ql_2", label: "nhaccuatui.com - NCT", url: "https://www.nhaccuatui.com" },
        { id: "ql_3", label: "nhac.vui.vn - Nhạc Vui", url: "" },
        { id: "ql_4", label: "truongton.net - Trường Tồn", url: "" },
        { id: "ql_5", label: "vn.360plus.yahoo.com", url: "" },
        { id: "ql_6", label: "yeuamnhac.com - YAN", url: "" },
        { id: "ql_7", label: "hoahoctro.vn - Hoa Học Trò", url: "" }
      ]
    };
  }

  function normalizeDB(raw, localAuthOverride) {
    const def = buildDefaultDB();
    if (!raw || typeof raw !== "object") return def;

    return {
      version: 1,
      adminAuth: Object.assign({}, def.adminAuth, raw.adminAuth || {}, localAuthOverride || {}),
      settings: Object.assign({}, def.settings, raw.settings || {}),
      songs: Array.isArray(raw.songs) ? raw.songs : def.songs,
      leftBooks: Array.isArray(raw.leftBooks) ? raw.leftBooks : def.leftBooks,
      leftInfo: Array.isArray(raw.leftInfo) ? raw.leftInfo : def.leftInfo,
      rightDiscover: Array.isArray(raw.rightDiscover) ? raw.rightDiscover : def.rightDiscover,
      quickLinks: Array.isArray(raw.quickLinks) ? raw.quickLinks : def.quickLinks
    };
  }

  // ==================== Tiện ích Mã Hóa UTF-8 / ArrayBuffer <-> Base64 ====================
  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    const chunks = [];
    for (let i = 0; i < bytes.length; i += chunkSize) {
      chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
    }
    return btoa(chunks.join(""));
  }

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    return arrayBufferToBase64(bytes.buffer);
  }

  function base64ToUtf8(b64) {
    const clean = String(b64 || "").replace(/\s+/g, "");
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  }

  function sanitizeUploadName(rawName) {
    const base = String(rawName || "track.mp3").split(/[\\/]/).pop();
    const dotIdx = base.lastIndexOf(".");
    const ext = dotIdx !== -1 ? base.slice(dotIdx).toLowerCase() : ".mp3";
    const allowed = [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"];
    const safeExt = allowed.includes(ext) ? ext : ".mp3";
    const stem = dotIdx !== -1 ? base.slice(0, dotIdx) : base;
    // Bỏ dấu tiếng Việt nhẹ nhàng cho URL trên GitHub Pages luôn sạch đẹp
    const asciiStem = stem
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^a-zA-Z0-9\s\-_]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "nhac-xua";
    return `${Date.now()}-${asciiStem}${safeExt}`;
  }

  // ==================== Cấu Hình GitHub Cloud (Lưu riêng trên trình duyệt Admin) ====================
  function detectGitHubPagesRepo() {
    const host = window.location.hostname || "";
    const pathParts = (window.location.pathname || "").split("/").filter(Boolean);
    if (host.endsWith(".github.io")) {
      const owner = host.replace(/\.github\.io$/i, "");
      const repo = pathParts.length > 0 && !pathParts[0].endsWith(".html") ? pathParts[0] : "";
      return { owner, repo, branch: "main", token: "" };
    }
    return { owner: "", repo: "trieutraitim-retro", branch: "main", token: "" };
  }

  function getGitHubConfig() {
    const detected = detectGitHubPagesRepo();
    try {
      const raw = localStorage.getItem(GH_CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          owner: (parsed.owner || detected.owner || "").trim(),
          repo: (parsed.repo || detected.repo || "").trim(),
          branch: (parsed.branch || detected.branch || "main").trim(),
          token: (parsed.token || "").trim()
        };
      }
    } catch (_) {}
    return detected;
  }

  function setGitHubConfig(cfg) {
    const clean = {
      owner: String(cfg.owner || "").trim(),
      repo: String(cfg.repo || "").trim(),
      branch: String(cfg.branch || "main").trim() || "main",
      token: String(cfg.token || "").trim()
    };
    localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(clean));
    return clean;
  }

  function isGitHubConfigured() {
    const cfg = getGitHubConfig();
    return Boolean(cfg.owner && cfg.repo && cfg.token);
  }

  async function ghApiFetch(path, options = {}, cfgOverride = null) {
    const cfg = cfgOverride || getGitHubConfig();
    const headers = Object.assign({
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }, options.headers || {});
    if (cfg.token) {
      headers["Authorization"] = `Bearer ${cfg.token}`;
    }
    const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}${path}`;
    return fetch(url, Object.assign({}, options, { headers }));
  }

  async function testGitHubConnection(cfg) {
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      throw new Error("Vui lòng nhập đầy đủ GitHub Owner, Tên Repo và Personal Access Token!");
    }
    const res = await ghApiFetch("", { method: "GET", cache: "no-store" }, cfg);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `HTTP ${res.status} — Kiểm tra lại Owner/Repo hoặc quyền Token`);
    }
    const repoInfo = await res.json();
    if (!repoInfo.permissions || !repoInfo.permissions.push) {
      throw new Error("Token này chưa có quyền ghi (Contents: Read & Write / repo scope) vào Repository!");
    }
    return {
      fullName: repoInfo.full_name,
      defaultBranch: repoInfo.default_branch || "main",
      private: repoInfo.private
    };
  }

  async function ghGetFileMeta(repoFilePath) {
    const cfg = getGitHubConfig();
    const encodedPath = repoFilePath.split("/").map(encodeURIComponent).join("/");
    const res = await ghApiFetch(`/contents/${encodedPath}?ref=${encodeURIComponent(cfg.branch)}`, {
      method: "GET",
      cache: "no-store"
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub GET lỗi HTTP ${res.status}`);
    }
    return res.json();
  }

  async function ghPutFileBase64(repoFilePath, contentBase64, commitMsg) {
    const cfg = getGitHubConfig();
    const existing = await ghGetFileMeta(repoFilePath);
    const encodedPath = repoFilePath.split("/").map(encodeURIComponent).join("/");
    const body = {
      message: commitMsg,
      content: contentBase64,
      branch: cfg.branch
    };
    if (existing && existing.sha) {
      body.sha = existing.sha;
    }

    const res = await ghApiFetch(`/contents/${encodedPath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub PUT lỗi HTTP ${res.status}`);
    }
    return res.json();
  }

  async function ghListUploads() {
    const cfg = getGitHubConfig();
    const res = await ghApiFetch(`/contents/uploads?ref=${encodeURIComponent(cfg.branch)}`, {
      method: "GET",
      cache: "no-store"
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`Không đọc được thư mục uploads trên GitHub (HTTP ${res.status})`);
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((item) => item.type === "file" && item.name !== ".gitkeep")
      .map((item) => ({
        filename: item.name,
        url: `uploads/${item.name}`,
        rawUrl: item.download_url || `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/uploads/${item.name}`,
        size: item.size || 0,
        modified: "Trên GitHub (" + cfg.branch + ")",
        sha: item.sha
      }));
  }

  async function ghDeleteFile(repoFilePath) {
    const cfg = getGitHubConfig();
    const existing = await ghGetFileMeta(repoFilePath);
    if (!existing || !existing.sha) return;
    const encodedPath = repoFilePath.split("/").map(encodeURIComponent).join("/");
    await ghApiFetch(`/contents/${encodedPath}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Delete ${repoFilePath} via AdminCP`,
        sha: existing.sha,
        branch: cfg.branch
      })
    });
  }

  // ==================== IndexedDB Dự Phòng (Khi mở file:// trực tiếp) ====================
  function openIdb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("IndexedDB unavailable"));
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPutBlob(key, blob) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbGetBlob(key) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbDeleteBlob(key) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ==================== Tự Động Nhận Diện Backend: Hostinger PHP vs Local Server ====================
  let phpBackendCache = null;
  let localServerCache = null;

  async function checkPhpBackend() {
    const host = window.location.hostname || "";
    if (window.location.protocol === "file:" || host.endsWith(".github.io")) {
      phpBackendCache = false;
      return false;
    }
    try {
      const res = await fetch("api.php?action=ping", {
        cache: "no-store",
        credentials: "same-origin"
      });
      if (!res.ok) {
        phpBackendCache = false;
        return false;
      }
      const j = await res.json().catch(() => null);
      if (j && j.ok && j.engine === "php") {
        phpBackendCache = true;
        if (j.loggedIn) {
          sessionStorage.setItem(AUTH_SESSION_KEY, "1");
        }
        return true;
      }
      phpBackendCache = false;
      return false;
    } catch (_) {
      phpBackendCache = false;
      return false;
    }
  }

  async function checkLocalServerApi() {
    const host = window.location.hostname || "";
    if (window.location.protocol === "file:" || host.endsWith(".github.io")) {
      localServerCache = false;
      return false;
    }
    try {
      const res = await fetch("/api/ping", { cache: "no-store" });
      if (!res.ok) {
        localServerCache = false;
        return false;
      }
      const j = await res.json().catch(() => null);
      localServerCache = Boolean(j && j.ok);
      return localServerCache;
    } catch (_) {
      localServerCache = false;
      return false;
    }
  }

  function getSavedLocalAdminAuth() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.adminAuth) return parsed.adminAuth;
      }
    } catch (_) {}
    return null;
  }

  // ==================== Xác Thực Admin (Hỗ trợ PHP Session trên Hostinger) ====================
  async function adminLogin(username, password, currentDB) {
    const hasPhp = phpBackendCache !== null ? phpBackendCache : await checkPhpBackend();
    if (hasPhp) {
      const res = await fetch("api.php?action=login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Sai tài khoản hoặc mật khẩu Admin!");
      }
      setAdminLoggedIn(true);
      return true;
    }

    const expectedU = (currentDB && currentDB.adminAuth && currentDB.adminAuth.username) || "admin";
    const expectedP = (currentDB && currentDB.adminAuth && currentDB.adminAuth.password) || "123456";
    if (username === expectedU && password === expectedP) {
      setAdminLoggedIn(true);
      return true;
    }
    throw new Error("Sai tài khoản hoặc mật khẩu Admin!");
  }

  async function adminLogout() {
    const hasPhp = phpBackendCache !== null ? phpBackendCache : await checkPhpBackend();
    if (hasPhp) {
      try {
        await fetch("api.php?action=logout", { method: "POST", credentials: "same-origin" });
      } catch (_) {}
    }
    setAdminLoggedIn(false);
  }

  async function changeAdminCredentials(newUsername, newPassword, currentDB) {
    const hasPhp = phpBackendCache !== null ? phpBackendCache : await checkPhpBackend();
    if (hasPhp) {
      const res = await fetch("api.php?action=change-auth", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ username: newUsername, password: newPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Không thể đổi mật khẩu Admin trên máy chủ!");
      }
      return true;
    }

    if (currentDB) {
      currentDB.adminAuth = { username: newUsername, password: newPassword };
      await saveDB(currentDB, false);
    }
    return true;
  }

  // ==================== Load & Save Database ====================
  async function loadDB() {
    const localAuth = getSavedLocalAdminAuth();

    // 1. Ưu tiên Hostinger / Hosting PHP (api.php)
    const hasPhp = await checkPhpBackend();
    if (hasPhp) {
      try {
        const res = await fetch("api.php?action=data", {
          cache: "no-store",
          credentials: "same-origin"
        });
        if (res.ok) {
          const json = await res.json();
          if (json && json.initialized && json.db) {
            const normalized = normalizeDB(json.db, localAuth);
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch (_) {}
            return { db: normalized, serverMode: true, mode: "hostinger-php" };
          }
          const normalized = normalizeDB(null, localAuth);
          return { db: normalized, serverMode: true, mode: "hostinger-php" };
        }
      } catch (_) {}
    }

    // 2. Local Server trên Windows (serve.ps1)
    const hasLocalServer = await checkLocalServerApi();
    if (hasLocalServer) {
      try {
        const res = await fetch("/api/data", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (json && json.initialized && json.db) {
            const normalized = normalizeDB(json.db, localAuth);
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch (_) {}
            return { db: normalized, serverMode: true, mode: "local-server" };
          }
          const normalized = normalizeDB(null, localAuth);
          await saveDB(normalized, false);
          return { db: normalized, serverMode: true, mode: "local-server" };
        }
      } catch (_) {}
    }

    // 3. Nếu Admin đã kết nối GitHub Cloud API
    if (isGitHubConfigured()) {
      try {
        const meta = await ghGetFileMeta("site-db.json");
        if (meta && meta.content) {
          const decoded = JSON.parse(base64ToUtf8(meta.content));
          const normalized = normalizeDB(decoded, localAuth);
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch (_) {}
          return { db: normalized, serverMode: true, mode: "github-cloud" };
        }
      } catch (_) {}
    }

    // 4. Khách truy cập trên GitHub Pages / Static Web -> tải trực tiếp file tĩnh site-db.json
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
      try {
        const staticRes = await fetch(`site-db.json?v=${Date.now()}`, { cache: "no-store" });
        if (staticRes.ok) {
          const staticDb = await staticRes.json();
          const normalized = normalizeDB(staticDb, localAuth);
          return {
            db: normalized,
            serverMode: isGitHubConfigured(),
            mode: isGitHubConfigured() ? "github-cloud" : "github-pages-readonly"
          };
        }
      } catch (_) {}
    }

    // 5. Dự phòng Offline (localStorage)
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return { db: normalizeDB(JSON.parse(raw)), serverMode: false, mode: "offline" };
      }
    } catch (_) {}

    const def = buildDefaultDB();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(def)); } catch (_) {}
    return { db: def, serverMode: false, mode: "offline" };
  }

  async function saveDB(db, notifyTabs = true) {
    const normalized = normalizeDB(db);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (_) {}

    let savedToServer = false;
    const hasPhp = phpBackendCache !== null ? phpBackendCache : await checkPhpBackend();

    if (hasPhp) {
      const publicCopy = JSON.parse(JSON.stringify(normalized));
      delete publicCopy.adminAuth;
      const res = await fetch("api.php?action=data", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(publicCopy)
      });
      if (res.status === 401) {
        setAdminLoggedIn(false);
        throw new Error("Vui lòng đăng nhập vào trang AdminCP trước khi lưu dữ liệu!");
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Lỗi lưu dữ liệu HTTP ${res.status}`);
      }
      savedToServer = true;
    } else {
      const hasLocalServer = localServerCache !== null ? localServerCache : await checkLocalServerApi();
      if (hasLocalServer) {
        try {
          const res = await fetch("/api/data", {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify(normalized)
          });
          savedToServer = res.ok;
        } catch (_) {}
      } else if (isGitHubConfigured()) {
        const publicCopy = JSON.parse(JSON.stringify(normalized));
        delete publicCopy.adminAuth;
        const b64 = utf8ToBase64(JSON.stringify(publicCopy, null, 2));
        await ghPutFileBase64("site-db.json", b64, "Update site-db.json via Triệu Trái Tim AdminCP");
        savedToServer = true;
      }
    }

    if (notifyTabs && syncChannel) {
      syncChannel.postMessage({ type: "db-updated", timestamp: Date.now() });
    }

    return { ok: true, savedToServer };
  }

  // ==================== Upload & Xóa File MP3 ====================
  const instantUrlCache = new Map();

  async function uploadAudioFile(file, onProgress) {
    const hasPhp = phpBackendCache !== null ? phpBackendCache : await checkPhpBackend();

    // 1. Upload trực tiếp lên Hostinger PHP (api.php?action=upload-mp3 qua FormData)
    if (hasPhp) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append("file", file, file.name || "track.mp3");

        xhr.open("POST", "api.php?action=upload-mp3", true);
        xhr.withCredentials = true;

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && typeof onProgress === "function") {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status === 401) {
            setAdminLoggedIn(false);
            reject(new Error("Bạn cần đăng nhập AdminCP trước khi upload file MP3!"));
            return;
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const resp = JSON.parse(xhr.responseText);
              if (!resp.ok) {
                reject(new Error(resp.error || "Upload MP3 thất bại"));
                return;
              }
              if (onProgress) onProgress(100);
              resolve({ url: resp.url, filename: resp.filename, storedOnServer: true });
            } catch (err) {
              reject(err);
            }
          } else {
            let msg = "Upload lỗi HTTP " + xhr.status;
            try {
              const errJson = JSON.parse(xhr.responseText);
              if (errJson && errJson.error) msg = errJson.error;
            } catch (_) {}
            reject(new Error(msg));
          }
        };

        xhr.onerror = () => reject(new Error("Không kết nối được máy chủ Hostinger để upload"));
        xhr.send(formData);
      });
    }

    // 2. Upload qua Local Server Windows (serve.ps1)
    const hasLocalServer = localServerCache !== null ? localServerCache : await checkLocalServerApi();
    if (hasLocalServer) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const encodedName = encodeURIComponent(file.name || "track.mp3");
        xhr.open("POST", `/api/upload-mp3?filename=${encodedName}`, true);
        xhr.setRequestHeader("Content-Type", file.type || "audio/mpeg");

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && typeof onProgress === "function") {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const resp = JSON.parse(xhr.responseText);
              if (onProgress) onProgress(100);
              resolve({ url: resp.url, filename: resp.filename, storedOnServer: true });
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error("Upload lỗi HTTP " + xhr.status));
          }
        };

        xhr.onerror = () => reject(new Error("Không kết nối được máy chủ upload"));
        xhr.send(file);
      });
    }

    // 3. Upload thẳng vào nhánh GitHub Repository (uploads/<safeFile>)
    if (isGitHubConfigured()) {
      if (file.size > 48 * 1024 * 1024) {
        throw new Error("GitHub Contents API giới hạn mỗi file MP3 tối đa ~48MB. Vui lòng nén nhỏ hơn 48MB!");
      }
      if (onProgress) onProgress(15);
      const buf = await file.arrayBuffer();
      if (onProgress) onProgress(45);
      const b64 = arrayBufferToBase64(buf);
      const safeName = sanitizeUploadName(file.name);
      const repoPath = `uploads/${safeName}`;
      if (onProgress) onProgress(65);
      const ghRes = await ghPutFileBase64(repoPath, b64, `Upload MP3: ${safeName}`);
      if (onProgress) onProgress(100);

      const cfg = getGitHubConfig();
      const rawDownloadUrl = (ghRes && ghRes.content && ghRes.content.download_url)
        || `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${repoPath}`;
      instantUrlCache.set(repoPath, rawDownloadUrl);

      return {
        url: repoPath,
        rawUrl: rawDownloadUrl,
        filename: safeName,
        storedOnServer: true
      };
    }

    // 4. Dự phòng IndexedDB trên trình duyệt
    const idbKey = "mp3_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    await idbPutBlob(idbKey, file);
    if (onProgress) onProgress(100);
    return {
      url: "idb://" + idbKey,
      filename: file.name,
      storedOnServer: false
    };
  }

  async function deleteAudioFile(audioUrl) {
    if (!audioUrl) return;
    if (audioUrl.startsWith("idb://")) {
      const key = audioUrl.slice("idb://".length);
      try { await idbDeleteBlob(key); } catch (_) {}
      return;
    }

    const hasPhp = phpBackendCache !== null ? phpBackendCache : await checkPhpBackend();
    if (hasPhp && audioUrl.startsWith("uploads/")) {
      try {
        await fetch(`api.php?action=delete-mp3&file=${encodeURIComponent(audioUrl)}`, {
          method: "POST",
          credentials: "same-origin"
        });
      } catch (_) {}
      return;
    }

    const hasLocalServer = localServerCache !== null ? localServerCache : await checkLocalServerApi();
    if (hasLocalServer && audioUrl.startsWith("uploads/")) {
      try {
        await fetch(`/api/upload-mp3?file=${encodeURIComponent(audioUrl)}`, { method: "DELETE" });
      } catch (_) {}
      return;
    }

    if (isGitHubConfigured() && audioUrl.startsWith("uploads/")) {
      await ghDeleteFile(audioUrl);
    }
  }

  async function listUploadedFiles() {
    const hasPhp = phpBackendCache !== null ? phpBackendCache : await checkPhpBackend();
    if (hasPhp) {
      const res = await fetch("api.php?action=uploads-list", {
        cache: "no-store",
        credentials: "same-origin"
      });
      const data = await res.json();
      return { mode: "hostinger-php", files: (data && data.files) || [] };
    }
    const hasLocalServer = localServerCache !== null ? localServerCache : await checkLocalServerApi();
    if (hasLocalServer) {
      const res = await fetch("/api/uploads-list", { cache: "no-store" });
      const data = await res.json();
      return { mode: "local-server", files: (data && data.files) || [] };
    }
    if (isGitHubConfigured()) {
      const files = await ghListUploads();
      return { mode: "github-cloud", files };
    }
    return { mode: "offline", files: [] };
  }

  const objectUrlCache = new Map();
  async function resolvePlayableUrl(audioUrl) {
    if (!audioUrl) return "";
    if (instantUrlCache.has(audioUrl)) {
      return instantUrlCache.get(audioUrl);
    }
    if (!audioUrl.startsWith("idb://")) {
      if (audioUrl.startsWith("uploads/") && isGitHubConfigured() && window.location.hostname.endsWith(".github.io")) {
        const cfg = getGitHubConfig();
        return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${audioUrl}`;
      }
      return audioUrl;
    }

    if (objectUrlCache.has(audioUrl)) {
      return objectUrlCache.get(audioUrl);
    }
    const key = audioUrl.slice("idb://".length);
    try {
      const blob = await idbGetBlob(key);
      if (blob) {
        const objUrl = URL.createObjectURL(blob);
        objectUrlCache.set(audioUrl, objUrl);
        return objUrl;
      }
    } catch (_) {}
    return "";
  }

  function probeAudioDuration(fileOrUrl) {
    return new Promise((resolve) => {
      const tempAudio = new Audio();
      let tempObjUrl = null;
      const cleanup = () => {
        if (tempObjUrl) URL.revokeObjectURL(tempObjUrl);
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve(210);
      }, 5000);

      tempAudio.preload = "metadata";
      tempAudio.onloadedmetadata = () => {
        clearTimeout(timer);
        const dur = isFinite(tempAudio.duration) && tempAudio.duration > 0
          ? Math.round(tempAudio.duration)
          : 210;
        cleanup();
        resolve(dur);
      };
      tempAudio.onerror = () => {
        clearTimeout(timer);
        cleanup();
        resolve(210);
      };

      if (typeof fileOrUrl === "string") {
        tempAudio.src = fileOrUrl;
      } else {
        tempObjUrl = URL.createObjectURL(fileOrUrl);
        tempAudio.src = tempObjUrl;
      }
    });
  }

  function generateDefaultSynthArrangement() {
    const presets = [
      {
        bpm: 84,
        progression: [[60,64,67],[55,59,62],[57,60,64],[52,55,59],[53,57,60],[60,64,67],[53,57,62],[55,59,62]],
        melody: [72,74,76,74,72,67,69,72,71,69,67,64,65,69,67,64,65,67,69,72,74,72,71,67]
      },
      {
        bpm: 88,
        progression: [[57,60,64],[53,57,60],[60,64,67],[55,59,62],[50,53,67],[57,60,64],[52,55,59],[57,60,64]],
        melody: [69,72,76,74,72,71,69,67,65,69,72,71,67,64,69,71,72,74,76,72,71,69,68,69]
      },
      {
        bpm: 92,
        progression: [[62,66,69],[57,61,64],[59,62,66],[54,57,61],[55,59,62],[62,66,69],[55,59,64],[57,61,64]],
        melody: [74,76,78,74,73,74,76,69,71,73,74,71,69,66,67,71,74,73,71,69,67,69,71,73]
      }
    ];
    return presets[Math.floor(Math.random() * presets.length)];
  }

  function onSync(callback) {
    if (syncChannel) {
      syncChannel.addEventListener("message", (e) => {
        if (e.data && e.data.type === "db-updated") {
          callback();
        }
      });
    }
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) callback();
    });
  }

  function isAdminLoggedIn() {
    return sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
  }

  function setAdminLoggedIn(flag) {
    if (flag) sessionStorage.setItem(AUTH_SESSION_KEY, "1");
    else sessionStorage.removeItem(AUTH_SESSION_KEY);
  }

  window.RetroStore = {
    buildDefaultDB,
    loadDB,
    saveDB,
    uploadAudioFile,
    deleteAudioFile,
    listUploadedFiles,
    resolvePlayableUrl,
    probeAudioDuration,
    generateDefaultSynthArrangement,
    adminLogin,
    adminLogout,
    changeAdminCredentials,
    getGitHubConfig,
    setGitHubConfig,
    isGitHubConfigured,
    testGitHubConnection,
    onSync,
    isAdminLoggedIn,
    setAdminLoggedIn
  };
})();
