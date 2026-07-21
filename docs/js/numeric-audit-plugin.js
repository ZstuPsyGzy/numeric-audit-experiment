const { ParameterType } = window.jsPsychModule;

function keyOf(position) {
  return `${position.row},${position.col}`;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function cueMembership(position, material) {
  const key = keyOf(position);
  const deep = material.deepCue && keyOf(material.deepCue) === key;
  const light = material.lightCue && keyOf(material.lightCue) === key;
  if (deep && light) return "deep_and_light";
  if (deep) return "deep";
  if (light) return "light";
  return "none";
}

export class NumericAuditPlugin {
  static info = {
    name: "numeric-audit",
    version: "1.2.0",
    parameters: {
      spec: { type: ParameterType.OBJECT, default: undefined },
      material: { type: ParameterType.OBJECT, default: undefined },
      practice: { type: ParameterType.BOOL, default: false },
      ask_ratings: { type: ParameterType.BOOL, default: true },
      instruction_html: { type: ParameterType.HTML_STRING, default: "" },
      progress_current: { type: ParameterType.INT, default: 0 },
      progress_total: { type: ParameterType.INT, default: 0 }
    },
    data: {
      judgment_correct: { type: ParameterType.BOOL },
      localization_correct: { type: ParameterType.BOOL },
      fully_correct: { type: ParameterType.BOOL },
      total_rt_ms: { type: ParameterType.FLOAT }
    }
  };

  constructor(jsPsych) {
    this.jsPsych = jsPsych;
  }

  trial(displayElement, trial) {
    const { spec, material } = trial;
    const startedAt = performance.now();
    let pausedDuration = 0;
    let instructionReviewStartedAt = null;
    let instructionReviewCount = 0;
    let instructionReviewDuration = 0;
    const activeElapsed = () => {
      const currentPause = instructionReviewStartedAt === null
        ? 0
        : performance.now() - instructionReviewStartedAt;
      return performance.now() - startedAt - pausedDuration - currentPause;
    };
    const targetKeys = new Set(material.targetPositions.map(keyOf));
    const selected = new Map();
    const clickTrace = [];
    const ratings = {};
    let judgment = null;
    let judgmentAt = null;
    let fixationActualDuration = null;

    displayElement.innerHTML = `
      <main class="trial-screen">
        <header class="trial-header">
          <div><strong>数字关系核查</strong><span>${spec.ai_present ? "AI 辅助" : "独立审核"} · 有效核查位置 ${spec.set_size}×${spec.set_size}</span></div>
          <div class="trial-header-actions">
            ${trial.practice && trial.instruction_html ? '<button class="review-instructions-button" type="button" data-review-instructions>返回阅读指导语</button>' : ""}
            <div class="trial-progress"><span>${trial.practice ? "练习" : `${trial.progress_current} / ${trial.progress_total}`}</span><progress max="${trial.progress_total || 1}" value="${trial.progress_current || 0}"></progress></div>
          </div>
        </header>
        <section class="trial-workspace">
          <div class="stimulus-area">
            <p class="rule-line">规则：逐一核查可点击位置。若某位置“上 + 下 ≠ 左 + 右”，该位置就是目标。</p>
            <div class="matrix-wrap">
              <div class="number-matrix matrix-size-${material.matrixSize}"></div>
            </div>
            <div class="cue-status">${spec.ai_present ? '<span class="analysis-done">AI 分析完成</span><span><i class="cue-key deep"></i>深红候选</span><span><i class="cue-key light"></i>浅红候选</span>' : "本阶段不提供 AI 候选"}</div>
          </div>
          <aside class="response-area">
            <section class="response-section response-main">
              <div class="response-copy"><h2>作答</h2><p>先点击所有发现的目标位置，可再次点击取消；然后完成最终判断。</p></div>
              <div class="selection-count">已选择 <strong data-selection-count>0</strong> 个位置</div>
              <div class="judgment-block">
                <div class="judgment-actions">
                  <button type="button" data-judgment="compliant"><strong>合规</strong><span>未发现目标</span></button>
                  <button type="button" data-judgment="noncompliant"><strong>不合规</strong><span>发现一个或多个目标</span></button>
                </div>
                <p class="response-message" role="status"></p>
              </div>
            </section>
            <section class="response-section rating-section" hidden>
              <h2>本次评价</h2>
              <div class="rating-list"></div>
              <div class="rating-submit-area">
                <div class="rating-anchors"><span>1 很低</span><span>5 很高</span></div>
                <button class="primary-button submit-rating" type="button" disabled>提交评价</button>
              </div>
            </section>
            <section class="response-section feedback-section" hidden>
              <h2>练习反馈</h2>
              <p class="feedback-text"></p>
              <button class="primary-button feedback-continue" type="button">继续</button>
            </section>
          </aside>
        </section>
      </main>
      <div class="trial-fixation" data-fixation hidden aria-label="注视点"><span>+</span></div>
      ${trial.practice && trial.instruction_html ? `<div class="practice-instruction-overlay" data-instruction-overlay hidden role="dialog" aria-modal="true" aria-labelledby="practice-instruction-title">
        <section class="practice-instruction-dialog">
          <header><h1 id="practice-instruction-title">任务指导语</h1></header>
          <div class="practice-instruction-content">${trial.instruction_html}</div>
          <footer><button class="primary-button" type="button" data-close-instructions>返回当前练习</button></footer>
        </section>
      </div>` : ""}`;

    const matrixElement = displayElement.querySelector(".number-matrix");
    const messageElement = displayElement.querySelector(".response-message");
    const countElement = displayElement.querySelector("[data-selection-count]");
    const trialScreen = displayElement.querySelector(".trial-screen");
    const responseMain = displayElement.querySelector(".response-main");
    const ratingSection = displayElement.querySelector(".rating-section");
    const feedbackSection = displayElement.querySelector(".feedback-section");
    const fixationOverlay = displayElement.querySelector("[data-fixation]");
    const reviewButton = displayElement.querySelector("[data-review-instructions]");
    const instructionOverlay = displayElement.querySelector("[data-instruction-overlay]");
    const closeInstructionsButton = displayElement.querySelector("[data-close-instructions]");

    if (reviewButton && instructionOverlay && closeInstructionsButton) {
      reviewButton.addEventListener("click", () => {
        instructionReviewCount += 1;
        instructionReviewStartedAt = performance.now();
        instructionOverlay.hidden = false;
        closeInstructionsButton.focus();
      });
      closeInstructionsButton.addEventListener("click", () => {
        const duration = performance.now() - instructionReviewStartedAt;
        pausedDuration += duration;
        instructionReviewDuration += duration;
        instructionReviewStartedAt = null;
        instructionOverlay.hidden = true;
        reviewButton.focus();
      });
    }

    material.matrix.forEach((row, rowIndex) => row.forEach((value, colIndex) => {
      const button = document.createElement("button");
      const selectable = rowIndex > 0 && rowIndex < material.matrixSize - 1
        && colIndex > 0 && colIndex < material.matrixSize - 1;
      button.type = "button";
      button.className = `number-cell${selectable ? " selectable" : " boundary"}`;
      button.textContent = value;
      button.dataset.row = rowIndex;
      button.dataset.col = colIndex;
      button.disabled = !selectable;
      if (spec.ai_present && material.deepCue?.row === rowIndex && material.deepCue?.col === colIndex) {
        const ring = document.createElement("span");
        ring.className = "cue-ring deep";
        button.append(ring);
      }
      if (spec.ai_present && material.lightCue?.row === rowIndex && material.lightCue?.col === colIndex) {
        const ring = document.createElement("span");
        ring.className = "cue-ring light";
        button.append(ring);
      }
      if (selectable) button.addEventListener("click", () => {
        const position = { row: rowIndex, col: colIndex };
        const key = keyOf(position);
        const action = selected.has(key) ? "deselect" : "select";
        if (action === "select") selected.set(key, position);
        else selected.delete(key);
        button.classList.toggle("selected", action === "select");
        countElement.textContent = selected.size;
        messageElement.textContent = "";
        clickTrace.push({
          order: clickTrace.length + 1,
          action,
          row: rowIndex,
          col: colIndex,
          rt_ms: round(activeElapsed()),
          is_target: targetKeys.has(key),
          cue_membership: cueMembership(position, material)
        });
      });
      matrixElement.append(button);
    }));

    const finish = (responseEndedAt = activeElapsed()) => {
      const endedAt = responseEndedAt;
      const selectedPositions = [...selected.values()];
      const selectedKeys = new Set(selectedPositions.map(keyOf));
      const truePositiveClicks = selectedPositions.filter(position => targetKeys.has(keyOf(position))).length;
      const localizationCorrect = selectedKeys.size === targetKeys.size
        && [...targetKeys].every(key => selectedKeys.has(key));
      const judgmentCorrect = judgment === spec.correct_judgment;
      const firstSelection = clickTrace.find(click => click.action === "select");
      const firstClickedPosition = firstSelection
        ? { row: firstSelection.row, col: firstSelection.col }
        : null;
      this.jsPsych.finishTrial({
        trial_kind: "numeric_audit",
        practice: trial.practice,
        canonical_id: spec.canonical_id,
        phase: spec.phase,
        condition_key: spec.condition_key,
        trial_index_global: spec.trial_index_global ?? null,
        trial_index_block: spec.trial_index_block ?? null,
        block_index: spec.block_index ?? null,
        set_size: spec.set_size,
        matrix_size: spec.matrix_size,
        effective_positions: spec.effective_positions,
        target_count: spec.target_count,
        target_present: spec.target_present,
        true_status: spec.true_status,
        target_positions: material.targetPositions,
        deep_validity: spec.deep_validity,
        light_validity: spec.light_validity,
        deep_cue_position: material.deepCue,
        light_cue_position: material.lightCue,
        deep_outcome: spec.deep_outcome,
        light_outcome: spec.light_outcome,
        cue_profile: spec.cue_profile,
        system_event: spec.system_event,
        system_correct: spec.system_correct,
        matrix: material.matrix,
        participant_judgment: judgment,
        correct_judgment: spec.correct_judgment,
        judgment_correct: judgmentCorrect,
        selected_positions: selectedPositions,
        selected_count: selectedPositions.length,
        localization_correct: localizationCorrect,
        fully_correct: localizationCorrect && judgmentCorrect,
        true_positive_clicks: truePositiveClicks,
        false_positive_clicks: selectedPositions.length - truePositiveClicks,
        target_recall: spec.target_count ? truePositiveClicks / spec.target_count : null,
        click_precision: selectedPositions.length ? truePositiveClicks / selectedPositions.length : null,
        click_trace: clickTrace,
        first_clicked_position: firstClickedPosition,
        first_click_cue_membership: firstSelection?.cue_membership ?? "none",
        first_click_was_target: firstSelection?.is_target ?? null,
        first_click_rt_ms: firstSelection?.rt_ms ?? null,
        localization_rt_ms: round(judgmentAt),
        judgment_rt_ms: round(judgmentAt),
        rating_rt_ms: trial.ask_ratings ? round(endedAt - judgmentAt) : null,
        total_rt_ms: round(endedAt),
        fixation_planned_ms: 500,
        fixation_actual_ms: fixationActualDuration === null ? null : round(fixationActualDuration),
        instruction_review_count: instructionReviewCount,
        instruction_review_time_ms: round(instructionReviewDuration),
        judgment_confidence: ratings.confidence ?? null,
        ai_output_trust: ratings.ai_output_trust ?? null,
        deep_cue_trust: ratings.deep_trust ?? null,
        light_cue_trust: ratings.light_trust ?? null,
        fullscreen_exit_count_total: window.__fullscreenExitCount || 0,
        visibility_hidden_count_total: window.__visibilityHiddenCount || 0
      });
    };

    const showFixationThenFinish = () => {
      const responseEndedAt = activeElapsed();
      fixationOverlay.hidden = false;
      const fixationStartedAt = performance.now();
      window.setTimeout(() => {
        fixationActualDuration = performance.now() - fixationStartedAt;
        finish(responseEndedAt);
      }, 500);
    };

    const showFeedback = () => {
      const selectedKeys = new Set([...selected.keys()]);
      const localizationCorrect = selectedKeys.size === targetKeys.size
        && [...targetKeys].every(key => selectedKeys.has(key));
      const judgmentCorrect = judgment === spec.correct_judgment;
      trialScreen.classList.add("post-response-stage");
      responseMain.hidden = true;
      feedbackSection.hidden = false;
      const status = localizationCorrect && judgmentCorrect ? "回答正确。" : "本题尚未完全正确。";
      const truth = spec.target_count === 0
        ? "矩阵中没有目标，应选择“合规”，且不点击任何位置。"
        : `矩阵中有 ${spec.target_count} 个目标，应点击全部目标并选择“不合规”。`;
      const aiFeedback = !spec.ai_present
        ? ""
        : spec.system_event === "false_alarm"
          ? " AI 标出的候选此次都不是目标，不能只凭候选作答。"
          : spec.system_event === "correct_rejection"
            ? " AI 此次没有标出候选，矩阵中也确实没有目标。"
            : " AI 候选覆盖了真实目标，但仍需按规则自行核查。";
      feedbackSection.querySelector(".feedback-text").textContent = `${status}${truth}${aiFeedback}`;
      feedbackSection.querySelector(".feedback-continue").addEventListener("click", showFixationThenFinish, { once: true });
    };

    const ratingQuestions = [
      { key: "confidence", label: "对本次判断有多确定？" },
      ...(spec.ai_present ? [
        { key: "ai_output_trust", label: "对本次 AI 分析结果有多信任？" },
        ...(material.deepCue ? [{ key: "deep_trust", label: "对本次深红候选有多信任？" }] : []),
        ...(material.lightCue ? [{ key: "light_trust", label: "对本次浅红候选有多信任？" }] : [])
      ] : [])
    ];

    const showRatings = () => {
      trialScreen.classList.add("post-response-stage");
      responseMain.hidden = true;
      ratingSection.hidden = false;
      ratingSection.classList.toggle("single-rating", ratingQuestions.length === 1);
      const list = ratingSection.querySelector(".rating-list");
      ratingQuestions.forEach(question => {
        const row = document.createElement("div");
        row.className = "rating-row";
        row.innerHTML = `<span>${question.label}</span><div class="rating-buttons"></div>`;
        const choices = row.querySelector(".rating-buttons");
        for (let value = 1; value <= 5; value += 1) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = value;
          button.addEventListener("click", () => {
            ratings[question.key] = value;
            [...choices.children].forEach(choice => choice.classList.toggle("selected", choice === button));
            ratingSection.querySelector(".submit-rating").disabled = ratingQuestions.some(item => !ratings[item.key]);
          });
          choices.append(button);
        }
        list.append(row);
      });
      ratingSection.querySelector(".submit-rating").addEventListener("click", showFixationThenFinish, { once: true });
    };

    displayElement.querySelectorAll("[data-judgment]").forEach(button => {
      button.addEventListener("click", () => {
        const value = button.dataset.judgment;
        if (value === "noncompliant" && selected.size === 0) {
          messageElement.textContent = "若判断为不合规，请先点击至少一个目标位置。";
          return;
        }
        if (value === "compliant" && selected.size > 0) {
          messageElement.textContent = "若判断为合规，请先取消已选择的位置。";
          return;
        }
        judgment = value;
        judgmentAt = activeElapsed();
        if (trial.practice) showFeedback();
        else if (trial.ask_ratings) showRatings();
        else showFixationThenFinish();
      });
    });
  }
}
