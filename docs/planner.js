const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const storageKey = "numeric-audit-structure-draft-v1";

const controls = {
  aiAssignment: $("#aiAssignment"),
  trialsPerCell: $("#trialsPerCell"),
  targetRate: $("#targetRate"),
  reliabilityDefinition: $("#reliabilityDefinition"),
  errorAllocation: $("#errorAllocation"),
  noSystemMiss: $("#noSystemMiss"),
  optionalClick: $("#optionalClick"),
  confidenceRating: $("#confidenceRating"),
  ai1Trust: $("#ai1Trust"),
  ai2Trust: $("#ai2Trust"),
  practiceTrials: $("#practiceTrials"),
  decisionSeconds: $("#decisionSeconds"),
  ratingSeconds: $("#ratingSeconds"),
  blockOrder: $("#blockOrder"),
  breakEvery: $("#breakEvery"),
  breakSeconds: $("#breakSeconds")
};

function checkedValues(name) {
  return $$(`input[name="${name}"]:checked`).map(input => Number(input.value)).sort((a, b) => a - b);
}

function readConfig() {
  return {
    design: {
      ai_assignment: controls.aiAssignment.value,
      ai1_levels: checkedValues("ai1Level"),
      ai2_levels: checkedValues("ai2Level"),
      set_sizes: checkedValues("setSize"),
      trials_per_cell: Number(controls.trialsPerCell.value),
      target_rate: Number(controls.targetRate.value)
    },
    ai: {
      reliability_definition: controls.reliabilityDefinition.value,
      error_allocation: controls.errorAllocation.value,
      no_system_miss: controls.noSystemMiss.checked,
      cue_mapping: { ai1: "deep_red", ai2: "light_red" }
    },
    measurement: {
      optional_matrix_click: controls.optionalClick.checked,
      confidence_per_trial: controls.confidenceRating.checked,
      ai1_trust_per_trial: controls.ai1Trust.checked,
      ai2_trust_per_trial: controls.ai2Trust.checked
    },
    flow: {
      practice_trials: Number(controls.practiceTrials.value),
      mean_decision_seconds: Number(controls.decisionSeconds.value),
      seconds_per_rating: Number(controls.ratingSeconds.value),
      block_order: controls.blockOrder.value,
      break_every_trials: Number(controls.breakEvery.value),
      break_seconds: Number(controls.breakSeconds.value),
      fixation_ms: 500,
      iti_ms: 500
    }
  };
}

function combinations(config) {
  return config.design.ai1_levels.flatMap(ai1 =>
    config.design.ai2_levels.map(ai2 => ({ ai1, ai2, key: `${Math.round(ai1 * 100)}_${Math.round(ai2 * 100)}` }))
  );
}

function integer(value) {
  return Number.isFinite(value) && Math.abs(value - Math.round(value)) < 1e-9;
}

function formatReliability(value) {
  return `${Math.round(value * 100)}%`;
}

function node(title, detail) {
  return `<div class="flow-node"><strong>${title}</strong><span>${detail}</span></div>`;
}

function arrows(items) {
  return items.map((item, index) => `${index ? '<div class="flow-arrow">→</div>' : ''}${item}`).join("");
}

function validation(config, combos) {
  const messages = [];
  let severity = "ok";
  const n = config.design.trials_per_cell;
  const target = n * config.design.target_rate;
  const absent = n - target;
  if (!config.design.ai1_levels.length || !config.design.ai2_levels.length || !config.design.set_sizes.length) {
    messages.push("至少保留一个 AI1 水平、一个 AI2 水平和一个 set size。");
    severity = "error";
  }
  if (!integer(target)) {
    messages.push(`每 cell 的有目标数为 ${target}，不是整数。请调整 trial 数或目标比例。`);
    severity = "error";
  }
  if (config.ai.reliability_definition === "cue_validity") {
    messages.push("Cue-level validity 还需要先确定每个 trial 出现几个 cue；当前只能作为设计草案，不能直接生成正式条件表。");
    severity = severity === "error" ? "error" : "warning";
  }
  for (const combo of combos) {
    const error1 = n * (1 - combo.ai1);
    const error2 = n * (1 - combo.ai2);
    if (!integer(n * combo.ai1) || !integer(n * combo.ai2)) {
      messages.push(`${formatReliability(combo.ai1)} / ${formatReliability(combo.ai2)} 在 ${n} trials 下不能得到整数正确次数。`);
      severity = "error";
      continue;
    }
    if (config.ai.error_allocation === "balanced") {
      if (!integer(error1 / 2) || !integer(error2 / 2)) {
        messages.push(`${formatReliability(combo.ai1)} / ${formatReliability(combo.ai2)} 的错误数无法在有目标与无目标间严格平分。`);
        severity = "error";
      }
      if (config.ai.no_system_miss && error1 / 2 + error2 / 2 > target) {
        messages.push(`${formatReliability(combo.ai1)} / ${formatReliability(combo.ai2)} 无法同时满足当前有目标数量和“无系统漏报”。`);
        severity = "error";
      }
    } else if (error1 > absent || error2 > absent) {
      messages.push(`${formatReliability(combo.ai1)} / ${formatReliability(combo.ai2)} 的错误数超过无目标 trial 数，无法只用虚惊实现。`);
      severity = "error";
    }
  }
  if (!messages.length) messages.push("当前参数可以生成整数条件计数；正式应用前仍需确认可靠性定义与组内/组间属性。");
  return { severity, messages };
}

function render() {
  const config = readConfig();
  const combos = combinations(config);
  const cellCount = combos.length * config.design.set_sizes.length;
  const cellsPerParticipant = config.design.ai_assignment === "within"
    ? cellCount
    : config.design.set_sizes.length;
  const formalTrials = cellsPerParticipant * config.design.trials_per_cell;
  const ratingCount = [
    config.measurement.confidence_per_trial,
    config.measurement.ai1_trust_per_trial,
    config.measurement.ai2_trust_per_trial
  ].filter(Boolean).length;
  const trialSeconds = 1 + config.flow.mean_decision_seconds + ratingCount * config.flow.seconds_per_rating;
  const practiceSeconds = config.flow.practice_trials * trialSeconds;
  const breaks = config.flow.break_every_trials > 0
    ? Math.floor(Math.max(0, formalTrials - 1) / config.flow.break_every_trials)
    : 0;
  const totalMinutes = Math.ceil((formalTrials * trialSeconds + practiceSeconds + breaks * config.flow.break_seconds + 180) / 60);

  $("#participantTrials").textContent = String(formalTrials);
  $("#participantTrialNote").textContent = `${cellsPerParticipant} cells × ${config.design.trials_per_cell}`;
  $("#estimatedMinutes").textContent = `${totalMinutes} min`;
  $("#timeNote").textContent = `${ratingCount} 道评分 / trial，${breaks} 次休息`;
  $("#designCells").textContent = `${cellCount} cells`;
  $("#groupNote").textContent = config.design.ai_assignment === "within"
    ? "每人完成全部 AI 组合"
    : `${combos.length} 个 AI 组，每人完成 ${config.design.set_sizes.length} cells`;

  const blockLabels = {
    ai_set: "AI 组合 → Set size",
    set_ai: "Set size → AI 组合",
    mixed: "所有 cell 混合随机"
  };
  $("#structureLabel").textContent = `${config.design.ai_assignment === "within" ? "被试内" : "AI 组合组间"} · ${blockLabels[config.flow.block_order]}`;

  const studyNodes = [
    node("身份与知情同意", "唯一邀请链接 / 匿名编号"),
    node("图示指导语", "规则、AI 提示和反应方式"),
    node("练习", `${config.flow.practice_trials} trials，提供反馈`),
    node("正式实验", `${formalTrials} trials，${cellsPerParticipant} cells`),
    node("完成与上传", "确认数据完整后结束")
  ];
  $("#studyFlow").innerHTML = arrows(studyNodes);

  const trialNodes = [node("注视点", "500 ms"), node("数字矩阵 + AI", config.measurement.optional_matrix_click ? "可选点击数字标记" : "只观察，不点击数字"), node("审核判断", "点击合格 / 不合格")];
  if (ratingCount) trialNodes.push(node("本次评价", `${ratingCount} 道，预计 ${ratingCount * config.flow.seconds_per_rating} 秒`));
  trialNodes.push(node("空屏", "500 ms"));
  $("#trialFlow").innerHTML = arrows(trialNodes);

  const n = config.design.trials_per_cell;
  const targetCount = n * config.design.target_rate;
  const absentCount = n - targetCount;
  $("#conditionRows").innerHTML = combos.flatMap(combo =>
    config.design.set_sizes.map(setSize => {
      const ai1Correct = n * combo.ai1;
      const ai2Correct = n * combo.ai2;
      const exact = integer(targetCount) && integer(ai1Correct) && integer(ai2Correct);
      return `<tr>
        <td><span class="condition-pair"><i class="cue-dot ai1"></i>${formatReliability(combo.ai1)} <i class="cue-dot ai2"></i>${formatReliability(combo.ai2)}</span></td>
        <td>${setSize}×${setSize}（实际 ${setSize + 2}×${setSize + 2}）</td>
        <td>${n}</td>
        <td>${Number.isInteger(targetCount) ? targetCount : targetCount.toFixed(1)} / ${Number.isInteger(absentCount) ? absentCount : absentCount.toFixed(1)}</td>
        <td>${Number.isInteger(ai1Correct) ? ai1Correct : ai1Correct.toFixed(1)}</td>
        <td>${Number.isInteger(ai2Correct) ? ai2Correct : ai2Correct.toFixed(1)}</td>
        <td class="${exact ? "exact" : "inexact"}">${exact ? "是" : "否"}</td>
      </tr>`;
    })
  ).join("");

  const variables = ["判断正确率", "判断 RT", "置信度", "AI1 信任度", "AI2 信任度", "切出页面次数"];
  if (config.measurement.optional_matrix_click) variables.splice(2, 0, "首次点击 RT", "点击来源", "点击次数", "最终标记是否命中");
  if (!config.measurement.confidence_per_trial) variables.splice(variables.indexOf("置信度"), 1);
  if (!config.measurement.ai1_trust_per_trial) variables.splice(variables.indexOf("AI1 信任度"), 1);
  if (!config.measurement.ai2_trust_per_trial) variables.splice(variables.indexOf("AI2 信任度"), 1);
  $("#dependentVariables").innerHTML = variables.map(variable => `<span class="variable-item">${variable}</span>`).join("");

  const check = validation(config, combos);
  const panel = $("#validationPanel");
  panel.className = `validation-panel visible ${check.severity}`;
  panel.innerHTML = check.messages.map(message => `<div>${message}</div>`).join("");

  localStorage.setItem(storageKey, JSON.stringify(config));
  $("#saveState").textContent = "草案已保存在当前浏览器";
}

function applyStoredConfig() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return;
  try {
    const config = JSON.parse(raw);
    controls.aiAssignment.value = config.design.ai_assignment;
    controls.trialsPerCell.value = config.design.trials_per_cell;
    controls.targetRate.value = String(config.design.target_rate);
    controls.reliabilityDefinition.value = config.ai.reliability_definition;
    controls.errorAllocation.value = config.ai.error_allocation;
    controls.noSystemMiss.checked = config.ai.no_system_miss;
    controls.optionalClick.checked = config.measurement.optional_matrix_click;
    controls.confidenceRating.checked = config.measurement.confidence_per_trial;
    controls.ai1Trust.checked = config.measurement.ai1_trust_per_trial;
    controls.ai2Trust.checked = config.measurement.ai2_trust_per_trial;
    controls.practiceTrials.value = config.flow.practice_trials;
    controls.decisionSeconds.value = config.flow.mean_decision_seconds;
    controls.ratingSeconds.value = config.flow.seconds_per_rating;
    controls.blockOrder.value = config.flow.block_order;
    controls.breakEvery.value = config.flow.break_every_trials;
    controls.breakSeconds.value = config.flow.break_seconds;
    $$('input[name="ai1Level"]').forEach(input => { input.checked = config.design.ai1_levels.includes(Number(input.value)); });
    $$('input[name="ai2Level"]').forEach(input => { input.checked = config.design.ai2_levels.includes(Number(input.value)); });
    $$('input[name="setSize"]').forEach(input => { input.checked = config.design.set_sizes.includes(Number(input.value)); });
  } catch {
    localStorage.removeItem(storageKey);
  }
}

async function copyConfig() {
  const text = JSON.stringify(readConfig(), null, 2);
  await navigator.clipboard.writeText(text);
  $("#copyConfig").textContent = "已复制";
  setTimeout(() => { $("#copyConfig").textContent = "复制当前配置"; }, 1200);
}

applyStoredConfig();
document.addEventListener("input", render);
document.addEventListener("change", render);
$("#copyConfig").addEventListener("click", copyConfig);
render();

