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

const mode = new URLSearchParams(location.search).get("mode") === "pilot" ? "pilot" : "formal";
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
window.__fullscreenExitCount = 0;
window.__visibilityHiddenCount = 0;

const planValidation = validateTrialPlan();
console.table(planValidation.summary);
if (!planValidation.valid) console.error("Trial plan validation failed", planValidation.errors);

function randomUuid() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function detectMobile() {
  const userAgentMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const uaDataMobile = navigator.userAgentData?.mobile === true;
  return userAgentMobile || uaDataMobile;
}

function runPreflight() {
  const checks = [
    {
      label: "电脑设备",
      pass: !detectMobile() && matchMedia("(pointer: fine)").matches,
      detail: "实验仅支持带鼠标或触控板的电脑"
    },
    {
      label: "屏幕尺寸",
      pass: screen.width >= 1024 && screen.height >= 700,
      detail: `检测到 ${screen.width}×${screen.height}，最低要求 1024×700`
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
  const allPassed = checks.every(check => check.pass) && planValidation.valid;
  startButton.disabled = !allPassed;
  if (!allPassed) formError.textContent = "当前设备不满足实验要求，请更换电脑或调整显示设备后刷新页面。";
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
  fullscreenReturn.addEventListener("click", async () => {
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

function taskIntroductionContent() {
  return `<div class="instruction-prose">
    <p class="instruction-lead">你将看到一个数字矩阵。任务是核查矩阵内部的每一个有效位置，找出是否存在不满足上下左右关系规则的目标。</p>
    <div class="task-definition-grid">
      <section><strong>需要核查什么</strong><p>矩阵内部所有可点击位置构成核查区域。最外圈数字只提供上下左右关系所需的参考，不需要点击。不同 trial 的矩阵大小可能不同，但核查规则保持不变。</p></section>
      <section><strong>什么是目标</strong><p>对某个核查位置，如果“上方数字 + 下方数字”不等于“左侧数字 + 右侧数字”，该位置就是目标。</p></section>
      <section><strong>怎样作答</strong><p>先点击发现的全部目标，再判断整张矩阵“合规”或“不合规”。</p></section>
    </div>
    <div class="response-definition">
      <span><b>合规</b>：没有发现目标</span>
      <span><b>不合规</b>：发现一个或多个目标</span>
    </div>
  </div>`;
}

function taskRuleVisualContent() {
  return `<div class="rule-visual-layout">
    <section class="matrix-figure">
      <div class="figure-labels"><span class="reference-label">外圈：关系参考数字</span><span class="audit-label">矩阵内部：可点击核查区域</span></div>
      ${instructionMatrixExample()}
      <div class="matrix-legend"><span><i class="legend-audit"></i>可点击核查位置</span><span><i class="legend-focus"></i>当前示例位置</span></div>
    </section>
    <section class="rule-calculation">
      <h2>示例位置的判断</h2>
      <div class="calculation-row vertical-calc"><span>上 + 下</span><strong>4 + 3 = 7</strong></div>
      <div class="calculation-row horizontal-calc"><span>左 + 右</span><strong>2 + 4 = 6</strong></div>
      <div class="calculation-result"><b>7 ≠ 6</b><span>因此，该位置是目标</span></div>
      <ol class="instruction-steps compact-steps">
        <li><span>1</span>核查内部位置的上下左右数字。</li>
        <li><span>2</span>发现目标时，点击该位置进行标记。</li>
        <li><span>3</span>完成搜索后，再判断整张矩阵是否合规。</li>
      </ol>
    </section>
  </div>`;
}

function aiInstructionContent() {
  return `<div class="ai-instruction-layout">
    <section>
      <p class="instruction-lead">我们基于过往数字核查数据训练了一个 AI 模型。模型会分析矩阵中的位置，并提示最值得优先核查的候选。</p>
      <div class="ai-cue-example" aria-label="AI 深红和浅红底纹候选示意">
        <span>6</span><span class="deep-candidate">8</span><span>7</span>
        <span>5</span><span>4</span><span class="light-candidate">6</span>
        <span>9</span><span>3</span><span>8</span>
      </div>
    </section>
    <section class="ai-explanation-list">
      <div class="cue-explanation"><i class="cue-key deep"></i><p><strong>较深的淡红底纹</strong><br>模型认为最值得优先核查的位置。</p></div>
      <div class="cue-explanation"><i class="cue-key light"></i><p><strong>较浅的淡红底纹</strong><br>模型认为也值得核查的位置。</p></div>
      <div class="ai-boundary-note"><strong>请注意</strong><p>深红和浅红候选不会指向同一个位置。AI 只帮助安排核查顺序，不直接给出最终答案；候选可能正确，也可能把正常位置标出来，最终判断仍由你完成。</p></div>
    </section>
  </div>`;
}

function instructionContent() {
  return `<div class="practice-guide">
    <section><h2>任务说明</h2>${taskIntroductionContent()}</section>
    <section><h2>矩阵与判断规则</h2>${taskRuleVisualContent()}</section>
    <section><h2>AI 辅助说明</h2>${aiInstructionContent()}</section>
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
      content: `<div class="phase-intro"><p>本阶段不显示任何 AI 候选，用于测量你尚未接触 AI 提示时的独立审核表现。</p><p>实验首先进行一次任务规则练习，共 5 个 trial。练习正确率达到 80% 后进入无 AI 正式基线；后续无 AI block 不再重复练习。</p></div>`
    };
  }
  return {
    title: "AI 辅助审核阶段",
    content: `<div class="phase-intro"><p>无 AI 正式基线已经完成。本阶段会显示深红和/或浅红候选；候选只是 AI 建议优先检查的位置，最终判断仍由你完成。</p><p>首次进入 AI 阶段时进行一次 5-trial AI 熟悉练习。达到 80% 后进入正式实验；后续四个 AI 条件不再重复练习。</p></div>`
  };
}

function validityBar(label, value, colorClass) {
  return `<div class="validity-row"><span>${label}</span><progress class="${colorClass}" max="1" value="${value}"></progress><strong>${Math.round(value * 100)}%</strong></div>`;
}

function blockIntro(spec, trialCount) {
  if (!spec.ai_present) {
    return {
      title: "无 AI · 独立审核",
      content: `<div class="block-intro"><p>本组共 ${trialCount} 个 trial，不显示 AI 候选。</p><p>请保持准确，在确认后再提交判断。</p></div>`
    };
  }
  return {
    title: AI_CONDITIONS[spec.condition_key].label,
    content: `<div class="block-intro">
      <p>本组共 ${trialCount} 个 trial。以下百分比表示：该颜色候选出现时，它落在真实目标位置上的历史比例。</p>
      <div class="validity-bars">
        ${validityBar("深红候选有效率", spec.deep_validity, "deep-fill")}
        ${validityBar("浅红候选有效率", spec.light_validity, "light-fill")}
      </div>
      <p>颜色表示候选优先层级，百分比表示本组历史有效率；两者都不是最终答案。</p>
    </div>`
  };
}

function selectPracticeSpecs(phase, formalPlan) {
  const canonical = generateCanonicalPlan();
  const conditionKey = phase === "baseline"
    ? "baseline"
    : formalPlan.find(trial => trial.phase === "ai")?.condition_key || "90_90";
  const pool = canonical.filter(trial => trial.condition_key === conditionKey && trial.set_size === 3);
  const chosen = phase === "baseline"
    ? [
      pool.find(trial => trial.target_count === 0),
      pool.filter(trial => trial.target_count === 0)[1],
      pool.find(trial => trial.target_count === 1),
      pool.filter(trial => trial.target_count === 1)[1],
      pool.find(trial => trial.target_count === 2)
    ]
    : [
      pool.find(trial => trial.system_event === "correct_rejection"),
      pool.find(trial => trial.system_event === "false_alarm"),
      pool.find(trial => trial.system_event === "hit" && trial.target_count === 1),
      pool.filter(trial => trial.system_event === "hit" && trial.target_count === 1)[1],
      pool.find(trial => trial.system_event === "hit" && trial.target_count === 2)
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
    ask_ratings: !options.practice,
    instruction_html: options.instructionHtml || "",
    progress_current: options.progressCurrent || 0,
    progress_total: options.progressTotal || 0,
    on_finish: data => storeTrialData(data, spec, assignment)
  };
}

function storeTrialData(data, spec, assignment) {
  const record = {
    ...data,
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
    browser_check: browserCheckData,
    viewport_width: innerWidth,
    viewport_height: innerHeight,
    screen_width: screen.width,
    screen_height: screen.height
  };
  enqueueTrial(session.session_id, record);
  if (queuedTrialCount(session.session_id) >= UPLOAD_BATCH_SIZE) syncQueue();
}

function storeCalibrationData(data, assignment) {
  const record = {
    ...data,
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
    browser_check: browserCheckData,
    viewport_width: innerWidth,
    viewport_height: innerHeight,
    screen_width: screen.width,
    screen_height: screen.height
  };
  Object.assign(data, record);
  enqueueTrial(session.session_id, record);
  if (queuedTrialCount(session.session_id) >= UPLOAD_BATCH_SIZE) syncQueue();
}

function reverseScore(value, maximum) {
  return maximum + 1 - Number(value);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
  return {};
}

function storeQuestionnaireData(data, assignment) {
  const responses = data.responses || {};
  const record = {
    ...data,
    ...responses,
    ...scoreQuestionnaire(data.questionnaire_id, responses),
    trial_uuid: randomUuid(),
    experiment_version: EXPERIMENT_VERSION,
    mode,
    phase: "post_questionnaire",
    condition_key: data.questionnaire_id,
    assignment_group: assignment.assignment_group,
    assignment_cycle: assignment.assignment_cycle,
    allocation_method: assignment.allocation_method,
    phase_order_index: assignment.phase_order_index,
    condition_order_index: assignment.condition_order_index,
    set_size_order_index: assignment.set_size_order_index,
    phase_order: assignment.phase_order,
    condition_order: assignment.condition_order,
    set_size_order: assignment.set_size_order,
    questionnaire_order: ["bfi10_zh", "ai_literacy_wang12_zh"],
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
  enqueueTrial(session.session_id, record);
  if (queuedTrialCount(session.session_id) >= UPLOAD_BATCH_SIZE) syncQueue();
}

function postQuestionnaireTimeline(assignment) {
  const bfiLabels = ["非常不同意", "有点不同意", "既不同意也不反对", "有点同意", "非常同意"];
  const aiLabels = ["非常不同意", "不同意", "有点不同意", "不确定", "有点同意", "同意", "非常同意"];
  return [
    {
      type: PostQuestionnairePlugin,
      title: "简版大五人格问卷",
      description: "<p>下面这些陈述在多大程度上符合你通常的情况？请根据真实感受作答，没有正确或错误答案。</p>",
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
      description: "<p>请判断以下陈述在多大程度上符合你的实际情况。这里的人工智能包括日常使用的智能应用、产品或助手。</p>",
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
  return {
    timeline: specs.map(spec => prepareNumericTrial(spec, {
      practice: true,
      instructionHtml: instructionContent()
    }, assignment)),
    loop_function: data => {
      const rows = data.values().filter(row => row.trial_kind === "numeric_audit" && row.practice);
      const correct = rows.filter(row => row.fully_correct).length;
      practiceState.lastAccuracy = rows.length ? correct / rows.length : 0;
      practiceState.attempt += 1;
      return practiceState.lastAccuracy < 0.8;
    }
  };
}

function buildTimeline(plan, assignment) {
  const timeline = [
    {
      type: window.jsPsychBrowserCheck,
      features: ["width", "height", "browser", "browser_version", "mobile", "os", "fullscreen"],
      on_finish: data => { browserCheckData = { ...data }; }
    },
    {
      type: ExperimentScreenPlugin,
      title: "任务说明",
      content: taskIntroductionContent(),
      button_label: "下一步：查看矩阵示意",
      screen_class: "instruction-screen"
    },
    {
      type: ExperimentScreenPlugin,
      title: "矩阵、核查区域与判断规则",
      content: taskRuleVisualContent(),
      button_label: "下一步：理解检查",
      screen_class: "instruction-screen"
    },
    {
      type: ExperimentScreenPlugin,
      title: "任务规则理解检查",
      content: "<div class=\"check-intro\"><p>请根据刚才的规则独立判断下面的位置。回答正确后才能继续。</p></div>",
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
      type: ExperimentScreenPlugin,
      title: "AI 辅助说明",
      content: aiInstructionContent(),
      button_label: "已了解，进入全屏",
      screen_class: "instruction-screen"
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
    timeline.push({ type: ExperimentScreenPlugin, ...intro, button_label: skipPractice ? "进入预测试区组" : "开始练习" });
    if (!skipPractice) {
      timeline.push(practiceLoop(phase, plan, assignment));
      timeline.push({
        type: ExperimentScreenPlugin,
        title: "练习通过",
        content: "<div class=\"phase-intro\"><p>练习完全正确率已达到 80%。下一页将显示正式区组条件，正式 trial 不提供正确答案反馈。</p></div>",
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
      const nextBlock = blocks[blockPosition + 1];
      const aiConditionComplete = phase === "ai"
        && nextBlock
        && nextBlock[0].condition_key !== block[0].condition_key;
      if (aiConditionComplete) {
        timeline.push({
          type: ExperimentScreenPlugin,
          title: "当前 AI 条件完成",
          content: "<div class=\"phase-intro\"><p>已完成当前 AI 条件下三个 set size、共 60 个正式 trial。请休息片刻，准备好后进入下一个 AI 条件。</p></div>",
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
    content: "<div class=\"phase-intro\"><p>正式任务和实验后问卷均已完成。点击下方按钮退出全屏并确认数据上传。</p></div>",
    button_label: "完成并上传"
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
  jsPsychTarget.innerHTML = `
    <main class="completion-screen">
      <section>
        <h1>${failed ? "数据尚未完全上传" : "实验完成"}</h1>
        <p>${message}</p>
        ${failed ? '<button class="primary-button" id="retry-upload" type="button">重新上传</button>' : ""}
      </section>
    </main>`;
  if (failed) document.querySelector("#retry-upload").addEventListener("click", completeExperiment);
}

async function completeExperiment() {
  renderCompletion("正在确认数据，请不要关闭页面。");
  try {
    await finishSession(session.session_id);
    renderCompletion("数据已完整保存。现在可以关闭此页面。感谢你的参与。");
  } catch {
    renderCompletion("网络暂时不可用，数据仍保存在本机浏览器中。请检查网络后点击“重新上传”。", true);
  }
}

async function launchExperiment() {
  const assignment = session.assignment;
  const plan = buildParticipantPlan(assignment, mode);
  const jsPsych = window.initJsPsych({
    display_element: jsPsychTarget,
    on_finish: completeExperiment,
    on_close: () => syncQueue()
  });
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
  if (mode === "formal" && !/^P\d{3,}$/i.test(participant.subject_code)) {
    formError.textContent = "正式实验请输入实验员提供的编号，例如 P001。";
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
    session = await startSession({
      subject_code: participant.subject_code,
      consent: participant.consent,
      mode,
      client_meta: {
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
      }
    });
    installUnloadUpload(() => session?.session_id);
    await launchExperiment();
  } catch (error) {
    console.error(error);
    if (error.message === "device_not_supported") {
      formError.textContent = "当前设备不满足实验要求。";
    } else if (error.message === "formal_subject_code_required") {
      formError.textContent = "正式实验请输入实验员提供的编号，例如 P001。";
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
  consentScreen.innerHTML = `<section><h1>你已选择不参加实验</h1><p>程序不会收集或上传你的任何实验信息。现在可以安全关闭本页面。</p></section>`;
});
installFullscreenGuard();
runPreflight();
