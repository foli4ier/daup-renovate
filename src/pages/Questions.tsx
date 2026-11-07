import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { copy } from "../copy";
import { answersForSkip, bestGuess, unanswered } from "../data/questions";
import { ActionBar, TopBar } from "../components/Chrome";
import { activePlan } from "../state/select";
import { useRenovate } from "../state/store";

export default function Questions() {
  const { zoneId = "" } = useParams();
  const navigate = useNavigate();
  const { state, dispatch, generate, busyZoneId } = useRenovate();
  const plan = activePlan(state);
  const zone = state.zones.find((item) => item.id === zoneId);
  const [queue] = useState(() => (zone ? unanswered(zone.key, zone.answers) : []));
  const pending = queue;
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [hint, setHint] = useState("");
  const question = pending[index];

  if (!plan || !zone) {
    return (
      <div className="page">
        <TopBar />
        <p>That zone is not on this plan.</p>
      </div>
    );
  }

  const currentPlan = plan;

  async function finish(answers: { questionId: string; text: string }[]) {
    for (const answer of answers) {
      dispatch({ type: "save-answer", zoneId, questionId: answer.questionId, text: answer.text });
    }
    dispatch({ type: "questions-pending", planId: currentPlan.id, zoneId, pending: false });
    const result = await generate(zoneId);
    if (result.ok) navigate(`/gallery/${zoneId}?picture=${result.proposalId}`);
    else navigate(`/gallery/${zoneId}`);
  }

  function currentAnswer(): string | null {
    if (typing && typed.trim()) return typed.trim();
    return picked;
  }

  if (!question) {
    return (
      <div className="page has-action">
        <TopBar title={zone.name} />
        <p>Answers are saved on this zone.</p>
        <ActionBar>
          <button className="btn btn-primary btn-wide" type="button" onClick={() => void finish([])}>
            {copy.generate}
          </button>
        </ActionBar>
      </div>
    );
  }

  const last = index === pending.length - 1;

  return (
    <div className="page has-action">
      <TopBar title={zone.name} />
      <p className="count">{copy.questionCount(index + 1, pending.length)}</p>
      <article className="card">
        <h2>{question.prompt}</h2>
        <div className="stack" style={{ marginTop: 12 }}>
          {question.options.map((option) => (
            <button
              key={option}
              type="button"
              className="choice"
              aria-pressed={picked === option && !typing}
              onClick={() => {
                setPicked(option);
                setTyping(false);
                setHint("");
              }}
            >
              {option}
            </button>
          ))}
        </div>
        <button
          className="text-btn"
          type="button"
          onClick={() => {
            setTyping(true);
            setPicked(null);
          }}
        >
          {copy.typeAnswer}
        </button>
        {typing ? (
          <label className="field">
            Your answer
            <input value={typed} onChange={(event) => setTyped(event.target.value)} />
          </label>
        ) : null}
      </article>
      {hint ? <p className="meta">{hint}</p> : null}
      <button
        className="text-btn"
        type="button"
        onClick={() => {
          const answers = answersForSkip(zone.key, pending, zone.answers, currentAnswer() ? { questionId: question.id, text: currentAnswer() ?? "" } : null);
          void finish(answers);
        }}
      >
        {copy.skipQuestions}
      </button>
      <ActionBar>
        <button
          className="btn btn-primary btn-wide"
          type="button"
          disabled={busyZoneId === zoneId}
          onClick={() => {
            const answer = currentAnswer();
            if (!answer) {
              setHint(copy.pickAnswer);
              return;
            }
            dispatch({ type: "save-answer", zoneId, questionId: question.id, text: answer });
            if (!last) {
              setIndex((value) => value + 1);
              setPicked(null);
              setTyped("");
              setTyping(false);
              setHint("");
              return;
            }
            const earlier = pending.slice(0, index).map((item) => {
              const saved = zone.answers.find((answerItem) => answerItem.questionId === item.id);
              return { questionId: item.id, text: saved?.text ?? bestGuess(zone.key, item.id) };
            });
            void finish([...earlier, { questionId: question.id, text: answer }]);
          }}
        >
          {last ? copy.answer : copy.next}
        </button>
      </ActionBar>
    </div>
  );
}
