import "server-only";

import { foundationalScreeningQuestions, foundationalScreeningShortAnswers, type FoundationalQuestionId, type FoundationalScreeningAnswers } from "@/lib/foundationalScreeningQuestions";

const correctObjectiveAnswers = {
  q1: "B",
  q2: "A",
  q3: "B",
  q4: "C",
  q5: "B",
  q6: "C",
  q7: "A",
  q8: "B",
  q9: "C",
  q10: "B",
} as const satisfies Record<FoundationalQuestionId, string>;

export const screeningObjectiveMax = 50;

export function scoreFoundationalScreening(answers: FoundationalScreeningAnswers) {
  const screeningObjectiveScore = answers.objective.reduce((score, response) => {
    return score + (correctObjectiveAnswers[response.questionId] === response.answer ? 5 : 0);
  }, 0);

  return {
    screeningObjectiveScore,
    screeningObjectiveMax,
  };
}

export function buildFoundationalScreeningReview(answers: FoundationalScreeningAnswers) {
  const objectiveAnswers = new Map(answers.objective.map((answer) => [answer.questionId, answer.answer]));
  const shortAnswers = new Map(answers.shortAnswers.map((answer) => [answer.questionId, answer.response]));
  return {
    objective: foundationalScreeningQuestions.map((question) => {
      const applicantAnswer = objectiveAnswers.get(question.id) || null;
      const correctAnswer = correctObjectiveAnswers[question.id];
      return {
        id: question.id,
        question: question.question,
        options: question.options,
        applicantAnswer,
        correctAnswer,
        isCorrect: applicantAnswer === correctAnswer,
      };
    }),
    shortAnswers: foundationalScreeningShortAnswers.map((question) => ({
      id: question.id,
      question: question.question,
      response: shortAnswers.get(question.id) || "",
    })),
  };
}
