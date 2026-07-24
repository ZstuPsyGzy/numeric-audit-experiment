const { ParameterType } = window.jsPsychModule;

export class ExperimentScreenPlugin {
  static info = {
    name: "experiment-screen",
    version: "1.2.0",
    parameters: {
      title: { type: ParameterType.STRING, default: "" },
      content: { type: ParameterType.HTML_STRING, default: "" },
      button_label: { type: ParameterType.STRING, default: "继续" },
      back_pages: { type: ParameterType.OBJECT, default: [] },
      back_button_label: { type: ParameterType.STRING, default: "返回上一步" },
      screen_class: { type: ParameterType.STRING, default: "" },
      check_question: { type: ParameterType.HTML_STRING, default: "" },
      check_options: { type: ParameterType.OBJECT, default: [] },
      check_correct: { type: ParameterType.STRING, default: "" },
      check_success: { type: ParameterType.STRING, default: "回答正确，可以继续。" },
      check_error: { type: ParameterType.STRING, default: "答案不正确，请再核查一次。" }
    },
    data: {
      rt: { type: ParameterType.INT },
      screen_title: { type: ParameterType.STRING },
      instruction_back_clicks: { type: ParameterType.INT }
    }
  };

  constructor(jsPsych) {
    this.jsPsych = jsPsych;
  }

  trial(displayElement, trial) {
    const startedAt = performance.now();
    const content = typeof trial.content === "function" ? trial.content() : trial.content;
    const hasCheck = Boolean(trial.check_question && trial.check_options?.length);
    const backPages = Array.isArray(trial.back_pages)
      ? trial.back_pages.map(page => ({
        title: page.title,
        content: typeof page.content === "function" ? page.content() : page.content
      }))
      : [];
    const pages = [...backPages, { title: trial.title, content }];
    const currentPageIndex = pages.length - 1;
    let pageIndex = currentPageIndex;
    let backClicks = 0;
    let checkAttempts = 0;
    let checkCorrect = !hasCheck;
    let selectedCheckValue = "";
    let feedbackText = "请先完成判断。";
    let feedbackClass = "";

    const renderPage = () => {
      const page = pages[pageIndex];
      const atCurrentPage = pageIndex === currentPageIndex;
      displayElement.innerHTML = `
        <main class="timeline-screen ${trial.screen_class}">
          <section class="timeline-panel">
            <h1>${page.title}</h1>
            <div class="timeline-content">${page.content}</div>
            ${atCurrentPage && hasCheck ? `<section class="instruction-check" aria-labelledby="instruction-check-title">
              <h2 id="instruction-check-title">理解检查</h2>
              <div class="instruction-check-question">${trial.check_question}</div>
              <div class="instruction-check-options">
                ${trial.check_options.map(option => {
                  const stateClass = option.value === selectedCheckValue
                    ? `selected ${checkCorrect ? "correct" : "incorrect"}`
                    : "";
                  return `<button type="button" class="${stateClass}" data-check-value="${option.value}">${option.label}</button>`;
                }).join("")}
              </div>
              <p class="instruction-check-feedback ${feedbackClass}" role="status">${feedbackText}</p>
            </section>` : ""}
            <div class="timeline-actions">
              ${pageIndex > 0 ? `<button class="secondary-button" type="button" data-action="back">${trial.back_button_label}</button>` : ""}
              <button class="primary-button" type="button" data-action="continue" ${atCurrentPage && hasCheck && !checkCorrect ? "disabled" : ""}>${atCurrentPage ? trial.button_label : "下一步"}</button>
            </div>
          </section>
        </main>`;

      const continueButton = displayElement.querySelector('[data-action="continue"]');
      const backButton = displayElement.querySelector('[data-action="back"]');
      if (backButton) {
        backButton.addEventListener("click", () => {
          pageIndex -= 1;
          backClicks += 1;
          renderPage();
        }, { once: true });
      }
      if (atCurrentPage && hasCheck) {
      const feedback = displayElement.querySelector(".instruction-check-feedback");
      displayElement.querySelectorAll("[data-check-value]").forEach(button => {
        button.addEventListener("click", () => {
          checkAttempts += 1;
          selectedCheckValue = button.dataset.checkValue;
          displayElement.querySelectorAll("[data-check-value]").forEach(option => option.classList.remove("selected", "correct", "incorrect"));
          button.classList.add("selected");
          checkCorrect = button.dataset.checkValue === trial.check_correct;
          button.classList.add(checkCorrect ? "correct" : "incorrect");
          feedbackText = checkCorrect ? trial.check_success : trial.check_error;
          feedbackClass = checkCorrect ? "success" : "error";
          feedback.textContent = feedbackText;
          feedback.className = `instruction-check-feedback ${feedbackClass}`;
          continueButton.disabled = !checkCorrect;
        });
      });
      }
      continueButton.addEventListener("click", () => {
        if (!atCurrentPage) {
          pageIndex += 1;
          renderPage();
          return;
        }
        this.jsPsych.finishTrial({
          trial_kind: "screen",
          screen_title: trial.title,
          comprehension_check_present: hasCheck,
          comprehension_check_attempts: hasCheck ? checkAttempts : null,
          comprehension_check_correct: hasCheck ? checkCorrect : null,
          instruction_back_clicks: backClicks,
          rt: Math.round(performance.now() - startedAt)
        });
      }, { once: true });
    };

    renderPage();
  }
}
