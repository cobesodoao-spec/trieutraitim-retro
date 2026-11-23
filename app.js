// ==========================================================================
// Điều khiển Giao diện Web Nghe Nhạc Xưa - trieutraitim.info (Kết nối RetroStore)
// ==========================================================================

(function () {
  let siteDB = null;
  let songs = [];
  let activeIndex = 1;
  let repeatOne = false;
  let fxEnabled = true;

  // DOM Elements
  const playlistEl = document.getElementById("playlist-list");
  const lcdTimeEl = document.getElementById("lcd-time");
  const lcdStatusEl = document.getElementById("lcd-song-status");
  const greetingTextEl = document.getElementById("marquee-greeting");

  const seekGrooveEl = document.getElementById("seek-groove");
  const seekFillEl = document.getElementById("seek-fill");
  const seekKnobEl = document.getElementById("seek-knob");

  const volGrooveEl = document.getElementById("vol-groove");
  const volFillEl = document.getElementById("vol-fill");
  const volKnobEl = document.getElementById("vol-knob");

  const btnPlay = document.getElementById("btn-play");
  const iconPlaySvg = document.getElementById("icon-play-svg");
  const iconPauseSvg = document.getElementById("icon-pause-svg");
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const btnMute = document.getElementById("btn-mute");
  const iconSpeakerOn = document.getElementById("icon-speaker-on");
  const iconSpeakerOff = document.getElementById("icon-speaker-off");

  const btnRepeat = document.getElementById("btn-repeat");
  const btnLyricsToggle = document.getElementById("btn-lyrics-toggle");
  const btnUploadMp3 = document.getElementById("btn-upload-mp3");
  const mp3Input = document.getElementById("mp3-file-input");

  const lyricsPanel = document.getElementById("lyrics-panel");
  const lyricsTitle = document.getElementById("lyrics-song-title");
  const lyricsBody = document.getElementById("lyrics-body");

  const fxContainer = document.getElementById("falling-fx");
  const btnToggleFx = document.getElementById("btn-toggle-fx");
  const btnToggleBanner = document.getElementById("btn-toggle-banner");
  const btnRestoreBanner = document.getElementById("btn-restore-banner");
  const topPortalWrapper = document.getElementById("top-portal-wrapper");

  const engine = new window.RetroMusicEngine({
    onTick: (current, total) => {
      updateTimeUI(current, total);
    },
    onEnded: () => {
      if (!songs.length) return;
      if (repeatOne) {
        engine.seek(0);
        engine.play();
      } else {
        selectSong((activeIndex + 1) % songs.length, 0, true);
      }
    },
    onStateChange: (playing) => {
      iconPauseSvg.style.display = playing ? "block" : "none";
      iconPlaySvg.style.display = playing ? "none" : "block";
      renderPlaylist();
      updateLcdStatus(playing);
    }
  });

  function formatMMSS(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function updateTimeUI(current, total) {
    lcdTimeEl.textContent = `${formatMMSS(current)} / ${formatMMSS(total)}`;
    const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
    seekFillEl.style.width = `${pct}%`;
    seekKnobEl.style.left = `${pct}%`;
  }

  function updateVolumeUI(vol, muted) {
    const pct = muted ? 0 : Math.round(vol * 100);
    volFillEl.style.width = `${pct}%`;
    volKnobEl.style.left = `${pct}%`;
    iconSpeakerOn.style.display = muted || pct === 0 ? "none" : "block";
    iconSpeakerOff.style.display = muted || pct === 0 ? "block" : "none";
  }

  function updateLcdStatus(playing) {
    const song = songs[activeIndex];
    if (!song) {
      lcdStatusEl.textContent = "Chưa có bài hát nào trong Playlist";
      return;
    }
    const modeTag = song.audioUrl ? "[MP3]" : "[Giai điệu hòa tấu]";
    const stateTag = playing ? "Đang phát:" : "Sẵn sàng:";
    lcdStatusEl.textContent = `${stateTag} ${song.title} - ${song.realSinger || song.artist} ${modeTag}`;
    lyricsTitle.textContent = `♪ Lời bài hát & Cảm nhận: ${song.title}`;
    lyricsBody.textContent = song.lyrics || `Đang phát ca khúc "${song.title}" - ${song.artist}.`;
  }

  function renderPlaylist() {
    playlistEl.innerHTML = "";
    songs.forEach((song, idx) => {
      const li = document.createElement("li");
      li.className = "playlist-row" + (idx === activeIndex ? " active" : "");

      const indexCell = document.createElement("span");
      indexCell.className = "track-index-cell";

      if (idx === activeIndex) {
        const eq = document.createElement("span");
        eq.className = "eq-bars" + (engine.isPlaying ? "" : " paused");
        eq.innerHTML = "<span></span><span></span><span></span><span></span>";
        indexCell.appendChild(eq);
      } else {
        indexCell.textContent = `${idx + 1}.`;
      }

      const textSpan = document.createElement("div");
      textSpan.className = "track-text";

      const titleSpan = document.createElement("span");
      titleSpan.className = "track-title";
      titleSpan.textContent = song.title;

      const dashSpan = document.createElement("span");
      dashSpan.className = "track-dash";
      dashSpan.textContent = " - ";

      const artistSpan = document.createElement("span");
      artistSpan.className = "track-artist";
      artistSpan.textContent = song.artist;

      textSpan.appendChild(titleSpan);
      textSpan.appendChild(dashSpan);
      textSpan.appendChild(artistSpan);

      if (song.audioUrl) {
        const localTag = document.createElement("span");
        localTag.className = "track-badge-local";
        localTag.textContent = "MP3";
        textSpan.appendChild(localTag);
      }

      li.appendChild(indexCell);
      li.appendChild(textSpan);

      li.addEventListener("click", () => {
        if (idx === activeIndex) {
          engine.togglePlay();
        } else {
          selectSong(idx, 0, true);
        }
      });

      playlistEl.appendChild(li);
    });
  }

  async function selectSong(index, startOffset = 0, autoPlay = true) {
    if (!songs.length) return;
    activeIndex = ((index % songs.length) + songs.length) % songs.length;
    const song = songs[activeIndex];
    song.resolvedUrl = song.audioUrl ? await window.RetroStore.resolvePlayableUrl(song.audioUrl) : "";
    engine.loadSong(song, startOffset, autoPlay);
    renderPlaylist();
    updateLcdStatus(autoPlay);
    const baseGreet = (siteDB && siteDB.settings && siteDB.settings.playerGreeting)
      ? siteDB.settings.playerGreeting
      : "Nửa Ngày Nửa Đêm Blog - Chúc bạn nghe nhạc vui vẻ";
    greetingTextEl.textContent = `${baseGreet}  ★  Đang chọn: ${song.title} - ${song.artist}`;
  }

  // Hỗ trợ kéo chuột trên thanh Seek và Volume
  function attachSliderDrag(grooveEl, onRatio) {
    let dragging = false;
    const calcRatio = (clientX) => {
      const rect = grooveEl.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };

    grooveEl.addEventListener("mousedown", (e) => {
      dragging = true;
      onRatio(calcRatio(e.clientX));
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      onRatio(calcRatio(e.clientX));
    });

    window.addEventListener("mouseup", () => {
      dragging = false;
    });
  }

  attachSliderDrag(seekGrooveEl, (ratio) => {
    engine.seek(ratio * engine.duration);
  });

  attachSliderDrag(volGrooveEl, (ratio) => {
    engine.setVolume(ratio);
    updateVolumeUI(engine.volume, engine.isMuted);
  });

  btnPlay.addEventListener("click", () => engine.togglePlay());
  btnPrev.addEventListener("click", () => selectSong(activeIndex - 1, 0, true));
  btnNext.addEventListener("click", () => selectSong(activeIndex + 1, 0, true));

  btnMute.addEventListener("click", () => {
    const muted = engine.toggleMute();
    updateVolumeUI(engine.volume, muted);
  });

  btnRepeat.addEventListener("click", () => {
    repeatOne = !repeatOne;
    btnRepeat.classList.toggle("active", repeatOne);
    btnRepeat.textContent = repeatOne ? "↻ Lặp: Bật" : "↻ Lặp lại";
  });

  btnLyricsToggle.addEventListener("click", () => {
    const hidden = lyricsPanel.style.display === "none";
    lyricsPanel.style.display = hidden ? "block" : "none";
    btnLyricsToggle.classList.toggle("active", hidden);
  });

  // Upload nhanh file MP3 trực tiếp lên Server & Lưu vào DB luôn!
  btnUploadMp3.addEventListener("click", () => mp3Input.click());

  mp3Input.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const origBtnLabel = btnUploadMp3.textContent;
    btnUploadMp3.disabled = true;
    let firstAddedIndex = songs.length;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        btnUploadMp3.textContent = `Đang tải (${i + 1}/${files.length})...`;

        const duration = await window.RetroStore.probeAudioDuration(file);
        const upRes = await window.RetroStore.uploadAudioFile(file);

        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        const parts = cleanName.split(" - ");
        const title = parts[0] ? parts[0].trim() : cleanName;
        const artist = parts[1] ? parts[1].trim() : "Nhạc MP3 tuyển chọn";

        const synthPreset = window.RetroStore.generateDefaultSynthArrangement();
        const newSong = Object.assign({
          id: Date.now() + Math.floor(Math.random() * 10000),
          title,
          artist,
          realSinger: artist,
          duration,
          audioUrl: upRes.url,
          lyrics: `♪ Ca khúc MP3: ${title} - ${artist}\nTệp gốc: ${file.name}`
        }, synthPreset);

        siteDB.songs.push(newSong);
      }

      await window.RetroStore.saveDB(siteDB, true);
      songs = siteDB.songs;
      await selectSong(firstAddedIndex, 0, true);
    } catch (err) {
      alert("Không thể upload file nhạc: " + err.message);
    } finally {
      btnUploadMp3.disabled = false;
      btnUploadMp3.textContent = origBtnLabel;
      mp3Input.value = "";
    }
  });

  // ========================================================================
  // Áp dụng Cấu Hình & Render Cột Trái / Cột Phải từ RetroStore
  // ========================================================================
  function applySiteSettings() {
    if (!siteDB || !siteDB.settings) return;
    const st = siteDB.settings;

    document.title = st.pageTitle || "Triệu Trái Tim (trieutraitim.info)";
    const brandTitleEl = document.getElementById("brand-title");
    const brandSubEl = document.getElementById("brand-subtitle");
    if (brandTitleEl) brandTitleEl.textContent = st.brandTitle || "Triệu Trái Tim . Info";
    if (brandSubEl) brandSubEl.textContent = st.brandSubtitle || "";

    greetingTextEl.textContent = st.playerGreeting || "Nửa Ngày Nửa Đêm Blog - Chúc bạn nghe nhạc vui vẻ";

    // Bộ đếm lượt truy cập
    const counterBox = document.getElementById("lcd-counter-box");
    if (counterBox) {
      const digits = String(st.hitCounter || "01894208").padStart(8, "0").split("");
      counterBox.innerHTML = digits.map((d) => `<span>${escapeHtml(d)}</span>`).join("");
    }
    const onlineEl = document.getElementById("online-count-val");
    if (onlineEl) onlineEl.textContent = st.onlineCount != null ? st.onlineCount : 128;

    // Nick Yahoo! Messenger
    const yhNickEl = document.getElementById("yh-nick-name");
    if (yhNickEl) {
      yhNickEl.innerHTML = escapeHtml(st.yahooNickDisplay || "Con mòe kêu meo\nmeo").replace(/\n/g, "<br/>");
    }
    const yhTitleEl = document.getElementById("yh-win-title-text");
    if (yhTitleEl) {
      yhTitleEl.textContent = `😊 ${st.yahooId || "con_moe_keu_meo_meo"} - Instant Message`;
    }

    // Chân trang
    const f1 = document.getElementById("footer-line-1");
    const f2 = document.getElementById("footer-line-2");
    if (f1 && st.footerLine1) f1.textContent = st.footerLine1;
    if (f2 && st.footerLine2) {
      f2.innerHTML = `${escapeHtml(st.footerLine2)} — <a href="admin.html" style="color:#0b56a8;font-weight:bold;">[⚙ Mở Admin CP]</a>`;
    }
  }

  function renderSidebars() {
    const leftBooksEl = document.getElementById("left-books-list");
    leftBooksEl.innerHTML = "";
    (siteDB.leftBooks || []).forEach((item) => {
      const label = typeof item === "string" ? item : item.label;
      const customContent = typeof item === "object" ? item.content : "";
      const li = document.createElement("li");
      li.innerHTML = `<a href="#book"><span class="dots-icon"><i></i><i></i><i></i><i></i><i></i><i></i></span>${escapeHtml(label)}</a>`;
      li.querySelector("a").addEventListener("click", (e) => {
        e.preventDefault();
        openRetroModal(`Tủ Sách Hay :: ${label}`, customContent ? `<div style="white-space:pre-line;">${escapeHtml(customContent)}</div>` : buildBookContent(label));
      });
      leftBooksEl.appendChild(li);
    });

    const leftInfoEl = document.getElementById("left-info-list");
    leftInfoEl.innerHTML = "";
    (siteDB.leftInfo || []).forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = `<a href="#${escapeHtml(item.key || "info")}"><span class="plus-icon">+</span>${escapeHtml(item.label)}</a>`;
      li.querySelector("a").addEventListener("click", (e) => {
        e.preventDefault();
        if (item.content && item.content.trim()) {
          openRetroModal(`Thông Tin :: ${item.label}`, `<div style="white-space:pre-line;">${escapeHtml(item.content)}</div>`);
        } else {
          openInfoUtility(item.key || "custom", item.label);
        }
      });
      leftInfoEl.appendChild(li);
    });

    const rightDiscoverEl = document.getElementById("right-discover-list");
    rightDiscoverEl.innerHTML = "";
    (siteDB.rightDiscover || []).forEach((item) => {
      const label = typeof item === "string" ? item : item.label;
      const customContent = typeof item === "object" ? item.content : "";
      const li = document.createElement("li");
      li.innerHTML = `<a href="#discover"><span class="plus-icon">+</span>${escapeHtml(label)}</a>`;
      li.querySelector("a").addEventListener("click", (e) => {
        e.preventDefault();
        openRetroModal(`Khám Phá Thế Giới :: ${label}`, customContent ? `<div style="white-space:pre-line;">${escapeHtml(customContent)}</div>` : buildDiscoverContent(label));
      });
      rightDiscoverEl.appendChild(li);
    });

    const quickSelect = document.getElementById("quick-link-select");
    quickSelect.innerHTML = `<option value="">(¯\`Liên Kết Nhanh´¯)</option>`;
    (siteDB.quickLinks || []).forEach((ql, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = ql.label;
      quickSelect.appendChild(opt);
    });

    quickSelect.onchange = () => {
      if (quickSelect.value === "") return;
      const item = (siteDB.quickLinks || [])[Number(quickSelect.value)];
      quickSelect.selectedIndex = 0;
      if (!item) return;

      if (item.url && /^https?:\/\//i.test(item.url)) {
        openRetroModal(
          "Liên Kết Nhanh",
          `<p><b>Liên kết bạn chọn:</b> ${escapeHtml(item.label)}</p>
           <p>Địa chỉ: <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a></p>`
        );
      } else {
        openRetroModal(
          "Liên Kết Nhanh Web Xưa (2008)",
          `<p><b>Bạn vừa chọn liên kết kỷ niệm:</b> <span style="color:#0055cc">${escapeHtml(item.label)}</span></p>
           <p>Vào những năm 2007 - 2010, các trang nhạc cá nhân như <b>trieutraitim.info</b> đều đặt hộp <code>(¯\`Liên Kết Nhanh´¯)</code> để trao đổi liên kết bạn bè giữa các Webmaster!</p>`
        );
      }
    };
  }

  // ========================================================================
  // Modal đọc chuyên mục & Tiện ích
  // ========================================================================
  const modalBackdrop = document.getElementById("retro-modal");
  const modalTitle = document.getElementById("retro-modal-title");
  const modalContent = document.getElementById("retro-modal-content");
  const modalClose = document.getElementById("retro-modal-close");

  function openRetroModal(title, html) {
    modalTitle.textContent = title;
    modalContent.innerHTML = html;
    modalBackdrop.classList.add("open");
  }

  modalClose.addEventListener("click", () => modalBackdrop.classList.remove("open"));
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) modalBackdrop.classList.remove("open");
  });

  function openInfoUtility(key, label) {
    if (key === "plates") {
      openRetroModal(
        `Tra Cứu :: ${label}`,
        `<div>
          <p>Nhập mã vùng biển số xe Việt Nam (ví dụ: <b>29</b>, <b>43</b>, <b>59</b>, <b>65</b>, <b>99</b>):</p>
          <input id="plate-input" class="retro-lookup-input" type="text" maxlength="2" value="29" style="width:70px" />
          <button id="plate-btn" class="retro-chip-btn">Tra cứu ngay</button>
          <div id="plate-result" style="margin-top:10px;padding:8px;background:#f0f8ff;border:1px solid #9ad1ff;font-weight:bold;">
            Biển số 29 - 33: Thủ đô Hà Nội
          </div>
          <p style="font-size:11px;color:#587596;margin-top:10px;">Mẹo: Nhạc nền vẫn đang tiếp tục phát trong lúc bạn tra cứu!</p>
        </div>`
      );
      const input = document.getElementById("plate-input");
      const btn = document.getElementById("plate-btn");
      const res = document.getElementById("plate-result");
      const doLookup = () => {
        const code = input.value.trim();
        const prov = window.VN_PLATES[code];
        res.textContent = prov
          ? `Biển số ${code}: Tỉnh / Thành phố ${prov}`
          : `Mã số "${code}": Chưa có trong danh sách tra cứu nhanh (thử 14, 15, 29, 36, 37, 43, 49, 51, 59, 65, 79, 99).`;
      };
      btn.addEventListener("click", doLookup);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") doLookup(); });
      return;
    }

    if (key === "converter") {
      openRetroModal(
        `Tiện Ích :: ${label}`,
        `<div>
          <p><b>Chuyển đổi nhanh Chiều dài & Nhiệt độ kiểu Web tiện ích xưa:</b></p>
          <div style="margin-bottom:8px;">
            <input id="conv-val" class="retro-lookup-input" type="number" value="100" style="width:95px" />
            <select id="conv-type" class="retro-lookup-input">
              <option value="km2mi">Kilômét (km) → Dặm (miles)</option>
              <option value="c2f">Độ C (°C) → Độ F (°F)</option>
              <option value="kg2lb">Kilôgam (kg) → Pound (lb)</option>
              <option value="cay2g">Cây (Lượng vàng) → Chỉ vàng</option>
            </select>
          </div>
          <div id="conv-output" style="padding:8px;background:#f2faff;border:1px solid #96ceff;font-weight:bold;">
            100 km = 62.14 dặm (miles)
          </div>
        </div>`
      );
      const valEl = document.getElementById("conv-val");
      const typeEl = document.getElementById("conv-type");
      const outEl = document.getElementById("conv-output");
      const updateConv = () => {
        const v = parseFloat(valEl.value) || 0;
        const t = typeEl.value;
        if (t === "km2mi") outEl.textContent = `${v} km = ${(v * 0.621371).toFixed(2)} dặm (miles)`;
        if (t === "c2f") outEl.textContent = `${v} °C = ${(v * 9 / 5 + 32).toFixed(1)} °F`;
        if (t === "kg2lb") outEl.textContent = `${v} kg = ${(v * 2.20462).toFixed(2)} lb`;
        if (t === "cay2g") outEl.textContent = `${v} lượng = ${v * 10} chỉ vàng (≈ ${(v * 37.5).toFixed(2)} gram)`;
      };
      valEl.addEventListener("input", updateConv);
      typeEl.addEventListener("change", updateConv);
      return;
    }

    if (key === "weather") {
      openRetroModal(
        `Bản Tin :: ${label}`,
        `<table style="width:100%;border-collapse:collapse;font-size:12px;" border="1" bordercolor="#9fd4ff" cellpadding="6">
          <tr style="background:#dff2ff;font-weight:bold;"><td>Khu vực</td><td>Thời tiết</td><td>Nhiệt độ</td></tr>
          <tr><td><b>Hà Nội & Đông Bắc Bộ</b></td><td>☁ Se lạnh, sương nhẹ sáng sớm</td><td>16°C - 22°C</td></tr>
          <tr><td><b>Huế - Đà Nẵng</b></td><td>🌤 Nắng dịu, gió mát</td><td>22°C - 28°C</td></tr>
          <tr><td><b>Đà Lạt - Tây Nguyên</b></td><td>❄ Trời rét ngọt về đêm</td><td>14°C - 23°C</td></tr>
          <tr><td><b>TP. Hồ Chí Minh & Nam Bộ</b></td><td>☀ Nắng đẹp, chiều mát mẻ</td><td>25°C - 33°C</td></tr>
        </table>
        <p style="margin-top:8px;color:#b94a48;"><i>♪ Thời tiết này nghe "Mùa Đông Không Lạnh" hay "Chiếc Khăn Gió Ấm" là chuẩn bài!</i></p>`
      );
      return;
    }

    if (key === "lottery") {
      openRetroModal(
        `Thông Tin :: ${label}`,
        `<p><b>Bảng Kết Quả Xổ Số Kiến Thiết Minh Họa (Giao diện cổ điển):</b></p>
         <div style="background:#fffdf2;border:1px solid #e2c97d;padding:8px;line-height:1.7;">
           <div>🏆 <b>Giải Đặc Biệt:</b> <span style="color:#cc0000;font-weight:bold;font-size:14px;">280908</span></div>
           <div>• <b>Giải Nhất:</b> 64912</div>
           <div>• <b>Giải Nhì:</b> 19304 - 85721</div>
           <div>• <b>Giải Tám:</b> <span style="color:#0055aa;font-weight:bold;">89</span></div>
         </div>`
      );
      return;
    }

    openRetroModal(
      `Thông Tin :: ${label}`,
      `<p><b>Chuyên mục thông tin tổng hợp: ${escapeHtml(label)}</b></p>
       <ul style="padding-left:18px;margin:6px 0;">
         <li><b>Việt Nam 2 - 1 Thái Lan</b> (Chung kết lượt đi AFF Suzuki Cup 2008)</li>
         <li><b>Việt Nam 1 - 1 Thái Lan</b> (Cú đánh đầu lịch sử phút 90+4 của Công Vinh tại Mỹ Đình!)</li>
       </ul>`
    );
  }

  function buildBookContent(title) {
    return `<p><b>Chuyên mục đọc sách online: ${escapeHtml(title)}</b></p>
      <p style="background:#f5faff;border-left:3px solid #3598ec;padding:8px 10px;">
        "Hạnh phúc đôi khi không nằm ở những điều lớn lao, mà ở khoảnh khắc ta ngồi bên chiếc máy tính CRT, bật một bản nhạc quen thuộc trên <i>trieutraitim.info</i>, nhâm nhi tách trà nóng và gửi một dòng tin nhắn Yahoo cho người bạn phương xa..."
      </p>
      <p><i>Bạn có thể chỉnh sửa nội dung bài viết của mục này trong trang Admin CP!</i></p>`;
  }

  function buildDiscoverContent(title) {
    return `<p><b>Khám phá chuyên đề: ${escapeHtml(title)}</b></p>
      <p>Đây là một trong những chuyên mục bài viết kèm ảnh nổi tiếng ở cột phải của <b>trieutraitim.info</b> xưa.</p>
      <div style="padding:8px;background:#eef8ff;border:1px dashed #69b8f7;">
        ✨ <b>Mẹo quản trị:</b> Vào <b>⚙ Admin CP → Menu &amp; Chuyên Mục</b> để viết nội dung riêng cho mục <i>"${escapeHtml(title)}"</i>!
      </div>`;
  }

  // ========================================================================
  // Cửa sổ Chat Yahoo! Messenger
  // ========================================================================
  const yhWin = document.getElementById("yh-chat-window");
  const yhHistory = document.getElementById("yh-chat-history");
  const yhInput = document.getElementById("yh-chat-input");
  const yhSendBtn = document.getElementById("yh-send-btn");
  const yhBuzzBtn = document.getElementById("yh-buzz-btn");
  const yhCloseBtn = document.getElementById("yh-close-btn");

  function getBotYahooId() {
    return (siteDB && siteDB.settings && siteDB.settings.yahooId) || "con_moe_keu_meo_meo";
  }

  function initYahooWelcome() {
    yhHistory.innerHTML = "";
    const msg = (siteDB && siteDB.settings && siteDB.settings.yahooWelcomeMsg)
      || "Chào đằng ấy! Chúc bạn nghe nhạc trên trieutraitim.info vui vẻ nha :D Bấm nút BUZZ! thử coi nè!";
    appendYhMsg("bot", msg);
  }

  function openYahooChat(statusMode) {
    yhWin.classList.add("open");
    if (statusMode === "offline") {
      appendYhMsg("bot", "Tớ đang để status Invisible trốn học bài thui nha =)) Cứ nhắn tin hoặc bấm BUZZ gọi tớ nhé! :x");
    }
    yhInput.focus();
  }

  document.getElementById("yh-btn-online").addEventListener("click", (e) => {
    e.preventDefault();
    openYahooChat("online");
  });

  document.getElementById("yh-btn-offline").addEventListener("click", (e) => {
    e.preventDefault();
    openYahooChat("offline");
  });

  yhCloseBtn.addEventListener("click", () => yhWin.classList.remove("open"));

  function appendYhMsg(who, text, isBuzz = false) {
    const div = document.createElement("div");
    div.className = "yh-msg";
    const botId = escapeHtml(getBotYahooId());
    if (who === "me") {
      div.innerHTML = `<span class="sender-me">Bạn:</span> ${isBuzz ? '<span class="buzz-text">BUZZ!!!</span>' : escapeHtml(text)}`;
    } else {
      div.innerHTML = `<span class="sender-bot">${botId}:</span> ${isBuzz ? '<span class="buzz-text">BUZZ!!!</span>' : escapeHtml(text)}`;
    }
    yhHistory.appendChild(div);
    yhHistory.scrollTop = yhHistory.scrollHeight;
  }

  yhBuzzBtn.addEventListener("click", () => {
    engine.playYahooBuzzSound();
    yhWin.classList.remove("buzzing");
    void yhWin.offsetWidth;
    yhWin.classList.add("buzzing");
    appendYhMsg("me", "", true);
    const curTitle = songs[activeIndex] ? songs[activeIndex].title : "nhạc xưa";
    setTimeout(() => {
      appendYhMsg("bot", `Á á rung cả màn hình rùi kìa =)) Đang nghe bài "${curTitle}" hay hem? :D`);
    }, 650);
  });

  function sendUserChat() {
    const val = yhInput.value.trim();
    if (!val) return;
    appendYhMsg("me", val);
    yhInput.value = "";
    const curTitle = songs[activeIndex] ? songs[activeIndex].title : "nhạc xưa";
    const replies = [
      "Meo meo ~ Hồi 2008 vào quán nét mở trieutraitim.info vừa nghe nhạc vừa nhảy Audition là hết sảy lun :x",
      `Bài "${curTitle}" nghe hoài không chán lun á :(( Nhớ thời để status Yahoo lời bài hát ghê!`,
      "Cậu nhớ ép nick Yahoo tớ vào nhóm Best Friends nha :)) Chúc nghe nhạc vui vẻ nhóe ♥"
    ];
    setTimeout(() => appendYhMsg("bot", replies[Math.floor(Math.random() * replies.length)]), 550);
  }

  yhSendBtn.addEventListener("click", sendUserChat);
  yhInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendUserChat(); });

  document.querySelectorAll(".yh-emo-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      yhInput.value += " " + btn.dataset.emo + " ";
      yhInput.focus();
    });
  });

  // ========================================================================
  // Hiệu ứng Bông Tuyết / Nốt Nhạc & Thu Gọn Banner
  // ========================================================================
  function setBannerCollapsed(collapsed) {
    topPortalWrapper.classList.toggle("collapsed", collapsed);
    if (btnRestoreBanner) {
      btnRestoreBanner.style.display = collapsed ? "inline-block" : "none";
    }
  }

  function setFxEnabled(flag) {
    fxEnabled = !!flag;
    if (!fxEnabled) fxContainer.innerHTML = "";
    if (btnToggleFx) {
      btnToggleFx.textContent = fxEnabled ? "❄ Tuyết & Nhạc: Bật" : "❄ Tuyết & Nhạc: Tắt";
    }
  }

  function spawnParticle() {
    if (!fxEnabled) return;
    const span = document.createElement("span");
    span.className = "fx-particle";
    const glyphs = ["♪", "♫", "❄", "♬", "❅"];
    span.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
    span.style.left = Math.random() * 98 + "vw";
    span.style.fontSize = (12 + Math.random() * 10) + "px";
    const dur = 8 + Math.random() * 7;
    span.style.animationDuration = dur + "s";
    fxContainer.appendChild(span);
    setTimeout(() => span.remove(), dur * 1000);
  }

  setInterval(spawnParticle, 1300);

  if (btnToggleFx) {
    btnToggleFx.addEventListener("click", () => setFxEnabled(!fxEnabled));
  }
  if (btnToggleBanner) {
    btnToggleBanner.addEventListener("click", () => setBannerCollapsed(true));
  }
  if (btnRestoreBanner) {
    btnRestoreBanner.addEventListener("click", () => setBannerCollapsed(false));
  }

  document.querySelectorAll("[data-nav-action]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const act = link.dataset.navAction;
      if (act === "compact") {
        setBannerCollapsed(true);
      } else if (act === "yh") {
        openYahooChat("online");
      } else if (act === "gift") {
        const curTitle = songs[activeIndex] ? songs[activeIndex].title : "bài hát này";
        openRetroModal(
          "Quà Tặng Âm Nhạc - Triệu Trái Tim",
          `<p><b>Gửi tặng ca khúc đang chọn:</b> <span style="color:#0a3480;font-weight:bold;">${escapeHtml(curTitle)}</span></p>
           <p>Người nhận (Nick Yahoo): <input id="gift-to" class="retro-lookup-input" value="pe_kute_9x" /></p>
           <p>Lời nhắn yêu thương:<br/>
             <textarea id="gift-msg" style="width:100%;height:60px;font-family:Tahoma;font-size:12px;border:1px solid #76b4e6;margin-top:4px;">Chúc ấy luôn vui vẻ và ấm áp mùa đông này nhé! Nghe hết bài hát này nha ♥</textarea>
           </p>
           <button id="gift-send" class="retro-chip-btn">💌 Gửi Quà Tặng Âm Nhạc</button>
           <div id="gift-done" style="margin-top:8px;color:#157a2c;font-weight:bold;"></div>`
        );
        document.getElementById("gift-send").addEventListener("click", () => {
          const to = document.getElementById("gift-to").value || "bạn ấy";
          document.getElementById("gift-done").textContent =
            `✔ Đã đăng lời nhắn gửi tặng "${curTitle}" tới ${to} lên bảng Lưu Bút!`;
        });
      }
    });
  });

  // ========================================================================
  // Khởi động & Đồng bộ Real-time với Admin CP
  // ========================================================================
  async function bootstrap() {
    const loaded = await window.RetroStore.loadDB();
    siteDB = loaded.db;
    songs = siteDB.songs || [];

    applySiteSettings();
    renderSidebars();
    initYahooWelcome();

    setBannerCollapsed(!!siteDB.settings.defaultCollapseBanner);
    setFxEnabled(siteDB.settings.defaultSnowFx !== false);
    updateVolumeUI(engine.volume, engine.isMuted);

    if (songs.length > 0) {
      const defIdx = Number.isInteger(siteDB.settings.defaultSongIndex)
        ? Math.max(0, Math.min(songs.length - 1, siteDB.settings.defaultSongIndex))
        : 0;
      const defOffset = Number(siteDB.settings.defaultStartOffset) || 0;
      activeIndex = defIdx;
      const initialSong = songs[activeIndex];
      initialSong.resolvedUrl = initialSong.audioUrl
        ? await window.RetroStore.resolvePlayableUrl(initialSong.audioUrl)
        : "";
      engine.loadSong(initialSong, defOffset, false);
    }
    renderPlaylist();
    updateLcdStatus(false);
  }

  // Khi Admin CP lưu thay đổi ở tab khác, tự động cập nhật giao diện mà không làm gián đoạn nhạc đang phát!
  window.RetroStore.onSync(async () => {
    const currentPlayingId = songs[activeIndex] ? songs[activeIndex].id : null;
    const wasPlaying = engine.isPlaying;

    const loaded = await window.RetroStore.loadDB();
    siteDB = loaded.db;
    songs = siteDB.songs || [];

    applySiteSettings();
    renderSidebars();

    if (currentPlayingId != null) {
      const foundIdx = songs.findIndex((s) => s.id === currentPlayingId);
      if (foundIdx !== -1) {
        activeIndex = foundIdx;
        engine.currentSong = songs[activeIndex];
      } else {
        activeIndex = Math.min(activeIndex, Math.max(0, songs.length - 1));
        if (songs[activeIndex]) {
          await selectSong(activeIndex, 0, wasPlaying);
        } else {
          engine.pause();
        }
      }
    }
    renderPlaylist();
    updateLcdStatus(engine.isPlaying);
  });

  bootstrap();
})();
