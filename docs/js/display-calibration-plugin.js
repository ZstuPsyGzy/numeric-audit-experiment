const { ParameterType } = window.jsPsychModule;

const REFERENCE_WIDTH_MM = 85.6;
const REFERENCE_HEIGHT_MM = 53.98;
const CARD_ASPECT_RATIO = REFERENCE_HEIGHT_MM / REFERENCE_WIDTH_MM;

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export class DisplayCalibrationPlugin {
  static info = {
    name: "display-calibration",
    version: "1.0.0",
    parameters: {},
    data: {
      px_per_mm: { type: ParameterType.FLOAT },
      red_discrimination_correct: { type: ParameterType.BOOL },
      gray_bands_distinguishable: { type: ParameterType.BOOL }
    }
  };

  constructor(jsPsych) {
    this.jsPsych = jsPsych;
  }

  trial(displayElement) {
    const startedAt = performance.now();
    const initialWidth = Math.max(240, Math.min(420, Math.round(innerWidth * 0.32)));
    let referenceWidthPx = initialWidth;
    let redChoice = null;
    let redAttempts = 0;
    let firstRedChoiceCorrect = null;
    let grayDistinguishable = null;
    const deepOnLeft = Math.random() < 0.5;

    displayElement.innerHTML = `
      <main class="timeline-screen calibration-screen">
        <section class="timeline-panel calibration-panel">
          <header class="calibration-heading">
            <span>显示校准 1 / 2</span>
            <h1>尺寸校准</h1>
          </header>
          <div class="calibration-stage" data-size-stage>
            <p><strong>校准目的：</strong>估算当前屏幕的物理显示尺寸，使不同电脑上呈现的数字矩阵大小尽量一致。</p>
            <p>请准备一张<strong>居民身份证或标准银行卡实体卡</strong>，将其贴近屏幕。拖动滑块，使下方矩形的外轮廓与卡片大小一致（标准尺寸：85.60 × 53.98 mm）。</p>
            <p class="calibration-privacy-note">只比较卡片外轮廓。程序不会读取、拍摄、保存或上传身份证及银行卡上的任何信息。</p>
            <div class="reference-card" data-reference-card aria-label="可调尺寸参考矩形"></div>
            <label class="calibration-slider-label">
              <span>调整矩形宽度</span>
              <input data-size-slider type="range" min="200" max="600" step="1" value="${initialWidth}">
            </label>
            <p class="calibration-value"><span data-width-value>${initialWidth}</span> px</p>
            <div class="timeline-actions">
              <button class="primary-button" type="button" data-confirm-size>尺寸已经匹配</button>
            </div>
          </div>

          <div class="calibration-stage" data-color-stage hidden>
            <p>请在当前屏幕亮度下完成颜色辨认。两块色块的面积完全相同，只比较颜色深浅。</p>
            <section class="red-check" aria-labelledby="red-check-title">
              <h2 id="red-check-title">哪一块红色更深？</h2>
              <div class="red-swatch-options">
                <button type="button" class="red-choice" data-red-choice="left">
                  <span class="red-swatch ${deepOnLeft ? "deep" : "light"}"></span><strong>左侧</strong>
                </button>
                <button type="button" class="red-choice" data-red-choice="right">
                  <span class="red-swatch ${deepOnLeft ? "light" : "deep"}"></span><strong>右侧</strong>
                </button>
              </div>
              <p class="calibration-feedback" data-red-feedback>请选择颜色更深的一侧。</p>
            </section>

            <section class="gray-check" aria-labelledby="gray-check-title">
              <h2 id="gray-check-title">灰阶辨认</h2>
              <div class="gray-bands" aria-label="从深到浅的八个灰阶">
                ${["#171717", "#363636", "#555555", "#747474", "#939393", "#b2b2b2", "#d1d1d1", "#f0f0f0"].map(color => `<i style="background:${color}"></i>`).join("")}
              </div>
              <p>你能否区分所有相邻灰阶？</p>
              <div class="binary-check">
                <button type="button" data-gray-choice="true">可以区分</button>
                <button type="button" data-gray-choice="false">无法全部区分</button>
              </div>
            </section>

            <div class="calibration-warning" data-color-warning hidden>如果较难区分，请关闭夜间模式并适当调整屏幕亮度。你的选择会被记录，但不会显示正确答案。</div>
            <div class="timeline-actions">
              <button class="primary-button" type="button" data-finish-calibration disabled>完成校准</button>
            </div>
          </div>
        </section>
      </main>`;

    const referenceCard = displayElement.querySelector("[data-reference-card]");
    const slider = displayElement.querySelector("[data-size-slider]");
    const widthValue = displayElement.querySelector("[data-width-value]");
    const sizeStage = displayElement.querySelector("[data-size-stage]");
    const colorStage = displayElement.querySelector("[data-color-stage]");
    const headingStep = displayElement.querySelector(".calibration-heading span");
    const headingTitle = displayElement.querySelector(".calibration-heading h1");
    const finishButton = displayElement.querySelector("[data-finish-calibration]");
    const colorWarning = displayElement.querySelector("[data-color-warning]");

    const renderReference = () => {
      referenceWidthPx = Number(slider.value);
      referenceCard.style.width = `${referenceWidthPx}px`;
      referenceCard.style.height = `${round(referenceWidthPx * CARD_ASPECT_RATIO, 1)}px`;
      widthValue.textContent = referenceWidthPx;
    };
    renderReference();
    slider.addEventListener("input", renderReference);

    displayElement.querySelector("[data-confirm-size]").addEventListener("click", () => {
      sizeStage.hidden = true;
      colorStage.hidden = false;
      headingStep.textContent = "显示校准 2 / 2";
      headingTitle.textContent = "颜色与亮度检查";
    }, { once: true });

    const updateReadyState = () => {
      finishButton.disabled = redChoice === null || grayDistinguishable === null;
      colorWarning.hidden = grayDistinguishable !== false && firstRedChoiceCorrect !== false;
    };

    displayElement.querySelectorAll("[data-red-choice]").forEach(button => {
      button.addEventListener("click", () => {
        redAttempts += 1;
        redChoice = button.dataset.redChoice;
        const correct = redChoice === (deepOnLeft ? "left" : "right");
        if (firstRedChoiceCorrect === null) firstRedChoiceCorrect = correct;
        displayElement.querySelectorAll("[data-red-choice]").forEach(option => option.classList.toggle("selected", option === button));
        displayElement.querySelector("[data-red-feedback]").textContent = "已记录你的选择。";
        updateReadyState();
      });
    });

    displayElement.querySelectorAll("[data-gray-choice]").forEach(button => {
      button.addEventListener("click", () => {
        grayDistinguishable = button.dataset.grayChoice === "true";
        displayElement.querySelectorAll("[data-gray-choice]").forEach(option => option.classList.toggle("selected", option === button));
        updateReadyState();
      });
    });

    finishButton.addEventListener("click", () => {
      const pxPerMm = referenceWidthPx / REFERENCE_WIDTH_MM;
      const calibration = {
        trial_kind: "display_calibration",
        calibration_method: "iso_id1_card_manual_match",
        calibration_reference: "cn_id_card_or_standard_bank_card",
        calibration_reference_width_mm: REFERENCE_WIDTH_MM,
        calibration_reference_height_mm: REFERENCE_HEIGHT_MM,
        calibration_reference_width_px: referenceWidthPx,
        px_per_mm: round(pxPerMm, 4),
        estimated_420px_width_mm: round(420 / pxPerMm, 2),
        deep_red_hex: "#941c24",
        light_red_hex: "#de8d92",
        red_deeper_side: deepOnLeft ? "left" : "right",
        red_choice: redChoice,
        red_choice_attempts: redAttempts,
        red_discrimination_correct: firstRedChoiceCorrect,
        gray_bands_distinguishable: grayDistinguishable,
        calibration_viewport_width: innerWidth,
        calibration_viewport_height: innerHeight,
        calibration_device_pixel_ratio: window.devicePixelRatio || 1,
        rt: Math.round(performance.now() - startedAt)
      };
      window.__displayCalibration = calibration;
      this.jsPsych.finishTrial(calibration);
    }, { once: true });
  }
}
