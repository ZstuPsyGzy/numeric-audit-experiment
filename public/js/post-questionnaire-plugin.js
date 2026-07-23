const { ParameterType } = window.jsPsychModule;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export class PostQuestionnairePlugin {
  static info = {
    name: "post-questionnaire",
    version: "1.0.0",
    parameters: {
      title: { type: ParameterType.STRING, default: "实验后问卷" },
      description: { type: ParameterType.HTML_STRING, default: "" },
      questionnaire_id: { type: ParameterType.STRING, default: "" },
      scale_name: { type: ParameterType.STRING, default: "" },
      scale_version: { type: ParameterType.STRING, default: "" },
      progress_label: { type: ParameterType.STRING, default: "" },
      questions: { type: ParameterType.OBJECT, default: [] },
      labels: { type: ParameterType.OBJECT, default: [] },
      button_label: { type: ParameterType.STRING, default: "提交并继续" }
    },
    data: {
      rt: { type: ParameterType.INT },
      questionnaire_id: { type: ParameterType.STRING },
      scale_name: { type: ParameterType.STRING },
      scale_version: { type: ParameterType.STRING },
      responses: { type: ParameterType.OBJECT },
      item_count: { type: ParameterType.INT },
      missing_count: { type: ParameterType.INT }
    }
  };

  constructor(jsPsych) {
    this.jsPsych = jsPsych;
  }

  trial(displayElement, trial) {
    const startedAt = performance.now();
    const labels = (trial.labels || []).map((label, index) => (
      typeof label === "object"
        ? { text: label.text, value: label.value ?? index + 1 }
        : { text: label, value: index + 1 }
    ));
    const questions = trial.questions || [];
    const scaleHeader = labels.map((label, index) => `
      <span class="questionnaire-scale-label" style="grid-column:${index + 2}">${escapeHtml(label.text)}</span>`).join("");
    const questionRows = questions.map((question, questionIndex) => `
      <div class="questionnaire-item" role="radiogroup" aria-labelledby="question-${questionIndex + 1}">
        <p id="question-${questionIndex + 1}"><span>${questionIndex + 1}</span>${escapeHtml(question.prompt)}</p>
        <div class="questionnaire-options" style="--option-count:${labels.length}">
          ${labels.map(label => `
            <label title="${escapeHtml(label.text)}">
              <input type="radio" name="${escapeHtml(question.name)}" value="${escapeHtml(label.value)}" required>
              <span>${escapeHtml(label.value)}</span>
            </label>`).join("")}
        </div>
      </div>`).join("");

    displayElement.innerHTML = `
      <main class="questionnaire-screen">
        <form class="questionnaire-panel" novalidate>
          <header>
            <div>
              <p>${escapeHtml(trial.progress_label)}</p>
              <h1>${escapeHtml(trial.title)}</h1>
            </div>
            <span>${questions.length}题</span>
          </header>
          <div class="questionnaire-description">${trial.description}</div>
          <div class="questionnaire-scale-head" style="--option-count:${labels.length}">
            <i></i>${scaleHeader}
          </div>
          <div class="questionnaire-items">${questionRows}</div>
          <footer>
            <p class="questionnaire-error" role="alert"></p>
            <button class="primary-button" type="submit">${escapeHtml(trial.button_label)}</button>
          </footer>
        </form>
      </main>`;

    const form = displayElement.querySelector("form");
    form.addEventListener("submit", event => {
      event.preventDefault();
      const responses = {};
      const missing = [];
      for (const question of questions) {
        const selected = form.querySelector(`input[name="${CSS.escape(question.name)}"]:checked`);
        if (!selected) missing.push(question.name);
        else responses[question.name] = Number(selected.value);
      }
      if (missing.length) {
        displayElement.querySelector(".questionnaire-error").textContent = `还有 ${missing.length} 题未作答，请完成后提交。`;
        const firstMissing = form.querySelector(`input[name="${CSS.escape(missing[0])}"]`);
        firstMissing?.closest(".questionnaire-item")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      form.querySelector("button[type=submit]").disabled = true;
      this.jsPsych.finishTrial({
        trial_kind: "questionnaire",
        questionnaire_id: trial.questionnaire_id,
        scale_name: trial.scale_name,
        scale_version: trial.scale_version,
        responses,
        item_count: questions.length,
        missing_count: 0,
        rt: Math.round(performance.now() - startedAt)
      });
    });
  }
}
