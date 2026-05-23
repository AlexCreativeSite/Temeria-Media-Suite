/* =========================================================
   TEMERIA MEDIA FORGE V5
   GITHUB PUBLISH ENGINE
   Deduplica assets immagini/video + card sempre uniche
========================================================= */

(function(){
"use strict";

/* =========================
   CONFIG
========================= */

const CONFIG = {
  user: "AlexCreativeSite",
  repo: "Temeria-Media-Suite",
  branch: "main",

  cardsFolder: "cards",
  imgFolder: "assets/img",
  videoFolder: "assets/video",

  fallbackOGImage:
    "https://alexcreativesite.github.io/Temeria-Media-Suite/assets/thumb/default.jpg",

  githubApi: "https://api.github.com",
  base: "https://alexcreativesite.github.io/Temeria-Media-Suite",

  retryAttempts: 8,
  retryDelay: 1500,
  whatsappSafetyDelay: 2500,
  enableCacheBuster: true
};

let publishLock = false;
/* =========================
   BASIC HELPERS
========================= */

function delay(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withCache(url, stamp){
  if(!CONFIG.enableCacheBuster) return url;

  const v = stamp || Date.now();

  return url + (url.includes("?") ? "&" : "?") + "v=" + v;
}

function safeBase64Unicode(str){
  const bytes = new TextEncoder().encode(str);
  let binary = "";

  bytes.forEach(b => {
    binary += String.fromCharCode(b);
  });

  return btoa(binary);
}

function extractBase64(dataUrl){
  return dataUrl?.split(",")[1] || null;
}

function getExt(dataUrl){
  if(!dataUrl) return "bin";

  const s = String(dataUrl).toLowerCase();

  if(s.includes("image/png")) return "png";
  if(s.includes("image/webp")) return "webp";
  if(s.includes("image/gif")) return "gif";
  if(s.includes("image/jpeg")) return "jpg";
  if(s.includes("image/jpg")) return "jpg";

  if(s.includes("video/mp4")) return "mp4";
  if(s.includes("video/webm")) return "webm";

  /*
    Alcuni MP4 provenienti da smartphone/editor possono arrivare
    come video/quicktime. Manteniamo mov se il browser li ha già
    gestiti meglio nel tuo flusso.
  */
  if(s.includes("video/quicktime")) return "mov";
  if(s.includes("mov")) return "mov";

  if(s.includes("audio/mpeg")) return "mp3";
  if(s.includes("audio/mp3")) return "mp3";
  if(s.includes("audio/wav")) return "wav";
  if(s.includes("audio/ogg")) return "ogg";

  return "bin";
}

function escapeHTML(str){
  return String(str || "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function normalizeSlug(str){
  return String(str || "temeria")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,60) || "temeria";
}

/* =========================
   HASH / DEDUPE HELPERS
========================= */

async function sha256FromBase64(base64){
  if(!base64){
    throw new Error("Base64 mancante per hash");
  }

  const bytes =
    Uint8Array.from(
      atob(base64),
      c => c.charCodeAt(0)
    );

  const hashBuffer =
    await crypto.subtle.digest(
      "SHA-256",
      bytes
    );

  const hashArray =
    Array.from(
      new Uint8Array(hashBuffer)
    );

  return hashArray
    .map(b => b.toString(16).padStart(2,"0"))
    .join("")
    .slice(0,16);
}

function isDataImage(value){
  return String(value || "").startsWith("data:image/");
}

function isDataVideo(value){
  return String(value || "").startsWith("data:video/");
}

function isHttpUrl(value){
  return /^https?:\/\//i.test(String(value || "").trim());
}

/* =========================
   GITHUB API HELPERS
========================= */

async function githubFetch(api, options = {}, token){
  const res = await fetch(api, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await res.json().catch(() => null);

  if(!res.ok){
    console.error("[TEMERIA GITHUB] API error:", data);
    throw new Error(data?.message || "Errore GitHub API");
  }

  return data;
}

async function getExistingSHA(path, token){
  const api =
    `${CONFIG.githubApi}/repos/${CONFIG.user}/${CONFIG.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(CONFIG.branch)}`;

  try{
    const res = await fetch(api, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json"
      },
      cache: "no-store"
    });

    if(!res.ok){
      return null;
    }

    const data = await res.json();

    return data?.sha || null;

  }catch(err){
    console.warn("[TEMERIA GITHUB] getExistingSHA fail:", path, err);
    return null;
  }
}

async function fileExists(path, token){
  const sha = await getExistingSHA(path, token);
  return !!sha;
}

async function uploadFile(path, base64, token, options = {}){
  const api =
    `${CONFIG.githubApi}/repos/${CONFIG.user}/${CONFIG.repo}/contents/${encodeURIComponent(path)}`;

  const body = {
    message: options.message || "publish " + path,
    content: base64,
    branch: CONFIG.branch
  };

  if(options.sha){
    body.sha = options.sha;
  }

  const res = await fetch(api,{
    method:"PUT",
    headers:{
      Authorization:`Bearer ${token}`,
      Accept:"application/vnd.github+json",
      "Content-Type":"application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => null);

  if(!res.ok){
    console.error("[TEMERIA PUBLISH] Upload fail:", data);
    throw new Error(data?.message || "Upload fail " + path);
  }

  return data;
}

/* =========================
   PUBLIC URL WAIT
========================= */

async function waitForPublicUrl(url, label = "file"){
  for(let i = 1; i <= CONFIG.retryAttempts; i++){
    const cleanUrl = withCache(url, Date.now() + i);

    try{
      const res = await fetch(cleanUrl, {
        method: "GET",
        cache: "no-store"
      });

      if(res.ok){
        console.log(`[TEMERIA PUBLISH] ${label} online:`, url);
        return true;
      }

      console.warn(`[TEMERIA PUBLISH] ${label} non ancora online`, i, res.status);
    }catch(err){
      console.warn(`[TEMERIA PUBLISH] ${label} non ancora online`, i, err);
    }

    await delay(CONFIG.retryDelay);
  }

  throw new Error(`${label} non raggiungibile online: ${url}`);
}

/* =========================
   SMART ASSET UPLOAD
   - stesso file = stesso hash = stesso URL
   - card vecchie NON vengono modificate
========================= */

async function uploadAssetSmart({
  dataUrl,
  folder,
  prefix,
  token,
  label
}){
  if(!dataUrl){
    return "";
  }

  if(isHttpUrl(dataUrl)){
    return dataUrl.trim();
  }

  if(!String(dataUrl).startsWith("data:")){
    console.warn("[TEMERIA DEDUPE] asset ignorato, formato non valido:", dataUrl.slice(0,80));
    return "";
  }

  const ext =
    getExt(dataUrl);

  const base64 =
    extractBase64(dataUrl);

  if(!base64){
    throw new Error(`${label || "asset"} non valido`);
  }

  const hash =
    await sha256FromBase64(base64);

  const fileName =
    `${normalizeSlug(prefix || "temeria")}-${hash}.${ext}`;

  const path =
    `${folder}/${fileName}`;

  const publicUrl =
    `${CONFIG.base}/${path}`;

  const exists =
    await fileExists(path, token);

  if(exists){
    console.log("[TEMERIA DEDUPE] asset già esistente, riuso:", publicUrl);
    return publicUrl;
  }

  console.log("[TEMERIA DEDUPE] upload nuovo asset:", path);

  await uploadFile(
    path,
    base64,
    token,
    {
      message: `upload ${label || "asset"} ${fileName}`
    }
  );

  try{
    await waitForPublicUrl(publicUrl, label || "asset");
  }catch(err){
    console.warn(`[TEMERIA DEDUPE] ${label || "asset"} non ancora propagato`, err);
  }

  return publicUrl;
}

/* =========================
   IMAGE UPLOAD
========================= */

async function uploadImage(state, token, prefix){
  state.github = state.github || {};
  state.media = state.media || {};

  const img =
    state?.media?.mainImageRaw ||
    state?.media?.mainImage ||
    "";

  /*
    Se non è data:image, non si carica niente.
    Se è già URL pubblico, lo si riusa.
  */
  if(!img){
    const existing =
      state.media.mainImagePublic ||
      state.github.ogImageUrl ||
      CONFIG.fallbackOGImage;

    state.github.ogImageUrl = existing;
    state.media.mainImagePublic = existing;

    return existing;
  }

  if(isHttpUrl(img)){
    state.github.ogImageUrl = img;
    state.media.mainImagePublic = img;
    return img;
  }

  if(!isDataImage(img)){
    const existing =
      state.media.mainImagePublic ||
      state.github.ogImageUrl ||
      CONFIG.fallbackOGImage;

    state.github.ogImageUrl = existing;
    state.media.mainImagePublic = existing;

    return existing;
  }

  const publicUrl =
    await uploadAssetSmart({
      dataUrl: img,
      folder: CONFIG.imgFolder,
      prefix: prefix || "temeria-img",
      token,
      label: "immagine"
    });

  state.github.ogImageUrl = publicUrl;
  state.media.mainImagePublic = publicUrl;

  /*
    Importante:
    sostituiamo anche mainImage/mainImageRaw con URL pubblico
    prima del renderer, così la card NON contiene base64.
  */
  state.media.mainImage = publicUrl;
  state.media.mainImageRaw = "";

  return publicUrl;
}

/* =========================
   VIDEO UPLOAD
========================= */

async function uploadVideo(state, token, prefix){
  state.media = state.media || {};

  const video =
    state?.media?.videoUrl || "";

  console.log("[TEMERIA VIDEO CHECK]", String(video).slice(0,80));

  if(!video){
    return state?.media?.videoUrlPublic || state?.media?.videoPublic || "";
  }

  if(isHttpUrl(video)){
    state.media.videoUrlPublic = video;
    state.media.videoPublic = video;
    state.media.videoUrl = video;
    return video;
  }

  if(isDataImage(video)){
    console.warn("[TEMERIA VIDEO] videoUrl contiene una immagine, upload video annullato");
    state.media.videoUrl = "";
    return "";
  }

  if(!isDataVideo(video)){
    console.warn("[TEMERIA VIDEO] Formato video non valido:", String(video).slice(0,80));
    return "";
  }

  const publicUrl =
    await uploadAssetSmart({
      dataUrl: video,
      folder: CONFIG.videoFolder,
      prefix: prefix || "temeria-video",
      token,
      label: "video"
    });

  /*
    Fondamentale:
    da qui in poi il renderer riceve SOLO URL pubblico.
    Niente base64 MP4 dentro HTML.
  */
  state.media.videoUrlPublic = publicUrl;
  state.media.videoPublic = publicUrl;
  state.media.videoUrl = publicUrl;

  return publicUrl;
}

/* =========================
   OG META
========================= */

function injectOG(html, state, publicUrl, ogImageUrl){
  const title =
    state.content?.title ||
    "Temeria Card";

  const desc =
    state.content?.phrase ||
    state.content?.text ||
    "Card creata con Temeria Media Forge";

  const finalImage =
    ogImageUrl ||
    CONFIG.fallbackOGImage;

  const imageType =
    finalImage.endsWith(".jpg") || finalImage.endsWith(".jpeg")
      ? "image/jpeg"
      : finalImage.endsWith(".webp")
        ? "image/webp"
        : "image/png";

  const og = `
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="${escapeHTML(desc)}">
<meta property="og:url" content="${escapeHTML(publicUrl)}">

<meta property="og:image" content="${escapeHTML(finalImage)}">
<meta property="og:image:secure_url" content="${escapeHTML(finalImage)}">
<meta property="og:image:type" content="${escapeHTML(imageType)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHTML(title)}">
<meta name="twitter:description" content="${escapeHTML(desc)}">
<meta name="twitter:image" content="${escapeHTML(finalImage)}">
`;

  html = html.replace(/<meta property="og:[^>]*>/g, "");
  html = html.replace(/<meta name="twitter:[^>]*>/g, "");

  if(html.includes("</head>")){
    return html.replace("</head>", og + "\n</head>");
  }

  return og + html;
}

/* =========================
   MAIN PUBLISH
========================= */

async function publishCardToGitHub(){
  if(publishLock){
    console.warn("[TEMERIA PUBLISH] publish già in corso");
    return;
  }

  publishLock = true;

  try{
    const token =
      localStorage.getItem("TEMERIA_GITHUB_TOKEN");

    if(!token){
      alert("Token GitHub mancante");
      return;
    }

    let state =
      window.TemeriaForge.collectState();

    state.github = state.github || {};
    state.media = state.media || {};

    const rawTitle =
      state.content?.title ||
      "temeria-card";

    const slug =
      window.TemeriaExport?.slugify
        ? window.TemeriaExport.slugify(rawTitle)
        : normalizeSlug(rawTitle);

    const stamp =
      Date.now();

    const safeSlug =
      slug || "temeria-card";

    /*
      REGOLA FONDAMENTALE:
      - CARD HTML sempre unica con timestamp
      - ASSET immagini/video deduplicati con hash stabile
    */
    const fileName =
      `${safeSlug}-${stamp}.html`;

    const cardPath =
      `${CONFIG.cardsFolder}/${fileName}`;

    const publicUrl =
      `${CONFIG.base}/${cardPath}`;

    console.log("[TEMERIA PUBLISH] Preparazione publish...");
    console.log("[TEMERIA PUBLISH] URL card:", publicUrl);

    /*
      Asset prefix stabile e leggibile.
      L'hash evita duplicati, il prefix aiuta a leggere assets.
    */
    const assetPrefix =
      safeSlug || "temeria";

    const ogImageUrl =
      await uploadImage(
        state,
        token,
        assetPrefix
      );

    await uploadVideo(
      state,
      token,
      assetPrefix
    );

    let html =
      window.TemeriaRenderer.buildStandaloneHTML(
        state,
        { publicUrl }
      );

    html =
      injectOG(
        html,
        state,
        publicUrl,
        ogImageUrl
      );

    console.log("[TEMERIA PUBLISH] Upload card:", cardPath);

    await uploadFile(
      cardPath,
      safeBase64Unicode(html),
      token,
      {
        message: "publish card " + fileName
      }
    );

    try{
      await waitForPublicUrl(publicUrl, "card");
    }catch(err){
      console.warn("[TEMERIA PUBLISH] card non ancora propagata", err);
    }

    await delay(CONFIG.whatsappSafetyDelay);

    state.github.lastPublishedUrl = publicUrl;
    state.github.ogImageUrl = ogImageUrl;

    if(window.TemeriaForge.saveState){
      window.TemeriaForge.saveState();
    }

    alert("Card pubblicata:\n" + publicUrl);

    window.open(
      withCache(publicUrl, stamp),
      "_blank"
    );

    return publicUrl;

  }catch(err){
    console.error("[TEMERIA PUBLISH] Errore:", err);
    alert("Errore publish:\n" + err.message);
  }finally{
    publishLock = false;
  }
}

/* =========================
   EXPORT GLOBAL
========================= */

window.publishCardToGitHub = publishCardToGitHub;

})();
'''

out = Path("/mnt/data/github.js")
out.write_text(js, encoding="utf-8")
print(out)
