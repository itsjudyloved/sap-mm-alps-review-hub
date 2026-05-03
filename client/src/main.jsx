import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  Database,
  Home,
  LogOut,
  Plus,
  Search,
  Star,
  Trophy,
  Upload,
  X,
  XCircle
} from "lucide-react";
import "./styles.css";

const emptyQuestion = {
  question: "",
  type: "multiple_choice",
  choice_a: "",
  choice_b: "",
  choice_c: "",
  choice_d: "",
  correct_answer: "",
  explanation: "",
  category: "",
  difficulty: "medium"
};

function App() {
  const [auth, setAuth] = useState(() => {
    const saved = localStorage.getItem("reviewHubAuth");
    return saved ? JSON.parse(saved) : null;
  });
  const [page, setPage] = useState("dashboard");

  const api = useMemo(() => createApi(auth?.token), [auth?.token]);

  function handleLogin(nextAuth) {
    localStorage.setItem("reviewHubAuth", JSON.stringify(nextAuth));
    setAuth(nextAuth);
    setPage("dashboard");
  }

  function logout() {
    localStorage.removeItem("reviewHubAuth");
    setAuth(null);
    setPage("dashboard");
  }

  if (!auth) return <Login onLogin={handleLogin} />;

  return (
    <Shell auth={auth} page={page} setPage={setPage} logout={logout}>
      {page === "dashboard" && <Dashboard api={api} setPage={setPage} />}
      {page === "questions" && auth.user.role === "admin" && <QuestionBank api={api} />}
      {page === "batch" && auth.user.role === "admin" && <BatchAdd api={api} />}
      {page === "review" && <Reviewer api={api} />}
      {page === "practice" && <PracticeExam api={api} />}
    </Shell>
  );
}

function createApi(token) {
  async function request(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.errors?.join(" ") || "Request failed.");
    return data;
  }

  return {
    login: (body) => request("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
    questions: (params = {}) => request(`/api/questions?${new URLSearchParams(clean(params))}`),
    categories: () => request("/api/categories"),
    createQuestion: (body) => request("/api/questions", { method: "POST", body: JSON.stringify(body) }),
    updateQuestion: (id, body) => request(`/api/questions/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    deleteQuestion: (id) => request(`/api/questions/${id}`, { method: "DELETE" }),
    batchPreview: (text) => request("/api/questions/batch-preview", { method: "POST", body: JSON.stringify({ text }) }),
    batchSave: (text) => request("/api/questions/batch-save", { method: "POST", body: JSON.stringify({ text }) }),
    mark: (id) => request(`/api/questions/${id}/mark`, { method: "POST" }),
    unmark: (id) => request(`/api/questions/${id}/mark`, { method: "DELETE" }),
    practiceAttempts: (limit = 5) => request(`/api/practice/attempts?limit=${limit}`),
    startPractice: (body) => request("/api/practice/start", { method: "POST", body: JSON.stringify(body) }),
    answerPractice: (attemptId, body) =>
      request(`/api/practice/${attemptId}/answer`, { method: "POST", body: JSON.stringify(body) }),
    completePractice: (attemptId, body = {}) =>
      request(`/api/practice/${attemptId}/complete`, { method: "POST", body: JSON.stringify(body) }),
    getPractice: (attemptId) => request(`/api/practice/${attemptId}`)
  };
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value));
}

function Login({ onLogin }) {
  const api = useMemo(() => createApi(), []);
  const [form, setForm] = useState({ username: "admin", password: "admin123" });
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      onLogin(await api.login(form));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={submit}>
        <div>
          <p className="eyebrow">SAP MM ALPS</p>
          <h1>Review Hub</h1>
          <p className="muted">Sign in to manage questions or review flashcards.</p>
        </div>
        <label>
          Username
          <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary">Sign In</button>
        <p className="hint">Admin: admin/admin123 - Student: student/student123</p>
      </form>
    </main>
  );
}

function Shell({ auth, page, setPage, logout, children }) {
  const links = [
    { id: "dashboard", label: "Dashboard", icon: Home, roles: ["admin", "student"] },
    { id: "questions", label: "Question Bank", icon: Database, roles: ["admin"] },
    { id: "batch", label: "Batch Add", icon: Upload, roles: ["admin"] },
    { id: "review", label: "Reviewer Mode", icon: BookOpen, roles: ["admin", "student"] },
    { id: "practice", label: "Practice Exam", icon: ClipboardList, roles: ["admin", "student"] }
  ].filter((link) => link.roles.includes(auth.user.role));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span>ALPS</span>
          <strong>Review Hub</strong>
        </div>
        <nav>
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <button key={link.id} className={page === link.id ? "active" : ""} onClick={() => setPage(link.id)}>
                <Icon size={18} />
                {link.label}
              </button>
            );
          })}
        </nav>
        <div className="user-block">
          <div>
            <strong>{auth.user.username}</strong>
            <span>{auth.user.role}</span>
          </div>
          <button className="icon-button" onClick={logout} title="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <section className="content">{children}</section>
    </div>
  );
}

function Dashboard({ api, setPage }) {
  const [total, setTotal] = useState(0);
  const [latestAttempt, setLatestAttempt] = useState(null);

  useEffect(() => {
    Promise.all([api.questions(), api.practiceAttempts(1)])
      .then(([questionData, attemptData]) => {
        setTotal(questionData.questions.length);
        setLatestAttempt(attemptData.attempts[0] || null);
      })
      .catch(() => {
        setTotal(0);
        setLatestAttempt(null);
      });
  }, [api]);

  return (
    <Page title="Dashboard" subtitle="Compact overview for review and practice work.">
      <div className="metric-grid">
        <Metric label="Total Questions" value={total} />
        <Metric
          label="Latest Score"
          value={latestAttempt ? `${latestAttempt.score}/${latestAttempt.total_items}` : "--"}
        />
        <Metric label="Weak Topics" value="Pending" />
      </div>
      <div className="action-row">
        <button className="primary inline-action" onClick={() => setPage("review")}>
          <BookOpen size={18} /> Start Review
        </button>
        <button className="inline-action" onClick={() => setPage("practice")}>
          <ClipboardList size={18} /> Practice Exam
        </button>
      </div>
    </Page>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function QuestionBank({ api }) {
  const [questions, setQuestions] = useState([]);
  const [filters, setFilters] = useState({ search: "", category: "" });
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    const [questionData, categoryData] = await Promise.all([api.questions(filters), api.categories()]);
    setQuestions(questionData.questions);
    setCategories(categoryData.categories);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [filters.search, filters.category]);

  async function remove(id) {
    if (!confirm("Delete this question?")) return;
    await api.deleteQuestion(id);
    await load();
  }

  return (
    <Page title="Question Bank" subtitle="Search, filter, add, edit, and delete reviewer questions.">
      <Toolbar>
        <div className="search-box">
          <Search size={16} />
          <input
            placeholder="Search questions"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
        <button className="primary" onClick={() => setEditing(emptyQuestion)}>
          <Plus size={16} /> Add
        </button>
      </Toolbar>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Question</th>
              <th>Type</th>
              <th>Answer</th>
              <th>Category</th>
              <th>Difficulty</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => (
              <tr key={q.id}>
                <td>{q.question}</td>
                <td>{labelType(q.type)}</td>
                <td>{q.correct_answer}</td>
                <td>{q.category}</td>
                <td>{q.difficulty}</td>
                <td className="row-actions">
                  <button onClick={() => setEditing(q)}>Edit</button>
                  <button className="danger" onClick={() => remove(q.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <QuestionModal api={api} question={editing} close={() => setEditing(null)} saved={load} />}
    </Page>
  );
}

function QuestionModal({ api, question, close, saved }) {
  const [form, setForm] = useState({ ...emptyQuestion, ...question });
  const [error, setError] = useState("");
  const isEdit = Boolean(question.id);

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      if (isEdit) await api.updateQuestion(question.id, form);
      else await api.createQuestion(form);
      await saved();
      close();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <div className="modal-head">
          <h2>{isEdit ? "Edit Question" : "Add Question"}</h2>
          <button type="button" className="icon-button" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <label>
          Question
          <textarea value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} />
        </label>
        <div className="form-grid">
          <label>
            Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="multiple_choice">Multiple Choice</option>
              <option value="true_false">True/False</option>
              <option value="identification">Identification</option>
            </select>
          </label>
          <label>
            Correct Answer
            <input value={form.correct_answer} onChange={(e) => setForm({ ...form, correct_answer: e.target.value })} />
          </label>
        </div>
        {form.type === "multiple_choice" && (
          <div className="choice-grid">
            {["a", "b", "c", "d"].map((letter) => (
              <label key={letter}>
                {letter.toUpperCase()}
                <input
                  value={form[`choice_${letter}`] || ""}
                  onChange={(e) => setForm({ ...form, [`choice_${letter}`]: e.target.value })}
                />
              </label>
            ))}
          </div>
        )}
        <div className="form-grid">
          <label>
            Category
            <input value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </label>
          <label>
            Difficulty
            <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
        </div>
        <label>
          Explanation
          <textarea value={form.explanation || ""} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button className="primary">{isEdit ? "Save" : "Create"}</button>
        </div>
      </form>
    </div>
  );
}

function BatchAdd({ api }) {
  const [text, setText] = useState(sampleBatch);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState("");

  async function previewBatch() {
    setMessage("");
    setPreview(await api.batchPreview(text));
  }

  async function saveBatch() {
    const result = await api.batchSave(text);
    setMessage(`Saved ${result.savedCount} valid question(s).`);
    setPreview(await api.batchPreview(text));
  }

  return (
    <Page title="Batch Add" subtitle="Paste formatted questions, preview validation, and save valid rows only.">
      <div className="split">
        <textarea className="batch-input" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="batch-actions">
          <button onClick={previewBatch}>Preview</button>
          <button className="primary" onClick={saveBatch} disabled={!preview?.validCount}>
            Save Valid
          </button>
          {message && <p className="success">{message}</p>}
        </div>
      </div>
      {preview && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Row</th>
                <th>Status</th>
                <th>Question</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.row}>
                  <td>{row.row}</td>
                  <td>{row.valid ? "Valid" : "Invalid"}</td>
                  <td>{row.question.question || "--"}</td>
                  <td>{row.errors.join(" ") || "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}

function Reviewer({ api }) {
  const [questions, setQuestions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState("");
  const [markedOnly, setMarkedOnly] = useState(false);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  async function load() {
    const [questionData, categoryData] = await Promise.all([
      api.questions({ category, marked: markedOnly ? "true" : "" }),
      api.categories()
    ]);
    setQuestions(questionData.questions);
    setCategories(categoryData.categories);
    setIndex(0);
    setRevealed(false);
  }

  useEffect(() => {
    load();
  }, [category, markedOnly]);

  const current = questions[index];

  async function toggleMark() {
    if (!current) return;
    if (current.marked) await api.unmark(current.id);
    else await api.mark(current.id);
    await load();
  }

  return (
    <Page title="Reviewer Mode" subtitle="Filter, reveal answers, and mark questions for later review.">
      <Toolbar>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={markedOnly} onChange={(e) => setMarkedOnly(e.target.checked)} />
          Marked only
        </label>
      </Toolbar>

      {!current ? (
        <div className="empty-state">No questions match this review set.</div>
      ) : (
        <article className="flashcard">
          <div className="flashcard-meta">
            <span>{index + 1} of {questions.length}</span>
            <span>{current.category} - {current.difficulty}</span>
          </div>
          <h2>{current.question}</h2>
          {current.type === "multiple_choice" && (
            <ol className="choices">
              {["a", "b", "c", "d"].map((letter) => (
                <li key={letter}><strong>{letter.toUpperCase()}.</strong> {current[`choice_${letter}`]}</li>
              ))}
            </ol>
          )}
          {revealed && (
            <div className="answer-panel">
              <strong>Answer: {current.correct_answer}</strong>
              {current.explanation && <p>{current.explanation}</p>}
            </div>
          )}
          <div className="review-actions">
            <button onClick={() => setIndex(Math.max(index - 1, 0))}>Previous</button>
            <button className="primary" onClick={() => setRevealed(!revealed)}>
              {revealed ? "Hide Answer" : "Show Answer"}
            </button>
            <button onClick={() => setIndex(Math.min(index + 1, questions.length - 1))}>Next</button>
            <button onClick={toggleMark}>
              <Star size={16} fill={current.marked ? "currentColor" : "none"} /> {current.marked ? "Unmark" : "Mark"}
            </button>
          </div>
        </article>
      )}
    </Page>
  );
}

function PracticeExam({ api }) {
  const [view, setView] = useState("setup");
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState({ count: 10, category: "", timer_minutes: "" });
  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [selectedByQuestion, setSelectedByQuestion] = useState({});
  const [feedbackByQuestion, setFeedbackByQuestion] = useState({});
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const completingRef = useRef(false);

  useEffect(() => {
    api.categories().then((data) => setCategories(data.categories)).catch(() => setCategories([]));
  }, [api]);

  useEffect(() => {
    if (view !== "exam" || !attempt?.timer_minutes || result) return;
    if (remainingSeconds <= 0) {
      completeAttempt(true);
      return;
    }
    const timer = setInterval(() => setRemainingSeconds((seconds) => Math.max(seconds - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [view, attempt?.timer_minutes, remainingSeconds, result]);

  async function startPractice(e) {
    e.preventDefault();
    setError("");
    try {
      const payload = {
        count: Number(settings.count) || 10,
        category: settings.category,
        timer_minutes: settings.timer_minutes ? Number(settings.timer_minutes) : null
      };
      const data = await api.startPractice(payload);
      setAttempt(data.attempt);
      setQuestions(data.questions);
      setIndex(0);
      setSelectedByQuestion({});
      setFeedbackByQuestion({});
      setRemainingSeconds(data.attempt.timer_minutes ? data.attempt.timer_minutes * 60 : null);
      setResult(null);
      setView("exam");
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitAnswer() {
    const current = questions[index];
    if (!current) return;
    const selected = selectedByQuestion[current.id];
    if (!selected || feedbackByQuestion[current.id]) return;

    setError("");
    try {
      const data = await api.answerPractice(attempt.id, {
        question_id: current.id,
        selected_answer: selected
      });
      setFeedbackByQuestion({ ...feedbackByQuestion, [current.id]: data.feedback });
    } catch (err) {
      setError(err.message);
    }
  }

  async function completeAttempt(timedOut = false) {
    if (!attempt || completingRef.current) return;
    completingRef.current = true;
    setError("");
    try {
      const data = await api.completePractice(attempt.id, { timed_out: timedOut });
      setResult(data);
      setView("results");
    } catch (err) {
      setError(err.message);
    } finally {
      completingRef.current = false;
    }
  }

  function moveNext() {
    if (index >= questions.length - 1) {
      completeAttempt(false);
      return;
    }
    setIndex(index + 1);
  }

  function updateSelected(questionId, value) {
    if (feedbackByQuestion[questionId]) return;
    setSelectedByQuestion({ ...selectedByQuestion, [questionId]: value });
  }

  if (view === "results" && result) {
    return <PracticeResults result={result} restart={() => setView("setup")} />;
  }

  if (view === "exam") {
    const current = questions[index];
    const feedback = current ? feedbackByQuestion[current.id] : null;
    const selected = current ? selectedByQuestion[current.id] || "" : "";
    const answeredCount = Object.keys(feedbackByQuestion).length;

    return (
      <Page title="Practice Exam" subtitle="Answer each item, lock it in, and review feedback instantly.">
        <Toolbar>
          <span className="status-pill">{index + 1} of {questions.length}</span>
          <span className="status-pill">{answeredCount} answered</span>
          {remainingSeconds !== null && (
            <span className={`status-pill ${remainingSeconds <= 30 ? "urgent" : ""}`}>
              <Clock size={16} /> {formatSeconds(remainingSeconds)}
            </span>
          )}
        </Toolbar>

        {current && (
          <article className="flashcard practice-card">
            <div className="flashcard-meta">
              <span>{current.category} - {current.difficulty}</span>
              <span>{labelType(current.type)}</span>
            </div>
            <h2>{current.question}</h2>
            <AnswerInput
              question={current}
              selected={selected}
              locked={Boolean(feedback)}
              onSelect={(value) => updateSelected(current.id, value)}
            />
            {feedback && (
              <div className={`answer-panel ${feedback.is_correct ? "correct" : "wrong"}`}>
                <strong>
                  {feedback.is_correct ? "Correct" : "Wrong"} - Answer: {feedback.correct_answer}
                </strong>
                {feedback.explanation && <p>{feedback.explanation}</p>}
              </div>
            )}
            {error && <p className="error">{error}</p>}
            <div className="review-actions">
              <button onClick={() => setIndex(Math.max(index - 1, 0))}>Previous</button>
              {!feedback ? (
                <button className="primary" onClick={submitAnswer} disabled={!selected}>
                  Submit Answer
                </button>
              ) : (
                <button className="primary" onClick={moveNext}>
                  {index >= questions.length - 1 ? "Finish" : "Next"}
                </button>
              )}
              <button onClick={() => completeAttempt(false)}>Finish Now</button>
            </div>
          </article>
        )}
      </Page>
    );
  }

  return (
    <Page title="Practice Exam" subtitle="Choose a randomized set and optional timer.">
      <form className="setup-panel" onSubmit={startPractice}>
        <div className="form-grid">
          <label>
            Number of Questions
            <input
              type="number"
              min="1"
              max="100"
              value={settings.count}
              onChange={(e) => setSettings({ ...settings, count: e.target.value })}
            />
          </label>
          <label>
            Category
            <select value={settings.category} onChange={(e) => setSettings({ ...settings, category: e.target.value })}>
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            Timer Minutes
            <input
              type="number"
              min="1"
              max="180"
              placeholder="Off"
              value={settings.timer_minutes}
              onChange={(e) => setSettings({ ...settings, timer_minutes: e.target.value })}
            />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="primary inline-action">
          <ClipboardList size={18} /> Start Practice
        </button>
      </form>
    </Page>
  );
}

function AnswerInput({ question, selected, locked, onSelect }) {
  if (question.type === "multiple_choice") {
    return (
      <div className="answer-options">
        {["a", "b", "c", "d"].map((letter) => {
          const value = letter.toUpperCase();
          return (
            <button
              key={letter}
              className={selected === value ? "selected" : ""}
              disabled={locked}
              onClick={() => onSelect(value)}
              type="button"
            >
              <strong>{value}.</strong> {question[`choice_${letter}`]}
            </button>
          );
        })}
      </div>
    );
  }

  if (question.type === "true_false") {
    return (
      <div className="answer-options two">
        {["True", "False"].map((value) => (
          <button
            key={value}
            className={selected === value ? "selected" : ""}
            disabled={locked}
            onClick={() => onSelect(value)}
            type="button"
          >
            {value}
          </button>
        ))}
      </div>
    );
  }

  return (
    <label>
      Answer
      <input value={selected} disabled={locked} onChange={(e) => onSelect(e.target.value)} />
    </label>
  );
}

function PracticeResults({ result, restart }) {
  const { summary, attempt, answers } = result;
  return (
    <Page title="Practice Results" subtitle="Score summary and answer review.">
      <div className="metric-grid">
        <Metric label="Score" value={`${summary.score}/${summary.total_items}`} />
        <Metric label="Percentage" value={`${summary.percentage}%`} />
        <Metric label="Elapsed" value={formatSeconds(attempt.duration_seconds || 0)} />
      </div>
      <div className="result-banner">
        <Trophy size={20} />
        <span>{summary.correct_answers} correct, {summary.wrong_answers} wrong{attempt.timed_out ? " - timed out" : ""}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Question</th>
              <th>Your Answer</th>
              <th>Correct Answer</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {answers.map((answer) => (
              <tr key={answer.question_id}>
                <td>{answer.position}</td>
                <td>{answer.question}</td>
                <td>{answer.selected_answer || "--"}</td>
                <td>{answer.correct_answer}</td>
                <td>
                  {answer.is_correct ? (
                    <span className="result-tag correct"><CheckCircle2 size={16} /> Correct</span>
                  ) : (
                    <span className="result-tag wrong"><XCircle size={16} /> Wrong</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="primary inline-action top-space" onClick={restart}>
        Start Another Practice
      </button>
    </Page>
  );
}

function Page({ title, subtitle, children }) {
  return (
    <>
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </header>
      {children}
    </>
  );
}

function Toolbar({ children }) {
  return <div className="toolbar">{children}</div>;
}

function labelType(type) {
  return type.replace("_", " ");
}

function formatSeconds(totalSeconds) {
  const seconds = Math.max(Number(totalSeconds) || 0, 0);
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

const sampleBatch = `Question: What is ERP?
Type: multiple_choice
A. Inventory system
B. Integrated business system
C. Accounting tool
D. Warehouse system
Answer: B
Category: SAP Basics
Difficulty: easy
Explanation: ERP integrates business processes.`;

createRoot(document.getElementById("root")).render(<App />);
