// ==========================================================================
// Điều khiển Bảng Quản Trị Webmaster AdminCP - Triệu Trái Tim
// ==========================================================================

(function () {
  let siteDB = null;
  let serverMode = false;
  let editingSongId = null;

  const loginScreen = document.getElementById("login-screen");
  const adminApp = document.getElementById("admin-app");
  const loginForm = document.getElementById("login-form");
  const loginUser = document.getElementById("login-user");
  const loginPass = document.getElementById("login-pass");
  const loginErr = document.getElementById("login-error");
  const serverBadge = document.getElementById("server-mode-badge");
  const toastEl = document.getElementById("acp-toast");

  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function formatMMSS(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
  }

  function parseDurationInput(val) {
    const raw = String(val || "").trim();
    if (!raw) return 210;
    if (raw.includes(":")) {
      const parts = raw.split(":");
      const m = parseInt(parts[0], 10) || 0;
      const s = parseInt(parts[1], 10) || 0;
      return Math.max(1, m * 60 + s);
    }
    const num = parseInt(raw, 10);
    return Number.isFinite(num) && num > 0 ? num : 210;
  }

  function formatBytes(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / (1024 * 1024)).toFixed(2) + " MB";
  }

  // ==================== ĐĂNG NHẬP & CHUYỂN TAB ====================
  function updateAuthView() {
    if (window.RetroStore.isAdminLoggedIn()) {
      loginScreen.style.display = "none";
      adminApp.style.display = "block";
      renderAllAdminViews();
    } else {
      loginScreen.style.display = "flex";
      adminApp.style.display = "none";
    }
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const u = loginUser.value.trim();
    const p = loginPass.value;
    try {
      await window.RetroStore.adminLogin(u, p, siteDB);
      loginErr.style.display = "none";
      updateAuthView();
      showToast("✔ Đăng nhập AdminCP thành công!");
    } catch (err) {
      loginErr.textContent = err.message || "Sai tài khoản hoặc mật khẩu Admin!";
      loginErr.style.display = "block";
    }
  });

  document.getElementById("btn-logout").addEventListener("click", async () => {
    await window.RetroStore.adminLogout();
    updateAuthView();
  });

  document.querySelectorAll(".admin-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add("active");
      if (btn.dataset.tab === "tab-system") {
        refreshUploadsList();
      }
    });
  });

  // ==================== TAB 1: QUẢN LÝ BÀI HÁT & UPLOAD MP3 ====================
  const songForm = document.getElementById("song-form");
  const songEditIdEl = document.getElementById("song-edit-id");
  const songFormHeading = document.getElementById("song-form-heading");
  const songTitleEl = document.getElementById("song-title");
  const songArtistEl = document.getElementById("song-artist");
  const songRealSingerEl = document.getElementById("song-real-singer");
  const songDurationEl = document.getElementById("song-duration");
  const songAudioUrlEl = document.getElementById("song-audio-url");
  const songLyricsEl = document.getElementById("song-lyrics");
  const singleMp3Input = document.getElementById("single-mp3-input");
  const singleUploadStatus = document.getElementById("single-upload-status");
  const btnCancelEdit = document.getElementById("btn-cancel-edit");
  const btnSaveSong = document.getElementById("btn-save-song");

  const songSearchInput = document.getElementById("song-search-input");
  const songTypeFilter = document.getElementById("song-type-filter");
  const songsTbody = document.getElementById("admin-songs-tbody");
  const songCountBadge = document.getElementById("song-count-badge");
  const defaultSongSummary = document.getElementById("default-song-summary");

  const previewBar = document.getElementById("admin-preview-bar");
  const previewLabel = document.getElementById("admin-preview-label");
  const previewAudio = document.getElementById("admin-preview-audio");

  document.getElementById("btn-close-preview").addEventListener("click", () => {
    previewAudio.pause();
    previewBar.style.display = "none";
  });

  function resetSongForm() {
    editingSongId = null;
    songEditIdEl.value = "";
    songTitleEl.value = "";
    songArtistEl.value = "";
    songRealSingerEl.value = "";
    songDurationEl.value = "03:30";
    songAudioUrlEl.value = "";
    songLyricsEl.value = "";
    singleUploadStatus.textContent = "";
    songFormHeading.textContent = "✳ Thêm Bài Hát Mới Vào Playlist";
    btnSaveSong.textContent = "💾 Thêm Bài Hát Vào Playlist";
    btnCancelEdit.style.display = "none";
    renderSongsTable();
  }

  document.getElementById("btn-reset-song-form").addEventListener("click", resetSongForm);
  btnCancelEdit.addEventListener("click", resetSongForm);

  // Upload 1 file MP3 ngay trong form Thêm / Sửa bài hát
  document.getElementById("btn-pick-single-mp3").addEventListener("click", () => {
    singleMp3Input.click();
  });

  document.getElementById("btn-clear-mp3").addEventListener("click", () => {
    songAudioUrlEl.value = "";
    singleUploadStatus.textContent = "Đã gỡ đường dẫn MP3 (bài hát sẽ phát giai điệu hòa tấu).";
  });

  singleMp3Input.addEventListener("change", async (e) => {
    const file = (e.target.files || [])[0];
    if (!file) return;

    try {
      singleUploadStatus.textContent = "⏳ Đang đọc thời lượng & tải file MP3 lên máy chủ...";
      const dur = await window.RetroStore.probeAudioDuration(file);
      const res = await window.RetroStore.uploadAudioFile(file, (pct) => {
        singleUploadStatus.textContent = `⏳ Đang upload: ${pct}%...`;
      });

      songAudioUrlEl.value = res.url;
      songDurationEl.value = formatMMSS(dur);

      // Nếu đang thêm mới và chưa điền tên bài, tự động tách từ tên file
      if (!songTitleEl.value.trim()) {
        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        const parts = cleanName.split(" - ");
        songTitleEl.value = (parts[0] || cleanName).trim();
        if (!songArtistEl.value.trim() && parts[1]) {
          songArtistEl.value = parts[1].trim();
          songRealSingerEl.value = parts[1].trim();
        }
      }

      singleUploadStatus.textContent = `✔ Đã upload thành công: ${res.url} (${formatMMSS(dur)}) — Bấm "Lưu" để hoàn tất!`;
    } catch (err) {
      singleUploadStatus.textContent = "❌ Lỗi upload: " + err.message;
    } finally {
      singleMp3Input.value = "";
    }
  });

  // Lưu bài hát từ Form (Thêm mới hoặc Cập nhật)
  songForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = songTitleEl.value.trim();
    const artist = songArtistEl.value.trim();
    if (!title || !artist) return;

    const realSinger = songRealSingerEl.value.trim() || artist;
    const duration = parseDurationInput(songDurationEl.value);
    const audioUrl = songAudioUrlEl.value.trim();
    const lyrics = songLyricsEl.value;

    if (editingSongId != null) {
      const idx = siteDB.songs.findIndex((s) => String(s.id) === String(editingSongId));
      if (idx !== -1) {
        siteDB.songs[idx] = Object.assign({}, siteDB.songs[idx], {
          title,
          artist,
          realSinger,
          duration,
          audioUrl,
          lyrics
        });
      }
      await window.RetroStore.saveDB(siteDB, true);
      showToast(`✔ Đã cập nhật bài hát "${title}"!`);
    } else {
      const synthPreset = window.RetroStore.generateDefaultSynthArrangement();
      const newSong = Object.assign({
        id: Date.now() + Math.floor(Math.random() * 10000),
        title,
        artist,
        realSinger,
        duration,
        audioUrl,
        lyrics: lyrics || `♪ Ca khúc: ${title} - ${realSinger}`
      }, synthPreset);

      siteDB.songs.push(newSong);
      await window.RetroStore.saveDB(siteDB, true);
      showToast(`✔ Đã thêm bài hát mới "${title}"!`);
    }

    resetSongForm();
  });

  // Upload hàng loạt (Kéo thả hoặc chọn nhiều file MP3)
  const bulkDropzone = document.getElementById("bulk-dropzone");
  const bulkMp3Input = document.getElementById("bulk-mp3-input");
  const bulkProgressWrap = document.getElementById("bulk-progress-wrap");
  const bulkProgressText = document.getElementById("bulk-progress-text");
  const bulkProgressFill = document.getElementById("bulk-progress-fill");

  bulkDropzone.addEventListener("click", () => bulkMp3Input.click());

  bulkDropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    bulkDropzone.classList.add("dragover");
  });

  bulkDropzone.addEventListener("dragleave", () => {
    bulkDropzone.classList.remove("dragover");
  });

  bulkDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    bulkDropzone.classList.remove("dragover");
    const files = Array.from(e.dataTransfer.files || []).filter((f) =>
      f.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(f.name)
    );
    if (files.length) handleBulkMp3Files(files);
  });

  bulkMp3Input.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) handleBulkMp3Files(files);
    bulkMp3Input.value = "";
  });

  async function handleBulkMp3Files(files) {
    bulkProgressWrap.style.display = "block";
    bulkProgressFill.style.width = "0%";

    let addedCount = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      bulkProgressText.textContent = `Đang tải (${i + 1}/${files.length}): ${file.name}...`;

      try {
        const duration = await window.RetroStore.probeAudioDuration(file);
        const upRes = await window.RetroStore.uploadAudioFile(file, (filePct) => {
          const overall = Math.round(((i + filePct / 100) / files.length) * 100);
          bulkProgressFill.style.width = overall + "%";
        });

        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        const parts = cleanName.split(" - ");
        const title = (parts[0] || cleanName).trim();
        const artist = parts[1] ? parts[1].trim() : "Nhạc MP3 tuyển chọn";

        const synthPreset = window.RetroStore.generateDefaultSynthArrangement();
        siteDB.songs.push(Object.assign({
          id: Date.now() + i + Math.floor(Math.random() * 10000),
          title,
          artist,
          realSinger: artist,
          duration,
          audioUrl: upRes.url,
          lyrics: `♪ Tệp âm thanh MP3: ${file.name}`
        }, synthPreset));

        addedCount++;
      } catch (err) {
        alert(`Lỗi tải file ${file.name}: ${err.message}`);
      }
    }

    await window.RetroStore.saveDB(siteDB, true);
    bulkProgressFill.style.width = "100%";
    bulkProgressText.textContent = `✔ Hoàn tất! Đã upload và thêm ${addedCount} bài hát MP3 vào Playlist.`;
    renderSongsTable();
    showToast(`✔ Đã upload thêm ${addedCount} bài hát MP3!`);
  }

  function loadSongIntoEditor(song) {
    editingSongId = song.id;
    songEditIdEl.value = String(song.id);
    songTitleEl.value = song.title || "";
    songArtistEl.value = song.artist || "";
    songRealSingerEl.value = song.realSinger || "";
    songDurationEl.value = formatMMSS(song.duration || 210);
    songAudioUrlEl.value = song.audioUrl || "";
    songLyricsEl.value = song.lyrics || "";
    singleUploadStatus.textContent = song.audioUrl
      ? `Đang gắn nguồn MP3: ${song.audioUrl}`
      : "Chưa gắn file MP3 (đang dùng nhạc hòa tấu). Bấm '📤 Upload MP3' để gắn file thật!";

    songFormHeading.textContent = `✏ Đang Chỉnh Sửa Bài Hát: ${song.title}`;
    btnSaveSong.textContent = "💾 Lưu Cập Nhật Bài Hát";
    btnCancelEdit.style.display = "inline-flex";

    renderSongsTable();
    document.getElementById("song-editor-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function previewSongInAdmin(song) {
    if (!song.audioUrl) {
      alert(`Bài "${song.title}" hiện đang dùng bộ phát Hòa Tấu Synth trên trang chủ (chưa gắn file MP3).\nBạn có thể bấm "✏ Sửa / MP3" để upload file .mp3 cho bài hát này!`);
      return;
    }
    const url = song.audioUrl.startsWith("idb://")
      ? await window.RetroStore.resolvePlayableUrl(song.audioUrl)
      : song.audioUrl;
    previewBar.style.display = "flex";
    previewLabel.textContent = `♪ Nghe thử: ${song.title} - ${song.artist}`;
    previewAudio.src = url;
    previewAudio.play().catch(() => {});
  }

  function renderSongsTable() {
    const songs = siteDB.songs || [];
    songCountBadge.textContent = String(songs.length);

    const defIdx = Number.isInteger(siteDB.settings.defaultSongIndex)
      ? Math.max(0, Math.min(songs.length - 1, siteDB.settings.defaultSongIndex))
      : 0;

    if (songs[defIdx]) {
      defaultSongSummary.textContent = `#${defIdx + 1} - ${songs[defIdx].title}`;
    } else {
      defaultSongSummary.textContent = "Chưa có";
    }

    const q = songSearchInput.value.trim().toLowerCase();
    const filterMode = songTypeFilter.value;

    songsTbody.innerHTML = "";

    songs.forEach((song, idx) => {
      if (filterMode === "mp3" && !song.audioUrl) return;
      if (filterMode === "synth" && song.audioUrl) return;
      if (q) {
        const hay = `${song.title} ${song.artist} ${song.realSinger || ""}`.toLowerCase();
        if (!hay.includes(q)) return;
      }

      const tr = document.createElement("tr");
      if (editingSongId != null && String(song.id) === String(editingSongId)) {
        tr.className = "editing-row";
      }

      const isDefault = idx === defIdx;
      const sourceBadge = song.audioUrl
        ? `<span class="badge-mp3" title="${escapeHtml(song.audioUrl)}">✔ File MP3</span>`
        : `<span class="badge-synth">♪ Hòa tấu</span>`;

      tr.innerHTML = `
        <td><b>${idx + 1}.</b></td>
        <td>
          <b style="color:#0b2c7a;">${escapeHtml(song.title)}</b>
          <span style="color:#b64949;"> - ${escapeHtml(song.artist)}</span>
          ${isDefault ? '<span class="badge-default">★ Mặc định</span>' : ''}
        </td>
        <td>${sourceBadge}</td>
        <td>${formatMMSS(song.duration || 210)}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="acp-btn acp-btn-sm act-edit">✏ Sửa / MP3</button>
            ${song.audioUrl ? '<button type="button" class="acp-btn acp-btn-sm act-preview">▶ Nghe</button>' : ''}
            <button type="button" class="acp-btn acp-btn-sm act-up" title="Đưa lên" ${idx === 0 ? 'disabled' : ''}>▲</button>
            <button type="button" class="acp-btn acp-btn-sm act-down" title="Đưa xuống" ${idx === songs.length - 1 ? 'disabled' : ''}>▼</button>
            ${!isDefault ? '<button type="button" class="acp-btn acp-btn-sm act-default" title="Đặt làm bài mặc định khi mở web">★</button>' : ''}
            <button type="button" class="acp-btn acp-btn-danger acp-btn-sm act-del" title="Xóa bài hát">🗑</button>
          </div>
        </td>
      `;

      tr.querySelector(".act-edit").addEventListener("click", () => loadSongIntoEditor(song));

      const prevBtn = tr.querySelector(".act-preview");
      if (prevBtn) {
        prevBtn.addEventListener("click", () => previewSongInAdmin(song));
      }

      tr.querySelector(".act-up").addEventListener("click", async () => {
        if (idx <= 0) return;
        const defaultSongId = songs[defIdx] ? songs[defIdx].id : null;
        const tmp = songs[idx - 1];
        songs[idx - 1] = songs[idx];
        songs[idx] = tmp;
        if (defaultSongId != null) {
          siteDB.settings.defaultSongIndex = songs.findIndex((s) => s.id === defaultSongId);
        }
        await window.RetroStore.saveDB(siteDB, true);
        renderSongsTable();
      });

      tr.querySelector(".act-down").addEventListener("click", async () => {
        if (idx >= songs.length - 1) return;
        const defaultSongId = songs[defIdx] ? songs[defIdx].id : null;
        const tmp = songs[idx + 1];
        songs[idx + 1] = songs[idx];
        songs[idx] = tmp;
        if (defaultSongId != null) {
          siteDB.settings.defaultSongIndex = songs.findIndex((s) => s.id === defaultSongId);
        }
        await window.RetroStore.saveDB(siteDB, true);
        renderSongsTable();
      });

      const defBtn = tr.querySelector(".act-default");
      if (defBtn) {
        defBtn.addEventListener("click", async () => {
          siteDB.settings.defaultSongIndex = idx;
          siteDB.settings.defaultStartOffset = 0;
          await window.RetroStore.saveDB(siteDB, true);
          renderSongsTable();
          populateSettingsForm();
          showToast(`★ Đã đặt "${song.title}" làm bài hát mở đầu mặc định!`);
        });
      }

      tr.querySelector(".act-del").addEventListener("click", async () => {
        if (!confirm(`Bạn có chắc muốn xóa bài hát "${song.title}" khỏi Playlist?`)) return;
        if (song.audioUrl && (song.audioUrl.startsWith("uploads/") || song.audioUrl.startsWith("idb://"))) {
          if (confirm(`Xóa luôn tệp nhạc MP3 gốc (${song.audioUrl}) trên máy chủ?`)) {
            await window.RetroStore.deleteAudioFile(song.audioUrl);
          }
        }
        const defaultSongId = songs[defIdx] ? songs[defIdx].id : null;
        siteDB.songs.splice(idx, 1);
        if (defaultSongId != null) {
          const newDef = siteDB.songs.findIndex((s) => s.id === defaultSongId);
          siteDB.settings.defaultSongIndex = newDef !== -1 ? newDef : 0;
        }
        if (editingSongId != null && String(editingSongId) === String(song.id)) {
          resetSongForm();
        }
        await window.RetroStore.saveDB(siteDB, true);
        renderSongsTable();
        showToast(`🗑 Đã xóa bài hát "${song.title}"`);
      });

      songsTbody.appendChild(tr);
    });
  }

  songSearchInput.addEventListener("input", renderSongsTable);
  songTypeFilter.addEventListener("change", renderSongsTable);

  // ==================== TAB 2: CẤU HÌNH GIAO DIỆN & YAHOO ====================
  const settingsForm = document.getElementById("settings-form");

  function populateSettingsForm() {
    const st = siteDB.settings || {};
    document.getElementById("st-page-title").value = st.pageTitle || "";
    document.getElementById("st-player-greeting").value = st.playerGreeting || "";
    document.getElementById("st-brand-title").value = st.brandTitle || "";
    document.getElementById("st-brand-subtitle").value = st.brandSubtitle || "";
    document.getElementById("st-yahoo-id").value = st.yahooId || "";
    document.getElementById("st-yahoo-nick").value = st.yahooNickDisplay || "";
    document.getElementById("st-start-offset").value = st.defaultStartOffset != null ? st.defaultStartOffset : 85;
    document.getElementById("st-yahoo-welcome").value = st.yahooWelcomeMsg || "";
    document.getElementById("st-hit-counter").value = st.hitCounter || "01894208";
    document.getElementById("st-online-count").value = st.onlineCount != null ? st.onlineCount : 128;
    document.getElementById("st-collapse-banner").checked = !!st.defaultCollapseBanner;
    document.getElementById("st-snow-fx").checked = st.defaultSnowFx !== false;
    document.getElementById("st-footer-1").value = st.footerLine1 || "";
    document.getElementById("st-footer-2").value = st.footerLine2 || "";
  }

  settingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const st = siteDB.settings;
    st.pageTitle = document.getElementById("st-page-title").value.trim();
    st.playerGreeting = document.getElementById("st-player-greeting").value.trim();
    st.brandTitle = document.getElementById("st-brand-title").value.trim();
    st.brandSubtitle = document.getElementById("st-brand-subtitle").value.trim();
    st.yahooId = document.getElementById("st-yahoo-id").value.trim();
    st.yahooNickDisplay = document.getElementById("st-yahoo-nick").value;
    st.defaultStartOffset = Math.max(0, parseInt(document.getElementById("st-start-offset").value, 10) || 0);
    st.yahooWelcomeMsg = document.getElementById("st-yahoo-welcome").value.trim();
    st.hitCounter = document.getElementById("st-hit-counter").value.trim() || "01894208";
    st.onlineCount = Math.max(1, parseInt(document.getElementById("st-online-count").value, 10) || 128);
    st.defaultCollapseBanner = document.getElementById("st-collapse-banner").checked;
    st.defaultSnowFx = document.getElementById("st-snow-fx").checked;
    st.footerLine1 = document.getElementById("st-footer-1").value.trim();
    st.footerLine2 = document.getElementById("st-footer-2").value.trim();

    await window.RetroStore.saveDB(siteDB, true);
    showToast("✔ Đã lưu cấu hình giao diện & Yahoo!");
  });

  // ==================== TAB 3: QUẢN LÝ MENU HAI CỘT & LIÊN KẾT NHANH ====================
  const menuSectionSelect = document.getElementById("menu-section-select");
  const menuItemForm = document.getElementById("menu-item-form");
  const menuEditIdxEl = document.getElementById("menu-edit-idx");
  const menuItemLabelEl = document.getElementById("menu-item-label");
  const menuItemUrlEl = document.getElementById("menu-item-url");
  const menuItemContentEl = document.getElementById("menu-item-content");
  const menuUrlWrap = document.getElementById("menu-url-wrap");
  const menuContentWrap = document.getElementById("menu-content-wrap");
  const menuItemsTbody = document.getElementById("menu-items-tbody");
  const btnCancelMenuItem = document.getElementById("btn-cancel-menu-item");
  const btnSaveMenuItem = document.getElementById("btn-save-menu-item");

  function resetMenuForm() {
    menuEditIdxEl.value = "-1";
    menuItemLabelEl.value = "";
    menuItemUrlEl.value = "";
    menuItemContentEl.value = "";
    btnSaveMenuItem.textContent = "💾 Thêm Mục Mới";
    btnCancelMenuItem.style.display = "none";
  }

  function renderMenuManager() {
    const secKey = menuSectionSelect.value;
    const isQuickLinks = secKey === "quickLinks";

    menuUrlWrap.style.display = isQuickLinks ? "block" : "none";
    menuContentWrap.style.display = isQuickLinks ? "none" : "block";

    const list = siteDB[secKey] || [];
    menuItemsTbody.innerHTML = "";

    list.forEach((rawItem, idx) => {
      const item = typeof rawItem === "string"
        ? { id: secKey + "_" + idx, label: rawItem, content: "", url: "" }
        : rawItem;
      list[idx] = item;

      const summary = isQuickLinks
        ? (item.url ? `<a href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(item.url)}</a>` : '<span style="color:#888;">(Mặc định kỷ niệm)</span>')
        : (item.content && item.content.trim()
            ? `<span style="color:#0f6b28;">✔ Bài viết riêng (${item.content.length} ký tự)</span>`
            : '<span style="color:#777;">Bài mẫu mặc định</span>');

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${idx + 1}</b></td>
        <td><b>${escapeHtml(item.label)}</b></td>
        <td>${summary}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="acp-btn acp-btn-sm m-edit">✏ Sửa</button>
            <button type="button" class="acp-btn acp-btn-sm m-up" ${idx === 0 ? 'disabled' : ''}>▲</button>
            <button type="button" class="acp-btn acp-btn-sm m-down" ${idx === list.length - 1 ? 'disabled' : ''}>▼</button>
            <button type="button" class="acp-btn acp-btn-danger acp-btn-sm m-del">🗑</button>
          </div>
        </td>
      `;

      tr.querySelector(".m-edit").addEventListener("click", () => {
        menuEditIdxEl.value = String(idx);
        menuItemLabelEl.value = item.label || "";
        menuItemUrlEl.value = item.url || "";
        menuItemContentEl.value = item.content || "";
        btnSaveMenuItem.textContent = "💾 Cập Nhật Mục Này";
        btnCancelMenuItem.style.display = "inline-flex";
        menuItemLabelEl.focus();
      });

      tr.querySelector(".m-up").addEventListener("click", async () => {
        if (idx <= 0) return;
        const tmp = list[idx - 1];
        list[idx - 1] = list[idx];
        list[idx] = tmp;
        await window.RetroStore.saveDB(siteDB, true);
        renderMenuManager();
      });

      tr.querySelector(".m-down").addEventListener("click", async () => {
        if (idx >= list.length - 1) return;
        const tmp = list[idx + 1];
        list[idx + 1] = list[idx];
        list[idx] = tmp;
        await window.RetroStore.saveDB(siteDB, true);
        renderMenuManager();
      });

      tr.querySelector(".m-del").addEventListener("click", async () => {
        if (!confirm(`Xóa mục "${item.label}"?`)) return;
        list.splice(idx, 1);
        resetMenuForm();
        await window.RetroStore.saveDB(siteDB, true);
        renderMenuManager();
        showToast("🗑 Đã xóa mục menu!");
      });

      menuItemsTbody.appendChild(tr);
    });
  }

  menuSectionSelect.addEventListener("change", () => {
    resetMenuForm();
    renderMenuManager();
  });

  btnCancelMenuItem.addEventListener("click", resetMenuForm);

  menuItemForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const secKey = menuSectionSelect.value;
    const list = siteDB[secKey] || (siteDB[secKey] = []);
    const editIdx = parseInt(menuEditIdxEl.value, 10);
    const label = menuItemLabelEl.value.trim();
    if (!label) return;

    if (editIdx >= 0 && editIdx < list.length) {
      list[editIdx] = Object.assign({}, list[editIdx], {
        label,
        url: menuItemUrlEl.value.trim(),
        content: menuItemContentEl.value
      });
    } else {
      list.push({
        id: secKey + "_" + Date.now(),
        key: "custom",
        label,
        url: menuItemUrlEl.value.trim(),
        content: menuItemContentEl.value
      });
    }

    await window.RetroStore.saveDB(siteDB, true);
    resetMenuForm();
    renderMenuManager();
    showToast("✔ Đã lưu danh mục menu!");
  });

  // ==================== TAB 4: GITHUB CLOUD, KHO FILE MP3 & HỆ THỐNG ====================
  const uploadsTbody = document.getElementById("uploads-list-tbody");
  const ghCloudForm = document.getElementById("github-cloud-form");
  const ghOwnerInput = document.getElementById("gh-owner");
  const ghRepoInput = document.getElementById("gh-repo");
  const ghBranchInput = document.getElementById("gh-branch");
  const ghTokenInput = document.getElementById("gh-token");
  const ghConnStatus = document.getElementById("gh-conn-status");
  const btnDisconnectGh = document.getElementById("btn-disconnect-gh");

  let activeBackendMode = "offline";

  function updateStatusBadge(mode) {
    activeBackendMode = mode || "offline";
    const ghPanel = ghCloudForm ? ghCloudForm.closest(".acp-panel") : null;

    if (mode === "hostinger-php") {
      serverBadge.textContent = "● Hostinger PHP Online (Lưu trực tiếp vào /uploads & site-db.json)";
      serverBadge.classList.remove("offline");
      serverBadge.style.cursor = "default";
      if (ghPanel) ghPanel.style.display = "none";
    } else if (mode === "local-server") {
      serverBadge.textContent = "● Local Server (Lưu vào /uploads & site-db.json)";
      serverBadge.classList.remove("offline");
      serverBadge.style.cursor = "default";
      if (ghPanel) ghPanel.style.display = "block";
    } else if (mode === "github-cloud") {
      const cfg = window.RetroStore.getGitHubConfig();
      serverBadge.textContent = `☁ GitHub Cloud (${cfg.owner}/${cfg.repo}@${cfg.branch})`;
      serverBadge.classList.remove("offline");
      serverBadge.style.cursor = "pointer";
      if (ghPanel) ghPanel.style.display = "block";
    } else {
      serverBadge.textContent = "☁ Chưa kết nối Server / GitHub (Bấm để cấu hình)";
      serverBadge.classList.add("offline");
      serverBadge.style.cursor = "pointer";
      if (ghPanel) ghPanel.style.display = "block";
    }
  }

  serverBadge.addEventListener("click", () => {
    if (activeBackendMode !== "local-server" && activeBackendMode !== "hostinger-php") {
      const sysTabBtn = document.querySelector('[data-tab="tab-system"]');
      if (sysTabBtn) sysTabBtn.click();
      ghTokenInput.focus();
    }
  });

  function populateGitHubForm() {
    const cfg = window.RetroStore.getGitHubConfig();
    ghOwnerInput.value = cfg.owner || "";
    ghRepoInput.value = cfg.repo || "";
    ghBranchInput.value = cfg.branch || "main";
    ghTokenInput.value = cfg.token || "";
    if (window.RetroStore.isGitHubConfigured()) {
      ghConnStatus.style.color = "#0e5f24";
      ghConnStatus.textContent = `✔ Đã cấu hình: ${cfg.owner}/${cfg.repo} (${cfg.branch})`;
    } else {
      ghConnStatus.textContent = "";
    }
  }

  ghCloudForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const cfg = {
      owner: ghOwnerInput.value.trim(),
      repo: ghRepoInput.value.trim(),
      branch: ghBranchInput.value.trim() || "main",
      token: ghTokenInput.value.trim()
    };
    ghConnStatus.style.color = "#0d4a8a";
    ghConnStatus.textContent = "⏳ Đang kiểm tra kết nối GitHub API...";
    try {
      const info = await window.RetroStore.testGitHubConnection(cfg);
      if (!ghBranchInput.value.trim()) {
        cfg.branch = info.defaultBranch;
        ghBranchInput.value = cfg.branch;
      }
      window.RetroStore.setGitHubConfig(cfg);
      serverMode = true;
      updateStatusBadge("github-cloud");
      ghConnStatus.style.color = "#0e5f24";
      ghConnStatus.textContent = `✔ Kết nối thành công tới ${info.fullName}! Đang đồng bộ site-db.json...`;

      // Đẩy ngay bản dữ liệu hiện tại lên GitHub hoặc nạp dữ liệu từ GitHub
      const reloaded = await window.RetroStore.loadDB();
      siteDB = reloaded.db;
      await window.RetroStore.saveDB(siteDB, true);
      ghConnStatus.textContent = `✔ Đã kết nối & đồng bộ ${info.fullName} (Nhánh ${cfg.branch})! Từ giờ bạn upload MP3 sẽ lưu thẳng lên GitHub Pages.`;
      renderAllAdminViews();
      refreshUploadsList();
      showToast("☁ Đã kết nối GitHub Cloud thành công!");
    } catch (err) {
      ghConnStatus.style.color = "#b81414";
      ghConnStatus.textContent = "❌ " + err.message;
    }
  });

  btnDisconnectGh.addEventListener("click", async () => {
    const cur = window.RetroStore.getGitHubConfig();
    window.RetroStore.setGitHubConfig({ owner: cur.owner, repo: cur.repo, branch: cur.branch, token: "" });
    ghTokenInput.value = "";
    ghConnStatus.style.color = "#555";
    ghConnStatus.textContent = "Đã ngắt kết nối GitHub Token trên trình duyệt này.";
    const res = await window.RetroStore.loadDB();
    serverMode = res.serverMode;
    updateStatusBadge(res.mode);
    refreshUploadsList();
  });

  async function refreshUploadsList() {
    uploadsTbody.innerHTML = `<tr><td colspan="4">Đang tải danh sách file trong thư mục uploads/...</td></tr>`;

    try {
      const result = await window.RetroStore.listUploadedFiles();
      if (result.mode === "offline") {
        uploadsTbody.innerHTML = `<tr><td colspan="4">Hiện chưa kết nối Local Server hoặc GitHub Token. Hãy nhập <b>GitHub Personal Access Token</b> ở khung phía trên để quản lý trực tiếp thư mục <code>uploads/</code> trên GitHub!</td></tr>`;
        return;
      }

      const files = result.files || [];
      if (!files.length) {
        uploadsTbody.innerHTML = `<tr><td colspan="4" style="color:#666;">Chưa có file MP3 nào trong thư mục <code>uploads/</code>. Hãy sang Tab 1 để upload nhạc!</td></tr>`;
        return;
      }

      uploadsTbody.innerHTML = "";
      files.forEach((f) => {
        const isUsed = (siteDB.songs || []).some((s) => s.audioUrl === f.url);
        const openHref = f.rawUrl || f.url;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>
            <code>${escapeHtml(f.filename)}</code>
            ${isUsed ? '<span class="badge-mp3" style="margin-left:6px;">Đang dùng</span>' : '<span class="badge-synth" style="margin-left:6px;">Chưa gắn bài</span>'}
          </td>
          <td>${formatBytes(f.size)}</td>
          <td>${escapeHtml(f.modified)}</td>
          <td>
            <div class="row-actions">
              <button type="button" class="acp-btn acp-btn-sm u-add">+ Tạo bài hát</button>
              <a href="${escapeHtml(openHref)}" target="_blank" rel="noopener noreferrer" class="acp-btn acp-btn-sm">▶ Mở file</a>
              <button type="button" class="acp-btn acp-btn-danger acp-btn-sm u-del">🗑 Xóa file</button>
            </div>
          </td>
        `;

        tr.querySelector(".u-add").addEventListener("click", async () => {
          const dur = await window.RetroStore.probeAudioDuration(openHref);
          const stem = f.filename.replace(/^\d+-/, "").replace(/\.[^/.]+$/, "").replace(/-/g, " ");
          const synthPreset = window.RetroStore.generateDefaultSynthArrangement();
          siteDB.songs.push(Object.assign({
            id: Date.now(),
            title: stem || f.filename,
            artist: "Nhạc MP3 tuyển chọn",
            realSinger: "Nhạc MP3 tuyển chọn",
            duration: dur,
            audioUrl: f.url,
            lyrics: `♪ Tệp âm thanh: ${f.filename}`
          }, synthPreset));
          await window.RetroStore.saveDB(siteDB, true);
          renderSongsTable();
          refreshUploadsList();
          showToast(`✔ Đã thêm "${stem}" vào Playlist!`);
        });

        tr.querySelector(".u-del").addEventListener("click", async () => {
          if (!confirm(`Xóa vĩnh viễn tệp "${f.filename}" khỏi thư mục uploads/?`)) return;
          await window.RetroStore.deleteAudioFile(f.url);
          refreshUploadsList();
          showToast("🗑 Đã xóa file khỏi thư mục uploads/");
        });

        uploadsTbody.appendChild(tr);
      });
    } catch (err) {
      uploadsTbody.innerHTML = `<tr><td colspan="4" style="color:#b00;">Không đọc được thư mục uploads/: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  document.getElementById("btn-refresh-uploads").addEventListener("click", refreshUploadsList);

  // Xuất JSON Backup
  document.getElementById("btn-export-json").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(siteDB, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trieutraitim-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Nhập JSON Backup
  const importJsonInput = document.getElementById("import-json-input");
  document.getElementById("btn-import-json").addEventListener("click", () => importJsonInput.click());
  importJsonInput.addEventListener("change", async (e) => {
    const file = (e.target.files || [])[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.songs)) {
        throw new Error("Tệp JSON không đúng định dạng dữ liệu Triệu Trái Tim");
      }
      siteDB = parsed;
      await window.RetroStore.saveDB(siteDB, true);
      renderAllAdminViews();
      showToast("✔ Đã khôi phục dữ liệu từ bản sao lưu!");
    } catch (err) {
      alert("Không thể nhập file JSON: " + err.message);
    } finally {
      importJsonInput.value = "";
    }
  });

  // Reset toàn bộ về mặc định gốc 2008
  document.getElementById("btn-reset-defaults").addEventListener("click", async () => {
    if (!confirm("Khôi phục toàn bộ Playlist, Menu và Cấu hình về giao diện gốc năm 2008?\n(Các file MP3 trong thư mục uploads/ vẫn được giữ nguyên).")) {
      return;
    }
    const keepAuth = siteDB.adminAuth;
    siteDB = window.RetroStore.buildDefaultDB();
    siteDB.adminAuth = keepAuth;
    await window.RetroStore.saveDB(siteDB, true);
    resetSongForm();
    renderAllAdminViews();
    showToast("✔ Đã khôi phục giao diện & dữ liệu gốc 2008!");
  });

  // Đổi mật khẩu Admin
  document.getElementById("auth-change-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const newU = document.getElementById("auth-new-user").value.trim();
    const newP = document.getElementById("auth-new-pass").value;
    if (!newU || !newP) return;
    try {
      await window.RetroStore.changeAdminCredentials(newU, newP, siteDB);
      showToast("🔐 Đã cập nhật tài khoản & mật khẩu Admin!");
    } catch (err) {
      alert("Lỗi đổi mật khẩu: " + err.message);
    }
  });

  function renderAllAdminViews() {
    renderSongsTable();
    populateSettingsForm();
    populateGitHubForm();
    resetMenuForm();
    renderMenuManager();
    document.getElementById("auth-new-user").value = (siteDB.adminAuth && siteDB.adminAuth.username) || "admin";
    document.getElementById("auth-new-pass").value = (siteDB.adminAuth && siteDB.adminAuth.password) || "123456";
  }

  // ==================== KHỞI ĐỘNG ADMINCP ====================
  async function initAdmin() {
    const res = await window.RetroStore.loadDB();
    siteDB = res.db;
    serverMode = res.serverMode;
    updateStatusBadge(res.mode);
    updateAuthView();
  }

  initAdmin();
})();
