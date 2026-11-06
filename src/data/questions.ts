export type Question = {
  id: string;
  prompt: string;
  options: string[];
};

const QUESTIONS: Record<string, Question[]> = {
  living: [
    {
      id: "boards",
      prompt: "Is there wood under the carpet?",
      options: ["Yes. Boards.", "No. Concrete.", "Not sure."],
    },
    {
      id: "fireplace",
      prompt: "Keep the stone fireplace?",
      options: ["Keep it.", "Take it out.", "Not sure."],
    },
  ],
  kitchen: [
    {
      id: "use",
      prompt: "Home kitchen or catering kitchen?",
      options: ["Home kitchen.", "Catering kitchen."],
    },
    {
      id: "tiles",
      prompt: "Keep the floor tiles?",
      options: ["Keep the tiles.", "New floor.", "Not sure."],
    },
  ],
  front: [
    {
      id: "stone",
      prompt: "Keep the stone the same colour?",
      options: ["Keep the colour.", "Lighten the stone.", "Not sure."],
    },
  ],
  bath: [
    {
      id: "bath",
      prompt: "Keep the bath?",
      options: ["Keep the bath.", "New bath.", "Not sure."],
    },
  ],
  back: [
    {
      id: "ground",
      prompt: "What is underfoot in the back yard?",
      options: ["Concrete.", "Lawn.", "Not sure."],
    },
    {
      id: "wall",
      prompt: "Repaint the boundary wall?",
      options: ["Repaint it.", "Leave the wall.", "Not sure."],
    },
  ],
  side: [
    {
      id: "path",
      prompt: "Keep the flagstone path?",
      options: ["Keep it.", "New paving.", "Not sure."],
    },
  ],
  sun: [
    {
      id: "floor",
      prompt: "What should the floor become?",
      options: ["Vinyl plank.", "Keep the carpet.", "Not sure."],
    },
    {
      id: "frames",
      prompt: "Keep the wooden frames?",
      options: ["Keep the frames.", "Paint the frames.", "Not sure."],
    },
  ],
};

const GENERIC: Question[] = [
  {
    id: "stay",
    prompt: "What must stay the same?",
    options: ["Keep the layout.", "The layout can change."],
  },
];

export function questionsFor(zoneKey: string): Question[] {
  return QUESTIONS[zoneKey] ?? GENERIC;
}

export function unanswered(zoneKey: string, answers: { questionId: string }[]): Question[] {
  const done = new Set(answers.map((answer) => answer.questionId));
  return questionsFor(zoneKey).filter((question) => !done.has(question.id));
}

export function bestGuess(zoneKey: string, questionId: string): string {
  if (zoneKey === "living" && questionId === "boards") return "Yes. Boards.";
  if (zoneKey === "kitchen" && questionId === "use") return "Home kitchen.";
  const question = questionsFor(zoneKey).find((item) => item.id === questionId);
  return question?.options[0] ?? "Not sure.";
}
