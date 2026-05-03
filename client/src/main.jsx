import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  CheckCircle2,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Database,
  FileText,
  Home,
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

const MOCK_QUESTION_COUNT = 70;
const MOCK_DURATION_SECONDS = 60 * 60;
const MOCK_PASSING_SCORE = 49;

function App() {
  const [page, setPage] = useState("dashboard");
  const api = useMemo(() => createApi(), []);

  return (
    <Shell page={page} setPage={setPage}>
      {page === "dashboard" && <Dashboard api={api} setPage={setPage} />}
      {page === "questions" && <QuestionBank api={api} />}
      {page === "batch" && <BatchAdd api={api} />}
      {page === "review" && <Reviewer api={api} />}
      {page === "practice" && <PracticeExam api={api} />}
      {page === "mock" && <MockExam api={api} />}
    </Shell>
  );
}

function createApi() {
  async function request(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.errors?.join(" ") || "Request failed.");
    return data;
  }

  return {
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

function Shell({ page, setPage, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const links = [
    { id: "dashboard", label: "Dashboard", icon: Home },
    { id: "questions", label: "Question Bank", icon: Database },
    { id: "batch", label: "Batch Add", icon: Upload },
    { id: "review", label: "Reviewer Mode", icon: BookOpen },
    { id: "practice", label: "Practice Exam", icon: ClipboardList },
    { id: "mock", label: "Mock Exam", icon: FileText }
  ];

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <div className="brand-block">
            <span>ALPS</span>
            <strong>Review Hub</strong>
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}
          </button>
        </div>
        <nav>
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <button key={link.id} className={page === link.id ? "active" : ""} onClick={() => setPage(link.id)}>
                <Icon size={18} />
                <span className="nav-label">{link.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="user-block">
          <div>
            <strong>Admin</strong>
            <span>Open mode</span>
          </div>
        </div>
      </aside>
      <section className="content">{children}</section>
    </div>
  );
}

function Dashboard({ api, setPage }) {
  const [total, setTotal] = useState(0);
  const [latestAttempt, setLatestAttempt] = useState(null);
  const [markedQuestions, setMarkedQuestions] = useState([]);

  useEffect(() => {
    Promise.all([api.questions(), api.practiceAttempts(1), api.questions({ marked: "true" })])
      .then(([questionData, attemptData, markedData]) => {
        setTotal(questionData.questions.length);
        setLatestAttempt(attemptData.attempts[0] || null);
        setMarkedQuestions(markedData.questions);
      })
      .catch(() => {
        setTotal(0);
        setLatestAttempt(null);
        setMarkedQuestions([]);
      });
  }, [api]);

  const latestPercentage = latestAttempt?.total_items
    ? Math.round((latestAttempt.score / latestAttempt.total_items) * 100)
    : 0;

  return (
    <Page title="Dashboard" subtitle="Compact academic overview for SAP MM ALPS review work.">
      <div className="metric-grid dashboard-metrics">
        <Metric label="Total Questions" value={total} />
        <Metric
          label="Latest Score"
          value={latestAttempt ? `${latestAttempt.score}/${latestAttempt.total_items}` : "--"}
        />
        <Metric label="Passing Target" value="49/70" />
        <Metric label="Marked For Review" value={markedQuestions.length} />
      </div>

      <div className="dashboard-layout">
        <section className="panel-card exam-card">
          <div className="section-head">
            <div>
              <span className="eyebrow">Final Exam</span>
              <h2>May 7, 2026</h2>
            </div>
            <Clock size={20} />
          </div>
          <div className="exam-grid">
            <InfoItem label="Time" value="1:30 PM" />
            <InfoItem label="Items" value="70" />
            <InfoItem label="Duration" value="1 hour" />
            <InfoItem label="Passing Score" value="49" />
          </div>
        </section>

        <section className="panel-card progress-card">
          <div className="section-head">
            <div>
              <span className="eyebrow">Study Progress</span>
              <h2>Review Progress</h2>
            </div>
            <strong>{latestPercentage}%</strong>
          </div>
          <div className="progress-track" aria-label="Review Progress">
            <span style={{ width: `${latestPercentage}%` }} />
          </div>
          <p className="muted">
            {latestAttempt ? "Based on your latest completed practice attempt." : "Complete a practice attempt to update progress."}
          </p>
        </section>

        <section className="panel-card marked-card">
          <div className="section-head">
            <div>
              <span className="eyebrow">Review Later</span>
              <h2>Marked Questions</h2>
            </div>
            <Star size={20} fill={markedQuestions.length ? "currentColor" : "none"} />
          </div>
          {markedQuestions.length ? (
            <ul className="marked-list">
              {markedQuestions.map((question) => (
                <li key={question.id}>
                  <span>{question.question}</span>
                  <small>{question.category} - {question.difficulty}</small>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-inline">No marked questions yet</div>
          )}
        </section>
      </div>

      <div className="action-row">
        <button className="primary inline-action" onClick={() => setPage("review")}>
          <BookOpen size={18} /> Start Review
        </button>
        <button className="inline-action" onClick={() => setPage("practice")}>
          <ClipboardList size={18} /> Practice Exam
        </button>
        <button className="inline-action" onClick={() => setPage("mock")}>
          <FileText size={18} /> Mock Exam
        </button>
      </div>
    </Page>
  );
}

function InfoItem({ label, value }) {
  return (
    <div className="info-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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

function TypeBadge({ type }) {
  return <span className={`type-badge ${type}`}>{labelType(type)}</span>;
}

function QuestionBank({ api }) {
  const [questions, setQuestions] = useState([]);
  const [filters, setFilters] = useState({ search: "", category: "" });
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  async function load() {
    const [questionData, categoryData] = await Promise.all([api.questions(filters), api.categories()]);
    setQuestions(questionData.questions);
    setCategories(categoryData.categories);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [filters.search, filters.category]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters.search, filters.category]);

  const totalPages = Math.max(1, Math.ceil(questions.length / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const visibleQuestions = questions.slice(pageStart, pageStart + pageSize);
  const emptyRows = Math.max(0, pageSize - visibleQuestions.length);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

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
            {visibleQuestions.map((q) => (
              <tr key={q.id}>
                <td data-label="Question">{q.question}</td>
                <td data-label="Type"><TypeBadge type={q.type} /></td>
                <td data-label="Answer">{q.correct_answer}</td>
                <td data-label="Category">{q.category}</td>
                <td data-label="Difficulty">{q.difficulty}</td>
                <td className="row-actions">
                  <button onClick={() => setEditing(q)}>Edit</button>
                  <button className="danger" onClick={() => remove(q.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {!visibleQuestions.length && (
              <tr className="placeholder-row">
                <td colSpan="6">No questions found.</td>
              </tr>
            )}
            {Array.from({ length: visibleQuestions.length ? emptyRows : emptyRows - 1 }).map((_, index) => (
              <tr className="placeholder-row" key={`empty-${index}`} aria-hidden="true">
                <td colSpan="6">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          {questions.length
            ? `Showing ${pageStart + 1}-${Math.min(pageStart + pageSize, questions.length)} of ${questions.length}`
            : "0 questions"}
        </span>
        <div className="pagination-controls">
          <button onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))} disabled={currentPage === 1}>
            <ChevronLeft size={16} /> Previous
          </button>
          <span>Page {currentPage} of {totalPages}</span>
          <button
            onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
            disabled={currentPage === totalPages}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
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
  const [error, setError] = useState("");

  async function previewBatch() {
    setMessage("");
    setError("");
    try {
      setPreview(await api.batchPreview(text));
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveBatch() {
    setMessage("");
    setError("");
    try {
      const result = await api.batchSave(text);
      setMessage(
        result.savedCount
          ? `Saved ${result.savedCount} valid question(s).`
          : "No valid questions found to save."
      );
      setPreview(await api.batchPreview(text));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Page title="Batch Add" subtitle="Paste formatted questions, preview validation, and save valid rows only.">
      <div className="split">
        <textarea
          className="batch-input"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setMessage("");
            setError("");
          }}
        />
        <div className="batch-actions">
          <button onClick={previewBatch} disabled={!text.trim()}>Preview</button>
          <button className="primary" onClick={saveBatch} disabled={!text.trim()}>
            Save Valid
          </button>
          {message && <p className="success">{message}</p>}
          {error && <p className="error">{error}</p>}
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
              <TypeBadge type={current.type} />
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

function MockExam({ api }) {
  const [view, setView] = useState("setup");
  const [availableCount, setAvailableCount] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [selectedByQuestion, setSelectedByQuestion] = useState({});
  const [remainingSeconds, setRemainingSeconds] = useState(MOCK_DURATION_SECONDS);
  const [startedAt, setStartedAt] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const completingRef = useRef(false);

  useEffect(() => {
    api.questions()
      .then((data) => setAvailableCount(data.questions.length))
      .catch(() => setAvailableCount(null));
  }, [api]);

  useEffect(() => {
    if (view !== "exam" || result) return;
    if (remainingSeconds <= 0) {
      completeMock(true);
      return;
    }
    const timer = setInterval(() => setRemainingSeconds((seconds) => Math.max(seconds - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [view, remainingSeconds, result]);

  async function startMock() {
    setError("");
    try {
      const data = await api.questions();
      if (!data.questions.length) {
        setError("No questions are available for the mock exam.");
        return;
      }

      const selectedQuestions = shuffleArray(data.questions).slice(0, Math.min(MOCK_QUESTION_COUNT, data.questions.length));
      setAvailableCount(data.questions.length);
      setQuestions(selectedQuestions);
      setIndex(0);
      setSelectedByQuestion({});
      setRemainingSeconds(MOCK_DURATION_SECONDS);
      setStartedAt(Date.now());
      setResult(null);
      completingRef.current = false;
      setView("exam");
    } catch (err) {
      setError(err.message);
    }
  }

  function updateSelected(questionId, value) {
    setSelectedByQuestion({ ...selectedByQuestion, [questionId]: value });
  }

  function clearCurrent() {
    const current = questions[index];
    if (!current) return;
    const next = { ...selectedByQuestion };
    delete next[current.id];
    setSelectedByQuestion(next);
  }

  function completeMock(timedOut = false) {
    if (!questions.length || completingRef.current) return;
    completingRef.current = true;

    const completedAt = Date.now();
    const durationSeconds = Math.min(
      MOCK_DURATION_SECONDS,
      Math.max(0, Math.round((completedAt - (startedAt || completedAt)) / 1000))
    );
    const answers = questions.map((question, position) => {
      const selectedAnswer = normalizeMockAnswer(selectedByQuestion[question.id] || "", question.type);
      const isCorrect = Boolean(selectedAnswer) && gradeMockAnswer(selectedAnswer, question.correct_answer, question.type);
      return {
        ...question,
        position: position + 1,
        selected_answer: selectedAnswer,
        is_correct: isCorrect
      };
    });
    const score = answers.filter((answer) => answer.is_correct).length;

    setResult({
      timed_out: timedOut,
      duration_seconds: timedOut ? MOCK_DURATION_SECONDS : durationSeconds,
      answers,
      summary: {
        score,
        total_items: questions.length,
        correct_answers: score,
        wrong_answers: questions.length - score,
        percentage: questions.length ? Math.round((score / questions.length) * 100) : 0,
        passed: score >= MOCK_PASSING_SCORE
      }
    });
    setView("results");
  }

  if (view === "results" && result) {
    return <MockResults result={result} restart={() => setView("setup")} />;
  }

  if (view === "exam") {
    const current = questions[index];
    const selected = current ? selectedByQuestion[current.id] || "" : "";
    const answeredCount = questions.filter((question) => String(selectedByQuestion[question.id] || "").trim()).length;

    return (
      <Page title="Mock Exam" subtitle="Answer like a real test paper. Results appear only after submission.">
        <Toolbar>
          <span className="status-pill">{index + 1} of {questions.length}</span>
          <span className="status-pill">{answeredCount} answered</span>
          <span className={`status-pill ${remainingSeconds <= 300 ? "urgent" : ""}`}>
            <Clock size={16} /> {formatSeconds(remainingSeconds)}
          </span>
          <span className="status-pill">Passing: {MOCK_PASSING_SCORE}/{MOCK_QUESTION_COUNT}</span>
        </Toolbar>

        <div className="mock-layout">
          {current && (
            <article className="flashcard mock-card">
              <div className="flashcard-meta">
                <span>{current.category} - {current.difficulty}</span>
                <TypeBadge type={current.type} />
              </div>
              <h2>{current.question}</h2>
              <AnswerInput
                question={current}
                selected={selected}
                locked={false}
                onSelect={(value) => updateSelected(current.id, value)}
              />
              {error && <p className="error">{error}</p>}
              <div className="review-actions">
                <button onClick={() => setIndex(Math.max(index - 1, 0))} disabled={index === 0}>
                  Previous
                </button>
                <button onClick={clearCurrent} disabled={!selected}>
                  Clear Answer
                </button>
                <button onClick={() => setIndex(Math.min(index + 1, questions.length - 1))} disabled={index === questions.length - 1}>
                  Next
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    if (confirm("Submit mock exam now? Unanswered questions will be marked wrong.")) completeMock(false);
                  }}
                >
                  Submit Exam
                </button>
              </div>
            </article>
          )}

          <aside className="panel-card mock-palette">
            <div className="section-head">
              <div>
                <span className="eyebrow">Question Navigator</span>
                <h2>{answeredCount}/{questions.length} answered</h2>
              </div>
            </div>
            <div className="question-palette">
              {questions.map((question, questionIndex) => (
                <button
                  key={question.id}
                  className={[
                    "palette-button",
                    questionIndex === index ? "current" : "",
                    selectedByQuestion[question.id] ? "answered" : ""
                  ].join(" ")}
                  onClick={() => setIndex(questionIndex)}
                >
                  {questionIndex + 1}
                </button>
              ))}
            </div>
          </aside>
        </div>
      </Page>
    );
  }

  return (
    <Page title="Mock Exam" subtitle="Simulate the final exam with 70 randomized questions and a 1-hour timer.">
      <section className="setup-panel mock-setup">
        <div className="metric-grid">
          <Metric label="Questions" value={MOCK_QUESTION_COUNT} />
          <Metric label="Timer" value="1:00" />
          <Metric label="Passing Score" value={`${MOCK_PASSING_SCORE}/${MOCK_QUESTION_COUNT}`} />
        </div>
        <div className="result-banner">
          <FileText size={20} />
          <span>
            {availableCount === null
              ? "Checking question bank..."
              : `${Math.min(MOCK_QUESTION_COUNT, availableCount)} questions will be drawn from ${availableCount} available questions.`}
          </span>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="primary inline-action" onClick={startMock}>
          <Clock size={18} /> Start 1-Hour Mock Exam
        </button>
      </section>
    </Page>
  );
}

function MockResults({ result, restart }) {
  const { summary, answers } = result;
  return (
    <Page title="Mock Exam Results" subtitle="Score summary and answer review after submission.">
      <div className="metric-grid dashboard-metrics">
        <Metric label="Score" value={`${summary.score}/${summary.total_items}`} />
        <Metric label="Percentage" value={`${summary.percentage}%`} />
        <Metric label="Status" value={summary.passed ? "Passed" : "Review"} />
        <Metric label="Time Used" value={formatSeconds(result.duration_seconds || 0)} />
      </div>
      <div className={`result-banner ${summary.passed ? "passed" : "not-passed"}`}>
        <Trophy size={20} />
        <span>
          {summary.passed ? "Passed" : "Below target"} - {summary.correct_answers} correct, {summary.wrong_answers} wrong
          {result.timed_out ? " - time expired" : ""}
        </span>
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
              <tr key={answer.id}>
                <td data-label="#">{answer.position}</td>
                <td data-label="Question">{answer.question}</td>
                <td data-label="Your Answer">{answer.selected_answer || "--"}</td>
                <td data-label="Correct Answer">{answer.correct_answer}</td>
                <td data-label="Result">
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
        Start Another Mock Exam
      </button>
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

function shuffleArray(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function normalizeMockAnswer(answer, type) {
  const trimmed = String(answer || "").trim();
  if (type === "multiple_choice") return trimmed.toUpperCase();
  if (type === "true_false") {
    const lowered = trimmed.toLowerCase();
    if (lowered === "true") return "True";
    if (lowered === "false") return "False";
  }
  return trimmed;
}

function gradeMockAnswer(selectedAnswer, correctAnswer, type) {
  const expected = normalizeMockAnswer(correctAnswer, type);
  if (type === "identification") return selectedAnswer.toLowerCase() === expected.toLowerCase();
  return selectedAnswer === expected;
}

const sampleBatch = `Question: What is ERP?
A. Inventory system
B. Integrated business system
C. Accounting tool
D. Warehouse system
Answer: B
Category: SAP Basics
Difficulty: easy
Explanation: ERP integrates business processes.

Question: What does PO mean?
Answer: Purchase Order
Category: Procurement
Difficulty: easy`;

createRoot(document.getElementById("root")).render(<App />);
