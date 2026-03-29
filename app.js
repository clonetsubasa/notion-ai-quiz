// === Notion AI Quiz - App Logic ===

(function () {
  'use strict';

  // --- State ---
  let currentQuestion = 0;
  let answers = []; // { questionId, correct, userAnswer }
  let multiSelections = new Set();

  // --- DOM helpers ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function showScreen(id) {
    $$('.screen').forEach((s) => s.classList.remove('active'));
    $(`#${id}`).classList.add('active');
  }

  // --- Session / localStorage ---
  const STORAGE_KEY = 'quizUser';
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  function getUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const user = JSON.parse(raw);
      if (Date.now() - new Date(user.loginDate).getTime() > THIRTY_DAYS) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return user;
    } catch {
      return null;
    }
  }

  function saveUser(name, email) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name, email, loginDate: new Date().toISOString() })
    );
  }

  // --- Categories for landing badges (exclude open-claw) ---
  const VISIBLE_CATEGORIES = CATEGORIES.filter((c) => c.id !== 'open-claw');

  function getCategoryQuestionCount(catId) {
    return QUESTIONS.filter((q) => q.category === catId).length;
  }

  // --- Init ---
  function init() {
    const user = getUser();
    if (user) {
      renderLanding();
      showScreen('landing-screen');
    } else {
      showScreen('login-screen');
    }

    // Login handler
    $('#login-btn').addEventListener('click', handleLogin);
    $('#login-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('#login-email').focus();
    });
    $('#login-email').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });

    // Start quiz handler
    $('#start-quiz-btn').addEventListener('click', startQuiz);
  }

  function handleLogin() {
    const name = $('#login-name').value.trim();
    const email = $('#login-email').value.trim();
    if (!name || !email) return;
    saveUser(name, email);
    renderLanding();
    showScreen('landing-screen');
  }

  // --- Landing ---
  function renderLanding() {
    const grid = $('#badge-grid');
    grid.innerHTML = VISIBLE_CATEGORIES.map((cat) => {
      const count = getCategoryQuestionCount(cat.id);
      return `
        <div class="badge">
          <svg class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="${cat.icon}"></path>
          </svg>
          <div class="badge-name">${cat.name}</div>
          <div class="badge-count">${count}問</div>
        </div>
      `;
    }).join('');
  }

  // --- Quiz ---
  function startQuiz() {
    currentQuestion = 0;
    answers = [];
    multiSelections = new Set();
    showScreen('quiz-screen');
    renderQuestion();
  }

  function renderQuestion() {
    const q = QUESTIONS[currentQuestion];
    const total = QUESTIONS.length;
    const catObj = CATEGORIES.find((c) => c.id === q.category);
    const catName = catObj ? catObj.name : q.category;

    // Progress
    $('#progress-text').textContent = `${currentQuestion + 1} / ${total}`;
    $('#progress-bar').style.width = `${((currentQuestion + 1) / total) * 100}%`;

    let optionsHTML = '';
    let extraHTML = '';

    if (q.type === 'choice') {
      optionsHTML = `<div class="options-list">${q.options
        .map(
          (opt, i) => `
        <button class="option-btn" data-index="${i}">
          <span class="option-letter">${String.fromCharCode(65 + i)}</span>
          <span>${escapeHTML(opt)}</span>
        </button>`
        )
        .join('')}</div>`;
    } else if (q.type === 'multi') {
      optionsHTML = `<div class="options-list">${q.options
        .map(
          (opt, i) => `
        <button class="option-btn multi" data-index="${i}">
          <span class="option-check"></span>
          <span>${escapeHTML(opt)}</span>
        </button>`
        )
        .join('')}</div>
        <div class="multi-submit">
          <button class="btn btn-start btn-full" id="multi-submit-btn">回答する</button>
        </div>`;
    } else if (q.type === 'free') {
      optionsHTML = `
        <textarea class="free-text-area" id="free-answer" placeholder="ここに回答を入力してください"></textarea>
        <button class="btn btn-start btn-full" id="free-submit-btn">回答する</button>`;
    }

    const card = $('#question-card');
    card.innerHTML = `
      <div class="question-category">${escapeHTML(catName)}</div>
      <div class="question-text">${escapeHTML(q.question)}</div>
      ${optionsHTML}
      <div class="explanation-box" id="explanation-box">
        <div class="answer-result" id="answer-result"></div>
        <div class="correct-answer-display" id="correct-answer-display"></div>
        ${q.type === 'free' ? `<div class="explanation-label">模範解答</div><div class="model-answer">${escapeHTML(q.modelAnswer)}</div>` : ''}
        ${q.type === 'free' ? `
          <div class="explanation-label">自己評価</div>
          <div class="self-rate-buttons" id="self-rate-buttons">
            <button class="self-rate-btn got-it" data-rate="got-it">正解できた</button>
            <button class="self-rate-btn missed" data-rate="missed">重要なポイントを見落とした</button>
          </div>` : ''}
        <div class="explanation-label" style="${q.type === 'free' ? 'margin-top:16px' : ''}">解説</div>
        <div class="explanation-text">${escapeHTML(q.explanation)}</div>
      </div>
      <div class="next-btn-container" id="next-btn-container">
        <button class="btn btn-start" id="next-btn">${currentQuestion < total - 1 ? '次の問題へ' : '結果を見る'}</button>
      </div>`;

    // Bind events
    if (q.type === 'choice') {
      card.querySelectorAll('.option-btn').forEach((btn) => {
        btn.addEventListener('click', () => handleChoiceAnswer(q, btn));
      });
    } else if (q.type === 'multi') {
      multiSelections = new Set();
      card.querySelectorAll('.option-btn.multi').forEach((btn) => {
        btn.addEventListener('click', () => toggleMultiOption(btn));
      });
      $('#multi-submit-btn').addEventListener('click', () => handleMultiAnswer(q));
    } else if (q.type === 'free') {
      $('#free-submit-btn').addEventListener('click', () => handleFreeSubmit(q));
    }
  }

  // --- Choice answer ---
  function handleChoiceAnswer(q, clickedBtn) {
    const btns = $$('.option-btn');
    if (clickedBtn.classList.contains('disabled')) return;

    const selectedIndex = parseInt(clickedBtn.dataset.index);
    const isCorrect = selectedIndex === q.correctIndex;

    btns.forEach((b) => {
      b.classList.add('disabled');
      const idx = parseInt(b.dataset.index);
      if (idx === q.correctIndex) b.classList.add('correct');
      if (idx === selectedIndex && !isCorrect) b.classList.add('wrong');
    });

    answers.push({ questionId: q.id, correct: isCorrect, userAnswer: selectedIndex });
    showAnswerResult(isCorrect, `${String.fromCharCode(65 + q.correctIndex)}. ${q.options[q.correctIndex]}`);
    showExplanationAndNext();
  }

  // --- Multi-select ---
  function toggleMultiOption(btn) {
    const idx = parseInt(btn.dataset.index);
    if (multiSelections.has(idx)) {
      multiSelections.delete(idx);
      btn.classList.remove('selected');
    } else {
      multiSelections.add(idx);
      btn.classList.add('selected');
    }
  }

  function handleMultiAnswer(q) {
    if (multiSelections.size === 0) return;

    const selected = Array.from(multiSelections).sort();
    const correct = [...q.correctIndices].sort();
    const isCorrect = JSON.stringify(selected) === JSON.stringify(correct);

    const btns = $$('.option-btn.multi');
    btns.forEach((b) => {
      b.classList.add('disabled');
      const idx = parseInt(b.dataset.index);
      if (q.correctIndices.includes(idx)) b.classList.add('correct');
      if (multiSelections.has(idx) && !q.correctIndices.includes(idx)) b.classList.add('wrong');
    });

    $('#multi-submit-btn').style.display = 'none';
    const correctText = q.correctIndices.map((i) => q.options[i]).join('、');
    answers.push({ questionId: q.id, correct: isCorrect, userAnswer: selected });
    showAnswerResult(isCorrect, correctText);
    showExplanationAndNext();
  }

  // --- Free text ---
  function handleFreeSubmit(q) {
    const text = $('#free-answer').value.trim();
    if (!text) return;

    $('#free-answer').setAttribute('readonly', true);
    $('#free-submit-btn').style.display = 'none';

    // Show explanation with self-rate (don't show next yet)
    $('#explanation-box').classList.add('visible');

    // Self-rate buttons
    $('#self-rate-buttons').querySelectorAll('.self-rate-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rate = btn.dataset.rate;
        const isCorrect = rate === 'got-it';

        $('#self-rate-buttons').querySelectorAll('.self-rate-btn').forEach((b) => {
          b.classList.remove('selected');
          b.style.pointerEvents = 'none';
        });
        btn.classList.add('selected');

        answers.push({ questionId: q.id, correct: isCorrect, userAnswer: text });
        $('#next-btn-container').classList.add('visible');
        bindNextButton();
      });
    });
  }

  function showAnswerResult(isCorrect, correctAnswerText) {
    const resultEl = $('#answer-result');
    const displayEl = $('#correct-answer-display');
    if (isCorrect) {
      resultEl.innerHTML = '<span class="result-correct">✅ 正解！</span>';
    } else {
      resultEl.innerHTML = '<span class="result-wrong">❌ 不正解</span>';
    }
    displayEl.innerHTML = `<span class="correct-answer-label">正答：</span>${escapeHTML(correctAnswerText)}`;
  }

  function showExplanationAndNext() {
    $('#explanation-box').classList.add('visible');
    $('#next-btn-container').classList.add('visible');
    bindNextButton();
  }

  function bindNextButton() {
    const nextBtn = $('#next-btn');
    // Remove old listeners by cloning
    const newBtn = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(newBtn, nextBtn);
    newBtn.addEventListener('click', () => {
      currentQuestion++;
      if (currentQuestion < QUESTIONS.length) {
        renderQuestion();
      } else {
        renderReport();
        showScreen('report-screen');
      }
    });
  }

  // --- Mastery Report ---
  function getLevel(pct) {
    if (pct >= 85) return { key: 'architect', name: 'Architect', desc: '再構築し、他者に教えられるレベル' };
    if (pct >= 65) return { key: 'builder', name: 'Builder', desc: '確かな基盤があり、深掘りが次のステップ' };
    if (pct >= 40) return { key: 'explorer', name: 'Explorer', desc: '概念に触れているが、体系化が必要' };
    return { key: 'starter', name: 'Starter', desc: '学びの初期段階' };
  }

  function renderReport() {
    const totalCorrect = answers.filter((a) => a.correct).length;
    const totalQuestions = QUESTIONS.length;
    const pct = Math.round((totalCorrect / totalQuestions) * 100);
    const level = getLevel(pct);

    // Category breakdown (visible categories only)
    const catBreakdown = VISIBLE_CATEGORIES.map((cat) => {
      const catQs = QUESTIONS.filter((q) => q.category === cat.id);
      const catAnswers = answers.filter((a) => catQs.some((q) => q.id === a.questionId));
      const catCorrect = catAnswers.filter((a) => a.correct).length;
      const catPct = catQs.length > 0 ? Math.round((catCorrect / catQs.length) * 100) : 0;
      const colorClass = catPct >= 80 ? 'high' : catPct >= 50 ? 'mid' : 'low';
      return { name: cat.name, correct: catCorrect, total: catQs.length, pct: catPct, colorClass };
    });

    // Analysis
    const strengths = catBreakdown.filter((c) => c.pct >= 80).map((c) => c.name);
    const gaps = catBreakdown.filter((c) => c.pct < 50).map((c) => c.name);

    // Missed questions
    const missed = answers
      .filter((a) => !a.correct)
      .map((a) => {
        const q = QUESTIONS.find((qq) => qq.id === a.questionId);
        let correctText = '';
        let userText = '';
        if (q.type === 'choice') {
          correctText = q.options[q.correctIndex];
          userText = q.options[a.userAnswer];
        } else if (q.type === 'multi') {
          correctText = q.correctIndices.map((i) => q.options[i]).join(' / ');
          userText = a.userAnswer.map((i) => q.options[i]).join(' / ');
        } else {
          correctText = '模範解答を参照';
          userText = '';
        }
        return { id: q.id, question: q.question, correctText, userText };
      });

    // Priority actions based on gaps
    const actionItems = [];
    if (gaps.length > 0) {
      actionItems.push(`弱点カテゴリー（${gaps.join('、')}）の復習を優先する`);
    }
    actionItems.push('間違えた問題の解説を読み直し、理解を深める');
    if (pct < 65) {
      actionItems.push('Notion AIの基本機能を実際に手を動かして試す');
    }
    if (pct < 85) {
      actionItems.push('実業務での活用シーンを1つ選び、小さく始めてみる');
    }
    actionItems.push('1週間後に再チャレンジして成長を確認する');

    const html = `
      <div class="report-header">
        <div class="report-score">${pct}<span>%</span></div>
        <div class="report-detail">${totalCorrect} / ${totalQuestions} 正解</div>
        <div class="report-level ${level.key}">${level.name}</div>
        <div class="report-level-desc">${level.desc}</div>
      </div>

      <div class="breakdown-section">
        <h3>カテゴリー別スコア</h3>
        ${catBreakdown
          .map(
            (c) => `
          <div class="breakdown-item">
            <div class="breakdown-label">
              <span class="breakdown-name">${escapeHTML(c.name)}</span>
              <span class="breakdown-score">${c.correct}/${c.total} (${c.pct}%)</span>
            </div>
            <div class="breakdown-bar">
              <div class="breakdown-fill ${c.colorClass}" style="width: ${Math.max(c.pct, 3)}%"></div>
            </div>
          </div>`
          )
          .join('')}
      </div>

      <div class="analysis-section">
        ${
          strengths.length > 0
            ? `<div class="analysis-card card-strengths">
            <h4>強み</h4>
            <ul>${strengths.map((s) => `<li>${escapeHTML(s)}</li>`).join('')}</ul>
          </div>`
            : ''
        }
        ${
          gaps.length > 0
            ? `<div class="analysis-card card-gaps">
            <h4>改善ポイント</h4>
            <ul>${gaps.map((g) => `<li>${escapeHTML(g)}</li>`).join('')}</ul>
          </div>`
            : ''
        }
        <div class="analysis-card card-next">
          <h4>次のステップ</h4>
          <ul>
            <li>弱点カテゴリーに集中して学習を進める</li>
            <li>実際のNotionワークスペースで実践してみる</li>
            <li>定期的に再チャレンジして成長を測る</li>
          </ul>
        </div>
      </div>

      ${
        missed.length > 0
          ? `<div class="missed-section">
          <h3>間違えた問題</h3>
          ${missed
            .map(
              (m) => `
            <div class="missed-item">
              <div class="missed-q-num">Q${m.id}</div>
              <div class="missed-q-text">${escapeHTML(m.question)}</div>
              ${m.userText ? `<div class="missed-answer user-wrong">あなたの回答: <strong>${escapeHTML(m.userText)}</strong></div>` : ''}
              <div class="missed-answer correct-ans">正解: <strong>${escapeHTML(m.correctText)}</strong></div>
            </div>`
            )
            .join('')}
        </div>`
          : ''
      }

      <div class="action-plan">
        <h3>優先アクションプラン</h3>
        ${actionItems
          .map(
            (item, i) => `
          <div class="action-step">
            <span class="action-num">${i + 1}</span>
            <span class="action-text">${escapeHTML(item)}</span>
          </div>`
          )
          .join('')}
      </div>

      <div class="report-actions">
        <button class="btn btn-export" id="export-pdf-btn">PDF出力</button>
        <button class="btn btn-email" id="email-btn">メールで送信</button>
        <button class="btn btn-advice" id="advice-btn">しくみちゃんに相談</button>
        <button class="btn btn-secondary" id="retake-btn">もう一度挑戦</button>
      </div>`;

    $('#report-content').innerHTML = html;

    // Bind action buttons
    $('#export-pdf-btn').addEventListener('click', () => window.print());

    $('#email-btn').addEventListener('click', () => {
      const user = getUser();
      const date = new Date().toLocaleDateString('ja-JP');
      const subject = encodeURIComponent(
        `Notion AI Mastery Quiz - ${pct}% (${level.name}) - ${date}`
      );

      let body = `Notion AI Mastery Quiz 結果\n\n`;
      body += `スコア: ${pct}% (${totalCorrect}/${totalQuestions})\n`;
      body += `レベル: ${level.name} - ${level.desc}\n`;
      body += `名前: ${user ? user.name : ''}\n`;
      body += `日付: ${date}\n\n`;
      body += `--- カテゴリー別 ---\n`;
      catBreakdown.forEach((c) => {
        body += `${c.name}: ${c.pct}% (${c.correct}/${c.total})\n`;
      });
      if (missed.length > 0) {
        body += `\n--- 間違えた問題 ---\n`;
        missed.forEach((m) => {
          body += `Q${m.id}: ${m.question}\n`;
          if (m.userText) body += `あなたの回答: ${m.userText}\n`;
          body += `正解: ${m.correctText}\n\n`;
        });
      }

      const mailto = `mailto:${user ? user.email : ''}?subject=${subject}&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;
    });

    $('#advice-btn').addEventListener('click', () => {
      let text = `【Notion AI講座クイズ結果】\n`;
      text += `スコア: ${pct}% (${totalCorrect}/${totalQuestions}正解) - レベル: ${level.name}\n\n`;
      text += `■ カテゴリ別:\n`;
      catBreakdown.forEach((c) => {
        text += `- ${c.name}: ${c.pct}% (${c.correct}/${c.total})\n`;
      });
      if (gaps.length > 0) {
        text += `\n■ 弱点カテゴリ: ${gaps.join('、')}\n`;
      }
      if (missed.length > 0) {
        text += `\n■ 間違えた問題:\n`;
        missed.forEach((m) => {
          text += `Q${m.id}: ${m.question}\n`;
          text += `→ 正解: ${m.correctText}\n\n`;
        });
      }
      text += `このクイズ結果を元に、弱点を克服するための具体的な学習アドバイスをお願いします。`;

      navigator.clipboard.writeText(text).then(() => {
        showToast('結果をコピーしました！しくみちゃんに貼り付けてアドバイスをもらいましょう');
      });
    });

    $('#retake-btn').addEventListener('click', () => {
      startQuiz();
    });
  }

  // --- Utility ---
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Toast ---
  function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
  }

  // --- Boot ---
  document.addEventListener('DOMContentLoaded', init);
})();
