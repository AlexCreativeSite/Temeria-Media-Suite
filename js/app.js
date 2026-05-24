/* =========================================================
   TEMERIA MEDIA FORGE V4 - APP INIT
========================================================= */

(function(){
  "use strict";

  let autoGenerateEnabled = true;

  function debounce(fn, delay = 300){
    let timer;

    return function(...args){
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function updateAutoKPI(){
    const kpi = document.getElementById("kpiAuto");

    if(kpi){
      kpi.textContent = autoGenerateEnabled
        ? "Auto-genera: ON"
        : "Auto-genera: OFF";
    }
  }

  function setAutoGenerate(enabled){
    autoGenerateEnabled = !!enabled;
    updateAutoKPI();

    if(autoGenerateEnabled && typeof window.genera === "function"){
      window.genera();
    }
  }

  function toggleAutoGenerate(){
    setAutoGenerate(!autoGenerateEnabled);
  }

  const autoG = debounce(() => {
    if(!autoGenerateEnabled) return;

    if(typeof window.genera === "function"){
      requestAnimationFrame(() => {
        window.genera();
      });
    }
  }, 700);

  function bindAutoGenerate(){
    document.querySelectorAll("input, textarea, select").forEach(el => {
      el.addEventListener("input", autoG);
      el.addEventListener("change", autoG);
    });
  }

  function init(){
    bindAutoGenerate();
    updateAutoKPI();

    if(window.TemeriaForge?.renderHistoryList){
      window.TemeriaForge.renderHistoryList();
    }

    if(typeof window.genera === "function"){
      window.genera();
    }
  }

  window.toggleAutoGenerate = toggleAutoGenerate;
  window.setAutoGenerate = setAutoGenerate;

  window.addEventListener("load", init);
})();

/* =========================================================
   IMPORTA HTML CARD VECCHIE
========================================================= */

function importaDaHTML(){
  try{
    const html = document.getElementById("importBox")?.value || "";

    if(!html.trim()){
      alert("Incolla prima una card HTML.");
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const rawText = doc.body?.textContent || "";

    doc.querySelectorAll("script, style, button, nav").forEach(el => el.remove());

    const title =
      doc.querySelector("h1,h2,.title")?.textContent?.trim() || "";

    let cleanText = (doc.body?.textContent || "")
      .replace(/window\.TemeriaPublicPlayer[\s\S]*/i, "")
      .replace(/💬\s*CONDIVIDI WHATSAPP/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    const img =
      doc.querySelector("img.hero-img, img.main-img, .card img, img")?.getAttribute("src") || "";

    const mini =
      [...doc.querySelectorAll("img")]
        .map(i => i.getAttribute("src") || "")
        .find(src => src && src !== img) || "";

    const iframeSrc =
      doc.querySelector("iframe")?.getAttribute("src") || "";

    const videoSrc =
      doc.querySelector("video source")?.getAttribute("src") ||
      doc.querySelector("video")?.getAttribute("src") ||
      "";

    const audioSrc =
      doc.querySelector("audio source")?.getAttribute("src") ||
      doc.querySelector("audio")?.getAttribute("src") ||
      "";

    let ytId = "";

    if(iframeSrc.includes("youtube.com") || iframeSrc.includes("youtu.be")){
      const m = iframeSrc.match(/embed\/([^?&]+)/) || iframeSrc.match(/[?&]v=([^?&]+)/);
      if(m) ytId = m[1];
    }

    const emojiMatch = rawText.match(/[☀️🌙✨💜🌸🪶🪽🔮🌌💫🎵🎶🎧💿👑❤️🔥🌹]+(?:\s+[☀️🌙✨💜🌸🪶🪽🔮🌌💫🎵🎶🎧💿👑❤️🔥🌹]+)*/u);
    const firmaMatch = rawText.match(/—\s*([A-Za-zÀ-ÿ0-9 _-]+)/);

    if(document.getElementById("titolo")){
      document.getElementById("titolo").value = title;
    }

    if(document.getElementById("frase")){
      document.getElementById("frase").value = cleanText.slice(0, 500);
    }

    if(document.getElementById("gifurl")){
      document.getElementById("gifurl").value = img;
    }

    if(document.getElementById("minigif")){
      document.getElementById("minigif").value = mini;
    }

    if(document.getElementById("ytid_auto") && ytId){
      document.getElementById("ytid_auto").value = ytId;
    }

    if(document.getElementById("mp3url") && audioSrc){
      document.getElementById("mp3url").value = audioSrc;
      if(document.getElementById("audioMode")){
        document.getElementById("audioMode").value = "mp3";
      }
    }

    if(document.getElementById("videourl") && videoSrc){
      document.getElementById("videourl").value = videoSrc;
    }

    if(document.getElementById("emoticons") && emojiMatch){
      document.getElementById("emoticons").value = emojiMatch[0];
    }

    if(document.getElementById("firma") && firmaMatch){
      document.getElementById("firma").value = firmaMatch[1].trim();
    }

    if(typeof window.genera === "function"){
      window.genera();
    }

    alert("Card importata con immagine/media.");
  }catch(err){
    console.error(err);
    alert("Errore importazione HTML.");
  }
}
