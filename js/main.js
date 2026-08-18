/* Furina Live2D Display
 * PixiJS 6 + pixi-live2d-display (cubism4) + Live2D Cubism Core
 * model: Furina (Cubism 5)
 */
(function () {
  "use strict";

  const MODEL_URL = "model/furina/furina.model3.json";

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

  let model = null;
  let currentMotion = null;
  let currentExpression = null;

  const status = document.getElementById("status");

  function setStatus(text) {
    if (status) status.textContent = text;
  }

  async function init() {
    try {
      model = await PIXI.live2d.Live2DModel.from(MODEL_URL, { autoInteract: false });

      model.scale.set(0.2, 0.2);
      model.anchor.set(0.5, 0.5);
      model.position.set(app.screen.width / 2, app.screen.height / 2);
      app.stage.addChild(model);

      // auto blink & idle motion
      model.internalModel.motionManager.expressionManager?.setExpression?.("");

      // click to trigger TapBody motion
      model.on("pointerdown", () => {
        playMotion("TapBody");
      });

      // play idle motion loop
      playMotion("Idle");

      setStatus("已加载，点击角色可互动");
    } catch (err) {
      console.error(err);
      setStatus("加载失败: " + err.message);
    }
  }

  function playMotion(group) {
    if (!model || !model.internalModel) return;
    const manager = model.internalModel.motionManager;
    if (!manager || !manager.groups || !manager.groups[group]) {
      setStatus("动画组不存在: " + group);
      return;
    }
    currentMotion = group;
    model.motion(group);
    setStatus("播放动画: " + group);
  }

  function setExpression(name) {
    if (!model || !model.internalModel) return;
    const manager = model.internalModel.motionManager;
    if (!manager || !manager.expressionManager) return;
    currentExpression = name;
    manager.expressionManager.setExpression(name);
    setStatus(name ? "表情: " + name : "恢复默认表情");
  }

  // wire up buttons
  function bindBtn(id, group) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", () => playMotion(group));
  }
  bindBtn("btn-idle", "Idle");
  bindBtn("btn-flood", "ChangeFlood");
  bindBtn("btn-spread", "SpreadHands");
  bindBtn("btn-tap", "TapBody");

  const exprSel = document.getElementById("expression-select");
  if (exprSel) {
    exprSel.addEventListener("change", () => setExpression(exprSel.value));
  }

  init();
})();