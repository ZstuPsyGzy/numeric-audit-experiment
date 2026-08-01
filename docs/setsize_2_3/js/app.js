import {
    enqueueTrial,
    finishSession,
    flushTrialQueue,
    installUnloadUpload,
    queuedTrialCount,
    startSession
} from "./api.js";
import {
    AI_CONDITIONS,
    EXPERIMENT_VERSION,
    UPLOAD_BATCH_SIZE
} from "./config.js";
import { generateTrialMaterial, verifyMaterial } from "./matrix.js";
import { DisplayCalibrationPlugin } from "./display-calibration-plugin.js";
import { NumericAuditPlugin } from "./numeric-audit-plugin.js";
import { PostQuestionnairePlugin } from "./post-questionnaire-plugin.js";
import { ExperimentScreenPlugin } from "./screen-plugin.js";
import { buildParticipantPlan, generateCanonicalPlan, validateTrialPlan } from "./trial-plan.js";
import { createExportBundle, downloadCsv, downloadJson } from "./data-export.js";

const requestedMode = new URLSearchParams(location.search).get("mode");
const mode = requestedMode === "pilot" ? "pilot" : "formal";
const skipPractice = mode === "pilot" && new URLSearchParams(location.search).get("skip_practice") === "1";
const CONSENT_VERSION = "human-ai-consent-v3-2026-07-22";
const BFI10_ITEMS = [
    { name: "bfi_01", prompt: "我认为自己话不多。" },
    { name: "bfi_02", prompt: "我认为自己总体而言是信任他人的。" },
    { name: "bfi_03", prompt: "我认为自己比较懒惰。" },
    { name: "bfi_04", prompt: "我认为自己抗压能力强，容易放松。" },
    { name: "bfi_05", prompt: "我认为自己对艺术不怎么感兴趣。" },
    { name: "bfi_06", prompt: "我认为自己开朗，社交能力强。" },
    { name: "bfi_07", prompt: "我认为自己喜欢寻找别人的缺点。" },
    { name: "bfi_08", prompt: "我认为自己工作细致周到。" },
    { name: "bfi_09", prompt: "我认为自己容易紧张或焦虑。" },
    { name: "bfi_10", prompt: "我认为自己想象力丰富。" }
];
const AI_LITERACY_ITEMS = [
    { name: "ail_01", prompt: "我能区分智能设备和非智能设备。" },
    { name: "ail_02", prompt: "我不知道人工智能技术能如何帮助我。" },
    { name: "ail_03", prompt: "我能识别自己使用的应用或产品中采用的人工智能技术。" },
    { name: "ail_04", prompt: "我能熟练使用人工智能应用或产品帮助我完成日常工作。" },
    { name: "ail_05", prompt: "学习使用新的人工智能应用或产品通常对我来说很困难。" },
    { name: "ail_06", prompt: "我能使用人工智能应用或产品提高工作效率。" },
    { name: "ail_07", prompt: "使用一段时间后，我能评估人工智能应用或产品的能力和局限。" },
    { name: "ail_08", prompt: "我能从智能助手提供的多种方案中选择合适的方案。" },
    { name: "ail_09", prompt: "针对特定任务，我能从多种人工智能应用或产品中选择最合适的一种。" },
    { name: "ail_10", prompt: "使用人工智能应用或产品时，我总是遵守伦理原则。" },
    { name: "ail_11", prompt: "使用人工智能应用或产品时，我从不警惕隐私和信息安全问题。" },
    { name: "ail_12", prompt: "我始终警惕人工智能技术被滥用。" }
];
const NASA_TLX_ITEMS = [
    { name: "tlx_mental", prompt: "心理需求：刚才这一组任务需要多少思考、注意和记忆投入？" },
    { name: "tlx_physical", prompt: "身体需求：刚才这一组任务需要多少身体操作或身体负担？" },
    { name: "tlx_temporal", prompt: "时间需求：刚才这一组任务让您感到多大的时间压力？" },
    { name: "tlx_performance", prompt: "表现感受：您对自己刚才这一组任务的表现有多不满意？" },
    { name: "tlx_effort", prompt: "努力程度：您为了完成刚才这一组任务投入了多少努力？" },
    { name: "tlx_frustration", prompt: "挫败感：刚才这一组任务让您感到多大程度的烦躁、压力或受挫？" }
];
const AI_USEFULNESS_ITEM = {
    name: "ai_usefulness",
    prompt: "AI 有用性：刚才这一组任务中，AI 分析结果对完成核查有多大帮助？"
};
const consentScreen = document.querySelector("#consent-screen");
const consentAdult = document.querySelector("#consent-adult");
const consentRead = document.querySelector("#consent-read");
const consentContinue = document.querySelector("#consent-continue");
const consentDecline = document.querySelector("#consent-decline");
const form = document.querySelector("#participant-form");
const startButton = document.querySelector("#start-button");
const formError = document.querySelector("#form-error");
const preflightList = document.querySelector("#preflight-list");
const infoScreen = document.querySelector("#info-screen");
const jsPsychTarget = document.querySelector("#jspsych-target");
const fullscreenGuard = document.querySelector("#fullscreen-guard");
const fullscreenReturn = document.querySelector("#fullscreen-return");

let session = null;
let uploadRunning = false;
let fullscreenRequired = false;
let browserCheckData = null;
let consentAccepted = false;
let consentAcceptedAt = null;
let exportBundle = null;
let experimentStartedAt = null;
let experimentStartedEpochMs = null;
let experimentStartedPerformanceMs = null;
let experimentFinishedAt = null;
let experimentFinishedEpochMs = null;
window.__fullscreenExitCount = 0;
window.__visibilityHiddenCount = 0;

const planValidation = validateTrialPlan();
console.table(planValidation.summary);
if (!planValidation.valid) console.error("Trial plan validation failed", planValidation.errors);

function randomUuid() {
    return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sessionTimingMeta() {
    const recordEpochMs = Date.now();
    const elapsedMs = experimentStartedPerformanceMs === null
        ? null
        : Math.round(performance.now() - experimentStartedPerformanceMs);
    return {
        session_started_at: session?.started_at || null,
        experiment_started_at: experimentStartedAt,
        experiment_started_epoch_ms: experimentStartedEpochMs,
        experiment_finished_at: experimentFinishedAt,
        experiment_finished_epoch_ms: experimentFinishedEpochMs,
        record_created_at: new Date(recordEpochMs).toISOString(),
        record_created_epoch_ms: recordEpochMs,
        experiment_elapsed_ms_to_record: elapsedMs
    };
}

function detectMobile() {
    const userAgentMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const uaDataMobile = navigator.userAgentData?.mobile === true;
    return userAgentMobile || uaDataMobile;
}

function collectDisplayMetrics() {
    const viewportWidth = Math.round(window.visualViewport?.width || innerWidth || 0);
    const viewportHeight = Math.round(window.visualViewport?.height || innerHeight || 0);
    const screenWidth = Math.round(screen.width || 0);
    const screenHeight = Math.round(screen.height || 0);
    const availWidth = Math.round(screen.availWidth || 0);
    const availHeight = Math.round(screen.availHeight || 0);
    const outerWidthValue = Math.round(outerWidth || 0);
    const outerHeightValue = Math.round(outerHeight || 0);
    const dpr = Number((window.devicePixelRatio || 1).toFixed(2));
    const candidates = [
        [screenWidth, screenHeight],
        [availWidth, availHeight],
        [outerWidthValue, outerHeightValue],
        [viewportWidth, viewportHeight]
    ].filter(([width, height]) => width > 0 && height > 0);
    const best = candidates.reduce((bestPair, pair) => {
        const [width, height] = pair;
        const [bestWidth, bestHeight] = bestPair;
        return width * height > bestWidth * bestHeight ? pair : bestPair;
    }, [0, 0]);
    const longSide = Math.max(best[0], best[1]);
    const shortSide = Math.min(best[0], best[1]);
    return {
        viewportWidth,
        viewportHeight,
        screenWidth,
        screenHeight,
        availWidth,
        availHeight,
        outerWidth: outerWidthValue,
        outerHeight: outerHeightValue,
        dpr,
        bestWidth: best[0],
        bestHeight: best[1],
        longSide,
        shortSide
    };
}

function runPreflight() {
    const displayMetrics = collectDisplayMetrics();
    const isMobile = detectMobile();
    const hasDesktopPointer = matchMedia("(pointer: fine)").matches || matchMedia("(hover: hover)").matches;
    const displayPass = displayMetrics.longSide >= 1280 && displayMetrics.shortSide >= 800;
    const checks = [{
            label: "电脑设备",
            pass: !isMobile,
            detail: hasDesktopPointer ?
                "已检测到电脑环境和鼠标/触控板指针" : "未检测到手机/平板；如果使用触控板但系统未识别，仍可继续测试"
        },
        {
            label: "屏幕尺寸",
            pass: displayPass,
            detail: `检测到 screen ${displayMetrics.screenWidth}×${displayMetrics.screenHeight}，viewport ${displayMetrics.viewportWidth}×${displayMetrics.viewportHeight}，DPR ${displayMetrics.dpr}；正式实验建议全屏后至少 1280×800`
        },
        {
            label: "全屏功能",
            pass: Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen),
            detail: "正式任务需要保持浏览器全屏"
        },
        {
            label: "浏览器功能",
            pass: Boolean(window.fetch && window.crypto && window.localStorage && window.Promise),
            detail: "建议使用最新版 Chrome、Edge、Firefox 或 Safari"
        }
    ];
    preflightList.replaceChildren(...checks.map(check => {
        const item = document.createElement("li");
        item.className = check.pass ? "pass" : "fail";
        item.innerHTML = `<span aria-hidden="true">${check.pass ? "通过" : "未通过"}</span><div><strong>${check.label}</strong><small>${check.detail}</small></div>`;
        return item;
    }));
    const hardPassed = checks.every(check => check.pass) && planValidation.valid;
    const allPassed = mode === "pilot" ? planValidation.valid : hardPassed;
    startButton.disabled = !allPassed;
    if (!hardPassed && mode === "pilot") {
        formError.textContent = "快速测试模式已允许继续；正式实验仍会要求电脑设备、全屏功能和足够屏幕尺寸。";
    } else if (!hardPassed) {
        formError.textContent = "当前设备不满足正式实验要求，请更换电脑、关闭移动模拟、调整浏览器缩放或使用更大显示设备后刷新页面。";
    } else {
        formError.textContent = "";
    }
    return { allPassed, checks };
}

function installFullscreenGuard() {
    document.addEventListener("fullscreenchange", () => {
        if (fullscreenRequired && !document.fullscreenElement) {
            window.__fullscreenExitCount += 1;
            fullscreenGuard.hidden = false;
        }
    });
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) window.__visibilityHiddenCount += 1;
    });
    fullscreenReturn.addEventListener("click", async() => {
        try {
            await document.documentElement.requestFullscreen();
            fullscreenGuard.hidden = true;
        } catch {
            fullscreenGuard.querySelector("p").textContent = "未能恢复全屏，请允许浏览器进入全屏后重试。";
        }
    });
}

function instructionMatrixExample() {
    const values = [
        [6, 8, 4, 7, 5],
        [5, 7, 4, 6, 8],
        [9, 2, 8, 4, 6],
        [7, 6, 3, 5, 4],
        [8, 5, 7, 6, 9]
    ];
    const cells = values.flatMap((row, rowIndex) => row.map((value, colIndex) => {
        const classes = ["instruction-matrix-cell"];
        const isAuditCell = rowIndex >= 1 && rowIndex <= 3 && colIndex >= 1 && colIndex <= 3;
        if (isAuditCell) classes.push("audit-cell");
        else classes.push("reference-cell");
        if (rowIndex === 2 && colIndex === 2) classes.push("example-target");
        if ((rowIndex === 1 || rowIndex === 3) && colIndex === 2) classes.push("vertical-link");
        if (rowIndex === 2 && (colIndex === 1 || colIndex === 3)) classes.push("horizontal-link");
        return `<span class="${classes.join(" ")}">${value}</span>`;
    })).join("");
    return `<div class="instruction-matrix" aria-label="数字矩阵，内部位置可以点击核查">${cells}</div>`;
}

function responseDemoMatrix(type) {
    const values = type === "invalid" ? [
        [5, 7, 6, 5],
        [4, 5, 5, 6],
        [6, 5, 5, 4],
        [5, 6, 4, 5]
    ] : [
        [5, 4, 6, 5],
        [4, 5, 5, 6],
        [6, 5, 5, 4],
        [5, 6, 4, 5]
    ];
    const cells = values.flatMap((row, rowIndex) => row.map((value, colIndex) => {
        const classes = ["response-demo-cell"];
        const isAudit = rowIndex > 0 && rowIndex < 3 && colIndex > 0 && colIndex < 3;
        if (isAudit) classes.push("audit");
        else classes.push("reference");
        if (type === "invalid" && rowIndex === 1 && colIndex === 1) classes.push("demo-target");
        return `<span class="${classes.join(" ")}">${value}</span>`;
    })).join("");
    return `<div class="response-demo-matrix">${cells}</div>`;
}

function responseAnimationDemos() {
    return `<div class="response-demo-strip" aria-label="合规和不合规作答动图示意">
    <section class="response-demo-card compliant-demo">
      <h3>合规：没有发现目标</h3>
      <div class="response-demo-stage">
        ${responseDemoMatrix("valid")}
        <i class="demo-pointer" aria-hidden="true"></i>
        <div class="demo-response-buttons">
          <span class="demo-response-button demo-compliant-button">合规</span>
          <span class="demo-response-button">不合规</span>
        </div>
      </div>
      <p>核查后没有发现目标，<strong class="key-emphasis">不点击任何位置</strong>，最后选择<strong class="key-emphasis">合规</strong>。</p>
    </section>
    <section class="response-demo-card invalid-demo">
      <h3>不合规：发现一个目标</h3>
      <div class="response-demo-stage">
        ${responseDemoMatrix("invalid")}
        <i class="demo-pointer" aria-hidden="true"></i>
        <div class="demo-response-buttons">
          <span class="demo-response-button">合规</span>
          <span class="demo-response-button demo-invalid-button">不合规</span>
        </div>
      </div>
      <p>发现目标后，先<strong class="key-emphasis">点击该位置</strong>进行标记，最后选择<strong class="key-emphasis">不合规</strong>。</p>
    </section>
  </div>`;
}

function auditAreaMiniMatrix(effectiveSize) {
    const material = generateTrialMaterial({
        set_size: effectiveSize,
        target_count: 1,
        cue_profile: "none",
        material_seed: `instruction-audit-area-size-${effectiveSize}`
    });
    const cells = material.matrix.flatMap((rowValues, row) => rowValues.map((value, col) => {
        const isAudit = row > 0 && row < material.matrixSize - 1 && col > 0 && col < material.matrixSize - 1;
        return `<span class="${isAudit ? "audit" : "reference"}">${value}</span>`;
    })).join("");
    return `<div class="audit-area-mini matrix-${material.matrixSize}" aria-label="不同规模矩阵的核查区域示意">${cells}</div>`;
}

function neighborCheckExample() {
    return `<div class="neighbor-check-example" aria-label="单个位置只比较上下左右相邻数字">
    <span></span><b class="neighbor top">上</b><span></span>
    <b class="neighbor left">左</b><b class="center">当前位置</b><b class="neighbor right">右</b>
    <span></span><b class="neighbor bottom">下</b><span></span>
  </div>`;
}

function auditAreaInstructionContent() {
    return `<div class="audit-area-layout">
    <section class="audit-area-copy">
      <p class="instruction-lead">每个任务中，只有矩阵内部带有<strong class="key-emphasis">淡灰底纹</strong>的位置需要逐一核查；最外圈数字只是关系计算时的参考数字。</p>
      <div class="audit-rule-cards">
        <section><strong>只核查中间底纹区域</strong><p>带淡灰底纹的位置是<strong class="key-emphasis">需要审核、可以点击</strong>的位置。最外圈数字只是关系计算时的参考数字。</p></section>
        <section><strong>每次只看一个位置</strong><p>判断某个位置时，只比较这个位置的<strong class="key-emphasis">上、下、左、右</strong>四个相邻数字。</p></section>
      </div>
    </section>
    <section class="audit-area-examples" aria-label="单个位置核查示意">
      <div class="neighbor-check-card">
        <strong>每次只核查一个位置</strong>
        ${neighborCheckExample()}
        <p>比较当前位置的上、下、左、右四个相邻数字，不需要同时看更远的位置。</p>
      </div>
    </section>
  </div>`;
}

function combinedRuleInstructionContent() {
    return `<div class="combined-rule-layout">
    <section><h2>需要核查哪里</h2>${auditAreaInstructionContent()}</section>
    <section><h2>怎样判断目标</h2>${taskRuleVisualContent()}</section>
  </div>`;
}

function taskIntroductionContent() {
    return `<div class="instruction-prose">
    <p class="instruction-lead">您将看到一个数字矩阵。本任务只需要完成两件事：<strong class="key-emphasis">找出目标</strong>，然后<strong class="key-emphasis">判断整张矩阵是否合规</strong>。</p>
    <div class="task-intro-layout">
      <section>
        <h2>一、找什么</h2>
        <p>只核查矩阵内部带有淡灰底纹的可点击位置。最外圈数字只用于提供上下左右参考，不需要点击。</p>
        <div class="target-rule-box" aria-label="目标判定规则">
          <span>上方数字 + 下方数字</span>
          <b>不等于</b>
          <span>左侧数字 + 右侧数字</span>
        </div>
        <p>如果上面的关系成立，该位置就是<strong class="key-emphasis">目标</strong>。</p>
      </section>
      <section>
        <h2>二、怎么反应</h2>
        <ol class="task-response-steps">
          <li><span>1</span><p>如果发现目标，先点击目标位置；如果发现多个目标，要点击全部目标。</p></li>
          <li><span>2</span><p>点击完目标后，再判断整张矩阵是<strong class="key-emphasis">“合规”</strong>还是<strong class="key-emphasis">“不合规”</strong>。</p></li>
          <li><span>3</span><p>如果没有发现目标，不点击任何位置，直接选择<strong class="key-emphasis">“合规”</strong>。</p></li>
        </ol>
      </section>
    </div>
    <div class="response-definition">
      <span><b class="key-emphasis">合规</b>：没有发现目标</span>
      <span><b class="key-emphasis">不合规</b>：发现一个或多个目标</span>
    </div>
    <div class="ai-boundary-note"><strong>任务要求</strong><p>请在<strong class="key-emphasis">保证准确</strong>的前提下<strong class="key-emphasis">尽可能快速</strong>完成任务。</p></div>
  </div>`;
}

function experimentFlowContent() {
    return `<div class="experiment-flow-overview">
    <p class="instruction-lead">整个实验将按照以下顺序进行，预计需要约 50–60 分钟。每组任务之间可以短暂休息。</p>
    <ol class="experiment-flow-grid">
      <li><span class="flow-index">1</span><div><strong>学习任务规则</strong><p>认真学习任务规则，通过理解检查。</p></div></li>
      <li><span class="flow-index">2</span><div><strong>显示与尺寸校准</strong><p>进入全屏模式，完成颜色辨认和屏幕尺寸校准。</p></div></li>
      <li><span class="flow-index">3</span><div><strong>独立审核阶段</strong><p>在无AI辅助的条件下，完成数字矩阵核查任务。</p></div></li>
      <li><span class="flow-index">4</span><div><strong>AI 辅助审核阶段</strong><p>阅读AI提示说明，在AI辅助下，完成数字矩阵核查任务。</p></div></li>
      <li><span class="flow-index">5</span><div><strong>阶段评价</strong><p>在每组任务结束后，报告本阶段的任务负荷及辅助系统使用感受。</p></div></li>
      <li><span class="flow-index">6</span><div><strong>实验后问卷</strong><p>完成简短问卷，最后生成并保存匿名实验数据文件。</p></div></li>
    </ol>
    <div class="ai-boundary-note"><strong>请按页面顺序完成</strong><p>实验过程中请<strong class="key-emphasis">保持全屏</strong>并<strong class="key-emphasis">独立作答</strong>。每个阶段开始前，程序都会再次显示相应说明。</p></div>
  </div>`;
}

function taskRuleVisualContent() {
    return `<div class="rule-visual-layout">
    <section class="matrix-figure">
      <div class="figure-labels"><span class="reference-label">外圈：关系参考数字</span><span class="audit-label">淡灰底纹：可点击核查区域</span></div>
      ${instructionMatrixExample()}
      <div class="matrix-legend"><span><i class="legend-audit"></i>可点击核查位置</span><span><i class="legend-focus"></i>当前示例位置</span></div>
    </section>
    <section class="rule-calculation">
      <h2>示例位置的判断</h2>
      <div class="calculation-row vertical-calc"><span>上 + 下</span><strong>4 + 3 = 7</strong></div>
      <div class="calculation-row horizontal-calc"><span>左 + 右</span><strong>2 + 4 = 6</strong></div>
      <div class="calculation-result"><b>7 ≠ 6</b><span>因此，该位置是<strong class="key-emphasis">目标</strong></span></div>
      <ol class="instruction-steps compact-steps">
        <li><span>1</span><p>核查内部位置的上下左右数字。</p></li>
        <li><span>2</span><p>发现目标时，<strong class="key-emphasis">点击该位置</strong>进行标记。</p></li>
        <li><span>3</span><p>完成搜索后，判断整张矩阵是<strong class="key-emphasis">合规</strong>还是<strong class="key-emphasis">不合规</strong>。</p></li>
      </ol>
    </section>
  </div>
  ${responseAnimationDemos()}`;
}

function aiRoleInstructionContent() {
    return `<div class="ai-role-layout">
    <p class="instruction-lead">本阶段将提供一个由过往数字核查数据训练的 <strong class="key-emphasis">AI 模型</strong>辅助您完成任务。AI 会在矩阵中标出它认为<strong class="key-emphasis">值得优先核查</strong>的位置。</p>
    <section class="ai-role-demo">
      <div class="ai-cue-example" aria-label="AI 分析数字矩阵并同时生成深红和浅红候选位置的示意">
        <span>6</span><span class="deep-candidate">8</span><span>7</span>
        <span>5</span><span>4</span><span class="light-candidate">6</span>
        <span>9</span><span>3</span><span>8</span>
      </div>
      <div class="ai-cue-explain-panel">
        <div class="mock-cue-status"><span class="analysis-done">AI 分析已完成：已生成候选提示</span><span><i class="cue-key deep"></i>深红候选</span><span><i class="cue-key light"></i>浅红候选</span></div>
        <div class="ai-explanation-list compact-ai-explanation">
          <div class="cue-explanation"><i class="cue-key deep"></i><p><strong>深红候选</strong><br>AI 认为<strong class="key-emphasis">最值得优先核查</strong>的位置。</p></div>
          <div class="cue-explanation"><i class="cue-key light"></i><p><strong>浅红候选</strong><br>AI 认为<strong class="key-emphasis">也值得核查</strong>的位置。</p></div>
        </div>
      </div>
    </section>
    <section class="ai-role-cards">
      <div><strong>AI 做什么</strong><p>分析当前矩阵，并给出建议优先核查的位置。</p></div>
      <div><strong>AI 不做什么</strong><p>不直接告诉您整张矩阵合规或不合规。</p></div>
      <div><strong>您需要做什么</strong><p>根据上下左右关系规则核查，并完成最终判断。</p></div>
    </section>
  </div>`;
}

function instructionContent(phase, reliabilitySpec = null) {
    const aiSections = phase === "ai" ? `
    <section><h2>AI 的作用和候选颜色</h2>${aiRoleInstructionContent()}</section>
    ${reliabilitySpec ? `
      <section><h2>本阶段 AI 的历史正确率</h2>${aiReliabilityInstructionContent(reliabilitySpec)}</section>
    ` : ""}` : "";
  return `<div class="practice-guide">
    <section><h2>任务说明</h2>${taskIntroductionContent()}</section>
    <section><h2>核查区域与判断规则</h2>${combinedRuleInstructionContent()}</section>
    ${aiSections}
  </div>`;
}

function instructionCheckQuestion() {
  return `<div class="mini-check-layout">
    <div class="relation-example mini-relation" aria-label="理解检查例题">
      <b class="top">3</b><b class="left">2</b><span class="center">?</span><b class="right">5</b><b class="bottom">4</b>
    </div>
    <div><p>请核查中心位置：上方是 3，下方是 4，左侧是 2，右侧是 5。</p><strong>这个中心位置是不是目标？</strong></div>
  </div>`;
}

function phaseIntro(phase) {
  if (phase === "baseline") {
    return {
      title: "独立审核阶段",
    content: `<div class="phase-intro"><p>本阶段<strong class="key-emphasis">不显示任何 AI 候选</strong>，用于测量您尚未接触 AI 提示时的独立审核表现。</p><p>实验首先进行一次任务规则练习，共 5 个练习任务。练习正确率达到 <strong class="key-emphasis">80%</strong> 后进入无 AI 正式基线；后续无 AI 任务组不再重复练习。</p></div>`
    };
  }
  return {
    title: "AI 辅助审核阶段",
    content: `<div class="phase-intro"><p>您已经完成<strong class="key-emphasis">无 AI 的任务</strong>。</p><p>即将进行<strong class="key-emphasis">AI 辅助的任务</strong>。接下来将说明 AI 的作用、候选颜色和历史表现，随后进行练习，帮助您熟悉 AI 使用。</p></div>`
  };
}

function validityBar(label, value, colorClass) {
  return `<div class="validity-row"><span>${label}</span><progress class="${colorClass}" max="1" value="${value}"></progress><strong>${Math.round(value * 100)}%</strong></div>`;
}

function reliabilityUnits(value, colorClass) {
  const validCount = Math.round(value * 10);
  return `<div class="reliability-units ${colorClass}" aria-label="10 个候选中 ${validCount} 个命中目标">
    ${Array.from({ length: 10 }, (_, index) => `<i class="${index < validCount ? "valid" : "invalid"}"></i>`).join("")}
  </div>`;
}

function aiReliabilityInstructionContent(spec) {
  return `<div class="reliability-instruction">
    <p class="instruction-lead">我们根据 AI 在类似任务中的<strong class="key-emphasis">历史表现</strong>，分别计算了深红候选和浅红候选这两类提示的表现好坏。以下<strong class="key-emphasis">历史正确率</strong>适用于您接下来整个 AI 阶段。</p>
    <div class="reliability-definition">
      <section><p><strong>历史正确率含义：</strong>当某种颜色标记了<strong class="key-emphasis">目标位置</strong>，就记为正确；如果标在<strong class="key-emphasis">非目标位置</strong>，就记为错误。</p></section>
      <section><p><strong>百分比含义：</strong><strong class="key-emphasis">90%</strong> 表示 10 次标记中有 9 次标记了真实目标；<strong class="key-emphasis">70%</strong> 表示 10 次标记中有 7 次标记了真实目标。</p></section>
    </div>
    <div class="reliability-condition-card">
      <div>
        <span class="reliability-cue-label"><i class="cue-key deep"></i>深红候选</span>
        <strong>${Math.round(spec.deep_validity * 100)}%</strong>
        ${reliabilityUnits(spec.deep_validity, "deep")}
        <p>每 10 次深红候选中，约 ${Math.round(spec.deep_validity * 10)} 次位于真实目标位置。</p>
      </div>
      <div>
        <span class="reliability-cue-label"><i class="cue-key light"></i>浅红候选</span>
        <strong>${Math.round(spec.light_validity * 100)}%</strong>
        ${reliabilityUnits(spec.light_validity, "light")}
        <p>每 10 次浅红候选中，约 ${Math.round(spec.light_validity * 10)} 次位于真实目标位置。</p>
      </div>
    </div>
  </div>`;
}

function blockIntro(spec, trialCount) {
  if (!spec.ai_present) {
    return {
      title: "无 AI · 独立审核",
      content: `<div class="block-intro"><p>本组共 ${trialCount} 个任务，<strong class="key-emphasis">不显示 AI 候选</strong>。</p><p>请保持准确，在确认后再提交判断。</p></div>`
    };
  }
  return {
    title: "AI 辅助审核",
    content: `<div class="block-intro">
      <p>本组共 ${trialCount} 个任务，会显示<strong class="key-emphasis">深红候选</strong>和<strong class="key-emphasis">浅红候选</strong>。</p>
      <p>请根据前面说明过的 AI 候选含义和历史表现，结合上下左右关系规则完成核查和判断。</p>
    </div>`
  };
}

function selectPracticeSpecs(phase, formalPlan) {
  const canonical = generateCanonicalPlan();
  const conditionKey = phase === "baseline"
    ? "baseline"
    : formalPlan.find(trial => trial.phase === "ai")?.condition_key || "90_90";
  const pool = canonical.filter(trial => trial.condition_key === conditionKey && trial.set_size === 3);
  const correctAiPool = pool.filter(trial =>
    trial.system_event !== "false_alarm"
    && trial.deep_outcome !== "invalid"
    && trial.light_outcome !== "invalid"
  );
  const chosen = phase === "baseline"
    ? [
      pool.find(trial => trial.target_count === 0),
      pool.filter(trial => trial.target_count === 0)[1],
      pool.find(trial => trial.target_count === 1),
      pool.filter(trial => trial.target_count === 1)[1],
      pool.find(trial => trial.target_count === 2)
    ]
    : [
      correctAiPool.find(trial => trial.system_event === "hit" && trial.target_count === 2),
      correctAiPool.filter(trial => trial.system_event === "hit" && trial.target_count === 2)[1],
      correctAiPool.filter(trial => trial.system_event === "hit" && trial.target_count === 2)[2],
      correctAiPool.filter(trial => trial.system_event === "hit" && trial.target_count === 2)[3],
      correctAiPool.filter(trial => trial.system_event === "hit" && trial.target_count === 2)[4]
    ];
  return chosen.map((spec, index) => ({
    ...spec,
    canonical_id: `practice-${phase}-${index + 1}`,
    matrix_id: `matrix-practice-${phase}-m${String(index + 1).padStart(2, "0")}`,
    phase: "practice",
    practice_for: phase,
    material_seed: `${spec.material_seed}:practice:${phase}:${index + 1}`,
    trial_index_global: null,
    trial_index_block: index + 1,
    block_index: null
  }));
}

function prepareNumericTrial(spec, options, assignment) {
  const material = generateTrialMaterial(spec);
  const verification = verifyMaterial(spec, material);
  if (!verification.valid) throw new Error(`材料校验失败: ${spec.canonical_id}`);
  return {
    type: NumericAuditPlugin,
    spec,
    material,
    practice: Boolean(options.practice),
    ask_ratings: true,
    instruction_html: options.instructionHtml || "",
    progress_current: options.progressCurrent || 0,
    progress_total: options.progressTotal || 0,
    on_finish: data => storeTrialData(data, spec, assignment)
  };
}

function storeTrialData(data, spec, assignment) {
  const record = {
    ...data,
    ...sessionTimingMeta(),
    trial_uuid: randomUuid(),
    experiment_version: EXPERIMENT_VERSION,
    mode,
    phase: data.practice ? "practice" : spec.phase,
    practice_for: spec.practice_for || null,
    assignment_group: assignment.assignment_group,
    assignment_cycle: assignment.assignment_cycle,
    allocation_method: assignment.allocation_method,
    phase_order_index: assignment.phase_order_index,
    condition_order_index: assignment.condition_order_index,
    set_size_order_index: assignment.set_size_order_index,
    phase_order: assignment.phase_order,
    condition_order: assignment.condition_order,
    set_size_order: assignment.set_size_order,
    material_seed: spec.material_seed,
    ai1_reliability: data.deep_validity,
    ai2_reliability: data.light_validity,
    ai1_outcome: data.deep_outcome,
    ai2_outcome: data.light_outcome,
    response_method: "mouse_click",
    hosting_platform: "github_pages",
    session_id: session.session_id,
    subject_code: session.subject_code,
    age: session.client_meta.age,
    gender: session.client_meta.gender,
    handedness: session.client_meta.handedness,
    vision: session.client_meta.vision,
    consent_version: session.client_meta.consent_version,
    consent_accepted_at: session.client_meta.consent_accepted_at,
    browser_check: browserCheckData,
    viewport_width: innerWidth,
    viewport_height: innerHeight,
    screen_width: screen.width,
    screen_height: screen.height
  };
  Object.assign(data, record);
  queueRecord(record);
}

function storeCalibrationData(data, assignment) {
  const record = {
    ...data,
    ...sessionTimingMeta(),
    trial_uuid: randomUuid(),
    experiment_version: EXPERIMENT_VERSION,
    mode,
    phase: "calibration",
    condition_key: "display_calibration",
    assignment_group: assignment.assignment_group,
    assignment_cycle: assignment.assignment_cycle,
    allocation_method: assignment.allocation_method,
    phase_order_index: assignment.phase_order_index,
    condition_order_index: assignment.condition_order_index,
    set_size_order_index: assignment.set_size_order_index,
    phase_order: assignment.phase_order,
    condition_order: assignment.condition_order,
    set_size_order: assignment.set_size_order,
    hosting_platform: "github_pages",
    session_id: session.session_id,
    subject_code: session.subject_code,
    age: session.client_meta.age,
    gender: session.client_meta.gender,
    handedness: session.client_meta.handedness,
    vision: session.client_meta.vision,
    consent_version: session.client_meta.consent_version,
    consent_accepted_at: session.client_meta.consent_accepted_at,
    browser_check: browserCheckData,
    viewport_width: innerWidth,
    viewport_height: innerHeight,
    screen_width: screen.width,
    screen_height: screen.height
  };
  Object.assign(data, record);
  queueRecord(record);
}

function reverseScore(value, maximum) {
  return maximum + 1 - Number(value);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function queueRecord(record) {
  try {
    const { mouse_trace: _mouseTrace, ...backupRecord } = record;
    enqueueTrial(session.session_id, backupRecord);
    if (queuedTrialCount(session.session_id) >= UPLOAD_BATCH_SIZE) syncQueue();
  } catch (error) {
    console.error("Data queue failed; timeline continues and upload will be checked at completion.", error);
    window.__failedLocalRecords = window.__failedLocalRecords || [];
    window.__failedLocalRecords.push(record);
  }
}

function scoreQuestionnaire(questionnaireId, responses) {
  if (questionnaireId === "bfi10_zh") {
    return {
      bfi_extraversion_mean: mean([reverseScore(responses.bfi_01, 5), responses.bfi_06]),
      bfi_agreeableness_mean: mean([responses.bfi_02, reverseScore(responses.bfi_07, 5)]),
      bfi_conscientiousness_mean: mean([reverseScore(responses.bfi_03, 5), responses.bfi_08]),
      bfi_neuroticism_mean: mean([reverseScore(responses.bfi_04, 5), responses.bfi_09]),
      bfi_openness_mean: mean([reverseScore(responses.bfi_05, 5), responses.bfi_10])
    };
  }
  if (questionnaireId === "ai_literacy_wang12_zh") {
    const scored = { ...responses };
    for (const item of ["ail_02", "ail_05", "ail_11"]) scored[item] = reverseScore(scored[item], 7);
    return {
      ai_literacy_awareness_mean: mean([scored.ail_01, scored.ail_02, scored.ail_03]),
      ai_literacy_usage_mean: mean([scored.ail_04, scored.ail_05, scored.ail_06]),
      ai_literacy_evaluation_mean: mean([scored.ail_07, scored.ail_08, scored.ail_09]),
      ai_literacy_ethics_mean: mean([scored.ail_10, scored.ail_11, scored.ail_12]),
      ai_literacy_total_mean: mean(Object.values(scored))
    };
  }
  if (questionnaireId === "block_nasa_tlx") {
    const tlxValues = NASA_TLX_ITEMS
      .map(item => responses[item.name])
      .filter(value => Number.isFinite(value));
    return {
      nasa_tlx_raw_mean: tlxValues.length ? mean(tlxValues) : null
    };
  }
  return {};
}

function storeQuestionnaireData(data, assignment, context = {}) {
  const responses = data.responses || {};
  const record = {
    ...data,
    ...responses,
    ...scoreQuestionnaire(data.questionnaire_id, responses),
    ...sessionTimingMeta(),
    trial_uuid: randomUuid(),
    experiment_version: EXPERIMENT_VERSION,
    mode,
    phase: context.phase || "post_questionnaire",
    condition_key: context.condition_key || data.questionnaire_id,
    block_index: context.block_index ?? null,
    set_size: context.set_size ?? null,
    block_trial_count: context.block_trial_count ?? null,
    block_position: context.block_position ?? null,
    block_count: context.block_count ?? null,
    assignment_group: assignment.assignment_group,
    assignment_cycle: assignment.assignment_cycle,
    allocation_method: assignment.allocation_method,
    phase_order_index: assignment.phase_order_index,
    condition_order_index: assignment.condition_order_index,
    set_size_order_index: assignment.set_size_order_index,
    phase_order: assignment.phase_order,
    condition_order: assignment.condition_order,
    set_size_order: assignment.set_size_order,
    questionnaire_order: context.questionnaire_order || ["bfi10_zh", "ai_literacy_wang12_zh"],
    hosting_platform: "github_pages",
    session_id: session.session_id,
    subject_code: session.subject_code,
    age: session.client_meta.age,
    gender: session.client_meta.gender,
    handedness: session.client_meta.handedness,
    vision: session.client_meta.vision,
    consent_version: session.client_meta.consent_version,
    consent_accepted_at: session.client_meta.consent_accepted_at,
    browser_check: browserCheckData,
    viewport_width: innerWidth,
    viewport_height: innerHeight,
    screen_width: screen.width,
    screen_height: screen.height
  };
  Object.assign(data, record);
  queueRecord(record);
}

function blockWorkloadTimeline(block, assignment, blockPosition, blockCount) {
  const spec = block[0];
  const labels = [
    { value: 0, text: "0 很低" },
    { value: 20, text: "20" },
    { value: 40, text: "40" },
    { value: 60, text: "60" },
    { value: 80, text: "80" },
    { value: 100, text: "100 很高" }
  ];
  const questions = [
    ...NASA_TLX_ITEMS,
    ...(spec.ai_present ? [AI_USEFULNESS_ITEM] : [])
  ];
  return {
    type: PostQuestionnairePlugin,
    title: spec.ai_present ? "本组任务评价" : "本组任务负荷评价",
    description: `<p>请根据刚刚完成的这一组任务作答。0 表示很低，100 表示很高。</p>${spec.ai_present ? "<p>最后一题只评价刚才这一组 AI 分析结果对您的帮助程度。</p>" : ""}`,
    questionnaire_id: "block_nasa_tlx",
    scale_name: "Raw NASA-TLX + AI usefulness",
    scale_version: "Hart & Staveland 1988; raw six-dimension block rating",
    progress_label: `本组评价 ${blockPosition + 1} / ${blockCount}`,
    questions,
    labels,
    button_label: "提交评价，继续",
    on_finish: data => storeQuestionnaireData(data, assignment, {
      phase: "block_questionnaire",
      condition_key: spec.condition_key,
      block_index: spec.block_index,
      set_size: spec.set_size,
      block_trial_count: block.length,
      block_position: blockPosition + 1,
      block_count: blockCount,
      questionnaire_order: ["block_nasa_tlx", "bfi10_zh", "ai_literacy_wang12_zh"]
    })
  };
}

function postQuestionnaireTimeline(assignment) {
  const bfiLabels = ["非常不同意", "有点不同意", "既不同意也不反对", "有点同意", "非常同意"];
  const aiLabels = ["非常不同意", "不同意", "有点不同意", "不确定", "有点同意", "同意", "非常同意"];
  return [
    {
      type: PostQuestionnairePlugin,
      title: "简版大五人格问卷",
      description: "<p>下面这些陈述在多大程度上符合您通常的情况？请根据真实感受作答，没有正确或错误答案。</p>",
      questionnaire_id: "bfi10_zh",
      scale_name: "Chinese BFI-10",
      scale_version: "Carciofo et al. 2016; Rammstedt & John 2007",
      progress_label: "实验后问卷 1 / 2",
      questions: BFI10_ITEMS,
      labels: bfiLabels,
      on_finish: data => storeQuestionnaireData(data, assignment)
    },
    {
      type: PostQuestionnairePlugin,
      title: "人工智能素养问卷",
      description: "<p>请判断以下陈述在多大程度上符合您的实际情况。这里的人工智能包括日常使用的智能应用、产品或助手。</p>",
      questionnaire_id: "ai_literacy_wang12_zh",
      scale_name: "Artificial Intelligence Literacy Scale",
      scale_version: "Wang, Rau, & Yuan 2022; 12-item Chinese presentation",
      progress_label: "实验后问卷 2 / 2",
      questions: AI_LITERACY_ITEMS,
      labels: aiLabels,
      button_label: "提交问卷",
      on_finish: data => storeQuestionnaireData(data, assignment)
    }
  ];
}

async function syncQueue() {
  if (!session || uploadRunning || !navigator.onLine) return;
  uploadRunning = true;
  try {
    await flushTrialQueue(session.session_id, UPLOAD_BATCH_SIZE);
  } catch (error) {
    console.warn("Trial upload deferred", error);
  } finally {
    uploadRunning = false;
  }
}

function practiceLoop(phase, formalPlan, assignment) {
  const practiceState = { attempt: 0, lastAccuracy: null };
  const specs = selectPracticeSpecs(phase, formalPlan);
  const reliabilitySpec = phase === "ai"
    ? formalPlan.find(trial => trial.phase === "ai")
    : null;
  return {
    timeline: specs.map(spec => prepareNumericTrial(spec, {
      practice: true,
      instructionHtml: instructionContent(phase, reliabilitySpec)
    }, assignment)),
    loop_function: data => {
      const rows = data.values()
        .filter(row => row.trial_kind === "numeric_audit" && row.practice)
        .slice(-specs.length);
      const correct = rows.filter(row => row.fully_correct).length;
      practiceState.lastAccuracy = rows.length ? correct / rows.length : 0;
      practiceState.attempt += 1;
      return practiceState.lastAccuracy < 0.8;
    }
  };
}

function buildTimeline(plan, assignment) {
  const overviewPage = { title: "实验整体流程", content: experimentFlowContent() };
  const taskPage = { title: "任务说明", content: taskIntroductionContent() };
  const rulePage = { title: "核查区域与判断规则", content: combinedRuleInstructionContent() };
  const timeline = [
    {
      type: window.jsPsychBrowserCheck,
      features: ["width", "height", "browser", "browser_version", "mobile", "os", "fullscreen"],
      on_finish: data => { browserCheckData = { ...data }; }
    },
    {
      type: ExperimentScreenPlugin,
      ...overviewPage,
      button_label: "下一步：了解任务",
      screen_class: "instruction-screen flow-overview-screen"
    },
    {
      type: ExperimentScreenPlugin,
      ...taskPage,
      back_pages: [overviewPage],
      button_label: "下一步：查看核查区域与判断规则",
      screen_class: "instruction-screen"
    },
    {
      type: ExperimentScreenPlugin,
      ...rulePage,
      back_pages: [overviewPage, taskPage],
      button_label: "下一步：理解检查",
      screen_class: "instruction-screen"
    },
    {
      type: ExperimentScreenPlugin,
      title: "任务规则理解检查",
      content: "<div class=\"check-intro\"><p>请根据刚才的规则独立判断下面的位置。回答正确后才能继续。</p></div>",
      back_pages: [overviewPage, taskPage, rulePage],
      button_label: "理解正确，继续",
      screen_class: "instruction-screen check-screen",
      check_question: instructionCheckQuestion(),
      check_options: [
        { value: "target", label: "是目标" },
        { value: "not_target", label: "不是目标" }
      ],
      check_correct: "not_target",
      check_success: "回答正确：3 + 4 = 2 + 5，中心位置不是目标。",
      check_error: "再算一次：分别比较“上 + 下”和“左 + 右”。"
    },
    {
      type: window.jsPsychFullscreen,
      fullscreen_mode: true,
      message: "<p>接下来的练习和正式实验需要保持全屏。</p>",
      button_label: "进入全屏",
      on_finish: () => { fullscreenRequired = true; }
    },
    {
      type: DisplayCalibrationPlugin,
      on_finish: data => storeCalibrationData(data, assignment)
    }
  ];

  for (const phase of assignment.phase_order) {
    const phaseTrials = plan.filter(trial => trial.phase === phase);
    const intro = phaseIntro(phase);
    timeline.push({
      type: ExperimentScreenPlugin,
      ...intro,
      button_label: phase === "ai"
        ? "下一步：了解 AI"
        : skipPractice ? "进入预测试任务" : "开始练习"
    });
    if (phase === "ai") {
      const aiSpec = phaseTrials[0];
      const phasePage = { title: intro.title, content: intro.content };
      const aiRolePage = { title: "AI 如何辅助核查", content: aiRoleInstructionContent() };
      const aiReliabilityPage = { title: "本阶段 AI 的历史正确率", content: aiReliabilityInstructionContent(aiSpec) };
      timeline.push({
        type: ExperimentScreenPlugin,
        ...aiRolePage,
        back_pages: [phasePage],
        button_label: "下一步：查看历史正确率",
        screen_class: "instruction-screen"
      });
      timeline.push({
        type: ExperimentScreenPlugin,
        ...aiReliabilityPage,
        back_pages: [phasePage, aiRolePage],
        button_label: skipPractice ? "进入预测试任务" : "开始 AI 练习",
        screen_class: "instruction-screen reliability-screen"
      });
    }
    if (!skipPractice) {
      timeline.push(practiceLoop(phase, plan, assignment));
      timeline.push({
        type: ExperimentScreenPlugin,
        title: "练习通过",
        content: "<div class=\"phase-intro\"><p>练习完全正确率已达到 80%。下一页将进入正式任务，正式任务不提供正确答案反馈。</p></div>",
        button_label: "进入正式实验"
      });
    }

    const blocks = [...new Set(phaseTrials.map(trial => trial.block_index))]
      .map(blockIndex => phaseTrials.filter(trial => trial.block_index === blockIndex));
    for (let blockPosition = 0; blockPosition < blocks.length; blockPosition += 1) {
      const block = blocks[blockPosition];
      const introData = blockIntro(block[0], block.length);
      timeline.push({ type: ExperimentScreenPlugin, ...introData, button_label: "开始本组" });
      block.forEach(spec => timeline.push(prepareNumericTrial(spec, {
        practice: false,
        progressCurrent: spec.trial_index_global,
        progressTotal: plan.length
      }, assignment)));
      timeline.push(blockWorkloadTimeline(block, assignment, blockPosition, blocks.length));
      const nextBlock = blocks[blockPosition + 1];
      const aiConditionComplete = phase === "ai"
        && nextBlock
        && nextBlock[0].condition_key !== block[0].condition_key;
      if (aiConditionComplete) {
        timeline.push({
          type: ExperimentScreenPlugin,
          title: "当前 AI 辅助任务完成",
          content: "<div class=\"phase-intro\"><p>已完成当前 AI 辅助任务。请休息片刻，准备好后继续。</p></div>",
          button_label: "休息结束，继续"
        });
      }
    }
  }

  timeline.push({
    type: ExperimentScreenPlugin,
    title: "正式任务完成",
    content: "<div class=\"phase-intro\"><p>数字核查任务已经完成。接下来还有两份简短问卷，共22题，预计需要3–5分钟。请根据真实情况作答。</p></div>",
    button_label: "开始实验后问卷"
  });
  timeline.push(...postQuestionnaireTimeline(assignment));

  timeline.push({
    type: ExperimentScreenPlugin,
    title: "实验全部完成",
    content: "<div class=\"phase-intro\"><p>正式任务和实验后问卷均已完成。点击下方按钮退出全屏并生成实验数据文件。</p></div>",
    button_label: "完成并生成数据"
  });
  timeline.push({
    type: window.jsPsychFullscreen,
    fullscreen_mode: false,
    on_start: () => {
      fullscreenRequired = false;
      fullscreenGuard.hidden = true;
    }
  });
  return timeline;
}

function renderCompletion(message, failed = false) {
  const downloadControls = !failed && exportBundle ? `
    <div class="completion-downloads">
      <button class="primary-button" id="download-json" type="button">下载完整 JSON</button>
      <button class="secondary-button" id="download-csv" type="button">下载 CSV</button>
    </div>
    <p class="completion-filename"><strong>被试编号：</strong>${session.subject_code}</p>
    <p class="completion-filename"><strong>文件名：</strong>${exportBundle.baseName}</p>
    <p>请将两份文件通过招募平台或邮件发送给研究人员。在确认文件已经保存前，请不要关闭本页面。</p>` : "";
  jsPsychTarget.innerHTML = `
    <main class="completion-screen">
      <section>
        <h1>${failed ? "数据文件尚未生成" : "实验完成"}</h1>
        <p>${message}</p>
        ${downloadControls}
        ${failed ? '<button class="primary-button" id="retry-export" type="button">重新生成数据</button>' : ""}
      </section>
    </main>`;
  if (failed) {
    document.querySelector("#retry-export").addEventListener("click", completeExperiment);
  } else if (exportBundle) {
    document.querySelector("#download-json").addEventListener("click", () => downloadJson(exportBundle));
    document.querySelector("#download-csv").addEventListener("click", () => downloadCsv(exportBundle));
  }
}

async function completeExperiment() {
  renderCompletion("正在生成实验数据文件，请不要关闭页面。");
  try {
    experimentFinishedEpochMs = Date.now();
    experimentFinishedAt = new Date(experimentFinishedEpochMs).toISOString();
    if (session) {
      session.experiment_started_at = experimentStartedAt;
      session.experiment_started_epoch_ms = experimentStartedEpochMs;
      session.experiment_finished_at = experimentFinishedAt;
      session.experiment_finished_epoch_ms = experimentFinishedEpochMs;
      session.experiment_total_wall_time_ms = experimentStartedEpochMs === null
        ? null
        : experimentFinishedEpochMs - experimentStartedEpochMs;
    }
    await finishSession(session.session_id).catch(error => {
      console.warn("Server upload unavailable; exporting local data instead.", error);
    });
    exportBundle = createExportBundle(window.jsPsych, session);
    window.__GITHUB_PAGES_EXPORT__ = exportBundle;
    renderCompletion("数据已经整理完成。浏览器将尝试自动下载 JSON 和 CSV；若没有出现下载，请使用下面的按钮。");
    setTimeout(() => {
      downloadJson(exportBundle);
      setTimeout(() => downloadCsv(exportBundle), 350);
    }, 250);
  } catch (error) {
    console.error(error);
    renderCompletion("数据整理暂未完成，请点击“重新生成数据”再次尝试。", true);
  }
}

async function launchExperiment() {
  const assignment = session.assignment;
  const plan = buildParticipantPlan(assignment, mode);
  experimentStartedEpochMs = Date.now();
  experimentStartedAt = new Date(experimentStartedEpochMs).toISOString();
  experimentStartedPerformanceMs = performance.now();
  experimentFinishedAt = null;
  experimentFinishedEpochMs = null;
  session.experiment_started_at = experimentStartedAt;
  session.experiment_started_epoch_ms = experimentStartedEpochMs;
  const jsPsych = window.initJsPsych({
    display_element: jsPsychTarget,
    on_finish: completeExperiment,
    on_close: () => syncQueue()
  });
  window.jsPsych = jsPsych;
  infoScreen.hidden = true;
  jsPsychTarget.hidden = false;
  const timeline = buildTimeline(plan, assignment);
  await jsPsych.run(timeline);
}

function formData() {
  return {
    subject_code: document.querySelector("#subject-code").value.trim(),
    age: Number(document.querySelector("#age").value),
    gender: document.querySelector("#gender").value,
    handedness: document.querySelector("#handedness").value,
    vision: document.querySelector("#vision").value,
    consent: consentAccepted
  };
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  formError.textContent = "";
  const participant = formData();
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(participant.subject_code)) {
    formError.textContent = "请输入邮件或招募信息中提供的被试编号。";
    return;
  }
  if (mode === "formal" && !/^(?:[ABCD]|P)\d{3,}$/i.test(participant.subject_code)) {
    formError.textContent = "正式实验请输入实验员提供的编号，例如 A001。";
    return;
  }
  if (!Number.isInteger(participant.age) || participant.age < 18 || participant.age > 80) {
    formError.textContent = "请输入 18–80 岁之间的整数年龄。";
    return;
  }
  if (!participant.gender || !participant.handedness || !participant.vision) {
    formError.textContent = "请完成所有必填项。";
    return;
  }
  if (!participant.consent) {
    formError.textContent = "知情同意状态无效，请刷新页面并重新阅读知情同意书。";
    return;
  }
  startButton.disabled = true;
  startButton.textContent = "正在建立实验会话…";
  try {
    const preflight = runPreflight();
    if (!preflight.allPassed) throw new Error("device_not_supported");
    const clientMeta = {
      age: participant.age,
      gender: participant.gender,
      handedness: participant.handedness,
      vision: participant.vision,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      consent_version: CONSENT_VERSION,
      consent_accepted_at: consentAcceptedAt,
      preflight: preflight.checks,
      device_pixel_ratio: devicePixelRatio
    };
    session = await startSession({
      subject_code: participant.subject_code,
      consent: participant.consent,
      mode,
      client_meta: clientMeta
    });
    session = {
      ...session,
      subject_code: participant.subject_code,
      client_meta: clientMeta
    };
    installUnloadUpload(() => session?.session_id);
    await launchExperiment();
  } catch (error) {
    console.error(error);
    if (error.message === "device_not_supported") {
      formError.textContent = "当前设备不满足实验要求。";
    } else if (error.message === "formal_subject_code_required") {
      formError.textContent = "正式实验请输入实验员提供的编号，例如 A001。";
    } else {
      formError.textContent = "未能连接实验服务器，请检查网络后重试。";
    }
    startButton.disabled = false;
    startButton.textContent = "确认信息并开始";
  }
});

const subjectFromUrl = new URLSearchParams(location.search).get("sid");
if (subjectFromUrl) document.querySelector("#subject-code").value = subjectFromUrl;
const modeLabel = mode === "pilot" ? "预测试模式" : "正式实验";
document.querySelector("#mode-label").textContent = modeLabel;
document.querySelector("#consent-mode-label").textContent = modeLabel;

function updateConsentContinue() {
  consentContinue.disabled = !(consentAdult.checked && consentRead.checked);
}

consentAdult.addEventListener("change", updateConsentContinue);
consentRead.addEventListener("change", updateConsentContinue);
consentContinue.addEventListener("click", () => {
  if (!consentAdult.checked || !consentRead.checked) return;
  consentAccepted = true;
  consentAcceptedAt = new Date().toISOString();
  consentScreen.hidden = true;
  infoScreen.hidden = false;
  document.querySelector("#subject-code").focus();
});
consentDecline.addEventListener("click", () => {
  consentScreen.className = "consent-exit";
  consentScreen.innerHTML = `<section><h1>您已选择不参加实验</h1><p>程序不会收集或上传您的任何实验信息。现在可以安全关闭本页面。</p></section>`;
});
installFullscreenGuard();
runPreflight();
