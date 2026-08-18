/* Furina Live2D Display
 * PixiJS 6 + pixi-live2d-display (cubism4) + Live2D Cubism Core
 * model: Furina (Cubism 5)
 */
(function () {
  "use strict";

  const MODEL_URL = "model/furina/furina.model3.json";

  const loading = document.getElementById("loading");
  const loadingText = document.getElementById("loading-text");
  const status = document.getElementById("status");

  function setStatus(text) {
    if (status) status.textContent = text;
  }

  async function init() {
    try {
      if (loadingText) loadingText.textContent = "正在加载模型（95MB）…请稍等";
      const model = await PIXI.live2d.Live2DModel.from(MODEL_URL, { autoInteract: false });

      model.scale.set(0.2, 0.2);
      model.anchor.set(0.5, 0.5);
      model.position.set(app.screen.width / 2, app.screen.height / 2);
      app.stage.addChild(model);

      if (loading) loading.classList.add("hidden");
      setStatus("已加载，点击角色可互动");

      const manager = model.internalModel.motionManager;
      if (manager && manager.groups && manager.groups.Idle) {
        model.motion("Idle");
      }

      model.on("pointerdown", () => {
        try {
          if (manager && manager.groups && manager.groups.TapBody) model.motion("TapBody");
        } catch (e) {}
      });

    } catch (err) {
      console.error(err);
      if (loading) loading.classList.add("hidden");
      setStatus("加载失败: " + err.message);
      if (loadingText) loadingText.textContent = "加载失败: " + err.message;
    }
  }

  // bind buttons
  function bindBtn(id, group) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", () => {
      const m = app.stage.children[0];
      if (!m || !m.internalModel) return;
      const mgr = m.internalModel.motionManager;
      if (!mgr || !mgr.groups || !mgr.groups[group]) {
        setStatus("动画不存在: " + group);
        return;
      }
      m.motion(group);
      setStatus("播放: " + group);
    });
  }
  bindBtn("btn-idle", "Idle");
  bindBtn("btn-flood", "ChangeFlood");
  bindBtn("btn-spread", "SpreadHands");
  bindBtn("btn-tap", "TapBody");

  const exprSel = document.getElementById("expression-select");
  if (exprSel) {
    exprSel.addEventListener("change", () => {
      const m = app.stage.children[0];
      if (!m || !m.internalModel || !m.internalModel.motionManager ||
          !m.internalModel.motionManager.expressionManager) return;
      const em = m.internalModel.motionManager.expressionManager;
      const val = exprSel.value;
      em.setExpression(val || "");
      setStatus(val ? "表情: " + val : "默认表情");
    });
  }

  const app = new PIXI.Application({
    view: document.getElementById("live2d"),
    width: 800,
    height: 800,
    transparent: true,
    antialias: true,
    autoStart: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1
  });

  init();
})();