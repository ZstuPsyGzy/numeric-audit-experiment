const { ParameterType } = window.jsPsychModule;

export class ExperimentScreenPlugin {
  static info = {
    name: "experiment-screen",
    version: "1.1.0",
    parameters: {
      title: { type: ParameterType.STRING, default: "" },
      content: { type: ParameterType.HTML_STRING, default: "" },
      button_label: { type: ParameterType.STRING, default: "继续" },
      screen_class: { type: ParameterType.STRING, default: "" },
      check_question: { type: ParameterType.HTML_STRING, default: "" },
      check_options: { type: ParameterType.OBJECT, default: [] },
      check_correct: { type: ParameterType.STRING, default: "" },
      check_success: { type: ParameterType.STRING, default: "回答正确，可以继续。" },
      check_error: { type: ParameterType.STRING, default: "答案不正确，请再核查一次。" }
    },
    data: {
      rt: { type: ParameterType.INT },
      screen_title: { type: ParameterType.STRING }
    }
  };

  constructor(jsPsych) {
    this.jsPsych = jsPsych;
  }

  trial(displayElement, trial) {
    const startedAt = performance.now();
    const content = typeof trial.content === "function" ? trial.content() : trial.content;
    const hasCheck = Boolean(trial.check_question && trial.check_options?.length);
    displayElement.innerHTML = `
      <main class="timeline-screen ${trial.screen_class}">
        <section class="timeline-panel">
          <h1>${trial.title}</h1>
          <div class="timeline-content">${content}</div>
          ${hasCheck ? `<section class="instruction-check" aria-labelledby="instruction-check-title">
            <h2 id="instruction-check-title">理解检查</h2>
            <div class="instruction-check-question">${trial.check_question}</div>
            <div class="instruction-check-options">
              ${trial.check_options.map(option => `<button type="button" data-check-value="${option.value}">${option.label}</button>`).join("")}
            </div>
            <p class="instruction-check-feedback" role="status">请先完成判断。</p>
          </section>` : ""}
          <div class="timeline-actions">
            <button class="primary-button" type="button" data-action="continue" ${hasCheck ? "disabled" : ""}>${trial.button_label}</button>
          </div>
        </section>
      </main>`;
    const continueButton = displayElement.querySelector('[data-action="continue"]');
    let checkAttempts = 0;
    let checkCorrect = !hasCheck;
    if (hasCheck) {
      const feedback = displayElement.querySelector(".instruction-check-feedback");
      displayElement.querySelectorAll("[data-check-value]").forEach(button => {
        button.addEventListener("click", () => {
          checkAttempts += 1;
          displayElement.querySelectorAll("[data-check-value]").forEach(option => option.classList.remove("selected", "correct", "incorrect"));
          button.classList.add("selected");
          checkCorrect = button.dataset.checkValue === trial.check_correct;
          button.classList.add(checkCorrect ? "correct" : "incorrect");
          feedback.textContent = checkCorrect ? trial.check_success : trial.check_error;
          feedback.className = `instruction-check-feedback ${checkCorrect ? "success" : "error"}`;
          continueButton.disabled = !checkCorrect;
        });
      });
    }
    continueButton.addEventListener("click", () => {
      this.jsPsych.finishTrial({
        trial_kind: "screen",
        screen_title: trial.title,
        comprehension_check_present: hasCheck,
        comprehension_check_attempts: hasCheck ? checkAttempts : null,
        comprehension_check_correct: hasCheck ? checkCorrect : null,
        rt: Math.round(performance.now() - startedAt)
      });
    }, { once: true });
  }
}
