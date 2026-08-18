/* Furina Kaban Girl - embeddable Live2D widget */
(function () {
  "use strict";

  var script = document.currentScript;
  var base = script ? script.src.replace(/[^/]*$/, "") : "";

  function getConfig(name, def) {
    var v;
    if (script && script.dataset && script.dataset[name] !== undefined) v = script.dataset[name];
    if (v === undefined && window.KabanConfig && window.KabanConfig[name] !== undefined) v = window.KabanConfig[name];
    return v === undefined ? def : v;
  }

  var modelUrl = getConfig("model", "");
  var size = parseInt(getConfig("size", 400), 10);
  var pos = getConfig("pos", "right");
  var tipText = getConfig("tip", "我是芙宁娜，点击我哦～");

  if (!modelUrl) {
    console.error("[Kaban] data-model is required.");
    return;
  }

  function resolveUrl(u) {
    if (/^(https?:)?\/\//.test(u)) return u;
    return base + u;
  }

  var els = {};

  function buildDOM() {
    var wrap = document.createElement("div");
    wrap.className = "kaban-wrap";
    if (pos === "left") wrap.classList.add("kaban-left");

    var stage = document.createElement("div");
    stage.className = "kaban-stage";
    stage.innerHTML =
      '<canvas class="kaban-canvas"></canvas>' +
      '<div class="kaban-tip"></div>';

    var toggle = document.createElement("div");
    toggle.className = "kaban-toggle";
    toggle.title = "显示/隐藏";
    toggle.innerHTML = "<span>×</span>";

    wrap.appendChild(stage);
    wrap.appendChild(toggle);
    document.body.appendChild(wrap);

    els.wrap = wrap;
    els.stage = stage;
    els.tip = stage.querySelector(".kaban-tip");
    els.canvas = stage.querySelector("canvas");
    els.toggle = toggle;

    els.tip.textContent = "加载中…";
    els.tip.classList.add("show");

    toggle.addEventListener("click", function () {
      if (wrap.classList.contains("kaban-hidden")) {
        wrap.classList.remove("kaban-hidden");
        toggle.innerHTML = "<span>×</span>";
      } else {
        wrap.classList.add("kaban-hidden");
        toggle.innerHTML = "<span>＋</span>";
      }
    });

    // drag
    var dragging = false, dx = 0, dy = 0;
    stage.addEventListener("pointerdown", function (e) {
      dragging = true;
      dx = e.clientX - wrap.offsetLeft;
      dy = e.clientY - wrap.offsetTop;
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var x = e.clientX - dx, y = e.clientY - dy;
      var maxX = window.innerWidth - wrap.offsetWidth;
      var maxY = window.innerHeight - wrap.offsetHeight;
      wrap.style.left = Math.max(0, Math.min(maxX, x)) + "px";
      wrap.style.top = Math.max(0, Math.min(maxY, y)) + "px";
      wrap.style.right = "auto";
    });
    stage.addEventListener("pointerup", function () { dragging = false; });
    stage.addEventListener("pointercancel", function () { dragging = false; });
  }

  function loadScripts(list) {
    return list.reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement("script");
          s.src = resolveUrl(src);
          s.onload = resolve;
          s.onerror = function () { reject(new Error("failed to load " + src)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve());
  }

  function initPixi() {
    var app = new PIXI.Application({
      view: els.canvas,
      width: size,
      height: size,
      transparent: true,
      antialias: true,
      autoStart: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2)
    });

    els.tip.textContent = "正在加载模型（95MB）…请稍等";
    return PIXI.live2d.Live2DModel.from(modelUrl, { autoInteract: true }).then(function (model) {
      model.scale.set(0.2, 0.2);
      model.anchor.set(0.5, 0.5);
      model.position.set(app.screen.width / 2, app.screen.height / 2);
      app.stage.addChild(model);

      var manager = model.internalModel.motionManager;
      if (manager && manager.groups && manager.groups.Idle) {
        model.motion("Idle");
      }

      model.on("pointerdown", function () {
        try {
          if (manager && manager.groups && manager.groups.TapBody) model.motion("TapBody");
        } catch (e) {}
        showTip(tipText, 2500);
      });

      els.tip.textContent = "";
      return model;
    }).catch(function (e) {
      console.error("[Kaban] model load error:", e);
      els.tip.textContent = "加载失败: " + e.message;
      throw e;
    });
  }

  var tipTimer = null;
  function showTip(text, ms) {
    els.tip.textContent = text;
    els.tip.classList.add("show");
    clearTimeout(tipTimer);
    if (ms) tipTimer = setTimeout(function () { els.tip.classList.remove("show"); }, ms);
  }

  window.Kaban = {
    showTip: showTip,
    hide: function () { els.wrap.classList.add("kaban-hidden"); },
    show: function () { els.wrap.classList.remove("kaban-hidden"); },
    setTip: function (t) { tipText = t; }
  };

  buildDOM();
  loadScripts(["../js/pixi.min.js", "../js/live2dcubismcore.min.js", "../js/cubism4.min.js"])
    .then(initPixi)
    .catch(function (e) {
      console.error("[Kaban]", e);
      els.tip.textContent = "加载失败";
    });
})();